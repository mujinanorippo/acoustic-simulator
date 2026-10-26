// 間柱でつながった二重壁（固体伝搬）の透過損失：Sharp（1978）の線接続のモデル。
//   R_bridge = R_M(m1 + m2) + 10·log10(b·fc) + 20·log10(m1 / (m1 + m2)) − 18 [dB]
//   R_M：両面の合計の面密度の板1枚としたときの透過損失（質量則、拡散入射）
//   b：間柱の間隔 [m]、fc：面のうちいちばん高い臨界周波数 [Hz]、m1：音が入る側の面の面密度、
//   m2：残りの面の合計（三重壁以上は、すべての面が間柱・胴縁でつながっているとみなす近似）
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
 * 積層を、空気層（多孔質材を含む）で区切られた「面」（板が続くところ）に分ける。
 * 室内側・室外側の端にある空気層は無視する。面に板以外（有孔板）がある積層や、面が1つしか
 * ない（一重壁）積層は対象外（null）。三重壁以上は、すべての面が間柱・胴縁でつながっている
 * とみなす（固体伝搬を絶縁していない前提）
 */
export function splitLeaves(layers) {
  const leaves = [];
  let current = [];
  for (const layer of layers) {
    if (isCavity(layer)) {
      if (current.length > 0) leaves.push(current);
      current = [];
    } else {
      current.push(layer);
    }
  }
  if (current.length > 0) leaves.push(current);
  if (leaves.length < 2) return null;
  if (leaves.some((leaf) => leaf.some((layer) => layer.kind !== "plate"))) return null;
  return leaves;
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
  const leaves = splitLeaves(layers);
  if (leaves === null) return null;
  // m1：音が入る側の面、m2：それ以外の面の合計（三重壁以上も、間柱で1つにつながるとみなす）
  const m1 = leafMass(leaves[0]);
  const m2 = leaves.slice(1).reduce((sum, leaf) => sum + leafMass(leaf), 0);
  const criticals = leaves.map(leafCriticalHz).filter((value) => value !== null);
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
