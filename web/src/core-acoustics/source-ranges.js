// 音源の周波数範囲での透過損失：範囲に中心周波数が入る 1/3 オクターブ帯域の透過率を平均する。
// 範囲に入る帯域が無いときは、範囲の中央（対数）にいちばん近い帯域の値を使う。
const DB_PER_DECADE = 10;
const DECIMAL_BASE = 10;

/** results：{ centerHz, value } の並び（value は透過損失 [dB]）。範囲 [lowHz, highHz] の平均 [dB] */
export function rangeTransmissionLossDb(results, lowHz, highHz) {
  const inside = results.filter((band) => band.centerHz >= lowHz && band.centerHz <= highHz);
  const used =
    inside.length > 0
      ? inside
      : [
          results.reduce((best, band) => {
            const middle = Math.sqrt(lowHz * highHz);
            const distance = (item) => Math.abs(Math.log(item.centerHz / middle));
            return distance(band) < distance(best) ? band : best;
          }),
        ];
  const meanTau =
    used.reduce((sum, band) => sum + DECIMAL_BASE ** (-band.value / DB_PER_DECADE), 0) /
    used.length;
  return -DB_PER_DECADE * Math.log10(meanTau);
}
