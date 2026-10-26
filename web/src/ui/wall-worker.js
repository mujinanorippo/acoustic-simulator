// 壁の遮音計算を画面とは別のスレッドで動かす（計算中も画面が固まらず、「中止」で止められるように）
// 受け取る: { layers, studSpacingM }  送る: { type: "progress", done, total } / { type: "done", results } /
//          { type: "error", message }
import { bridgedBandTransmissionLossDb } from "../core-acoustics/bridging.js";
import { bandResults } from "../core-acoustics/tmm.js";

self.addEventListener("message", (event) => {
  try {
    const { layers, studSpacingM } = event.data;
    const results = bandResults(layers, (done, total) =>
      self.postMessage({ type: "progress", done, total }),
    ).map((band) => ({
      ...band,
      // 間柱でつながった場合（固体伝搬あり）。二重壁でない積層では null
      bridgedTransmissionLossDb: bridgedBandTransmissionLossDb(
        layers,
        band.bandIndex,
        studSpacingM,
        band.transmissionLossDb,
      ),
    }));
    self.postMessage({ type: "done", results });
  } catch (error) {
    // 計算コアの番号付きエラーも想定外のエラーも、画面へ伝えて表示する（握りつぶさない）
    self.postMessage({ type: "error", message: error.message });
  }
});
