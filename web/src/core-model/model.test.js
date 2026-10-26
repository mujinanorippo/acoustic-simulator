// 作り方の履歴の検証（意図的エラー：形状の分類）
import { describe, expect, it } from "vitest";
import { LIMITS, nextId, validateRoom } from "./model.js";

const block = {
  id: "b1",
  kind: "block",
  position: { x: 0, y: 0, z: 0 },
  size: { x: 1, y: 1, z: 1 },
};
const room = (features, openings = []) => ({ features, openings });

describe("validateRoom", () => {
  it("正しい部屋は通る", () => {
    expect(() => validateRoom(room([block]))).not.toThrow();
  });

  it("形が無い・最初が穴・種類が分からない", () => {
    expect(() => validateRoom(room([]))).toThrow(/E-GEO-006/);
    expect(() => validateRoom({})).toThrow(/E-GEO-006/);
    expect(() => validateRoom(room([{ ...block, kind: "blockHole" }]))).toThrow(/E-GEO-004/);
    expect(() => validateRoom(room([{ ...block, kind: "sphere" }]))).toThrow(/E-GEO-003/);
  });

  it.each([0, -1, 0.0009, 101, Number.NaN, Infinity, "1", null])(
    "大きさ %s は E-GEO-001",
    (value) => {
      expect(() => validateRoom(room([{ ...block, size: { x: value, y: 1, z: 1 } }]))).toThrow(
        /E-GEO-001/,
      );
    },
  );

  it("位置が数でない・遠すぎる・無いは E-GEO-002", () => {
    for (const position of [{ x: "a", y: 0, z: 0 }, { x: 1e6, y: 0, z: 0 }, null]) {
      expect(() => validateRoom(room([{ ...block, position }]))).toThrow(/E-GEO-002/);
    }
  });

  it("円柱の向きが x・y・z 以外は E-GEO-002、直径0は E-GEO-001", () => {
    const cylinder = {
      id: "c1",
      kind: "cylinder",
      position: block.position,
      axis: "z",
      diameter: 0.2,
      length: 1,
    };
    expect(() => validateRoom(room([cylinder]))).not.toThrow();
    expect(() => validateRoom(room([{ ...cylinder, axis: "w" }]))).toThrow(/E-GEO-002/);
    expect(() => validateRoom(room([{ ...cylinder, diameter: 0 }]))).toThrow(/E-GEO-001/);
  });

  it("形が多すぎると E-GEO-007", () => {
    const many = Array.from({ length: LIMITS.maxFeatures + 1 }, (_, index) => ({
      ...block,
      id: `b${index}`,
    }));
    expect(() => validateRoom(room(many))).toThrow(/E-GEO-007/);
  });

  it("id の重複・空は E-GEO-010", () => {
    expect(() => validateRoom(room([block, { ...block }]))).toThrow(/E-GEO-010/);
    expect(() => validateRoom(room([{ ...block, id: "" }]))).toThrow(/E-GEO-010/);
  });

  it("開口部の種類・面の向き・幅がおかしいと E-GEO-009 / 002 / 001", () => {
    const door = {
      id: "o1",
      kind: "door",
      axis: "y",
      coordinate: 0,
      min: { x: 0, z: 0 },
      max: { x: 0.8, z: 2 },
    };
    expect(() => validateRoom(room([block], [door]))).not.toThrow();
    expect(() => validateRoom(room([block], [{ ...door, kind: "hatch" }]))).toThrow(/E-GEO-009/);
    expect(() => validateRoom(room([block], [{ ...door, axis: "q" }]))).toThrow(/E-GEO-002/);
    expect(() => validateRoom(room([block], [{ ...door, max: { x: 0, z: 2 } }]))).toThrow(
      /E-GEO-001/,
    );
  });
});

describe("nextId", () => {
  it("既存と重ならない番号", () => {
    expect(nextId("b", [])).toBe("b1");
    expect(nextId("b", [{ id: "b2" }])).toBe("b3");
    expect(nextId("b", [{ id: "b1" }, { id: "b3" }])).toBe("b4");
  });
});
