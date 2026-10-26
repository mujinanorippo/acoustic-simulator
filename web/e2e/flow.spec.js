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

test("1. 起動：入力例の4層・材料の参考値・参考表・3つのタブが出る", async ({ page }) => {
  await expect(page).toHaveTitle("音響シミュレーター 計算確認");
  await expect(page.locator(".layer-row")).toHaveCount(4);
  await expect(page.locator("[data-tab]")).toHaveCount(3);
  await expect(page.locator(".layer-row").first().locator(".reference-tag")).toHaveCount(4);
  await expect(page.locator("#plate-reference tbody tr")).toHaveCount(29);
  await expect(page.locator("#porous-reference tbody tr")).toHaveCount(13);
  await expect(page.locator("#plate-reference a").first()).toHaveAttribute("href", /^https:/);
});

test("1b. 材料の参考値：書き換えた欄だけ印が消え、自分で入力に戻すと全部消える", async ({
  page,
}) => {
  const row = page.locator(".layer-row").first();
  await row.locator('input[data-key="lossFactor"]').fill("0.03");
  await expect(row.locator(".reference-tag")).toHaveCount(3);
  await row.locator(".material-select").selectOption("float-glass-5mm");
  await expect(row.locator('input[data-key="surfaceDensity"]')).toHaveValue("12.25");
  await expect(row.locator(".reference-tag")).toHaveCount(4);
  await row.locator(".material-select").selectOption("");
  await expect(row.locator(".reference-tag")).toHaveCount(0);
  await expect(row.locator('input[data-key="surfaceDensity"]')).toHaveValue("12.25");
});

test("1c. グラスウール：密度を入れると流れ抵抗が計算し直される", async ({ page }) => {
  const row = page.locator(".layer-row").nth(2);
  await expect(row.locator('input[data-key="flowResistivity"]')).toHaveValue("3456");
  await row.locator('input[data-key="density"]').fill("32");
  await expect(row.locator('input[data-key="flowResistivity"]')).toHaveValue("9980");
  await expect(row.locator(".reference-tag")).toHaveCount(1);
});

test("2. 壁の遮音：計算すると全帯域の表とグラフが出て、数値がすべて有限", async ({ page }) => {
  const started = Date.now();
  await calculateWall(page);
  const seconds = (Date.now() - started) / 1000;
  test.info().annotations.push({ type: "計算時間", description: `${seconds.toFixed(1)} 秒` });
  await expect(page.locator("#wall-chart path.series")).toHaveCount(1);
  await expect(page.locator("#wall-notes")).toContainText("二重壁の共鳴周波数");
  await expect(page.locator("#wall-notes")).toContainText("コインシデンス限界周波数：3040 Hz");
  await expect(page.locator("#wall-notes")).toContainText("暫定値を含みます");
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
    page
      .locator('.layer-row select[aria-label$="の種類"]')
      .evaluateAll((items) => items.map((item) => item.value));
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
  await expect(page.locator("#reverberation-result tbody tr")).toHaveCount(6);
  await page.click("[data-tab=wall]");
  await expect(page.locator("#plate-reference")).toBeVisible();
  await page.click("[data-tab=reverberation]");
  await expect(page.locator("#plate-reference")).toBeHidden();
  await expect(page.locator("#room-z")).toHaveValue("2500");
  await expect(page.locator("#reverberation-result tbody tr")).toHaveCount(6);
});

test("9. 開口部：面積を入れるとその場で計算、壁より大きい開口部や文字は理由を出す", async ({
  page,
}) => {
  await page.click("[data-tab=opening]");
  const result = page.locator("#opening-result");
  await expect(result).toContainText("開口率：1.00 %");
  await expect(result).toContainText("20.0 dB");
  await page.fill("#opening-area", "200000");
  await expect(result).toContainText("E-CALC-011");
  await page.fill("#opening-area", "abc");
  await expect(result).toContainText("数字以外");
  await page.fill("#opening-area", "0");
  await expect(result).toContainText("45.0 dB");
  await page.fill("#opening-area", "990");
  await expect(page.locator("#opening-chart")).toContainText("壁の遮音");
  await page.click("[data-tab=wall]");
  await calculateWall(page);
  await page.click("[data-tab=opening]");
  await expect(page.locator("#opening-chart path.series")).toHaveCount(2);
});

test("10. 残響時間：材料ごとの吸音率で6帯域の表が出て、吸音ゼロは止まる", async ({ page }) => {
  await page.click("[data-tab=reverberation]");
  await expect(page.locator("#absorption-reference tbody tr")).toHaveCount(6);
  await page.click("#calculate-reverberation");
  await expect(page.locator("#reverberation-result tbody tr")).toHaveCount(6);
  // 1つの帯域だけ書き換えると、その欄だけ参考値の印が消える
  await page.fill("#face-zMin-0", "0.5");
  await expect(page.locator("#face-zMin-0")).not.toHaveClass(/is-reference/);
  await expect(page.locator("#face-zMin-1")).toHaveClass(/is-reference/);
  for (const face of ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"]) {
    await page.selectOption(`#face-${face}`, "");
    for (let band = 0; band < 6; band += 1) await page.fill(`#face-${face}-${band}`, "0");
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
