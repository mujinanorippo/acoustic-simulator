// 画面に出す要約（帯域ごとの結果・二重壁共鳴の目安・コインシデンス限界周波数）の単体テスト
// （カバー率の測定で、画面からしか呼ばれずテストが無かったことが分かったため追加）
import { describe, expect, it } from "vitest";
import {
  bandResults,
  bendingStiffnessNm,
  criticalFrequencyHz,
  doubleWallResonanceHz,
  massAirMassResonanceHz,
  plateCriticalFrequencies,
} from "./tmm.js";

const plate = (mass, stiffness = 0) => ({
  kind: "plate",
  surfaceDensityKgm2: mass,
  bendingStiffnessNm: stiffness,
  lossFactorRatio: 0.01,
});
const air = (thickness) => ({ kind: "air", thicknessM: thickness });
const porous = (thickness, resistivity) => ({
  kind: "porous",
  thicknessM: thickness,
  flowResistivityPasm2: resistivity,
});

// 21帯域 × 拡散入射の積分を行うため、並行実行中は数秒〜十数秒かかる
const HEAVY_TEST_TIMEOUT_MS = 60000;

describe("bandResults", () => {
  it(
    "21帯域すべてに有限の透過損失・0〜1 の吸音率があり、進み具合を毎帯域通知する",
    () => {
      const progress = [];
      const results = bandResults([plate(10)], (done, total) => progress.push([done, total]));
      expect(results).toHaveLength(21);
      for (const band of results) {
        expect(Number.isFinite(band.transmissionLossDb)).toBe(true);
        expect(band.absorptionRatio).toBeGreaterThanOrEqual(0);
        expect(band.absorptionRatio).toBeLessThanOrEqual(1);
      }
      expect(progress).toHaveLength(21);
      expect(progress.at(-1)).toEqual([21, 21]);
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it(
    "Miki の適用範囲外の層を帯域ごとに知らせる",
    () => {
      const results = bandResults([porous(0.05, 50000), air(0.05)]);
      expect(results[0].porousOutOfRange).toEqual([0]); // 50 Hz: f/σ = 0.001
      expect(results.at(-1).porousOutOfRange).toEqual([]); // 5000 Hz: f/σ = 0.1
    },
    HEAVY_TEST_TIMEOUT_MS,
  );

  it("層が不正なら計算せずにエラー", () => {
    expect(() => bandResults([])).toThrow(/E-CALC-008/);
  });
});

describe("doubleWallResonanceHz", () => {
  it("板2枚の間の層の厚さの合計で質量-空気-質量の式を使う", () => {
    const layers = [plate(10), air(0.05), porous(0.05, 10000), plate(20)];
    expect(doubleWallResonanceHz(layers)).toBeCloseTo(massAirMassResonanceHz(10, 20, 0.1), 9);
  });

  it.each([
    ["板が1枚", [plate(10), air(0.1)]],
    ["板が3枚", [plate(10), air(0.1), plate(10), air(0.1), plate(10)]],
    ["板が隣り合っている", [plate(10), plate(10)]],
    [
      "有孔板を含む",
      [
        plate(10),
        air(0.05),
        { kind: "perforated", thicknessM: 0.005, holeDiameterM: 0.005, perforationRatio: 0.1 },
        plate(10),
      ],
    ],
  ])("%s ときは目安を出さない（null）", (_label, layers) => {
    expect(doubleWallResonanceHz(layers)).toBeNull();
  });
});

describe("plateCriticalFrequencies", () => {
  it("曲げ剛性のある板だけ、層番号つきで返す", () => {
    const stiffness = bendingStiffnessNm({
      youngsModulusPa: 2.5e9,
      poissonRatio: 0.3,
      thicknessM: 0.0125,
    });
    const result = plateCriticalFrequencies([plate(10), air(0.05), plate(10, stiffness)]);
    expect(result).toEqual([{ index: 2, criticalHz: criticalFrequencyHz(10, stiffness) }]);
  });
});
