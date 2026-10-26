// 積層の断面図：材料ごとの見た目の決め方と、厚さの比率での幅
import { describe, expect, it } from "vitest";
import {
  appearanceKey,
  appearanceOf,
  labelRowFor,
  layerName,
  layerWidths,
} from "./layer-drawing.js";

describe("appearanceKey", () => {
  it("種類と材料で見た目を決める", () => {
    expect(appearanceKey({ kind: "air" })).toBe("air");
    expect(appearanceKey({ kind: "porous", materialId: "glass-wool-standard" })).toBe("insulation");
    expect(appearanceKey({ kind: "porous", materialId: "white-kuon-polyester" })).toBe(
      "insulation",
    );
    expect(appearanceKey({ kind: "porous", materialId: "urethane-sponge-example" })).toBe("sponge");
    expect(appearanceKey({ kind: "plate", materialId: "gypsum-board-gbr-12-5mm" })).toBe("gypsum");
    expect(appearanceKey({ kind: "plate", materialId: "structural-plywood-12mm" })).toBe("wood");
    expect(appearanceKey({ kind: "plate", materialId: "particleboard-novopan-15mm" })).toBe("wood");
    expect(appearanceKey({ kind: "plate", materialId: "" })).toBe("plate");
    expect(appearanceKey({ kind: "perforated" })).toBe("perforated");
  });

  it("指定の色：スポンジ灰色、せっこうボード白、空気層水色、グラスウール薄黄、木は茶色", () => {
    expect(appearanceOf({ kind: "porous", materialId: "urethane-sponge-example" }).fill).toBe(
      "#c8c8c8",
    );
    expect(appearanceOf({ kind: "plate", materialId: "gypsum-board-gbr-9-5mm" })).toMatchObject({
      fill: "#ffffff",
      hatch: "diagonal",
    });
    expect(appearanceOf({ kind: "air" }).fill).toBe("#dcefff");
    expect(appearanceOf({ kind: "porous", materialId: "gc-board-32k" }).hatch).toBe("insulation");
    expect(appearanceOf({ kind: "plate", materialId: "structural-plywood-9mm" }).hatch).toBe(
      "wood",
    );
  });
});

describe("layerWidths", () => {
  it("厚さの比率（最小幅 3px を除いた残りを配分）で、合計は全体の幅", () => {
    const widths = layerWidths([12.5, 50, 12.5], 180);
    expect(widths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(180, 9);
    expect((widths[1] - 3) / (widths[0] - 3)).toBeCloseTo(4, 9);
  });

  it("読めない厚さ・0 は最小幅", () => {
    expect(layerWidths([Number.NaN, 0, 10], 100)).toEqual([3, 3, 94]);
    expect(layerWidths([], 100)).toEqual([]);
  });
});

describe("layerName", () => {
  it("材料名（厚さが名前に入っていなければ付ける）、材料なしは種類と厚さ", () => {
    expect(
      layerName({
        kind: "plate",
        materialId: "gypsum-board-gbr-12-5mm",
        texts: { thickness: "12.5" },
      }),
    ).toBe("せっこうボード（GB-R）12.5mm");
    expect(layerName({ kind: "air", materialId: "", texts: { thickness: "50" } })).toBe(
      "空気層（厚さ 50 mm）",
    );
    expect(
      layerName({ kind: "porous", materialId: "glass-wool-standard", texts: { thickness: "100" } }),
    ).toBe("グラスウール 通常品（密度から計算）（厚さ 100 mm）");
  });
});

describe("labelRowFor", () => {
  it("離れていれば同じ段、詰まっていれば下の段。2桁の番号も重ならない", () => {
    const rowEnds = [];
    expect(labelRowFor(rowEnds, 10, "1")).toBe(0);
    expect(labelRowFor(rowEnds, 40, "2")).toBe(0);
    expect(labelRowFor(rowEnds, 43, "3")).toBe(1);
    expect(labelRowFor(rowEnds, 46, "4")).toBe(2);
    expect(labelRowFor(rowEnds, 52, "10")).toBe(0);
    expect(labelRowFor(rowEnds, 55, "11")).toBe(1);
  });
});
