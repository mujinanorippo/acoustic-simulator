// 壁の遮音計算を画面とは別のスレッドで動かす（計算中も画面が固まらず、「中止」で止められるように）
// 受け取る: { layers }  送る: { type: "progress", done, total } / { type: "done", results } /
//          { type: "error", message }
import { bandResults } from "../core-acoustics/tmm.js";

self.addEventListener("message", (event) => {
  try {
    const results = bandResults(event.data.layers, (done, total) =>
      self.postMessage({ type: "progress", done, total }),
    );
    self.postMessage({ type: "done", results });
  } catch (error) {
    // 計算コアの番号付きエラーも想定外のエラーも、画面へ伝えて表示する（握りつぶさない）
    self.postMessage({ type: "error", message: error.message });
  }
});
