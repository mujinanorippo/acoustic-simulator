// 音源の周波数範囲での透過損失の平均
import { describe, expect, it } from "vitest";
import { SOUND_SOURCES } from "./constants.js";
import { rangeTransmissionLossDb } from "./source-ranges.js";

const bands = [
  { centerHz: 100, value: 20 },
  { centerHz: 125, value: 30 },
  { centerHz: 160, value: 30 },
];

describe("rangeTransmissionLossDb", () => {
  it("1つの周波数（下限＝上限）は、その周波数にいちばん近い帯域", () => {
    expect(rangeTransmissionLossDb(bands, 40, 40)).toBe(20);
  });

  it("範囲に入る帯域の透過率を平均する", () => {
    expect(rangeTransmissionLossDb(bands, 120, 170)).toBeCloseTo(30, 12);
    const expected = -10 * Math.log10((0.01 + 0.001 + 0.001) / 3);
    expect(rangeTransmissionLossDb(bands, 90, 170)).toBeCloseTo(expected, 12);
  });

  it("範囲に帯域が無いときは中央にいちばん近い帯域", () => {
    expect(rangeTransmissionLossDb(bands, 101, 110)).toBe(20);
  });
});

describe("SOUND_SOURCES", () => {
  it("下限 ≤ 上限（ドラムは1つの周波数）、男性の話し声は 90〜155 Hz、27種類", () => {
    expect(SOUND_SOURCES).toHaveLength(27);
    for (const source of SOUND_SOURCES) {
      expect(source.rangeHz[0]).toBeLessThanOrEqual(source.rangeHz[1]);
    }
    expect(SOUND_SOURCES.find((source) => source.key === "maleVoice").rangeHz).toEqual([90, 155]);
  });
});
