// 作り方の履歴から部屋の立体を作る（一体化・くり抜き）と、1ソリッドかどうかの判定。
// ブール演算は manifold-3d（読み込んだライブラリ wasm を引数で受け取り、関数は純粋に保つ）。
// 作った途中の立体は WebAssembly のメモリを使うので、使い終わったら必ず delete する。
import { GEOMETRY_ERRORS, GeometryError } from "./errors.js";
import { PLANE_AXES, SHAPE_KINDS, validateRoom } from "./model.js";

// 円柱を多角形で近似するときの辺の数（表示とボクセル化の両方に十分な細かさ）
export const CYLINDER_SEGMENTS = 48;
// 開口部が面の上にあるかを調べるときの、面からのずらし量 [m]（1 mm の 1/10）
const PROBE_OFFSET_M = 1e-4;
// 開口部の四隅を調べるとき、縁から内側に寄せる割合
const CORNER_INSET_RATIO = 0.05;
const QUARTER_TURN_DEG = 90;
const COMPONENTS = 3; // x・y・z

function primitive(wasm, feature) {
  const { Manifold } = wasm;
  const { position } = feature;
  if (SHAPE_KINDS[feature.kind].primitive === "box") {
    const { size } = feature;
    return Manifold.cube([size.x, size.y, size.z]).translate([position.x, position.y, position.z]);
  }
  const radius = feature.diameter / 2;
  const base = Manifold.cylinder(feature.length, radius, radius, CYLINDER_SEGMENTS);
  // 円柱は z 方向に作られるので、向き（x・y）に合わせて回してから位置へ動かす
  const rotation = { x: [0, QUARTER_TURN_DEG, 0], y: [-QUARTER_TURN_DEG, 0, 0], z: [0, 0, 0] }[
    feature.axis
  ];
  const turned = base.rotate(rotation);
  base.delete();
  const moved = turned.translate([position.x, position.y, position.z]);
  turned.delete();
  return moved;
}

/** 点が立体の内側か（点のまわりの小さな立方体と立体の重なりで調べる） */
function isInside(wasm, solid, point) {
  const size = PROBE_OFFSET_M / 2;
  const probe = wasm.Manifold.cube([size, size, size], true).translate(point);
  const overlap = solid.intersect(probe);
  const inside = overlap.volume() > 0;
  probe.delete();
  overlap.delete();
  return inside;
}

function openingSamplePoints(opening) {
  const [first, second] = PLANE_AXES[opening.axis];
  const at = (along, across) => ({
    [opening.axis]: opening.coordinate,
    [first]: along,
    [second]: across,
  });
  const span = (axis) => opening.max[axis] - opening.min[axis];
  const inset = (axis, fromMax) =>
    fromMax
      ? opening.max[axis] - span(axis) * CORNER_INSET_RATIO
      : opening.min[axis] + span(axis) * CORNER_INSET_RATIO;
  const center = at(
    (opening.min[first] + opening.max[first]) / 2,
    (opening.min[second] + opening.max[second]) / 2,
  );
  return [
    center,
    at(inset(first, false), inset(second, false)),
    at(inset(first, true), inset(second, false)),
    at(inset(first, false), inset(second, true)),
    at(inset(first, true), inset(second, true)),
  ];
}

/** 開口部が部屋の表面（片側が部屋の中、反対側が外）にあるか */
function isOnSurface(wasm, solid, opening) {
  return openingSamplePoints(opening).every((point) => {
    const shifted = (sign) => {
      const moved = { ...point, [opening.axis]: point[opening.axis] + sign * PROBE_OFFSET_M };
      return [moved.x, moved.y, moved.z];
    };
    return isInside(wasm, solid, shifted(1)) !== isInside(wasm, solid, shifted(-1));
  });
}

function meshData(solid) {
  const mesh = solid.getMesh();
  const stride = mesh.numProp;
  const count = mesh.vertProperties.length / stride;
  const positions = new Float32Array(count * COMPONENTS);
  for (let index = 0; index < count; index += 1) {
    for (let axis = 0; axis < COMPONENTS; axis += 1) {
      positions[index * COMPONENTS + axis] = mesh.vertProperties[index * stride + axis];
    }
  }
  return { positions, indices: Uint32Array.from(mesh.triVerts) };
}

/**
 * 部屋の立体を作る。{ volumeM3, surfaceAreaM2, bounds: { min, max }, mesh: { positions, indices } }。
 * 形が離れて2つ以上に分かれる・穴で全部消える・開口部が表面にない、ときは番号付きのエラー
 */
export function buildRoom(wasm, room) {
  validateRoom(room);
  let solid = primitive(wasm, room.features[0]);
  try {
    for (const feature of room.features.slice(1)) {
      const part = primitive(wasm, feature);
      const next = SHAPE_KINDS[feature.kind].additive ? solid.add(part) : solid.subtract(part);
      part.delete();
      solid.delete();
      solid = next;
    }
    if (solid.isEmpty() || solid.volume() <= 0) {
      throw new GeometryError(
        GEOMETRY_ERRORS.EMPTY_SOLID,
        "穴で部屋が全部なくなりました。穴の大きさや位置を見直してください",
      );
    }
    const parts = solid.decompose();
    const partCount = parts.length;
    parts.forEach((part) => part.delete());
    if (partCount > 1) {
      throw new GeometryError(
        GEOMETRY_ERRORS.MULTIPLE_SOLIDS,
        `部屋が ${partCount} つに分かれています。部屋は1つのつながった空間にしてください（面で接するように置く。辺や点で触れるだけではつながりません）`,
      );
    }
    (room.openings ?? []).forEach((opening, index) => {
      if (!isOnSurface(wasm, solid, opening)) {
        throw new GeometryError(
          GEOMETRY_ERRORS.OPENING_NOT_ON_SURFACE,
          `${index + 1}番目の開口部が部屋の壁・床・天井の面の上にありません`,
        );
      }
    });
    const box = solid.boundingBox();
    return {
      volumeM3: solid.volume(),
      surfaceAreaM2: solid.surfaceArea(),
      bounds: {
        min: { x: box.min[0], y: box.min[1], z: box.min[2] },
        max: { x: box.max[0], y: box.max[1], z: box.max[2] },
      },
      mesh: meshData(solid),
    };
  } finally {
    solid.delete();
  }
}
