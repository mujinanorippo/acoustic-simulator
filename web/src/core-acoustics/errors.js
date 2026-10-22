// 計算コアの入力エラー（開発設計書「エラー処理方針」）
// 不正な入力では計算せず、番号付きのエラーを投げる。番号と文言の一覧は docs/error-codes.md。

export const ERROR_CODES = Object.freeze({
  NOT_POSITIVE_LENGTH: "E-CALC-001",
  ABSORPTION_OUT_OF_RANGE: "E-CALC-002",
  NO_ABSORPTION: "E-CALC-003",
  NOT_POSITIVE_PROPERTY: "E-CALC-004",
  NOT_POSITIVE_FREQUENCY: "E-CALC-005",
  MISSING_AXIS: "E-CALC-006",
  BAND_OUT_OF_RANGE: "E-CALC-007",
  UNKNOWN_LAYER: "E-CALC-008",
  OUT_OF_NUMERIC_RANGE: "E-CALC-009",
  INVALID_ANGLE: "E-CALC-010",
});

export class AcousticsInputError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "AcousticsInputError";
    this.code = code;
  }
}

export function requirePositiveFinite(value, code, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AcousticsInputError(code, `${label} は正の数で入力してください（入力値: ${value}）`);
  }
  return value;
}

export function requireRatio(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AcousticsInputError(
      ERROR_CODES.ABSORPTION_OUT_OF_RANGE,
      `${label} は 0〜1 の範囲で入力してください（入力値: ${value}）`,
    );
  }
  return value;
}
