// フェーズ1の確認画面：数値を入れて、壁の遮音・開口部・残響時間を計算する
import "./style.css";
import { setOpeningWallResults, setupOpeningPanel } from "./opening-panel.js";
import { setupReverbPanel } from "./reverb-panel.js";
import { setupWallPanel } from "./wall-panel.js";
import { allBands } from "../core-acoustics/frequency-bands.js";

function setupTabs() {
  const buttons = document.querySelectorAll("[data-tab]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-selected", String(other === button));
      for (const panel of document.querySelectorAll(".tab-page")) {
        panel.hidden = panel.id !== button.dataset.tab;
      }
    });
  }
}

setupTabs();
setupWallPanel(setOpeningWallResults);
setupOpeningPanel();
setupReverbPanel();
document.getElementById("band-count").textContent = String(allBands().length);
document
  .querySelector("#error-dialog button")
  .addEventListener("click", () => document.getElementById("error-dialog").close());
