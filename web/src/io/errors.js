// ファイルの読込・保存のエラー（開発設計書「エラー処理方針」）。番号と文言の一覧は docs/error-codes.md。
// 読めないファイルは読み込まず、番号付きのエラーを投げる（画面側で表示し、今のデータは消さない）。

export const IO_ERRORS = Object.freeze({
  EMPTY_FILE: "E-IO-001",
  NOT_JSON: "E-IO-002",
  NOT_PROJECT: "E-IO-003",
  NEWER_VERSION: "E-IO-004",
  TOO_LARGE: "E-IO-005",
  INVALID_CONTENT: "E-IO-006",
  SAVE_FAILED: "E-IO-007",
});

export class IoError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "IoError";
    this.code = code;
  }
}
