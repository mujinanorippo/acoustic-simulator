// 1/3オクターブ帯域（全モジュール共通の帯域表 shared/constants/frequency-bands.json）
// 出典: IEC 61260-1:2014 の10進法の定義（acoustic-toolbox の解説で確認）
//   中心周波数 fm = fr · G^(x/b)（b が奇数）、帯域端 fm · G^(±1/(2b))、G = 10^0.3
//   https://acoustic-toolbox.readthedocs.io/en/latest/standards/iec_61260_1_2014/
import { FREQUENCY_BANDS } from "./constants.js";
import { AcousticsInputError, ERROR_CODES } from "./errors.js";

const { referenceFrequencyHz, octaveRatioLog10, bandsPerOctave } = FREQUENCY_BANDS;
const HALF = 0.5;
// G = 10^0.3 の底（10進法の定義）
const DECIMAL_BASE = 10;

function octaveRatioPower(exponent) {
  return DECIMAL_BASE ** (octaveRatioLog10 * exponent);
}

/** 帯域番号 x の正確な中心周波数 [Hz] */
export function exactCenterFrequencyHz(bandIndex) {
  if (
    !Number.isInteger(bandIndex) ||
    bandIndex < FREQUENCY_BANDS.bandIndexMin ||
    bandIndex > FREQUENCY_BANDS.bandIndexMax
  ) {
    throw new AcousticsInputError(
      ERROR_CODES.BAND_OUT_OF_RANGE,
      `帯域番号 ${bandIndex} は帯域表の範囲外です`,
    );
  }
  return referenceFrequencyHz * octaveRatioPower(bandIndex / bandsPerOctave);
}

/** 帯域番号 x の下端・上端周波数 [Hz] */
export function bandEdgesHz(bandIndex) {
  const centerHz = exactCenterFrequencyHz(bandIndex);
  const halfBandRatio = octaveRatioPower(HALF / bandsPerOctave);
  return { lowerHz: centerHz / halfBandRatio, upperHz: centerHz * halfBandRatio };
}

/** 帯域表の全帯域（呼び周波数・正確な中心周波数・帯域端・評価範囲か） */
export function allBands() {
  const bands = [];
  for (
    let index = FREQUENCY_BANDS.bandIndexMin;
    index <= FREQUENCY_BANDS.bandIndexMax;
    index += 1
  ) {
    bands.push({
      bandIndex: index,
      nominalHz: FREQUENCY_BANDS.nominalCenterFrequenciesHz[index - FREQUENCY_BANDS.bandIndexMin],
      centerHz: exactCenterFrequencyHz(index),
      ...bandEdgesHz(index),
      isRatingBand:
        index >= FREQUENCY_BANDS.ratingBandIndexMin && index <= FREQUENCY_BANDS.ratingBandIndexMax,
    });
  }
  return bands;
}
