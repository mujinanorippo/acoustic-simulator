// 帯域表（ブラウザ側）の二重実装照合と検証
import { describe, expect, it } from "vitest";
import cases from "../../../tests/data/crosscheck/frequency-bands.cases.json" with { type: "json" };
import expected from "../../../tests/data/crosscheck/frequency-bands.expected.json" with { type: "json" };
import { ERROR_CODES } from "./errors.js";
import { allBands, bandEdgesHz, exactCenterFrequencyHz } from "./frequency-bands.js";

const CROSSCHECK_RELATIVE_TOLERANCE = 1e-12;

describe("二重実装照合", () => {
  it.each(cases.cases.map((item, index) => [item.id, item, expected.results[index]]))(
    "%s",
    (_id, item, wanted) => {
      const center = exactCenterFrequencyHz(item.bandIndex);
      const { lowerHz, upperHz } = bandEdgesHz(item.bandIndex);
      expect(Math.abs(center / wanted.centerHz - 1)).toBeLessThan(CROSSCHECK_RELATIVE_TOLERANCE);
      expect(Math.abs(lowerHz / wanted.lowerHz - 1)).toBeLessThan(CROSSCHECK_RELATIVE_TOLERANCE);
      expect(Math.abs(upperHz / wanted.upperHz - 1)).toBeLessThan(CROSSCHECK_RELATIVE_TOLERANCE);
    },
  );
});

describe("帯域表", () => {
  it("21帯域、評価用（Rw）は 100〜3150 Hz の16帯域", () => {
    const bands = allBands();
    expect(bands).toHaveLength(21);
    const rating = bands.filter((band) => band.isRatingBand).map((band) => band.nominalHz);
    expect(rating).toHaveLength(16);
    expect(rating[0]).toBe(100);
    expect(rating.at(-1)).toBe(3150);
  });

  it("正確な中心周波数と呼び周波数の差は 1% 未満", () => {
    for (const band of allBands()) {
      expect(Math.abs(band.centerHz / band.nominalHz - 1)).toBeLessThan(0.01);
    }
  });

  it("帯域は隙間なく並ぶ", () => {
    const bands = allBands();
    for (let i = 0; i < bands.length - 1; i += 1) {
      expect(Math.abs(bands[i].upperHz / bands[i + 1].lowerHz - 1)).toBeLessThan(1e-12);
    }
  });

  it.each([-14, 8, 0.5, "0", null, true])("帯域番号 %s は不可", (bad) => {
    expect(() => exactCenterFrequencyHz(bad)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.BAND_OUT_OF_RANGE }),
    );
  });
});
