// 伝達マトリクス法（TMM）による壁の遮音・吸音（仕様書「計算手法と根拠：壁の遮音・積層の吸音」）
// 時間因子 e^{jωt}。無限大の板を仮定する（有限寸法補正 FTMM は未実装。拡散入射は 0〜78° の
// field incidence で近似する）。
//
// 出典: K. Tageman, Chalmers 修士論文 2013:108
//   https://publications.lib.chalmers.se/records/fulltext/183451/183451.pdf
//   式(21)(22) 薄板 T = [[1, Zp],[0, 1]]、Zp = (B/jω)(k⁴sin⁴θ − kp⁴) = jωm + B(1+jη)k_t⁴/(jω)
//   式(33)     流体層 T = [[cos(kz·d), j·Z·sin(kz·d)], [j·sin(kz·d)/Z, cos(kz·d)]]、Z = Zc·k/kz
//   式(52)(53) τ = 4 / |T11 + T12/Z0 + Z0·T21 + T22|²、Z0 = ρ0c0/cosθ
//   式(16)     拡散入射 τd = ∫τ(θ)·sinθ·cosθ dθ / ∫sinθ·cosθ dθ（0〜θlim）
// 拡散入射の上限角 78°: shared/constants/calculation.json（VAC, Univ. of Kentucky）
import * as cx from "./complex.js";
import { AIR, CALCULATION } from "./constants.js";
import { AcousticsInputError, ERROR_CODES, requirePositiveFinite, requireRatio } from "./errors.js";
import { allBands, bandEdgesHz } from "./frequency-bands.js";
import { integrateWithResonances } from "./diffuse-integration.js";
import {
  isMikiInValidRange,
  mikiEquivalentFluid,
  perforatedPlateImpedance,
} from "./layer-models.js";

const TWO_PI = 2 * Math.PI;
// 度 → ラジアン（180° = π）
const DEGREES_PER_HALF_TURN = 180;
const DEG_TO_RAD = Math.PI / DEGREES_PER_HALF_TURN;
// 透過率 → dB（10·log10）
const DB_PER_DECADE = 10;
// τ = 4 / |…|² の 4
const TRANSMISSION_NUMERATOR = 4;
// 曲げ剛性 B = E·h³ / (12·(1 − ν²)) の 12（薄板理論。Crispin & Mertens ICA 2019 式(2)(3)と整合）
const BENDING_STIFFNESS_DIVISOR = 12;
const CUBE = 3;
const FOURTH_POWER = 4;

// 数値計算の設定（物理量ではない）
// 1/3オクターブ帯域の値：帯域内を対数等間隔に BAND_SAMPLES 点とって透過率を平均する
export const BAND_SAMPLES = 16;

function airImpedance() {
  return AIR.densityKgm3 * AIR.speedOfSoundMps;
}

/** 曲げ剛性 B [N·m] = E·h³ / (12(1−ν²)) */
export function bendingStiffnessNm({ youngsModulusPa, poissonRatio, thicknessM }) {
  requirePositiveFinite(youngsModulusPa, ERROR_CODES.NOT_POSITIVE_PROPERTY, "ヤング率");
  requirePositiveFinite(thicknessM, ERROR_CODES.NOT_POSITIVE_LENGTH, "板厚");
  requireRatio(poissonRatio, "ポアソン比");
  return (
    (youngsModulusPa * thicknessM ** CUBE) / (BENDING_STIFFNESS_DIVISOR * (1 - poissonRatio ** 2))
  );
}

/**
 * 「臨界周波数×板厚」fc·h [m/s] から曲げ剛性 B [N·m] を求める。fc = fc·h / h、
 * B = c⁴·m / (4π²·fc²)（Crispin & Mertens ICA 2019 式(3)：B = c0⁴ρh/(4π²fc²)、ρh = m）。
 * fc·h = 0 は「曲げ剛性を無視して質量だけで計算する」指定として 0 を返す。
 */
export function bendingStiffnessFromCoincidenceNm(
  surfaceDensityKgm2,
  coincidenceProductMps,
  thicknessM,
) {
  requirePositiveFinite(surfaceDensityKgm2, ERROR_CODES.NOT_POSITIVE_PROPERTY, "面密度");
  requirePositiveFinite(thicknessM, ERROR_CODES.NOT_POSITIVE_LENGTH, "板厚");
  if (coincidenceProductMps === 0) return 0;
  requirePositiveFinite(
    coincidenceProductMps,
    ERROR_CODES.NOT_POSITIVE_PROPERTY,
    "臨界周波数×板厚",
  );
  const criticalHz = coincidenceProductMps / thicknessM;
  return (AIR.speedOfSoundMps ** FOURTH_POWER * surfaceDensityKgm2) / (TWO_PI * criticalHz) ** 2;
}

/** コインシデンス限界周波数 fc = c²/(2π)·√(m/B)（Crispin & Mertens ICA 2019 式(3)） */
export function criticalFrequencyHz(surfaceDensityKgm2, bendingStiffness) {
  requirePositiveFinite(surfaceDensityKgm2, ERROR_CODES.NOT_POSITIVE_PROPERTY, "面密度");
  requirePositiveFinite(bendingStiffness, ERROR_CODES.NOT_POSITIVE_PROPERTY, "曲げ剛性");
  return (AIR.speedOfSoundMps ** 2 / TWO_PI) * Math.sqrt(surfaceDensityKgm2 / bendingStiffness);
}

/**
 * 二重壁の共鳴周波数 f0 = 1/(2π)·√(ρ0c0²/d·(1/m1 + 1/m2))（垂直入射の質量-空気-質量系）
 * 出典: Lund University VTAN01「Build.Ac.3 Analytical sound reduction models」
 */
export function massAirMassResonanceHz(surfaceDensity1Kgm2, surfaceDensity2Kgm2, gapM) {
  requirePositiveFinite(surfaceDensity1Kgm2, ERROR_CODES.NOT_POSITIVE_PROPERTY, "1枚目の面密度");
  requirePositiveFinite(surfaceDensity2Kgm2, ERROR_CODES.NOT_POSITIVE_PROPERTY, "2枚目の面密度");
  requirePositiveFinite(gapM, ERROR_CODES.NOT_POSITIVE_LENGTH, "空気層の厚さ");
  const stiffness = (AIR.densityKgm3 * AIR.speedOfSoundMps ** 2) / gapM;
  return Math.sqrt(stiffness * (1 / surfaceDensity1Kgm2 + 1 / surfaceDensity2Kgm2)) / TWO_PI;
}

function checkLayer(layer, index) {
  const label = `${index + 1}層目`;
  switch (layer.kind) {
    case "air":
      requirePositiveFinite(layer.thicknessM, ERROR_CODES.NOT_POSITIVE_LENGTH, `${label}の厚さ`);
      return;
    case "porous":
      requirePositiveFinite(layer.thicknessM, ERROR_CODES.NOT_POSITIVE_LENGTH, `${label}の厚さ`);
      requirePositiveFinite(
        layer.flowResistivityPasm2,
        ERROR_CODES.NOT_POSITIVE_PROPERTY,
        `${label}の流れ抵抗`,
      );
      return;
    case "plate":
      requirePositiveFinite(
        layer.surfaceDensityKgm2,
        ERROR_CODES.NOT_POSITIVE_PROPERTY,
        `${label}の面密度`,
      );
      if (!(Number.isFinite(layer.bendingStiffnessNm) && layer.bendingStiffnessNm >= 0)) {
        throw new AcousticsInputError(
          ERROR_CODES.NOT_POSITIVE_PROPERTY,
          `${label}の曲げ剛性は0以上の数で入力してください`,
        );
      }
      requireRatio(layer.lossFactorRatio, `${label}の損失係数`);
      return;
    case "perforated":
      requirePositiveFinite(layer.thicknessM, ERROR_CODES.NOT_POSITIVE_LENGTH, `${label}の厚さ`);
      requirePositiveFinite(layer.holeDiameterM, ERROR_CODES.NOT_POSITIVE_LENGTH, `${label}の穴径`);
      requireRatio(layer.perforationRatio, `${label}の開口率`);
      requirePositiveFinite(
        layer.perforationRatio,
        ERROR_CODES.ABSORPTION_OUT_OF_RANGE,
        `${label}の開口率`,
      );
      return;
    default:
      throw new AcousticsInputError(
        ERROR_CODES.UNKNOWN_LAYER,
        `${label}の種類「${layer.kind}」は使えません`,
      );
  }
}

export function checkLayers(layers) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new AcousticsInputError(ERROR_CODES.UNKNOWN_LAYER, "層が1つもありません");
  }
  layers.forEach(checkLayer);
}

function seriesImpedanceMatrix(impedance) {
  return [
    [cx.ONE, impedance],
    [cx.ZERO, cx.ONE],
  ];
}

// 以下、入射角は u = sin²θ（複素数も可）で表す。拡散入射の積分で共鳴の位置を
// 複素平面上で探すため、u について解析的な形で書いている。

/** 媒質中の法線方向波数 kz = √(k² − kt²)。減衰する向き（Im ≤ 0）を選ぶ */
function normalWavenumber(wavenumber, tangentialSquared) {
  const root = cx.sqrt(cx.sub(cx.mul(wavenumber, wavenumber), tangentialSquared));
  return root.im > 0 ? cx.scale(root, -1) : root;
}

function fluidLayerMatrix(characteristicImpedance, wavenumber, thicknessM, tangentialSquared) {
  const normal = normalWavenumber(wavenumber, tangentialSquared);
  const impedance = cx.div(cx.mul(characteristicImpedance, wavenumber), normal);
  const phase = cx.scale(normal, thicknessM);
  const cosine = cx.cos(phase);
  const jSine = cx.mul(cx.IMAGINARY_UNIT, cx.sin(phase));
  return [
    [cosine, cx.mul(jSine, impedance)],
    [cx.div(jSine, impedance), cosine],
  ];
}

function plateImpedance(layer, omega, tangentialSquared) {
  // jωm + B(1+jη)·kt⁴ / (jω)
  const stiffness = cx.complex(
    layer.bendingStiffnessNm,
    layer.bendingStiffnessNm * layer.lossFactorRatio,
  );
  const bending = cx.div(
    cx.mul(stiffness, cx.mul(tangentialSquared, tangentialSquared)),
    cx.complex(0, omega),
  );
  return cx.add(cx.complex(0, omega * layer.surfaceDensityKgm2), bending);
}

/** 周波数を決めた層の伝達マトリクス関数（角度によらない量は先に1回だけ計算する） */
function layerAtFrequency(layer, frequencyHz) {
  const omega = TWO_PI * frequencyHz;
  switch (layer.kind) {
    case "air": {
      const impedance = cx.complex(airImpedance());
      const wavenumber = cx.complex(omega / AIR.speedOfSoundMps);
      return (tangentialSquared) =>
        fluidLayerMatrix(impedance, wavenumber, layer.thicknessM, tangentialSquared);
    }
    case "porous": {
      const fluid = mikiEquivalentFluid(frequencyHz, layer.flowResistivityPasm2);
      return (tangentialSquared) =>
        fluidLayerMatrix(fluid.impedance, fluid.wavenumber, layer.thicknessM, tangentialSquared);
    }
    case "plate":
      return (tangentialSquared) =>
        seriesImpedanceMatrix(plateImpedance(layer, omega, tangentialSquared));
    default: {
      const matrix = seriesImpedanceMatrix(perforatedPlateImpedance(frequencyHz, layer));
      return () => matrix;
    }
  }
}

function multiply(left, right) {
  return [0, 1].map((row) =>
    [0, 1].map((column) =>
      cx.add(cx.mul(left[row][0], right[0][column]), cx.mul(left[row][1], right[1][column])),
    ),
  );
}

/** 周波数を決めた積層全体の伝達マトリクス関数。引数は sin²θ（複素数） */
function systemAtFrequency(layers, frequencyHz) {
  const airWavenumber = (TWO_PI * frequencyHz) / AIR.speedOfSoundMps;
  const parts = layers.map((layer) => layerAtFrequency(layer, frequencyHz));
  return (sinSquared) => {
    const tangentialSquared = cx.scale(sinSquared, airWavenumber ** 2);
    return parts.map((part) => part(tangentialSquared)).reduce(multiply);
  };
}

/** 積層全体の伝達マトリクス（音源側の層から順に掛ける）。sinSquared = sin²θ（複素数） */
export function systemMatrix(layers, frequencyHz, sinSquared) {
  return systemAtFrequency(layers, frequencyHz)(sinSquared);
}

/** D(u) = T11 + T12/Z0 + Z0·T21 + T22（Z0 = ρ0c0/cosθ、u = sin²θ）を返す関数。τ = 4/|D|² */
function denominatorAtFrequency(layers, frequencyHz) {
  const system = systemAtFrequency(layers, frequencyHz);
  return (sinSquared) => {
    const matrix = system(sinSquared);
    const cosine = cx.sqrt(cx.sub(cx.ONE, sinSquared));
    const outsideImpedance = cx.div(cx.complex(airImpedance()), cosine);
    return cx.add(
      cx.add(matrix[0][0], cx.div(matrix[0][1], outsideImpedance)),
      cx.add(cx.mul(outsideImpedance, matrix[1][0]), matrix[1][1]),
    );
  };
}

export function transmissionDenominator(layers, frequencyHz, sinSquared) {
  return denominatorAtFrequency(layers, frequencyHz)(sinSquared);
}

function tauFromDenominator(denominatorValue) {
  const tau = TRANSMISSION_NUMERATOR / cx.abs2(denominatorValue);
  if (!Number.isFinite(tau)) {
    throw new AcousticsInputError(
      ERROR_CODES.OUT_OF_NUMERIC_RANGE,
      "数値が計算範囲を超えました（層が厚すぎる可能性があります）",
    );
  }
  return tau;
}

export function tauFromSinSquared(layers, frequencyHz, sinSquared) {
  return tauFromDenominator(transmissionDenominator(layers, frequencyHz, cx.complex(sinSquared)));
}

/** 入射角 θ [rad] の透過率 τ（両側が空気） */
export function transmissionCoefficient(layers, frequencyHz, incidenceRad = 0) {
  checkLayers(layers);
  requirePositiveFinite(frequencyHz, ERROR_CODES.NOT_POSITIVE_FREQUENCY, "周波数");
  if (!(incidenceRad >= 0 && incidenceRad < Math.PI / 2)) {
    throw new AcousticsInputError(
      ERROR_CODES.INVALID_ANGLE,
      `入射角 ${incidenceRad} rad は 0 以上 π/2 未満で指定してください`,
    );
  }
  return tauFromSinSquared(layers, frequencyHz, Math.sin(incidenceRad) ** 2);
}

/** 拡散入射（0〜θlim）の透過率。u = sin²θ で (1/u_lim)∫τ du（積分法は diffuse-integration.js） */
export function diffuseTransmissionCoefficient(
  layers,
  frequencyHz,
  limitDeg = CALCULATION.fieldIncidenceLimitDeg,
) {
  checkLayers(layers);
  requirePositiveFinite(frequencyHz, ERROR_CODES.NOT_POSITIVE_FREQUENCY, "周波数");
  const upper = Math.sin(limitDeg * DEG_TO_RAD) ** 2;
  const denominator = denominatorAtFrequency(layers, frequencyHz);
  const integral = integrateWithResonances(
    (sinSquared) => tauFromDenominator(denominator(cx.complex(sinSquared))),
    denominator,
    upper,
  );
  return integral / upper;
}

export function transmissionLossDb(tau) {
  return -DB_PER_DECADE * Math.log10(tau);
}

/** 1/3オクターブ帯域 x の拡散入射透過損失 [dB] */
export function bandTransmissionLossDb(
  layers,
  bandIndex,
  limitDeg = CALCULATION.fieldIncidenceLimitDeg,
) {
  const { lowerHz, upperHz } = bandEdgesHz(bandIndex);
  let sum = 0;
  for (let i = 0; i < BAND_SAMPLES; i += 1) {
    const frequency = lowerHz * (upperHz / lowerHz) ** ((i + 1 / 2) / BAND_SAMPLES);
    sum += diffuseTransmissionCoefficient(layers, frequency, limitDeg);
  }
  return transmissionLossDb(sum / BAND_SAMPLES);
}

/**
 * 剛壁で裏打ちした積層の垂直入射吸音率。表面インピーダンス Zs = T11/T21、R = (Zs − Z0)/(Zs + Z0)。
 * A = T11、B = Z0·T21 とすると α = 1 − |R|² = 4·Re(A·B̄)/|A + B|²（1 − |R|² の引き算で
 * 桁落ちしないよう、式変形した形で計算する。T21 = 0 でも割り算にならない）
 */
export function normalIncidenceAbsorptionRigidBacked(layers, frequencyHz) {
  checkLayers(layers);
  requirePositiveFinite(frequencyHz, ERROR_CODES.NOT_POSITIVE_FREQUENCY, "周波数");
  const matrix = systemMatrix(layers, frequencyHz, cx.ZERO);
  const front = matrix[0][0];
  const loaded = cx.scale(matrix[1][0], airImpedance());
  const crossReal = front.re * loaded.re + front.im * loaded.im;
  return (TRANSMISSION_NUMERATOR * crossReal) / cx.abs2(cx.add(front, loaded));
}

/** 多孔質材の層のうち、周波数 frequencyHz で Miki モデルの適用範囲外になるものの番号（0 始まり） */
export function porousLayersOutOfRange(layers, frequencyHz) {
  return layers
    .map((layer, index) => ({ layer, index }))
    .filter(
      ({ layer }) =>
        layer.kind === "porous" && !isMikiInValidRange(frequencyHz, layer.flowResistivityPasm2),
    )
    .map(({ index }) => index);
}

/**
 * 1/3オクターブ帯域ごとの結果：拡散入射の透過損失、剛壁裏打ちの垂直入射吸音率（中心周波数）、
 * Miki モデルの適用範囲外になる層の番号。onProgress(終わった帯域数, 全帯域数) は帯域ごとに呼ぶ
 */
export function bandResults(layers, onProgress = () => {}) {
  checkLayers(layers);
  const bands = allBands();
  return bands.map((band, index) => {
    const result = {
      ...band,
      transmissionLossDb: bandTransmissionLossDb(layers, band.bandIndex),
      absorptionRatio: normalIncidenceAbsorptionRigidBacked(layers, band.centerHz),
      porousOutOfRange: porousLayersOutOfRange(layers, band.centerHz),
    };
    // 進み具合の通知（計算を別スレッドで動かす画面が、何帯域目まで終わったかを表示するため）
    onProgress(index + 1, bands.length);
    return result;
  });
}

/**
 * 板が2枚で、その間が空気層・多孔質材だけのとき、二重壁の共鳴周波数の目安 [Hz]（垂直入射の式）。
 * 当てはまらない積層では null。間が多孔質材の場合も空気層とみなした目安。
 */
export function doubleWallResonanceHz(layers) {
  const plateIndices = layers.flatMap((layer, index) => (layer.kind === "plate" ? [index] : []));
  if (plateIndices.length !== 2 || layers.some((layer) => layer.kind === "perforated")) {
    return null;
  }
  const [first, second] = plateIndices;
  const between = layers.slice(first + 1, second);
  if (between.length === 0) {
    return null;
  }
  const gapM = between.reduce((sum, layer) => sum + layer.thicknessM, 0);
  return massAirMassResonanceHz(
    layers[first].surfaceDensityKgm2,
    layers[second].surfaceDensityKgm2,
    gapM,
  );
}

/** 曲げ剛性のある板ごとのコインシデンス限界周波数 [Hz]（{ index, criticalHz } の並び） */
export function plateCriticalFrequencies(layers) {
  return layers.flatMap((layer, index) =>
    layer.kind === "plate" && layer.bendingStiffnessNm > 0
      ? [
          {
            index,
            criticalHz: criticalFrequencyHz(layer.surfaceDensityKgm2, layer.bendingStiffnessNm),
          },
        ]
      : [],
  );
}
