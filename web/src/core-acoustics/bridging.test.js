// 間柱でつながった二重壁（Sharp の線接続のモデル）
import { describe, expect, it } from "vitest";
import {
  bridgedBandTransmissionLossDb,
  combineTransmissionLossDb,
  lineBridgeParameters,
  splitDoubleLeaf,
} from "./bridging.js";
import { bandTransmissionLossDb, bendingStiffnessFromCoincidenceNm } from "./tmm.js";

const gypsum = {
  kind: "plate",
  surfaceDensityKgm2: 9.9,
  bendingStiffnessNm: bendingStiffnessFromCoincidenceNm(9.9, 38, 0.0125),
  lossFactorRatio: 0.01,
};
const air = { kind: "air", thicknessM: 0.05 };
const wool = { kind: "porous", thicknessM: 0.05, flowResistivityPasm2: 8000 };

describe("splitDoubleLeaf", () => {
  it("板・空気層・多孔質材・板 → 面1と面2", () => {
    expect(splitDoubleLeaf([gypsum, air, wool, gypsum])).toEqual({
      leaf1: [gypsum],
      leaf2: [gypsum],
    });
    expect(splitDoubleLeaf([gypsum, gypsum, air, gypsum])?.leaf1).toHaveLength(2);
  });

  it("一重壁・三重壁・面に板以外がある積層は対象外", () => {
    expect(splitDoubleLeaf([gypsum])).toBeNull();
    expect(splitDoubleLeaf([gypsum, air, gypsum, air, gypsum])).toBeNull();
    expect(splitDoubleLeaf([air, gypsum])).toBeNull();
    expect(splitDoubleLeaf([gypsum, air])).toBeNull();
  });
});

describe("lineBridgeParameters", () => {
  it("せっこうボード12.5の両面・455mm：10log(0.455×3040) + 20log(0.5) − 18 = 7.39 dB", () => {
    const result = lineBridgeParameters([gypsum, air, gypsum], 0.455);
    expect(result.criticalHz).toBeCloseTo(3040, 6);
    expect(result.offsetDb).toBeCloseTo(7.38825, 4);
  });

  it("間隔が広いほど間柱経由の透過損失は大きい（10log の比）", () => {
    const narrow = lineBridgeParameters([gypsum, air, gypsum], 0.3).offsetDb;
    const wide = lineBridgeParameters([gypsum, air, gypsum], 0.6).offsetDb;
    expect(wide - narrow).toBeCloseTo(10 * Math.log10(2), 9);
  });

  it("曲げの硬さが無い板だけの二重壁・0 の間隔は対象外・止める", () => {
    const limp = { ...gypsum, bendingStiffnessNm: 0 };
    expect(lineBridgeParameters([limp, air, limp], 0.455)).toBeNull();
    expect(() => lineBridgeParameters([gypsum, air, gypsum], 0)).toThrow(/E-CALC-001/);
  });
});

describe("合成", () => {
  it("同じ 30 dB 2つは 27.0 dB（透過率が2倍）", () => {
    expect(combineTransmissionLossDb(30, 30)).toBeCloseTo(26.9897, 4);
  });

  it("間柱でつながった値は、完全に独立した値を超えない", () => {
    const layers = [gypsum, air, wool, gypsum];
    for (const band of [-9, -3, 0, 3]) {
      const independent = bandTransmissionLossDb(layers, band);
      const bridged = bridgedBandTransmissionLossDb(layers, band, 0.455, independent);
      expect(bridged).toBeLessThanOrEqual(independent);
    }
  }, 60000);

  it("一重壁は null", () => {
    expect(bridgedBandTransmissionLossDb([gypsum], 0, 0.455, 30)).toBeNull();
  });
});
