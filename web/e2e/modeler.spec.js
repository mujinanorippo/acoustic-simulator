// 部屋の形（フェーズ2）の画面操作テスト：ブロック配置 → くっつけ → 穴 → 開口部 → 保存 → 再読込、
// と意図的エラー（部屋が分かれる・面にない開口部・壊れたファイル・新しい版・保存のキャンセル）
import { expect, test } from "@playwright/test";

const SIX_JO_VOLUME = "容積 23.85 m³";

test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(`例外: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`コンソール: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  testInfo.problems = problems;
  // 保存先を選ぶダイアログは自動操作では開けないので、書き込まれた中身を記録する偽物に置き換える
  await page.addInitScript(() => {
    window.savedFiles = [];
    window.saveChoice = "save";
    window.showSaveFilePicker = async () => {
      if (window.saveChoice === "cancel") throw new DOMException("キャンセル", "AbortError");
      return {
        createWritable: async () => ({
          write: async (text) => window.savedFiles.push(text),
          close: async () => {},
        }),
      };
    };
  });
  await page.goto("/");
  await expect(page.locator("#room-summary")).toContainText(SIX_JO_VOLUME);
});

test.afterEach(async ({ page }, testInfo) => {
  await expect(page.locator("main")).toBeVisible();
  expect(testInfo.problems, "画面のエラー").toEqual([]);
});

async function expectRevertDialog(page, code) {
  const dialog = page.locator("#error-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(code);
  await dialog.locator("button").click();
  await expect(dialog).toBeHidden();
}

test("1. 起動すると6畳の部屋が3D表示され、形の表に1行ある", async ({ page }) => {
  await expect(page.locator("#room-view canvas")).toBeVisible();
  await expect(page.locator("#feature-table tr")).toHaveCount(1);
  await expect(page.locator("[data-tab=modeler]")).toHaveAttribute("aria-selected", "true");
});

test("2. ブロックをくっつける → 穴 → ドア・窓 → 保存 → 新規 → 開くで元に戻る", async ({ page }) => {
  await page.click("#add-block");
  await expect(page.locator("#feature-table tr")).toHaveCount(2);
  await expect(page.locator("#room-summary")).toContainText("容積 26.25 m³");
  await page.click("#add-blockHole");
  await expect(page.locator("#feature-table tr")).toHaveCount(3);
  await page.click("#add-door");
  await page.click("#add-window");
  await expect(page.locator("#opening-surface-table tr")).toHaveCount(2);
  await page.click("#save-project");
  await expect(page.locator("#file-status")).toContainText("保存しました");
  const saved = await page.evaluate(() => window.savedFiles[0]);
  const data = JSON.parse(saved);
  expect(data.lengthUnit).toBe("m");
  expect(data.room.features).toHaveLength(3);

  await page.click("#new-project");
  await expect(page.locator("#feature-table tr")).toHaveCount(1);
  await page.setInputFiles("#open-file", {
    name: "部屋.json",
    mimeType: "application/json",
    buffer: Buffer.from(saved),
  });
  await expect(page.locator("#file-status")).toContainText("開きました");
  await expect(page.locator("#feature-table tr")).toHaveCount(3);
  await expect(page.locator("#opening-surface-table tr")).toHaveCount(2);
});

test("3. 形の寸法を mm で変えると立体が作り直される", async ({ page }) => {
  const width = page.getByLabel("1番目の形の x 方向の大きさ");
  await width.fill("4000");
  await width.press("Enter");
  await expect(page.locator("#room-summary")).toContainText("容積 26.21 m³");
});

test("4. 離れたブロックは「部屋が分かれた」として元に戻す（E-GEO-005）", async ({ page }) => {
  await page.click("#add-block");
  const position = page.getByLabel("2番目の形の位置 x");
  await position.fill("9000");
  await position.press("Enter");
  await expectRevertDialog(page, "E-GEO-005");
  await expect(page.getByLabel("2番目の形の位置 x")).toHaveValue("3640");
});

test("5. 寸法の異常入力（0・負・文字・全角）は入力欄で止めて元に戻す", async ({ page }) => {
  for (const text of ["0", "-100", "abc", "１０００"]) {
    const width = page.getByLabel("1番目の形の x 方向の大きさ");
    await width.fill(text);
    await width.press("Enter");
    await expectRevertDialog(page, "1番目の形の x 方向の大きさ");
    await expect(page.getByLabel("1番目の形の x 方向の大きさ")).toHaveValue("3640");
  }
});

test("6. 開口部を壁の外に動かすと元に戻す（E-GEO-008）", async ({ page }) => {
  await page.click("#add-door");
  const coordinate = page.getByLabel("1番目の開口部の面の位置");
  await coordinate.fill("1000");
  await coordinate.press("Enter");
  await expectRevertDialog(page, "E-GEO-008");
});

test("7. 壊れたファイル・新しい版・他ソフトのファイルは読み込まず、今の部屋はそのまま", async ({
  page,
}) => {
  await page.click("#add-block");
  const files = [
    ["壊れた.json", '{ "schemaVersion": 1,', "E-IO-002"],
    ["空.json", "", "E-IO-001"],
    [
      "新しい版.json",
      JSON.stringify({ schemaVersion: 99, kind: "acoustic-simulator-project", lengthUnit: "m" }),
      "E-IO-004",
    ],
    ["他ソフト.json", JSON.stringify({ type: "FeatureCollection" }), "E-IO-003"],
  ];
  for (const [name, text, code] of files) {
    await page.setInputFiles("#open-file", {
      name,
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
    await expectRevertDialog(page, code);
    await expect(page.locator("#feature-table tr")).toHaveCount(2);
  }
});

test("8. 保存先の選択をキャンセルしても何も変わらない", async ({ page }) => {
  await page.evaluate(() => {
    window.saveChoice = "cancel";
  });
  await page.click("#save-project");
  await expect(page.locator("#file-status")).toContainText("保存をやめました");
  expect(await page.evaluate(() => window.savedFiles.length)).toBe(0);
});

test("9. 保存先を選べないブラウザ（Firefox など）はダウンロード保存に切り替わる", async ({
  page,
}) => {
  await page.evaluate(() => {
    delete window.showSaveFilePicker;
  });
  const downloading = page.waitForEvent("download");
  await page.click("#save-project");
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("room-project.json");
  await expect(page.locator("#file-status")).toContainText("ダウンロード");
});
