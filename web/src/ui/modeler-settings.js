// 設定画面：矢印キー1回で動かす量と、マウスで動かすときの刻み（mm）。
// 値はこの画面を使う人のブラウザに覚えておく（使えないときは初期値のまま動く）。
import { showError } from "./dom.js";
import { parseNumberField } from "./forms.js";

const STORAGE_KEY = "acoustic-simulator.modeler-settings";
const MAX_STEP_MM = 10000;
export const DEFAULT_SETTINGS = Object.freeze({ keyStepMm: 10, dragSnapMm: 10 });

const settings = { ...DEFAULT_SETTINGS };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (Number.isFinite(saved[key]) && saved[key] > 0) settings[key] = saved[key];
      }
    }
  } catch {
    // 覚えておけないブラウザ（プライベートモードなど）では初期値のまま使う
  }
}

function store() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 覚えておけないときは、この画面を開いている間だけ有効
  }
}

export const getSettings = () => settings;

export function setupSettingsDialog() {
  load();
  const dialog = document.getElementById("settings-dialog");
  const inputs = {
    keyStepMm: document.getElementById("setting-key-step"),
    dragSnapMm: document.getElementById("setting-drag-snap"),
  };
  document.getElementById("open-settings").addEventListener("click", () => {
    for (const [key, input] of Object.entries(inputs)) input.value = String(settings[key]);
    dialog.showModal();
  });
  document.getElementById("settings-cancel").addEventListener("click", () => dialog.close());
  document.getElementById("settings-ok").addEventListener("click", () => {
    const labels = { keyStepMm: "矢印キーの移動量 [mm]", dragSnapMm: "マウスで動かす刻み [mm]" };
    const parsed = Object.fromEntries(
      Object.entries(inputs).map(([key, input]) => [
        key,
        parseNumberField(input.value, labels[key], { max: MAX_STEP_MM }),
      ]),
    );
    const errors = Object.values(parsed).filter((item) => !item.ok);
    if (errors.length > 0) {
      showError(
        "設定を確認してください",
        errors.map((item) => item.message),
      );
      return;
    }
    for (const [key, item] of Object.entries(parsed)) settings[key] = item.value;
    store();
    dialog.close();
  });
}
