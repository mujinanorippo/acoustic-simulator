// 全体寸法の線と数値
import { describe, expect, it } from "vitest";
import { linearDimension, overallDimensions } from "./dimensions.js";

const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 3.64, y: 2.73, z: 2.4 } };

describe("overallDimensions", () => {
  it("幅・奥行き・高さの数値は mm（単位は書かない）", () => {
    expect(overallDimensions(bounds).map((item) => item.label.text)).toEqual([
      "3640",
      "2730",
      "2400",
    ]);
  });

  it("幅の寸法線は手前（y がマイナス側）に出て、辺と平行", () => {
    const [width] = overallDimensions(bounds);
    const dimensionLine = width.lines[2];
    expect(dimensionLine[0].y).toBeLessThan(0);
    expect(dimensionLine[0].y).toBeCloseTo(dimensionLine[1].y, 12);
    expect(dimensionLine[1].x - dimensionLine[0].x).toBeCloseTo(3.64, 12);
  });
});

describe("linearDimension", () => {
  it("補助線2本・寸法線1本・矢印の羽根4本", () => {
    const result = linearDimension(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      1,
    );
    expect(result.lines).toHaveLength(7);
    expect(result.label.text).toBe("1000");
    expect(result.label.position.x).toBeCloseTo(0.5, 12);
  });
});
