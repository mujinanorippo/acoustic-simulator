// 禁則が本当に検出されるかを、わざと違反コードを与えて確かめる（意図的エラー）
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function errorsFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.severity === 2);
}

const CORE_FILE = "src/core-acoustics/sample.js";
const UI_FILE = "src/ui/sample.js";

describe("計算コアの禁則", () => {
  it.each([
    ["乱数", "export const value = Math.random();"],
    ["時刻", "export const value = Date.now();"],
    ["時刻(new Date)", "export const value = new Date();"],
    ["画面", "export const value = document.title;"],
    ["通信", "export const value = fetch;"],
    ["マジックナンバー", "export const value = 343 * 2;"],
    ["浮動小数点の==", "export const same = (value) => value === 0.1;"],
  ])("%s を使うと不合格", async (_label, code) => {
    expect(await errorsFor(code, CORE_FILE)).not.toHaveLength(0);
  });

  it("名前付き定数なら合格", async () => {
    const code = "const TWO_PI = 2 * Math.PI;\nexport const angle = (turns) => turns * TWO_PI;\n";
    expect(await errorsFor(code, CORE_FILE)).toHaveLength(0);
  });
});

describe("全体の禁則", () => {
  it.each([
    ["console.log", "console.log(1);"],
    ["var", "var value = 1;\nexport { value };"],
    ["==", "export const same = (left, right) => left == right;"],
    ["1文字の名前", "export const x = 1;"],
    ["空のcatch", "try { JSON.parse('') } catch (error) {}"],
  ])("%s を使うと不合格", async (_label, code) => {
    expect(await errorsFor(code, UI_FILE)).not.toHaveLength(0);
  });

  it("画面側では document を使ってよい", async () => {
    expect(await errorsFor("export const title = document.title;\n", UI_FILE)).toHaveLength(0);
  });
});
