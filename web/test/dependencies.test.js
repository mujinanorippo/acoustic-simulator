// 依存ライブラリと出典付き定数が「空ではなく、決めた版のものが入っている」ことを確かめる
// （実行順の最初の段階：何かを計算する前に、道具と材料がそろっているか）
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const readJson = (file) => JSON.parse(readFileSync(file, "utf-8"));
const packageJson = readJson(path.join(webRoot, "package.json"));
const lock = readJson(path.join(webRoot, "package-lock.json"));
const require = createRequire(path.join(webRoot, "package.json"));
const pinned = Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies });

describe("依存ライブラリ", () => {
  it("版はすべて完全固定（^ ~ >= などの範囲指定なし）", () => {
    for (const [name, version] of pinned) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it.each(pinned)(
    "%s：ロックファイル・実際に入っている版が package.json と同じ",
    (name, version) => {
      expect(lock.packages[`node_modules/${name}`]?.version).toBe(version);
      const installed = readJson(path.join(webRoot, "node_modules", name, "package.json"));
      expect(installed.version).toBe(version);
    },
  );

  it("配布物に入る外部コードは three と manifold-3d だけで、third_party にライセンス文がある", () => {
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(["manifold-3d", "three"]);
    for (const name of Object.keys(packageJson.dependencies)) {
      expect(statSync(path.join(repoRoot, "third_party", name, "LICENSE")).size).toBeGreaterThan(0);
    }
  });

  it.each(pinned.filter(([name]) => !name.startsWith("@eslint/")))(
    "%s：読み込めて、中身が空でない",
    async (name) => {
      const entry = require.resolve(name);
      expect(existsSync(entry)).toBe(true);
      expect(statSync(entry).size).toBeGreaterThan(0);
      const module = await import(name);
      expect(Object.keys(module).length).toBeGreaterThan(0);
    },
  );

  it("Node.js の版が .nvmrc と同じ", () => {
    const wanted = readFileSync(path.join(repoRoot, ".nvmrc"), "utf-8").trim();
    expect(process.versions.node).toBe(wanted);
  });
});

describe("出典付き定数（shared/constants）", () => {
  const directory = path.join(repoRoot, "shared", "constants");
  const files = [
    "air.json",
    "calculation.json",
    "frequency-bands.json",
    "porous.json",
    "sound-sources.json",
  ];

  it.each(files)("%s：値が空でなく、すべて有限の数値", (file) => {
    const data = readJson(path.join(directory, file));
    const entries = Object.entries(data.values);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, item] of entries) {
      const values = Array.isArray(item.value) ? item.value : [item.value];
      expect(values.length, key).toBeGreaterThan(0);
      for (const value of values) {
        expect(Number.isFinite(value), `${file} ${key}`).toBe(true);
      }
    }
  });
});
