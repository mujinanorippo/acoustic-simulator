// 開口部の四隅
import { describe, expect, it } from "vitest";
import { openingCorners } from "./opening-shape.js";

describe("openingCorners", () => {
  it("y = 0 の壁のドア：x と z で四隅", () => {
    const door = {
      kind: "door",
      axis: "y",
      coordinate: 0,
      min: { x: 0.5, z: 0 },
      max: { x: 1.3, z: 2 },
    };
    expect(openingCorners(door)).toEqual([
      { x: 0.5, y: 0, z: 0 },
      { x: 1.3, y: 0, z: 0 },
      { x: 1.3, y: 0, z: 2 },
      { x: 0.5, y: 0, z: 2 },
    ]);
  });

  it("天井（z）の開口部は x と y", () => {
    const hatch = {
      kind: "opening",
      axis: "z",
      coordinate: 2.4,
      min: { x: 1, y: 1 },
      max: { x: 2, y: 2 },
    };
    expect(openingCorners(hatch)[2]).toEqual({ x: 2, y: 2, z: 2.4 });
  });
});
