// 開口部による遮音低下（ブラウザ側）の二重実装照合・検証・意図的エラー
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import cases from "../../../tests/data/crosscheck/openings.cases.json" with { type: "json" };
import expected from "../../../tests/data/crosscheck/openings.expected.json" with { type: "json" };
import { ERROR_CODES } from "./errors.js";
import { compositeTransmissionLossDb, openingReduction } from "./openings.js";

// 二重実装照合の許容差（ブラウザ側は合成透過損失の関数経由、Python は透過率の平均を直接計算）
const CROSSCHECK_ABSOLUTE_TOLERANCE = 1e-9;
const KEYS = ["compositeTlDb", "reductionDb", "reductionPercent", "transmittedEnergyFactor"];

describe("二重実装照合", () => {
  it.each(cases.cases.map((item, index) => [item.id, item, expected.results[index]]))(
    "%s",
    (_id, item, wanted) => {
      const result = openingReduction(item.wallTlDb, item.openingRatio);
      for (const key of KEYS) {
        const scale = Math.max(1, Math.abs(wanted[key]));
        expect(Math.abs(result[key] - wanted[key]) / scale).toBeLessThan(
          CROSSCHECK_ABSOLUTE_TOLERANCE,
        );
      }
    },
  );
});

describe("検証", () => {
  it("開口率 1% なら、どれだけ良い壁でも約 20 dB で頭打ち", () => {
    expect(openingReduction(65, 0.01).compositeTlDb).toBeCloseTo(20, 1);
  });

  it("開口なしは元の壁のまま、全面開口は 0 dB", () => {
    expect(openingReduction(40, 0).reductionDb).toBeCloseTo(0, 12);
    expect(openingReduction(40, 1).compositeTlDb).toBe(0);
  });

  it("同じ透過損失の面を合成しても変わらない", () => {
    expect(
      compositeTransmissionLossDb([
        { areaM2: 2, transmissionLossDb: 30 },
        { areaM2: 3, transmissionLossDb: 30 },
      ]),
    ).toBeCloseTo(30, 12);
  });

  it("開口があると遮音は下がるだけで、上がることはない", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (wall, ratio) => {
          const result = openingReduction(wall, ratio);
          expect(result.compositeTlDb).toBeLessThanOrEqual(wall + 1e-9);
          expect(result.compositeTlDb).toBeGreaterThanOrEqual(-1e-12);
          expect(result.transmittedEnergyFactor).toBeGreaterThanOrEqual(1 - 1e-9);
        },
      ),
    );
  });
});

describe("意図的エラー", () => {
  it.each([-0.1, 1.1, Number.NaN, "0.1", null])("開口率 %s は不可", (bad) => {
    expect(() => openingReduction(40, bad)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.ABSORPTION_OUT_OF_RANGE }),
    );
  });

  it("透過損失が数値でない・面がない・面積ゼロは不可", () => {
    expect(() => openingReduction(Infinity, 0.1)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.NOT_POSITIVE_PROPERTY }),
    );
    expect(() => compositeTransmissionLossDb([])).toThrow(
      expect.objectContaining({ code: ERROR_CODES.NOT_POSITIVE_LENGTH }),
    );
    expect(() => compositeTransmissionLossDb([{ areaM2: 0, transmissionLossDb: 30 }])).toThrow(
      expect.objectContaining({ code: ERROR_CODES.NOT_POSITIVE_LENGTH }),
    );
  });
});
