// 間柱でつながった二重壁（固体伝搬）の透過損失：Sharp（1978）の線接続のモデル。
//   R_bridge = R_M(m1 + m2) + 10·log10(b·fc) + 20·log10(m1 / (m1 + m2)) − 18 [dB]
//   R_M：両面の合計の面密度の板1枚としたときの透過損失（質量則、拡散入射）
//   b：間柱の間隔 [m]、fc：2つの面のうち高いほうの臨界周波数 [Hz]、m1：音が入る側の面密度
// 出典：Marshall Day Acoustics（INSUL）セミナー資料「Design of walls and floors for good sound
// insulation」の Effect of Connections の式、Ballagh（New Zealand Acoustics 16(2), 2003）が
// Sharp（Noise Control Engineering 11, 53–63, 1978）として引用。
// 空気層を通る分（伝達マトリクス法）と間柱を通る分の透過率を足して、全体の透過損失にする。
import { requirePositiveFinite, ERROR_CODES } from "./errors.js";
import { bandTransmissionLossDb, criticalFrequencyHz } from "./tmm.js";

const DB_PER_DECADE = 10;
const DECIMAL_BASE = 10;
const LINE_CONSTANT_DB = 18;

function isCavity(layer) {
  return layer.kind === "air" || layer.kind === "porous";
}

/**
 * 積層を「面1・空気層（多孔質材を含む）・面2」に分ける。板以外の面材や、空気層が2つ以上の
 * 積層は対象外（null）
 */
export function splitDoubleLeaf(layers) {
  const firstCavity = layers.findIndex(isCavity);
  if (firstCavity <= 0) return null;
  let lastCavity = firstCavity;
  while (lastCavity + 1 < layers.length && isCavity(layers[lastCavity + 1])) lastCavity += 1;
  const leaf1 = layers.slice(0, firstCavity);
  const leaf2 = layers.slice(lastCavity + 1);
  const isPlates = (leaf) => leaf.length > 0 && leaf.every((layer) => layer.kind === "plate");
  if (!isPlates(leaf1) || !isPlates(leaf2)) return null;
  return { leaf1, leaf2 };
}

function leafMass(leaf) {
  return leaf.reduce((sum, layer) => sum + layer.surfaceDensityKgm2, 0);
}

/** 面の臨界周波数：面の中でいちばん重い板の値（曲げの硬さが無い板だけなら null） */
function leafCriticalHz(leaf) {
  const stiff = leaf.filter((layer) => layer.bendingStiffnessNm > 0);
  if (stiff.length === 0) return null;
  const heaviest = stiff.reduce((best, layer) =>
    layer.surfaceDensityKgm2 > best.surfaceDensityKgm2 ? layer : best,
  );
  return criticalFrequencyHz(heaviest.surfaceDensityKgm2, heaviest.bendingStiffnessNm);
}

/**
 * 間柱でつながった場合の補正のもとになる値。対象外の積層は null。
 * { m1, m2, criticalHz, offsetDb }：R_bridge = R_M(m1 + m2) + offsetDb
 */
export function lineBridgeParameters(layers, studSpacingM) {
  requirePositiveFinite(studSpacingM, ERROR_CODES.NOT_POSITIVE_LENGTH, "間柱の間隔");
  const leaves = splitDoubleLeaf(layers);
  if (leaves === null) return null;
  const m1 = leafMass(leaves.leaf1);
  const m2 = leafMass(leaves.leaf2);
  const criticals = [leafCriticalHz(leaves.leaf1), leafCriticalHz(leaves.leaf2)].filter(
    (value) => value !== null,
  );
  if (criticals.length === 0) return null;
  const criticalHz = Math.max(...criticals);
  const offsetDb =
    DB_PER_DECADE * Math.log10(studSpacingM * criticalHz) +
    2 * DB_PER_DECADE * Math.log10(m1 / (m1 + m2)) -
    LINE_CONSTANT_DB;
  return { m1, m2, criticalHz, offsetDb };
}

/** 透過損失 [dB] 2つ（空気層経由と間柱経由）を、透過率の和として合成する */
export function combineTransmissionLossDb(first, second) {
  const tau = DECIMAL_BASE ** (-first / DB_PER_DECADE) + DECIMAL_BASE ** (-second / DB_PER_DECADE);
  return -DB_PER_DECADE * Math.log10(tau);
}

/**
 * 帯域ごとの「間柱でつながった」透過損失。cavityTlDb は完全に独立した二重壁の値（伝達マトリクス法）。
 * 対象外の積層では null
 */
export function bridgedBandTransmissionLossDb(layers, bandIndex, studSpacingM, cavityTlDb) {
  const parameters = lineBridgeParameters(layers, studSpacingM);
  if (parameters === null) return null;
  const massLaw = bandTransmissionLossDb(
    [
      {
        kind: "plate",
        surfaceDensityKgm2: parameters.m1 + parameters.m2,
        bendingStiffnessNm: 0,
        lossFactorRatio: 0,
      },
    ],
    bandIndex,
  );
  return combineTransmissionLossDb(cavityTlDb, massLaw + parameters.offsetDb);
}
