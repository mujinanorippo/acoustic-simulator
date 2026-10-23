// フェーズ1の確認画面：数値を入れて、壁の遮音・開口部・残響時間を計算する
import "./style.css";
import { renderChart } from "./chart.js";
import { parseNumberField, mmToM, percentToRatio } from "./forms.js";
import { LAYER_KINDS, toCoreLayer } from "./layer-form.js";
import { openingReduction } from "../core-acoustics/openings.js";
import { rectangularRoom, reverberationTimes } from "../core-acoustics/reverberation.js";
import { allBands } from "../core-acoustics/frequency-bands.js";
import { doubleWallResonanceHz, plateCriticalFrequencies } from "../core-acoustics/tmm.js";

const state = { wallResults: null, wallWorker: null };

function create(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

// ---- エラーダイアログ（CAD らしい OK ボタンのダイアログ。トーストは使わない） ----

function showError(title, messages) {
  const dialog = document.getElementById("error-dialog");
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("ul").replaceChildren(...messages.map((text) => create("li", { text })));
  dialog.showModal();
}

function runSafely(title, action) {
  try {
    action();
  } catch (error) {
    // 計算コアのエラーは番号付きの文言をそのまま見せる。想定外のエラーも握りつぶさない
    showError(title, [error.message]);
  }
}

// ---- 壁の遮音 ----

const DEFAULT_LAYERS = [
  {
    kind: "plate",
    texts: {
      surfaceDensity: "10",
      youngsModulus: "0",
      thickness: "12.5",
      poissonRatio: "0.3",
      lossFactor: "0.01",
    },
  },
  { kind: "air", texts: { thickness: "50" } },
  { kind: "porous", texts: { thickness: "50", flowResistivity: "10000" } },
  {
    kind: "plate",
    texts: {
      surfaceDensity: "10",
      youngsModulus: "0",
      thickness: "12.5",
      poissonRatio: "0.3",
      lossFactor: "0.01",
    },
  },
];

function layerRow(row, index, rows, redraw) {
  const kindSelect = create(
    "select",
    {
      "aria-label": `${index + 1}層目の種類`,
      onchange: (event) => {
        row.kind = event.target.value;
        row.texts = {};
        redraw();
      },
    },
    Object.entries(LAYER_KINDS).map(([key, kind]) => {
      const option = create("option", { value: key, text: kind.label });
      option.selected = key === row.kind;
      return option;
    }),
  );
  const fields = LAYER_KINDS[row.kind].fields.map((field) =>
    create("label", { class: "field" }, [
      create("span", { text: `${field.label}${field.unit ? ` [${field.unit}]` : ""}` }),
      create("input", {
        type: "text",
        inputmode: "decimal",
        value: row.texts[field.key] ?? "",
        "data-key": field.key,
        oninput: (event) => {
          row.texts[field.key] = event.target.value;
        },
      }),
    ]),
  );
  const move = (offset) => () => {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    redraw();
  };
  const buttons = create("div", { class: "row-buttons" }, [
    create("button", { type: "button", text: "↑", title: "上へ", onclick: move(-1) }),
    create("button", { type: "button", text: "↓", title: "下へ", onclick: move(1) }),
    create("button", {
      type: "button",
      text: "削除",
      onclick: () => {
        rows.splice(index, 1);
        redraw();
      },
    }),
  ]);
  return create("div", { class: "layer-row" }, [
    create("span", { class: "row-number", text: `${index + 1}` }),
    kindSelect,
    ...fields,
    buttons,
  ]);
}

function setupWall() {
  const rows = structuredClone(DEFAULT_LAYERS);
  const list = document.getElementById("layer-list");
  const redraw = () =>
    list.replaceChildren(...rows.map((row, index) => layerRow(row, index, rows, redraw)));
  redraw();
  document.getElementById("add-layer").addEventListener("click", () => {
    rows.push({ kind: "air", texts: { thickness: "50" } });
    redraw();
  });
  document.getElementById("calculate-wall").addEventListener("click", () => calculateWall(rows));
  document.getElementById("cancel-wall").addEventListener("click", cancelWallCalculation);
}

function calculateWall(rows) {
  if (rows.length === 0) {
    showError("入力を確認してください", ["層が1つもありません。「層を追加」で追加してください"]);
    return;
  }
  const converted = rows.map((row, index) => toCoreLayer(row, index));
  const errors = converted.flatMap((result) =>
    result.ok ? [] : result.errors.map((item) => item.message),
  );
  if (errors.length > 0) {
    showError("入力を確認してください", errors);
    return;
  }
  startWallCalculation(converted.map((result) => result.layer));
}

// ---- 壁の計算の実行・中止（計算は別スレッド。中止したら途中の結果は使わない） ----

function setWallRunning(isRunning, message) {
  document.getElementById("calculate-wall").disabled = isRunning;
  document.getElementById("add-layer").disabled = isRunning;
  document.getElementById("cancel-wall").hidden = !isRunning;
  document.getElementById("wall-status").textContent = message;
}

function stopWallWorker() {
  state.wallWorker?.terminate();
  state.wallWorker = null;
}

function startWallCalculation(layers) {
  stopWallWorker();
  const worker = new Worker(new URL("./wall-worker.js", import.meta.url), { type: "module" });
  state.wallWorker = worker;
  setWallRunning(true, "計算中…");
  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "progress") {
      setWallRunning(true, `計算中… ${message.done} / ${message.total} 帯域`);
      return;
    }
    stopWallWorker();
    setWallRunning(false, "");
    if (message.type === "done") {
      runSafely("結果を表示できませんでした", () => showWallResults(layers, message.results));
    } else {
      showError("計算できませんでした", [message.message]);
    }
  });
  worker.addEventListener("error", (event) => {
    stopWallWorker();
    setWallRunning(false, "");
    showError("計算できませんでした", [event.message || "計算用のスレッドを起動できませんでした"]);
  });
  worker.postMessage({ layers });
}

function cancelWallCalculation() {
  if (!state.wallWorker) return;
  stopWallWorker();
  setWallRunning(false, "計算を中止しました（前の結果はそのままです）");
}

function showWallResults(layers, results) {
  state.wallResults = results;
  const notes = [];
  const resonance = doubleWallResonanceHz(layers);
  if (resonance !== null)
    notes.push(`二重壁の共鳴周波数の目安（垂直入射）：${resonance.toFixed(0)} Hz`);
  for (const plate of plateCriticalFrequencies(layers)) {
    notes.push(
      `${plate.index + 1}層目の板のコインシデンス限界周波数：${plate.criticalHz.toFixed(0)} Hz`,
    );
  }
  const outOfRange = results.filter((band) => band.porousOutOfRange.length > 0);
  if (outOfRange.length > 0) {
    notes.push(
      `多孔質材のモデル（Miki）の適用範囲外の帯域があります（${outOfRange.map((band) => band.nominalHz).join("、")} Hz）。参考値として見てください`,
    );
  }
  document
    .getElementById("wall-notes")
    .replaceChildren(...notes.map((text) => create("li", { text })));
  renderChart(
    document.getElementById("wall-chart"),
    [
      {
        label: "透過損失",
        className: "primary",
        points: results.map((band) => ({ hz: band.nominalHz, value: band.transmissionLossDb })),
      },
    ],
    { yLabel: "透過損失 [dB]" },
  );
  const rows = results.map((band) =>
    create("tr", { class: band.porousOutOfRange.length > 0 ? "reference" : "" }, [
      create("td", { text: String(band.nominalHz) }),
      create("td", { text: band.transmissionLossDb.toFixed(1) }),
      create("td", { text: band.absorptionRatio.toFixed(2) }),
    ]),
  );
  document.getElementById("wall-table").replaceChildren(...rows);
  document.getElementById("use-wall-result").disabled = false;
}

// ---- 開口部 ----

function setupOpening() {
  document.getElementById("calculate-opening").addEventListener("click", () => {
    const wall = parseNumberField(
      document.getElementById("opening-wall-tl").value,
      "壁の透過損失",
      { max: 150, allowZero: true },
    );
    const ratio = parseNumberField(document.getElementById("opening-ratio").value, "開口率", {
      max: 100,
      allowZero: true,
    });
    const errors = [wall, ratio].filter((result) => !result.ok).map((result) => result.message);
    if (errors.length > 0) {
      showError("入力を確認してください", errors);
      return;
    }
    runSafely("計算できませんでした", () => {
      const result = openingReduction(wall.value, percentToRatio(ratio.value));
      document.getElementById("opening-result").replaceChildren(
        create("li", { text: `開口部込みの透過損失：${result.compositeTlDb.toFixed(1)} dB` }),
        create("li", {
          text: `元の壁からの低下：${result.reductionDb.toFixed(1)} dB（${result.reductionPercent.toFixed(0)}%）`,
        }),
        create("li", {
          text: `外へ漏れる音のエネルギー：元の壁の ${result.transmittedEnergyFactor.toPrecision(3)} 倍`,
        }),
      );
    });
  });
  document.getElementById("use-wall-result").addEventListener("click", showOpeningBands);
}

function showOpeningBands() {
  const ratio = parseNumberField(document.getElementById("opening-ratio").value, "開口率", {
    max: 100,
    allowZero: true,
  });
  if (!ratio.ok) {
    showError("入力を確認してください", [ratio.message]);
    return;
  }
  runSafely("計算できませんでした", () => {
    const bands = state.wallResults.map((band) => ({
      hz: band.nominalHz,
      wall: band.transmissionLossDb,
      opened: openingReduction(band.transmissionLossDb, percentToRatio(ratio.value)).compositeTlDb,
    }));
    renderChart(
      document.getElementById("opening-chart"),
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
  });
}

// ---- 残響時間 ----

const FACES = [
  ["xMin", "奥の壁（X=0）"],
  ["xMax", "手前の壁"],
  ["yMin", "左の壁（Y=0）"],
  ["yMax", "右の壁"],
  ["zMin", "床"],
  ["zMax", "天井"],
];

function setupReverberation() {
  const container = document.getElementById("face-absorption");
  container.replaceChildren(
    ...FACES.map(([key, label]) =>
      create("label", { class: "field" }, [
        create("span", { text: `${label}の吸音率` }),
        create("input", {
          type: "text",
          inputmode: "decimal",
          id: `face-${key}`,
          value: key === "zMin" ? "0.3" : "0.1",
        }),
      ]),
    ),
  );
  document
    .getElementById("calculate-reverberation")
    .addEventListener("click", calculateReverberation);
}

function calculateReverberation() {
  const dimensions = [
    ["room-x", "部屋の奥行（X）"],
    ["room-y", "部屋の幅（Y）"],
    ["room-z", "天井高（Z）"],
  ].map(([id, label]) =>
    parseNumberField(document.getElementById(id).value, `${label} [mm]`, { max: 100000 }),
  );
  const faces = FACES.map(([key, label]) =>
    parseNumberField(document.getElementById(`face-${key}`).value, `${label}の吸音率`, {
      max: 1,
      allowZero: true,
    }),
  );
  const errors = [...dimensions, ...faces]
    .filter((result) => !result.ok)
    .map((result) => result.message);
  if (errors.length > 0) {
    showError("入力を確認してください", errors);
    return;
  }
  runSafely("計算できませんでした", () => {
    const room = rectangularRoom(
      {
        lengthXM: mmToM(dimensions[0].value),
        widthYM: mmToM(dimensions[1].value),
        heightZM: mmToM(dimensions[2].value),
      },
      Object.fromEntries(FACES.map(([key], index) => [key, faces[index].value])),
    );
    const times = reverberationTimes(room);
    document.getElementById("reverberation-result").replaceChildren(
      create("li", { text: `Sabine：${times.sabineS.toFixed(2)} 秒` }),
      create("li", { text: `Eyring：${times.eyringS.toFixed(2)} 秒` }),
      create("li", { text: `Fitzroy（吸音が偏った部屋向け）：${times.fitzroyS.toFixed(2)} 秒` }),
      create("li", {
        text: `Arau-Puchades（吸音が偏った部屋向け）：${times.arauPuchadesS.toFixed(2)} 秒`,
      }),
      create("li", { text: `部屋の容積：${room.volumeM3.toFixed(2)} m³` }),
    );
  });
}

// ---- タブ ----

function setupTabs() {
  const buttons = document.querySelectorAll("[data-tab]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-selected", String(other === button));
      for (const panel of document.querySelectorAll(".panel"))
        panel.hidden = panel.id !== button.dataset.tab;
    });
  }
}

setupTabs();
setupWall();
setupOpening();
setupReverberation();
document.getElementById("band-count").textContent = String(allBands().length);
document
  .querySelector("#error-dialog button")
  .addEventListener("click", () => document.getElementById("error-dialog").close());
