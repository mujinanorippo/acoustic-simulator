// 簡易残響時間（仕様書「計算手法と根拠：簡易モードの残響時間」）
// Sabine・Eyring・Fitzroy・Arau-Puchades を並べて出す。空気吸収は含めない（フェーズ1）。
//
// 出典:
//   Sabine  T = 24·ln(10)/c · V / (S·ᾱ)          pyrato（Kuttruff, Room Acoustics 4th ed.）
//   Eyring  T = 24·ln(10)/c · V / (−S·ln(1−ᾱ))    pyrato（Eyring, JASA 1, 1930）
//     https://pyrato.readthedocs.io/en/stable/modules/parametric.html
//   Fitzroy T = 0.161·V/S² · Σ_j (−S_j / ln(1−α_j))            Prawda ほか SMC 2020 式(5)
//   Arau    T = Π_j [0.161·V / (−S·ln(1−α_j))]^(S_j/S)        Prawda ほか SMC 2020 式(6)
//     https://acris.aalto.fi/ws/portalfiles/portal/52515211/Evaluation_of_reverberation_time_models.pdf
//   j は x・y・z の3軸。S_j はその軸に垂直な向かい合う面の合計面積、α_j はその面の面積加重平均吸音率。
//   0.161 は 24·ln(10)/c を c ≈ 343 m/s で丸めた値なので、ここでは c から 24·ln(10)/c を計算して使う。
import { AIR } from "./constants.js";
import { AcousticsInputError, ERROR_CODES, requirePositiveFinite, requireRatio } from "./errors.js";

// 残響時間の定義：音のエネルギーが 60 dB 減衰するまでの時間
const REVERBERATION_DECAY_DB = 60;
// dB = 10·log10(エネルギー比)
const DB_PER_DECADE = 10;
// 拡散音場の平均自由行程 4V/S の係数 4（24 = 4 × 60/10）
const MEAN_FREE_PATH_FACTOR = 4;

export const AXES = Object.freeze(["x", "y", "z"]);

/** 24·ln(10)/c [s/m]。c を省略すると 20 °C の空気 */
export function sabineCoefficientSPerM(speedOfSoundMps = AIR.speedOfSoundMps) {
  requirePositiveFinite(speedOfSoundMps, ERROR_CODES.NOT_POSITIVE_PROPERTY, "音速");
  return (
    (MEAN_FREE_PATH_FACTOR * (REVERBERATION_DECAY_DB / DB_PER_DECADE) * Math.LN10) / speedOfSoundMps
  );
}

function checkRoom(room) {
  requirePositiveFinite(room.volumeM3, ERROR_CODES.NOT_POSITIVE_LENGTH, "部屋の体積");
  if (!Array.isArray(room.surfaces) || room.surfaces.length === 0) {
    throw new AcousticsInputError(ERROR_CODES.NOT_POSITIVE_LENGTH, "面が1つもありません");
  }
  room.surfaces.forEach((surface, index) => {
    requirePositiveFinite(surface.areaM2, ERROR_CODES.NOT_POSITIVE_LENGTH, `面${index + 1}の面積`);
    requireRatio(surface.absorptionRatio, `面${index + 1}の吸音率`);
  });
}

function totals(surfaces) {
  let areaM2 = 0;
  let absorptionAreaM2 = 0;
  for (const surface of surfaces) {
    areaM2 += surface.areaM2;
    absorptionAreaM2 += surface.areaM2 * surface.absorptionRatio;
  }
  return { areaM2, absorptionAreaM2, meanAbsorptionRatio: absorptionAreaM2 / areaM2 };
}

function requireSomeAbsorption(absorptionRatio, label) {
  if (absorptionRatio <= 0) {
    throw new AcousticsInputError(
      ERROR_CODES.NO_ABSORPTION,
      `${label}の吸音がゼロのため残響時間が無限大になります`,
    );
  }
}

/** −ln(1−α)。α = 1 のときは無限大 */
function eyringExponent(absorptionRatio) {
  return -Math.log1p(-absorptionRatio);
}

/** Sabine の残響時間 [s] */
export function reverberationTimeSabine(room, speedOfSoundMps = AIR.speedOfSoundMps) {
  checkRoom(room);
  const { absorptionAreaM2, meanAbsorptionRatio } = totals(room.surfaces);
  requireSomeAbsorption(meanAbsorptionRatio, "部屋全体");
  return (sabineCoefficientSPerM(speedOfSoundMps) * room.volumeM3) / absorptionAreaM2;
}

/** Eyring の残響時間 [s] */
export function reverberationTimeEyring(room, speedOfSoundMps = AIR.speedOfSoundMps) {
  checkRoom(room);
  const { areaM2, meanAbsorptionRatio } = totals(room.surfaces);
  requireSomeAbsorption(meanAbsorptionRatio, "部屋全体");
  return (
    (sabineCoefficientSPerM(speedOfSoundMps) * room.volumeM3) /
    (areaM2 * eyringExponent(meanAbsorptionRatio))
  );
}

/** 軸ごとの面積 S_j と平均吸音率 α_j */
function axisGroups(surfaces) {
  return AXES.map((axis) => {
    const members = surfaces.filter((surface) => surface.axis === axis);
    if (members.length === 0) {
      throw new AcousticsInputError(
        ERROR_CODES.MISSING_AXIS,
        `${axis}軸に垂直な面がありません（Fitzroy・Arau-Puchades は直方体の部屋が前提です）`,
      );
    }
    const { areaM2, meanAbsorptionRatio } = totals(members);
    requireSomeAbsorption(meanAbsorptionRatio, `${axis}軸方向の面`);
    return { axis, areaM2, meanAbsorptionRatio };
  });
}

/** Fitzroy の残響時間 [s] */
export function reverberationTimeFitzroy(room, speedOfSoundMps = AIR.speedOfSoundMps) {
  checkRoom(room);
  const { areaM2 } = totals(room.surfaces);
  const sum = axisGroups(room.surfaces).reduce(
    (acc, group) => acc + group.areaM2 / eyringExponent(group.meanAbsorptionRatio),
    0,
  );
  return ((sabineCoefficientSPerM(speedOfSoundMps) * room.volumeM3) / areaM2 ** 2) * sum;
}

/** Arau-Puchades の残響時間 [s] */
export function reverberationTimeArauPuchades(room, speedOfSoundMps = AIR.speedOfSoundMps) {
  checkRoom(room);
  const { areaM2 } = totals(room.surfaces);
  const coefficientSPerM = sabineCoefficientSPerM(speedOfSoundMps);
  return axisGroups(room.surfaces).reduce((acc, group) => {
    const axisTimeS =
      (coefficientSPerM * room.volumeM3) / (areaM2 * eyringExponent(group.meanAbsorptionRatio));
    return acc * axisTimeS ** (group.areaM2 / areaM2);
  }, 1);
}

/**
 * 直方体の部屋の面一覧を作る。
 * faceAbsorption は { xMin, xMax, yMin, yMax, zMin, zMax } の吸音率（xMin は x = 0 の壁）。
 */
export function rectangularRoom({ lengthXM, widthYM, heightZM }, faceAbsorption) {
  requirePositiveFinite(lengthXM, ERROR_CODES.NOT_POSITIVE_LENGTH, "部屋の奥行（X）");
  requirePositiveFinite(widthYM, ERROR_CODES.NOT_POSITIVE_LENGTH, "部屋の幅（Y）");
  requirePositiveFinite(heightZM, ERROR_CODES.NOT_POSITIVE_LENGTH, "天井高（Z）");
  const faces = [
    ["xMin", "x", widthYM * heightZM],
    ["xMax", "x", widthYM * heightZM],
    ["yMin", "y", lengthXM * heightZM],
    ["yMax", "y", lengthXM * heightZM],
    ["zMin", "z", lengthXM * widthYM],
    ["zMax", "z", lengthXM * widthYM],
  ];
  return {
    volumeM3: lengthXM * widthYM * heightZM,
    surfaces: faces.map(([name, axis, areaM2]) => ({
      name,
      axis,
      areaM2,
      absorptionRatio: requireRatio(faceAbsorption[name], `${name}面の吸音率`),
    })),
  };
}

/** 4つの式をまとめて計算する */
export function reverberationTimes(room, speedOfSoundMps = AIR.speedOfSoundMps) {
  return {
    sabineS: reverberationTimeSabine(room, speedOfSoundMps),
    eyringS: reverberationTimeEyring(room, speedOfSoundMps),
    fitzroyS: reverberationTimeFitzroy(room, speedOfSoundMps),
    arauPuchadesS: reverberationTimeArauPuchades(room, speedOfSoundMps),
  };
}
