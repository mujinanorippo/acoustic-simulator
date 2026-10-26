// プロジェクトファイルの書き出し・読み込みと、読めないファイルの分類（意図的エラーテスト「ファイル」）
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import sample from "../../../shared/samples/room-6jo-with-door.json" with { type: "json" };
import {
  CURRENT_SCHEMA_VERSION,
  MAX_FILE_BYTES,
  parseProject,
  serializeProject,
} from "./project-file.js";

const sampleText = `${JSON.stringify(sample, null, 2)}\n`;

describe("書き出しと読み込み", () => {
  it("見本ファイルを読み、書き出すと同じ中身に戻る", () => {
    const project = parseProject(sampleText);
    expect(project.name).toBe("6畳（ドア1つ）の例");
    expect(project.room.features).toHaveLength(1);
    expect(JSON.parse(serializeProject(project))).toEqual(sample);
  });

  it("書き出したファイルには版・種類・単位 m が入る", () => {
    const data = JSON.parse(serializeProject({ name: "x", room: sample.room }));
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.kind).toBe("acoustic-simulator-project");
    expect(data.lengthUnit).toBe("m");
  });

  it("書き出し前に形を確かめる（不正な形は書き出さない）", () => {
    const broken = { features: [{ ...sample.room.features[0], size: { x: 0, y: 1, z: 1 } }] };
    expect(() => serializeProject({ name: "x", room: broken })).toThrow(/E-GEO-001/);
  });
});

const withChange = (change) => JSON.stringify({ ...sample, ...change });

describe("読めないファイルは理由つきで止める", () => {
  it.each([
    ["空ファイル", "", /E-IO-001/],
    ["空白だけ", "  \n ", /E-IO-001/],
    ["壊れた JSON", '{ "schemaVersion": 1,', /E-IO-002/],
    ["他ソフトのファイル", JSON.stringify({ type: "FeatureCollection" }), /E-IO-003/],
    ["JSON の配列", "[1, 2, 3]", /E-IO-003/],
    ["新しい版", withChange({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }), /E-IO-004.*新しい版/],
    ["版が整数でない", withChange({ schemaVersion: "1" }), /E-IO-006/],
    ["単位が mm", withChange({ lengthUnit: "mm" }), /E-IO-006/],
    ["知らない項目", withChange({ voxels: [] }), /E-IO-006/],
    ["部屋がない", withChange({ room: null }), /E-IO-006/],
    ["形の一覧が無い", withChange({ room: { openings: [] } }), /E-IO-006/],
    [
      "形の寸法が0",
      withChange({
        room: {
          ...sample.room,
          features: [{ ...sample.room.features[0], size: { x: 0, y: 1, z: 1 } }],
        },
      }),
      /E-IO-006.*E-GEO-001/,
    ],
  ])("%s", (_, text, pattern) => {
    expect(() => parseProject(text)).toThrow(pattern);
  });

  it("大きすぎるファイル", () => {
    expect(() => parseProject(" ".repeat(MAX_FILE_BYTES) + "{}")).toThrow(/E-IO-005/);
  });

  it("ランダムな文字列でも落ちずに番号付きのエラーになる", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        try {
          parseProject(text);
          return false;
        } catch (error) {
          return /^E-(IO|GEO)-\d{3}/.test(error.message);
        }
      }),
    );
  });
});
