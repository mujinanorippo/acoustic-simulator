// 実測との比較（検証）：単板の透過損失を、日本建築学会の指針に載った実測値と比べる。
// 無限に広い板の計算と、大きさの決まった試料の実測なので完全には一致しない。
// ここでは「大きく外れていないこと」（帯域ごとに ±7 dB 以内、5帯域の平均で 4 dB 以内）を確かめる。
import { describe, expect, it } from "vitest";
import data from "../../../tests/data/validation/measured-transmission-loss.json" with { type: "json" };
import { findMaterial, plateSurfaceDensityKgm2 } from "./materials.js";
import { bandTransmissionLossDb, bendingStiffnessFromCoincidenceNm } from "./tmm.js";

const MAX_BAND_DIFFERENCE_DB = 7;
const MAX_MEAN_DIFFERENCE_DB = 4;
const OCTAVE_CENTER_BAND_INDEXES = [-9, -6, -3, 0, 3]; // 125, 250, 500, 1000, 2000 Hz

function plateLayer(materialId) {
  const material = findMaterial(materialId);
  const thicknessM = material.values.thickness;
  const surfaceDensity = plateSurfaceDensityKgm2(material, thicknessM);
  return {
    kind: "plate",
    surfaceDensityKgm2: surfaceDensity,
    bendingStiffnessNm: bendingStiffnessFromCoincidenceNm(
      surfaceDensity,
      material.values.coincidenceProduct,
      thicknessM,
    ),
    lossFactorRatio: material.values.lossFactor,
  };
}

/** オクターブ帯域の透過損失：中に入る3つの 1/3 オクターブ帯域の透過率を平均する */
function octaveTransmissionLossDb(layers, centerBandIndex) {
  const taus = [-1, 0, 1].map(
    (offset) => 10 ** (-bandTransmissionLossDb(layers, centerBandIndex + offset) / 10),
  );
  return -10 * Math.log10(taus.reduce((sum, tau) => sum + tau, 0) / taus.length);
}

describe("単板の透過損失：実測との比較", () => {
  for (const item of data.cases) {
    it(`${item.name}`, () => {
      const layers = [plateLayer(item.materialId)];
      const differences = OCTAVE_CENTER_BAND_INDEXES.map(
        (band, index) => octaveTransmissionLossDb(layers, band) - item.measuredDb[index],
      );
      for (const difference of differences) {
        expect(Math.abs(difference)).toBeLessThanOrEqual(MAX_BAND_DIFFERENCE_DB);
      }
      const meanAbsolute =
        differences.reduce((sum, value) => sum + Math.abs(value), 0) / differences.length;
      expect(meanAbsolute).toBeLessThanOrEqual(MAX_MEAN_DIFFERENCE_DB);
    }, 60000);
  }
});
