// ファイルを開く・保存する操作（ブラウザの機能を使う部分）。
// 保存は「保存先を選ぶダイアログ」（File System Access API、Chrome・Edge）を使い、
// 使えないブラウザ（Firefox など）ではダウンロード保存に切り替える（仕様書の決定）。
// 保存先の選択をキャンセルしたときは何も変えない。
import { IO_ERRORS, IoError } from "./errors.js";
import { MAX_FILE_BYTES } from "./project-file.js";

// ダウンロード用の一時 URL を消すまでの待ち時間 [ms]
const REVOKE_DELAY_MS = 1000;
export const DOWNLOAD_FILE_NAME = "room-project.json";
const JSON_TYPE = {
  description: "音響シミュレーターのプロジェクト",
  accept: { "application/json": [".json"] },
};

/** 保存先を選ぶダイアログが使えるか（使えないとダウンロード保存になる） */
export function canChooseSaveLocation() {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

function download(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // すぐに URL を消すとブラウザがファイル名を受け取る前に消えるので、少し後で消す
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * 文字列をファイルに保存する。戻り値 "saved"（保存した）・"downloaded"（ダウンロード保存）・
 * "cancelled"（キャンセル。何もしていない）
 */
export async function saveTextFile(text, suggestedName) {
  if (!canChooseSaveLocation()) {
    // ダウンロード保存のファイル名は半角英数字にする（日本語名だと "download" になるブラウザがある）
    download(text, DOWNLOAD_FILE_NAME);
    return "downloaded";
  }
  let handle;
  try {
    handle = await window.showSaveFilePicker({ suggestedName, types: [JSON_TYPE] });
  } catch (error) {
    if (error?.name === "AbortError") return "cancelled";
    throw new IoError(
      IO_ERRORS.SAVE_FAILED,
      `保存先を選べませんでした（${error?.message ?? error}）`,
    );
  }
  try {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return "saved";
  } catch (error) {
    throw new IoError(IO_ERRORS.SAVE_FAILED, `保存できませんでした（${error?.message ?? error}）`);
  }
}

/** 選んだファイルの中身を文字列で読む（大きすぎるファイルは読む前に止める） */
export async function readFileText(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new IoError(IO_ERRORS.TOO_LARGE, "ファイルが大きすぎます（10 MB まで）");
  }
  return file.text();
}
