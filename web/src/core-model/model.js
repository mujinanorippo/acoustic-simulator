// 部屋の形の「作り方の履歴」（開発設計書「プロジェクトJSON」：形状は作り方の履歴で持ち、ボクセルは含めない）
// 長さはすべて m。座標は x：幅、y：奥行き、z：高さ（床が z = 0）。原点は最初のブロックの左手前下の角。
// 入力の上限は打ち間違いを止めるための範囲で、物理的な限界ではない。
import { GEOMETRY_ERRORS, GeometryError } from "./errors.js";

export const SHAPE_KINDS = Object.freeze({
  block: { label: "ブロック", additive: true, primitive: "box" },
  blockHole: { label: "ブロック穴", additive: false, primitive: "box" },
  cylinder: { label: "円柱", additive: true, primitive: "cylinder" },
  cylinderHole: { label: "円柱穴", additive: false, primitive: "cylinder" },
});

export const OPENING_KINDS = Object.freeze({
  door: { label: "ドア" },
  window: { label: "窓" },
  opening: { label: "開口部" },
});

export const AXES = Object.freeze(["x", "y", "z"]);
const MM_PER_M = 1000;

export const LIMITS = Object.freeze({
  minLengthM: 0.001,
  maxLengthM: 100,
  maxAbsCoordinateM: 1000,
  maxFeatures: 200,
  maxOpenings: 100,
});

/** 開口部の面の向き（軸）ごとの、面内の2つの軸 */
export const PLANE_AXES = Object.freeze({ x: ["y", "z"], y: ["x", "z"], z: ["x", "y"] });

function requireLength(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < LIMITS.minLengthM ||
    value > LIMITS.maxLengthM
  ) {
    throw new GeometryError(
      GEOMETRY_ERRORS.INVALID_SIZE,
      `${label}は ${LIMITS.minLengthM * MM_PER_M} mm〜${LIMITS.maxLengthM} m の範囲で入力してください（入力値: ${value}）`,
    );
  }
}

function requireCoordinate(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > LIMITS.maxAbsCoordinateM
  ) {
    throw new GeometryError(
      GEOMETRY_ERRORS.INVALID_POSITION,
      `${label}は ±${LIMITS.maxAbsCoordinateM} m 以内の数で入力してください（入力値: ${value}）`,
    );
  }
}

function requireAxis(value, label) {
  if (!AXES.includes(value)) {
    throw new GeometryError(
      GEOMETRY_ERRORS.INVALID_POSITION,
      `${label}は x・y・z のどれかです（入力値: ${value}）`,
    );
  }
}

function requirePoint(point, label) {
  if (typeof point !== "object" || point === null) {
    throw new GeometryError(GEOMETRY_ERRORS.INVALID_POSITION, `${label}がありません`);
  }
  for (const axis of AXES) requireCoordinate(point[axis], `${label}の ${axis}`);
}

/** 形の1つ（ブロック・ブロック穴・円柱・円柱穴）を確かめる */
export function validateFeature(feature, index) {
  const label = `${index + 1}番目の形`;
  const kind = SHAPE_KINDS[feature?.kind];
  if (!kind) {
    throw new GeometryError(
      GEOMETRY_ERRORS.UNKNOWN_KIND,
      `${label}の種類が分かりません（ブロック・ブロック穴・円柱・円柱穴のどれか）`,
    );
  }
  requirePoint(feature.position, `${label}の位置`);
  if (kind.primitive === "box") {
    if (typeof feature.size !== "object" || feature.size === null) {
      throw new GeometryError(GEOMETRY_ERRORS.INVALID_SIZE, `${label}の大きさがありません`);
    }
    for (const axis of AXES) requireLength(feature.size[axis], `${label}の ${axis} 方向の長さ`);
  } else {
    requireAxis(feature.axis, `${label}の向き`);
    requireLength(feature.diameter, `${label}の直径`);
    requireLength(feature.length, `${label}の長さ`);
  }
}

/** 開口部（ドア・窓の位置に貼る四角いサーフェス）を確かめる */
export function validateOpening(opening, index) {
  const label = `${index + 1}番目の開口部`;
  if (!OPENING_KINDS[opening?.kind]) {
    throw new GeometryError(
      GEOMETRY_ERRORS.INVALID_OPENING,
      `${label}の種類が分かりません（ドア・窓・開口部のどれか）`,
    );
  }
  requireAxis(opening.axis, `${label}の面の向き`);
  requireCoordinate(opening.coordinate, `${label}の面の位置`);
  for (const axis of PLANE_AXES[opening.axis]) {
    requireCoordinate(opening.min?.[axis], `${label}の ${axis} の始まり`);
    requireCoordinate(opening.max?.[axis], `${label}の ${axis} の終わり`);
    requireLength(opening.max[axis] - opening.min[axis], `${label}の ${axis} 方向の幅`);
  }
}

function requireUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (typeof item.id !== "string" || item.id === "" || seen.has(item.id)) {
      throw new GeometryError(
        GEOMETRY_ERRORS.DUPLICATE_ID,
        `${label}の番号（id）が空か重複しています（${item.id}）`,
      );
    }
    seen.add(item.id);
  }
}

/** 部屋の形全体を確かめる（形が無い・最初が穴・数が多すぎる、などを止める） */
export function validateRoom(room) {
  const features = room?.features;
  const openings = room?.openings ?? [];
  if (!Array.isArray(features) || features.length === 0) {
    throw new GeometryError(GEOMETRY_ERRORS.EMPTY_SOLID, "形が1つもありません");
  }
  if (features.length > LIMITS.maxFeatures || openings.length > LIMITS.maxOpenings) {
    throw new GeometryError(
      GEOMETRY_ERRORS.TOO_MANY_FEATURES,
      `形は ${LIMITS.maxFeatures} 個、開口部は ${LIMITS.maxOpenings} 個までです`,
    );
  }
  features.forEach(validateFeature);
  if (!SHAPE_KINDS[features[0].kind].additive) {
    throw new GeometryError(
      GEOMETRY_ERRORS.FIRST_NOT_BLOCK,
      "最初の形はブロックか円柱にしてください（穴から始めることはできません）",
    );
  }
  openings.forEach(validateOpening);
  requireUniqueIds(features, "形");
  requireUniqueIds(openings, "開口部");
}

/** 新しい形の id（既存と重ならない短い文字列） */
export function nextId(prefix, items) {
  const used = new Set(items.map((item) => item.id));
  let number = items.length + 1;
  while (used.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}
