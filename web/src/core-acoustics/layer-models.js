// 積層の各層の音響モデル（時間因子 e^{jωt}。質量のインピーダンスが +jωm になる向き）
import * as cx from "./complex.js";
import { besselRatioJ1OverJ0 } from "./bessel.js";
import { AIR, POROUS } from "./constants.js";
import { ERROR_CODES, requirePositiveFinite, requireRatio } from "./errors.js";

const THREE_HALVES = 1.5;
const TWO_PI = 2 * Math.PI;

/**
 * 空気の粘性係数 [Pa·s]（Sutherland の式）
 * μ = μref·(T/Tref)^(3/2)·(Tref + S)/(T + S)
 * 出典: CFD Online Wiki「Sutherland's law」 https://www.cfd-online.com/Wiki/Sutherland's_law
 */
export function airViscosityPas(temperatureK = AIR.temperatureK) {
  requirePositiveFinite(temperatureK, ERROR_CODES.NOT_POSITIVE_PROPERTY, "温度");
  const referenceK = AIR.sutherlandReferenceTemperatureK;
  const constantK = AIR.sutherlandConstantK;
  return (
    AIR.sutherlandReferenceViscosityPas *
    (temperatureK / referenceK) ** THREE_HALVES *
    ((referenceK + constantK) / (temperatureK + constantK))
  );
}

// Delany-Bazley-Miki モデルの係数（X = 10³·f/σ の形）
// 出典: Matelys APMR「Delany-Bazley-Miki model」（+jωt 規約と明記）
//   https://apmr.matelys.com/PropagationModels/MotionlessSkeleton/DelanyBazleyMikiModel.html
//   原典: Y. Miki, J. Acoust. Soc. Jpn. (E) 11(1), 19–24 (1990)
const MIKI_FREQUENCY_SCALE = 1e3;
const MIKI_IMPEDANCE_REAL = 5.5;
const MIKI_IMPEDANCE_IMAG = 8.43;
const MIKI_IMPEDANCE_EXPONENT = -0.632;
const MIKI_WAVENUMBER_REAL = 7.81;
const MIKI_WAVENUMBER_IMAG = 11.41;
const MIKI_WAVENUMBER_EXPONENT = -0.618;

// Delany-Bazley の測定データの範囲 0.01 < f/σ < 1（Matelys APMR に記載）。Miki の式も同じ
// データの回帰なので、この範囲外は参考値として扱う。Kirby（Applied Acoustics 86, 2014）は
// Miki 型の低周波補正には物理的根拠がないと指摘しており、照合テストでも f/σ ≪ 0.01 で
// 剛壁裏打ちの吸音率がごくわずかに負（最大 −1.2×10⁻⁴）になる例を確認した。
//   https://opus.lib.uts.edu.au/handle/10453/114497
export const MIKI_VALID_RANGE = Object.freeze({ min: 0.01, max: 1 });

/** f/σ が Delany-Bazley・Miki の元データの範囲内か */
export function isMikiInValidRange(frequencyHz, flowResistivityPasm2) {
  const ratio = frequencyHz / flowResistivityPasm2;
  return ratio >= MIKI_VALID_RANGE.min && ratio <= MIKI_VALID_RANGE.max;
}

/** 多孔質材（Miki）の特性インピーダンス [Pa·s/m] と複素波数 [1/m] */
export function mikiEquivalentFluid(frequencyHz, flowResistivityPasm2) {
  requirePositiveFinite(frequencyHz, ERROR_CODES.NOT_POSITIVE_FREQUENCY, "周波数");
  requirePositiveFinite(flowResistivityPasm2, ERROR_CODES.NOT_POSITIVE_PROPERTY, "流れ抵抗");
  const scaled = (MIKI_FREQUENCY_SCALE * frequencyHz) / flowResistivityPasm2;
  const impedanceTerm = scaled ** MIKI_IMPEDANCE_EXPONENT;
  const wavenumberTerm = scaled ** MIKI_WAVENUMBER_EXPONENT;
  const airImpedance = AIR.densityKgm3 * AIR.speedOfSoundMps;
  const airWavenumber = (TWO_PI * frequencyHz) / AIR.speedOfSoundMps;
  return {
    impedance: cx.complex(
      airImpedance * (1 + MIKI_IMPEDANCE_REAL * impedanceTerm),
      -airImpedance * MIKI_IMPEDANCE_IMAG * impedanceTerm,
    ),
    wavenumber: cx.complex(
      airWavenumber * (1 + MIKI_WAVENUMBER_REAL * wavenumberTerm),
      -airWavenumber * MIKI_WAVENUMBER_IMAG * wavenumberTerm,
    ),
  };
}

/**
 * 繊維系の多孔質材の流れ抵抗 [Pa·s/m²] を、かさ密度と繊維径から推定する（Bies & Hansen 1980）。
 * σ = K·ρ^n / d²。定数と出典は shared/constants/porous.json
 */
export function flowResistivityFromFiber(densityKgm3, fiberDiameterM) {
  requirePositiveFinite(densityKgm3, ERROR_CODES.NOT_POSITIVE_PROPERTY, "密度");
  requirePositiveFinite(fiberDiameterM, ERROR_CODES.NOT_POSITIVE_PROPERTY, "繊維径");
  return (
    (POROUS.biesHansenCoefficient * densityKgm3 ** POROUS.biesHansenExponent) / fiberDiameterM ** 2
  );
}

// 有孔板（Maa の厳密式＋端部補正）
// 出典: P. Cobo, Acoustics 3(4), 665–678 (2021)（Maa のモデルの整理）
//   https://www.mdpi.com/2624-599X/3/4/42
//   式(6) s = d·√(ρ0·ω/(4η))、式(8) Z_hole = jωρ0·t·[1 − 2/(s√−j)·J1(s√−j)/J0(s√−j)]⁻¹（÷φ）
//   式(9) 抵抗の端部補正 Rs = √(2ηωρ0)/2、式(10) 質量の端部補正 jωρ0·0.85d
// 穴どうしの干渉による端部補正の減少: Jaouen & Chevillotte, Acta Acust. 104, 243–250 (2018)
//   ε ≃ ε0·(1 − 1.33√φ − 0.07φ + 0.40φ^(3/2))（Ingard 型の計算を近似した式）
//   https://apmr.matelys.com/BasicsAcoustics/LengthCorrections/index.html
const PERFORATION_CONSTANT_DIVISOR = 4;
const END_CORRECTION_PER_DIAMETER = 0.85;
const INTERACTION_SQRT = 1.33;
const INTERACTION_LINEAR = 0.07;
const INTERACTION_THREE_HALVES = 0.4;
// √(−j) = e^(−jπ/4)
const EIGHTH_TURN_DIVISOR = 4;
const SQRT_MINUS_J = cx.exp(cx.complex(0, -Math.PI / EIGHTH_TURN_DIVISOR));

export function interactionFactor(perforationRatio) {
  return (
    1 -
    INTERACTION_SQRT * Math.sqrt(perforationRatio) -
    INTERACTION_LINEAR * perforationRatio +
    INTERACTION_THREE_HALVES * perforationRatio ** THREE_HALVES
  );
}

/** 有孔板の比音響インピーダンス [Pa·s/m]（板の面積あたり。剛な板として扱う） */
export function perforatedPlateImpedance(frequencyHz, plate) {
  requirePositiveFinite(frequencyHz, ERROR_CODES.NOT_POSITIVE_FREQUENCY, "周波数");
  requirePositiveFinite(plate.thicknessM, ERROR_CODES.NOT_POSITIVE_LENGTH, "有孔板の厚さ");
  requirePositiveFinite(plate.holeDiameterM, ERROR_CODES.NOT_POSITIVE_LENGTH, "穴径");
  const ratio = requireRatio(plate.perforationRatio, "開口率");
  requirePositiveFinite(ratio, ERROR_CODES.ABSORPTION_OUT_OF_RANGE, "開口率");
  const omega = TWO_PI * frequencyHz;
  const density = AIR.densityKgm3;
  const viscosity = airViscosityPas();
  const perforationConstant =
    plate.holeDiameterM * Math.sqrt((density * omega) / (PERFORATION_CONSTANT_DIVISOR * viscosity));
  const argument = cx.scale(SQRT_MINUS_J, perforationConstant);
  const viscousFactor = cx.sub(
    cx.ONE,
    cx.mul(cx.div(cx.complex(2), argument), besselRatioJ1OverJ0(argument)),
  );
  const holeImpedance = cx.div(cx.complex(0, omega * density * plate.thicknessM), viscousFactor);
  const endResistance = Math.sqrt(2 * viscosity * omega * density) / 2;
  const endMass =
    density * END_CORRECTION_PER_DIAMETER * plate.holeDiameterM * interactionFactor(ratio);
  const total = cx.add(holeImpedance, cx.complex(endResistance, omega * endMass));
  return cx.scale(total, 1 / ratio);
}
