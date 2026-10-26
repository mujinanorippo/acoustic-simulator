// 形状データのエラー（開発設計書「エラー処理方針」）。番号と文言の一覧は docs/error-codes.md。
// 不正な形状では作らず、番号付きのエラーを投げる。

export const GEOMETRY_ERRORS = Object.freeze({
  INVALID_SIZE: "E-GEO-001",
  INVALID_POSITION: "E-GEO-002",
  UNKNOWN_KIND: "E-GEO-003",
  FIRST_NOT_BLOCK: "E-GEO-004",
  MULTIPLE_SOLIDS: "E-GEO-005",
  EMPTY_SOLID: "E-GEO-006",
  TOO_MANY_FEATURES: "E-GEO-007",
  OPENING_NOT_ON_SURFACE: "E-GEO-008",
  INVALID_OPENING: "E-GEO-009",
  DUPLICATE_ID: "E-GEO-010",
  OPENINGS_OVERLAP: "E-GEO-011",
});

export class GeometryError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GeometryError";
    this.code = code;
  }
}
