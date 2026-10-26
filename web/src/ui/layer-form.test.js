// 材料を選んだときの参考値の自動入力と、自分で書き換えたときの扱い
import { describe, expect, it } from "vitest";
import {
  applyMaterial,
  editField,
  materialChoices,
  rowUsesTentativeValues,
  toCoreLayer,
} from "./layer-form.js";

const emptyPlate = { kind: "plate", materialId: "", texts: {}, referenceKeys: [] };

describe("applyMaterial", () => {
  it("せっこうボード 12.5mm を選ぶと、JIS の範囲の中央値などが参考値として入る", () => {
    const row = applyMaterial(emptyPlate, "gypsum-board-gbr-12-5mm");
    expect(row.texts).toEqual({
      thickness: "12.5",
      surfaceDensity: "9.9",
      coincidenceProduct: "38",
      lossFactor: "0.01",
    });
    expect(row.referenceKeys).toEqual([
      "thickness",
      "surfaceDensity",
      "coincidenceProduct",
      "lossFactor",
    ]);
    expect(rowUsesTentativeValues(row)).toBe(true);
    expect(toCoreLayer(row, 0).ok).toBe(true);
  });

  it("板ガラスは密度×厚さで面密度を出す（2450 kg/m³ × 5 mm = 12.25 kg/m²）", () => {
    const row = applyMaterial(emptyPlate, "float-glass-5mm");
    expect(row.texts.surfaceDensity).toBe("12.25");
    expect(row.texts.coincidenceProduct).toBe("12.7");
  });

  it("遮音シートは曲げの硬さを無視して重さだけ（臨界周波数×板厚 0）", () => {
    const row = applyMaterial(emptyPlate, "sound-insulation-sheet-1-2mm");
    expect(row.texts.surfaceDensity).toBe("2.1");
    expect(toCoreLayer(row, 0).layer.bendingStiffnessNm).toBe(0);
  });

  it("多孔質材の測定例は密度と流れ抵抗が入り、厚さは自分の入力のまま", () => {
    const row = applyMaterial(
      { kind: "porous", materialId: "", texts: { thickness: "75" }, referenceKeys: [] },
      "glass-fiber-16k",
    );
    expect(row.texts).toEqual({ thickness: "75", density: "16.4", flowResistivity: "7900" });
    expect(row.referenceKeys).toEqual(["density", "flowResistivity"]);
  });

  it("グラスウール通常品は、入力した密度から流れ抵抗を計算する（16 kg/m³ → 3456）", () => {
    const row = applyMaterial(
      {
        kind: "porous",
        materialId: "",
        texts: { thickness: "50", density: "16" },
        referenceKeys: [],
      },
      "glass-wool-standard",
    );
    expect(row.texts).toEqual({ thickness: "50", density: "16", flowResistivity: "3456" });
    expect(row.referenceKeys).toEqual(["flowResistivity"]);
    expect(toCoreLayer(row, 0).layer.flowResistivityPasm2).toBe(3456);
  });

  it("密度が空欄なら流れ抵抗は計算しない", () => {
    const row = applyMaterial(
      { kind: "porous", materialId: "", texts: { thickness: "50" }, referenceKeys: [] },
      "glass-wool-standard",
    );
    expect(row.texts.flowResistivity).toBeUndefined();
    expect(row.referenceKeys).toEqual([]);
  });

  it("「自分で入力」に戻すと値はそのまま、参考値の印だけ消える", () => {
    const chosen = applyMaterial(emptyPlate, "gypsum-board-gbr-15mm");
    const manual = applyMaterial(chosen, "");
    expect(manual.texts).toEqual(chosen.texts);
    expect(manual.referenceKeys).toEqual([]);
    expect(rowUsesTentativeValues(manual)).toBe(false);
  });
});

describe("editField", () => {
  it("書き換えた欄だけ参考値の印が消え、ほかは残る", () => {
    const chosen = applyMaterial(emptyPlate, "gypsum-board-gbr-12-5mm");
    const edited = editField(chosen, "lossFactor", "0.03");
    expect(edited.texts.lossFactor).toBe("0.03");
    expect(edited.referenceKeys).toEqual(["thickness", "surfaceDensity", "coincidenceProduct"]);
    expect(chosen.texts.lossFactor).toBe("0.01");
  });
});

describe("密度を書き換えたときの流れ抵抗", () => {
  const chosen = applyMaterial(
    {
      kind: "porous",
      materialId: "",
      texts: { thickness: "50", density: "16" },
      referenceKeys: [],
    },
    "glass-wool-standard",
  );

  it("流れ抵抗が参考値のままなら、密度に合わせて計算し直す（32 kg/m³ → 9980）", () => {
    const edited = editField(chosen, "density", "32");
    expect(edited.texts.flowResistivity).toBe("9980");
    expect(edited.referenceKeys).toEqual(["flowResistivity"]);
  });

  it("流れ抵抗を自分で入れた後は、密度を変えても上書きしない", () => {
    const manual = editField(chosen, "flowResistivity", "12000");
    expect(editField(manual, "density", "32").texts.flowResistivity).toBe("12000");
  });

  it("密度が数でないときは前の値のまま", () => {
    expect(editField(chosen, "density", "abc").texts.flowResistivity).toBe("3456");
  });

  it("密度は空欄でも計算できる（流れ抵抗があれば十分）", () => {
    const row = { kind: "porous", texts: { thickness: "50", flowResistivity: "8000" } };
    expect(toCoreLayer(row, 0).ok).toBe(true);
  });
});

describe("materialChoices", () => {
  it("板・多孔質材には材料があり、空気層・有孔板には無い", () => {
    expect(materialChoices("plate").length).toBeGreaterThan(0);
    expect(materialChoices("porous").length).toBeGreaterThan(0);
    expect(materialChoices("air")).toEqual([]);
    expect(materialChoices("perforated")).toEqual([]);
    expect(materialChoices("unknown")).toEqual([]);
  });
});
