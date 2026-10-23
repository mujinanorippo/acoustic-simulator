// 材料データの読み込みと、fc·h からの曲げ剛性・開口率の計算
import { describe, expect, it } from "vitest";
import { findMaterial, MATERIALS, materialsOf, plateSurfaceDensityKgm2 } from "./materials.js";
import { openingRatioFromAreas } from "./openings.js";
import { bendingStiffnessFromCoincidenceNm, criticalFrequencyHz } from "./tmm.js";

describe("材料データ", () => {
  it("shared/materials の全ファイルが読み込まれ、分類できる", () => {
    expect(MATERIALS.length).toBe(20);
    expect(MATERIALS.every((material) => material.category !== "other")).toBe(true);
    expect(materialsOf("absorption")).toHaveLength(6);
  });

  it("吸音率は6帯域・0〜1", () => {
    for (const material of materialsOf("absorption")) {
      expect(material.values.absorptionOctave).toHaveLength(6);
      for (const value of material.values.absorptionOctave) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("板の面密度：面密度の値があればそれ、なければ密度×厚さ", () => {
    expect(plateSurfaceDensityKgm2(findMaterial("gypsum-board-gbr-9-5mm"), 0.0095)).toBe(7.6);
    expect(plateSurfaceDensityKgm2(findMaterial("float-glass-6mm"), 0.006)).toBeCloseTo(14.7, 12);
  });

  it("無い材料は null", () => {
    expect(findMaterial("no-such-material")).toBeNull();
  });
});

describe("bendingStiffnessFromCoincidenceNm", () => {
  it("求めた曲げ剛性から計算した臨界周波数が fc·h ÷ 板厚 に戻る", () => {
    const stiffness = bendingStiffnessFromCoincidenceNm(9.9, 38, 0.0125);
    expect(criticalFrequencyHz(9.9, stiffness)).toBeCloseTo(38 / 0.0125, 6);
  });

  it("fc·h = 0 は重さだけ（0）、負の値は止める", () => {
    expect(bendingStiffnessFromCoincidenceNm(10, 0, 0.01)).toBe(0);
    expect(() => bendingStiffnessFromCoincidenceNm(10, -1, 0.01)).toThrow(/E-CALC-004/);
    expect(() => bendingStiffnessFromCoincidenceNm(10, 38, 0)).toThrow(/E-CALC-001/);
  });
});

describe("openingRatioFromAreas", () => {
  it("開口部 990 cm² ÷ 壁 9.9 m² = 1%", () => {
    expect(openingRatioFromAreas(9.9, 0.099)).toBeCloseTo(0.01, 15);
    expect(openingRatioFromAreas(9.9, 0)).toBe(0);
  });

  it("開口部が壁より大きい・負・壁の面積 0 は止める", () => {
    expect(() => openingRatioFromAreas(1, 2)).toThrow(/E-CALC-011/);
    expect(() => openingRatioFromAreas(1, -1)).toThrow(/E-CALC-001/);
    expect(() => openingRatioFromAreas(0, 0)).toThrow(/E-CALC-001/);
  });
});
