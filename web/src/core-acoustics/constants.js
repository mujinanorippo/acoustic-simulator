// 出典付き定数（shared/constants/）の読み込み。
// 値・単位・出典は JSON 側にあり、ここでは数値だけを取り出す。出典は各 JSON を参照。
import air from "../../../shared/constants/air.json" with { type: "json" };
import calculation from "../../../shared/constants/calculation.json" with { type: "json" };
import frequencyBands from "../../../shared/constants/frequency-bands.json" with { type: "json" };

function valueOf(constantFile, key) {
  return constantFile.values[key].value;
}

export const AIR = Object.freeze({
  temperatureK: valueOf(air, "temperature"),
  speedOfSoundMps: valueOf(air, "speedOfSound"),
  densityKgm3: valueOf(air, "density"),
  sutherlandReferenceViscosityPas: valueOf(air, "sutherlandReferenceViscosity"),
  sutherlandReferenceTemperatureK: valueOf(air, "sutherlandReferenceTemperature"),
  sutherlandConstantK: valueOf(air, "sutherlandConstant"),
});

export const CALCULATION = Object.freeze({
  fieldIncidenceLimitDeg: valueOf(calculation, "fieldIncidenceLimitAngle"),
});

export const FREQUENCY_BANDS = Object.freeze({
  referenceFrequencyHz: valueOf(frequencyBands, "referenceFrequency"),
  octaveRatioLog10: valueOf(frequencyBands, "octaveRatioLog10"),
  bandsPerOctave: valueOf(frequencyBands, "bandsPerOctave"),
  bandIndexMin: valueOf(frequencyBands, "bandIndexMin"),
  bandIndexMax: valueOf(frequencyBands, "bandIndexMax"),
  ratingBandIndexMin: valueOf(frequencyBands, "ratingBandIndexMin"),
  ratingBandIndexMax: valueOf(frequencyBands, "ratingBandIndexMax"),
  nominalCenterFrequenciesHz: Object.freeze([
    ...valueOf(frequencyBands, "nominalCenterFrequencies"),
  ]),
});
