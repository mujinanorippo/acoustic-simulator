// 材料データの読み込みと、fc·h からの曲げ剛性・開口率の計算
import { describe, expect, it } from "vitest";
import { findMaterial, MATERIALS, materialsOf, plateSurfaceDensityKgm2 } from "./materials.js";
import { openingRatioFromAreas } from "./openings.js";
import { flowResistivityFromFiber } from "./layer-models.js";
import {
  bendingStiffnessFromCoincidenceNm,
  bendingStiffnessNm,
  criticalFrequencyHz,
} from "./tmm.js";

describe("材料データ", () => {
  it("shared/materials の全ファイルが読み込まれ、分類できる", () => {
    expect(MATERIALS.length).toBe(42);
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

  it("平均繊維径3μmのグラスウールの流れ抵抗は KISTEC 2022 の推定式 σ = 316.97 D^1.5912 の値", () => {
    for (const density of [24, 32, 48]) {
      const material = findMaterial(`glass-wool-3um-${density}k`);
      expect(material.values.density).toBe(density);
      expect(material.values.flowResistivity).toBe(Math.round(316.97 * density ** 1.5912));
    }
  });

  // Bies & Hansen（Applied Acoustics 13, 1980）σ = 3.18e-9 ρ^1.53 / d²（Forum Acusticum 2026 の論文 000320 の引用で確認）
  it("推定式の値は Bies & Hansen の式（繊維径3μm）と2割以内で合う", () => {
    const biesHansen = (density, diameterM) => (3.18e-9 * density ** 1.53) / diameterM ** 2;
    for (const density of [24, 32, 48]) {
      const ratio =
        findMaterial(`glass-wool-3um-${density}k`).values.flowResistivity /
        biesHansen(density, 3e-6);
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.2);
    }
  });

  it("構造用合板は JAS の12種類の厚さ。12 mm は面密度 7.2 kg/m²、臨界周波数 約1808 Hz", () => {
    const plywood = materialsOf("plate").filter((material) =>
      material.id.startsWith("structural-plywood-"),
    );
    expect(plywood).toHaveLength(12);
    const twelve = findMaterial("structural-plywood-12mm");
    expect(plateSurfaceDensityKgm2(twelve, 0.012)).toBeCloseTo(7.2, 12);
    expect(twelve.values.coincidenceProduct / twelve.values.thickness).toBeCloseTo(1808.33, 1);
  });

  it("パーティクルボードの fc·h 31.7 は、実測の密度 750 kg/m³・ヤング率 3.145 GPa から出した値と合う", () => {
    const thicknessM = 0.009;
    const stiffness = bendingStiffnessNm({
      youngsModulusPa: 3.145e9,
      poissonRatio: 0,
      thicknessM,
    });
    const criticalHz = criticalFrequencyHz(750 * thicknessM, stiffness);
    const material = findMaterial("particleboard-novopan-stp2-9mm");
    expect(criticalHz * thicknessM).toBeCloseTo(material.values.coincidenceProduct, 1);
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

describe("flowResistivityFromFiber（Bies & Hansen）", () => {
  it("手計算の値：3.18e-9 × 16^1.53 ÷ (8e-6)² = 3455.8 Pa·s/m²", () => {
    expect(flowResistivityFromFiber(16, 8e-6)).toBeCloseTo(3455.816862832866, 9);
  });

  it("繊維径が半分なら4倍、密度が2倍なら 2^1.53 倍", () => {
    const base = flowResistivityFromFiber(24, 8e-6);
    expect(flowResistivityFromFiber(24, 4e-6) / base).toBeCloseTo(4, 12);
    expect(flowResistivityFromFiber(48, 8e-6) / base).toBeCloseTo(2 ** 1.53, 12);
  });

  it("通常品・高性能品の材料データは繊維径 8μm・4μm", () => {
    expect(findMaterial("glass-wool-standard").values.fiberDiameter).toBe(8e-6);
    expect(findMaterial("glass-wool-high-performance").values.fiberDiameter).toBe(4e-6);
    expect(findMaterial("glass-wool-standard").category).toBe("porous");
  });

  it("0・負・数でない密度や繊維径は止める", () => {
    expect(() => flowResistivityFromFiber(0, 8e-6)).toThrow(/E-CALC/);
    expect(() => flowResistivityFromFiber(16, -1)).toThrow(/E-CALC/);
    expect(() => flowResistivityFromFiber(Number.NaN, 8e-6)).toThrow(/E-CALC/);
  });
});
