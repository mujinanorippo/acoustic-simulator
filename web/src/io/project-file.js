// プロジェクトファイル（JSON）の書き出しと読み込み（開発設計書「プロジェクトJSON」）。
// 先頭に schemaVersion を持ち、長さはファイル内でも m。形状は作り方の履歴で持つ。
// ここはファイルの「文字列」との変換だけを行い、ファイルを開く・保存する操作は file-access.js。
import { GeometryError } from "../core-model/errors.js";
import { validateRoom } from "../core-model/model.js";
import { IO_ERRORS, IoError } from "./errors.js";

export const PROJECT_KIND = "acoustic-simulator-project";
export const CURRENT_SCHEMA_VERSION = 1;
export const LENGTH_UNIT = "m";
// 読み込むファイルの上限 [バイト]。形200個・開口部100個のプロジェクトでも 100 KB 程度なので、
// 桁違いに大きいファイル（他のデータの取り違え）を開く前に止めるための値
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LENGTH = 200;
const JSON_INDENT = 2;
const TOP_LEVEL_KEYS = new Set(["schemaVersion", "kind", "lengthUnit", "name", "room"]);
const ROOM_KEYS = new Set(["features", "openings"]);

/** プロジェクト { name, room } をファイルに書く文字列にする */
export function serializeProject(project) {
  validateRoom(project.room);
  const data = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: PROJECT_KIND,
    lengthUnit: LENGTH_UNIT,
    name: String(project.name ?? ""),
    room: { features: project.room.features, openings: project.room.openings ?? [] },
  };
  return `${JSON.stringify(data, null, JSON_INDENT)}\n`;
}

function invalid(message) {
  return new IoError(IO_ERRORS.INVALID_CONTENT, message);
}

function parseJson(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new IoError(IO_ERRORS.EMPTY_FILE, "ファイルが空です");
  }
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    throw new IoError(IO_ERRORS.TOO_LARGE, "ファイルが大きすぎます（10 MB まで）");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new IoError(
      IO_ERRORS.NOT_JSON,
      "ファイルが壊れているか、このソフトのファイルではありません（JSON として読めません）",
    );
  }
}

function checkHeader(data) {
  if (typeof data !== "object" || data === null || data.kind !== PROJECT_KIND) {
    throw new IoError(
      IO_ERRORS.NOT_PROJECT,
      "このソフトのプロジェクトファイルではありません（他のソフトのファイルの可能性があります）",
    );
  }
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    throw invalid("ファイルの版（schemaVersion）が正しくありません");
  }
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new IoError(
      IO_ERRORS.NEWER_VERSION,
      "新しい版で作られたファイルです。このソフトを新しくしてから開いてください",
    );
  }
  if (data.lengthUnit !== LENGTH_UNIT) {
    throw invalid("長さの単位が m ではありません");
  }
}

function checkShape(data) {
  const unknown = Object.keys(data).filter((key) => !TOP_LEVEL_KEYS.has(key));
  if (unknown.length > 0) throw invalid(`知らない項目があります（${unknown.join("、")}）`);
  if (typeof data.name !== "string" || data.name.length > MAX_NAME_LENGTH) {
    throw invalid(`名前が文字でないか、${MAX_NAME_LENGTH} 文字を超えています`);
  }
  const room = data.room;
  if (typeof room !== "object" || room === null || Array.isArray(room)) {
    throw invalid("部屋の形（room）がありません");
  }
  const unknownRoom = Object.keys(room).filter((key) => !ROOM_KEYS.has(key));
  if (unknownRoom.length > 0)
    throw invalid(`部屋に知らない項目があります（${unknownRoom.join("、")}）`);
  if (!Array.isArray(room.features) || !Array.isArray(room.openings)) {
    throw invalid("形の一覧（features）か開口部の一覧（openings）がありません");
  }
}

/**
 * ファイルの文字列を読み、{ name, room } を返す。読めないときは番号付きのエラー
 * （形のエラー E-GEO-xxx は E-IO-006 の文言に含めて伝える）
 */
export function parseProject(text) {
  const data = parseJson(text);
  checkHeader(data);
  checkShape(data);
  try {
    validateRoom(data.room);
  } catch (error) {
    if (error instanceof GeometryError)
      throw invalid(`形のデータに問題があります（${error.message}）`);
    throw error;
  }
  return { name: data.name, room: { features: data.room.features, openings: data.room.openings } };
}
