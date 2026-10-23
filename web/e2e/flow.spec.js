// 実行順どおりの画面操作テスト：起動 → 計算 → 戻る → キャンセル → 異常入力
import { expect, test } from "@playwright/test";

const BAND_COUNT = 21;

// 画面のエラー（例外・コンソールのエラー・読み込み失敗）を集め、各テストの最後に 0 件であることを確かめる
test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(`例外: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`コンソール: ${message.text()}`);
  });
  page.on("requestfailed", (request) => problems.push(`読み込み失敗: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  testInfo.problems = problems;
  await page.goto("/");
});

test.afterEach(async ({ page }, testInfo) => {
  // 最後まで画面が生きていて、途中でエラーが1件も出ていないこと
  await expect(page.locator("main")).toBeVisible();
  expect(testInfo.problems, "画面のエラー").toEqual([]);
});

async function calculateWall(page) {
  await page.click("#calculate-wall");
  await expect(page.locator("#wall-table tr")).toHaveCount(BAND_COUNT);
  await expect(page.locator("#calculate-wall")).toBeEnabled();
}

async function expectDialog(page, text) {
  const dialog = page.locator("#error-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(text);
  return dialog;
}

test("1. 起動：入力例の4層・3つのタブが出る", async ({ page }) => {
  await expect(page).toHaveTitle("音響シミュレーター 計算確認");
  await expect(page.locator(".layer-row")).toHaveCount(4);
  await expect(page.locator("[data-tab]")).toHaveCount(3);
  await expect(page.locator("#use-wall-result")).toBeDisabled();
});

test("2. 壁の遮音：計算すると全帯域の表とグラフが出て、数値がすべて有限", async ({ page }) => {
  const started = Date.now();
  await calculateWall(page);
  const seconds = (Date.now() - started) / 1000;
  test.info().annotations.push({ type: "計算時間", description: `${seconds.toFixed(1)} 秒` });
  await expect(page.locator("#wall-chart path.series")).toHaveCount(1);
  await expect(page.locator("#wall-notes")).toContainText("二重壁の共鳴周波数");
  const values = await page.locator("#wall-table td:nth-child(2)").allTextContents();
  expect(values.map(Number).every(Number.isFinite)).toBe(true);
});

test("3. キャンセル：計算中は計算ボタンが押せず、中止すると元に戻って再計算できる", async ({
  page,
}) => {
  await page.click("#calculate-wall");
  await expect(page.locator("#cancel-wall")).toBeVisible();
  await expect(page.locator("#calculate-wall")).toBeDisabled();
  await page.click("#cancel-wall");
  await expect(page.locator("#wall-status")).toContainText("中止しました");
  await expect(page.locator("#cancel-wall")).toBeHidden();
  await expect(page.locator("#calculate-wall")).toBeEnabled();
  await expect(page.locator("#wall-table tr")).toHaveCount(0);
  await calculateWall(page);
});

test("4. キャンセル：結果がある状態で中止しても前の結果は消えない", async ({ page }) => {
  await calculateWall(page);
  const before = await page.locator("#wall-table").textContent();
  await page.click("#calculate-wall");
  await page.click("#cancel-wall");
  expect(await page.locator("#wall-table").textContent()).toBe(before);
});

const BAD_INPUTS = [
  ["", "空欄"],
  ["0", "0より大きい"],
  ["-1", "0より大きい"],
  ["１０", "半角"],
  ["abc", "数字以外"],
  ["99999", "以下"],
];

for (const [bad, reason] of BAD_INPUTS) {
  test(`5. 異常入力「${bad}」：理由のダイアログ → 閉じて直すと計算できる`, async ({ page }) => {
    const input = page.locator(".layer-row").first().locator("input").first();
    await input.fill(bad);
    await page.click("#calculate-wall");
    await expectDialog(page, reason);
    await page.click("#error-dialog button");
    await expect(page.locator("#error-dialog")).toBeHidden();
    await expect(input).toHaveValue(bad);
    await input.fill("10");
    await calculateWall(page);
  });
}

test("6. ダイアログは Esc でも閉じられる（キャンセル）", async ({ page }) => {
  await page.locator(".layer-row").first().locator("input").first().fill("");
  await page.click("#calculate-wall");
  await expectDialog(page, "空欄");
  await page.keyboard.press("Escape");
  await expect(page.locator("#error-dialog")).toBeHidden();
  await expect(page.locator("#calculate-wall")).toBeEnabled();
});

test("7. 層の並べ替えは行って戻すと元どおり、全部消すと止まり、足し直せる", async ({ page }) => {
  const kinds = () =>
    page.locator(".layer-row select").evaluateAll((items) => items.map((item) => item.value));
  const original = await kinds();
  await page.locator(".layer-row").nth(1).getByTitle("下へ").click();
  expect(await kinds()).not.toEqual(original);
  await page.locator(".layer-row").nth(2).getByTitle("上へ").click();
  expect(await kinds()).toEqual(original);
  for (let i = 0; i < 4; i += 1) await page.locator(".layer-row").first().getByText("削除").click();
  await page.click("#calculate-wall");
  await expectDialog(page, "層が1つもありません");
  await page.click("#error-dialog button");
  await page.click("#add-layer");
  await expect(page.locator(".layer-row")).toHaveCount(1);
  await calculateWall(page);
});

test("8. タブを行き来しても入力と結果が残る", async ({ page }) => {
  await page.click("[data-tab=reverberation]");
  await page.fill("#room-z", "2500");
  await page.click("#calculate-reverberation");
  await expect(page.locator("#reverberation-result li")).toHaveCount(5);
  await page.click("[data-tab=wall]");
  await page.click("[data-tab=reverberation]");
  await expect(page.locator("#room-z")).toHaveValue("2500");
  await expect(page.locator("#reverberation-result li")).toHaveCount(5);
});

test("9. 開口部：1% で約 20 dB、壁の結果への当てはめ、範囲外の開口率は止まる", async ({ page }) => {
  await page.click("[data-tab=opening]");
  await page.click("#calculate-opening");
  await expect(page.locator("#opening-result")).toContainText("20.0 dB");
  await page.fill("#opening-ratio", "120");
  await page.click("#calculate-opening");
  await expectDialog(page, "100 以下");
  await page.click("#error-dialog button");
  await page.fill("#opening-ratio", "1");
  await page.click("[data-tab=wall]");
  await calculateWall(page);
  await page.click("[data-tab=opening]");
  await page.click("#use-wall-result");
  await expect(page.locator("#opening-chart path.series")).toHaveCount(2);
});

test("10. 残響時間：4つの式が出て、吸音ゼロは止まる", async ({ page }) => {
  await page.click("[data-tab=reverberation]");
  await page.click("#calculate-reverberation");
  await expect(page.locator("#reverberation-result")).toContainText("Sabine");
  for (const face of ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"]) {
    await page.fill(`#face-${face}`, "0");
  }
  await page.click("#calculate-reverberation");
  await expectDialog(page, "E-CALC-003");
});

test("11. 暗い表示でも背景と文字の色が変わり、文字が読める", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, text: style.color };
  });
  expect(colors.background).not.toBe("rgb(232, 234, 237)");
  expect(colors.background).not.toBe(colors.text);
});

test("12. 幅 400px でも横スクロールが出ない", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
