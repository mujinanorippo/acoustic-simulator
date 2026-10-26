// 部屋の立体：一体化・くり抜き・1ソリッド判定・開口部の位置（manifold-3d を実際に使う）
import Module from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRoom, CYLINDER_SEGMENTS } from "./geometry.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const block = (id, position, size, kind = "block") => ({ id, kind, position, size });
const origin = { x: 0, y: 0, z: 0 };
const room6 = block("b1", origin, { x: 3.64, y: 2.73, z: 2.4 });

describe("一体化・くり抜き", () => {
  it("6畳の直方体：体積 3.64×2.73×2.4、範囲は原点から", () => {
    const result = buildRoom(wasm, { features: [room6] });
    expect(result.volumeM3).toBeCloseTo(3.64 * 2.73 * 2.4, 9);
    expect(result.bounds.min).toEqual(origin);
    expect(result.bounds.max.x).toBeCloseTo(3.64, 12);
    expect(result.mesh.indices.length % 3).toBe(0);
    expect(result.mesh.positions.length).toBeGreaterThan(0);
  });

  it("面で接するブロックは一体化して1つ（L字の部屋）", () => {
    const extra = block("b2", { x: 3.64, y: 0, z: 0 }, { x: 1, y: 1, z: 2.4 });
    const result = buildRoom(wasm, { features: [room6, extra] });
    expect(result.volumeM3).toBeCloseTo(3.64 * 2.73 * 2.4 + 2.4, 9);
  });

  it("重なったブロックは重なりを二重に数えない", () => {
    const overlap = block("b2", { x: 3, y: 0, z: 0 }, { x: 1.64, y: 2.73, z: 2.4 });
    const result = buildRoom(wasm, { features: [room6, overlap] });
    expect(result.volumeM3).toBeCloseTo((3 + 1.64) * 2.73 * 2.4, 9);
  });

  it("ブロック穴で机の分をくり抜く", () => {
    const desk = block("h1", { x: 0, y: 0, z: 0 }, { x: 1.2, y: 0.6, z: 0.7 }, "blockHole");
    const result = buildRoom(wasm, { features: [room6, desk] });
    expect(result.volumeM3).toBeCloseTo(3.64 * 2.73 * 2.4 - 1.2 * 0.6 * 0.7, 9);
  });

  it("円柱穴（z 向き、柱）は多角形近似の体積だけ減る", () => {
    const pillar = {
      id: "h1",
      kind: "cylinderHole",
      position: { x: 1, y: 1, z: 0 },
      axis: "z",
      diameter: 0.3,
      length: 2.4,
    };
    const result = buildRoom(wasm, { features: [room6, pillar] });
    const polygonArea =
      (CYLINDER_SEGMENTS / 2) * 0.15 ** 2 * Math.sin((2 * Math.PI) / CYLINDER_SEGMENTS);
    expect(result.volumeM3).toBeCloseTo(3.64 * 2.73 * 2.4 - polygonArea * 2.4, 6);
  });

  it("円柱の向き x・y：端の中心が位置になる", () => {
    for (const axis of ["x", "y"]) {
      const pipe = {
        id: "c1",
        kind: "cylinder",
        position: { x: 1, y: 1, z: 1 },
        axis,
        diameter: 0.2,
        length: 0.5,
      };
      const result = buildRoom(wasm, { features: [pipe] });
      expect(result.bounds.min[axis]).toBeCloseTo(1, 9);
      expect(result.bounds.max[axis]).toBeCloseTo(1.5, 9);
    }
  });
});

describe("1ソリッド判定（意図的エラー）", () => {
  it("離れたブロックは E-GEO-005", () => {
    const far = block("b2", { x: 10, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(() => buildRoom(wasm, { features: [room6, far] })).toThrow(/E-GEO-005.*2 つ/);
  });

  it("辺だけで触れるブロックもつながっていない（E-GEO-005）", () => {
    const edge = block("b2", { x: 3.64, y: 2.73, z: 0 }, { x: 1, y: 1, z: 2.4 });
    expect(() => buildRoom(wasm, { features: [room6, edge] })).toThrow(/E-GEO-005/);
  });

  it("穴で部屋が2つに分断されると E-GEO-005", () => {
    const wall = block("h1", { x: 1.5, y: -1, z: -1 }, { x: 0.1, y: 5, z: 5 }, "blockHole");
    expect(() => buildRoom(wasm, { features: [room6, wall] })).toThrow(/E-GEO-005/);
  });

  it("穴で全部消えると E-GEO-006", () => {
    const all = block("h1", { x: -1, y: -1, z: -1 }, { x: 10, y: 10, z: 10 }, "blockHole");
    expect(() => buildRoom(wasm, { features: [room6, all] })).toThrow(/E-GEO-006/);
  });
});

describe("開口部", () => {
  const door = {
    id: "o1",
    kind: "door",
    axis: "y",
    coordinate: 0,
    min: { x: 0.5, z: 0 },
    max: { x: 1.3, z: 2.0 },
  };

  it("壁の面の上にあるドアは通る", () => {
    expect(() => buildRoom(wasm, { features: [room6], openings: [door] })).not.toThrow();
  });

  it("部屋の中に浮いている・外にある・面からはみ出す開口部は E-GEO-008", () => {
    const inside = { ...door, coordinate: 1 };
    const outside = { ...door, coordinate: -1 };
    const overhang = { ...door, max: { x: 5, z: 2.0 } };
    for (const opening of [inside, outside, overhang]) {
      expect(() => buildRoom(wasm, { features: [room6], openings: [opening] })).toThrow(
        /E-GEO-008/,
      );
    }
  });
});
