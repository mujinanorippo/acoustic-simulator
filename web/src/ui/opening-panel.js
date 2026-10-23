// 開口部タブ：壁の透過損失・壁の面積・開口部の面積を入れると、その場で結果が出る
import { renderChart } from "./chart.js";
import { create } from "./dom.js";
import { parseNumberField } from "./forms.js";
import { openingRatioFromAreas, openingReduction } from "../core-acoustics/openings.js";

const CM2_PER_M2 = 10000;
const PERCENT = 100;
const state = { wallResults: null };

function readInputs() {
  const fields = [
    ["opening-wall-tl", "壁の透過損失 [dB]", { max: 150, allowZero: true }],
    ["opening-wall-area", "壁の面積 [m²]", { max: 10000 }],
    ["opening-area", "開口部の面積 [cm²]", { max: 1e8, allowZero: true }],
  ];
  const results = fields.map(([id, label, options]) =>
    parseNumberField(document.getElementById(id).value, label, options),
  );
  return { results, errors: results.filter((item) => !item.ok).map((item) => item.message) };
}

function showMessages(messages, isError) {
  document
    .getElementById("opening-result")
    .replaceChildren(
      ...messages.map((text) => create("li", { text, class: isError ? "input-error" : "" })),
    );
}

function drawBandChart(ratio) {
  const container = document.getElementById("opening-chart");
  if (!state.wallResults) {
    container.replaceChildren(
      create("p", {
        class: "hint",
        text: "「壁の遮音」タブで計算すると、ここに周波数ごとのグラフが出ます",
      }),
    );
    return;
  }
  const bands = state.wallResults.map((band) => ({
    hz: band.nominalHz,
    wall: band.transmissionLossDb,
    opened: openingReduction(band.transmissionLossDb, ratio).compositeTlDb,
  }));
  renderChart(
    container,
    [
      {
        label: "壁だけ",
        className: "secondary",
        points: bands.map((band) => ({ hz: band.hz, value: band.wall })),
      },
      {
        label: "開口部込み",
        className: "primary",
        points: bands.map((band) => ({ hz: band.hz, value: band.opened })),
      },
    ],
    { yLabel: "透過損失 [dB]" },
  );
}

/** 入力が変わるたびに呼ぶ。誤りは結果の欄に理由を出す（ダイアログは出さない） */
export function updateOpening() {
  const { results, errors } = readInputs();
  if (errors.length > 0) {
    showMessages(errors, true);
    return;
  }
  const [wall, wallArea, openingAreaCm2] = results.map((item) => item.value);
  try {
    const ratio = openingRatioFromAreas(wallArea, openingAreaCm2 / CM2_PER_M2);
    const result = openingReduction(wall, ratio);
    showMessages(
      [
        `開口率：${(ratio * PERCENT).toPrecision(3)} %（開口部 ${openingAreaCm2} cm² ÷ 壁 ${wallArea} m²）`,
        `開口部込みの透過損失：${result.compositeTlDb.toFixed(1)} dB`,
        `元の壁からの低下：${result.reductionDb.toFixed(1)} dB（${result.reductionPercent.toFixed(0)}%）`,
        `外へ漏れる音のエネルギー：元の壁の ${result.transmittedEnergyFactor.toPrecision(3)} 倍`,
      ],
      false,
    );
    drawBandChart(ratio);
  } catch (error) {
    showMessages([error.message], true);
  }
}

export function setOpeningWallResults(results) {
  state.wallResults = results;
  updateOpening();
}

export function setupOpeningPanel() {
  for (const id of ["opening-wall-tl", "opening-wall-area", "opening-area"]) {
    document.getElementById(id).addEventListener("input", updateOpening);
  }
  updateOpening();
}
