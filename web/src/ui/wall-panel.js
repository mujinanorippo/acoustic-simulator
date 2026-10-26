// 壁の遮音タブ：積層の入力（材料を選ぶと参考値が入る）、別スレッドでの計算と中止、結果、参考表
import { renderChart } from "./chart.js";
import { drawLayers } from "./layer-drawing.js";
import { create, runSafely, showError, sourceLink, table } from "./dom.js";
import {
  applyMaterial,
  editField,
  LAYER_KINDS,
  materialChoices,
  rowUsesTentativeValues,
  toCoreLayer,
} from "./layer-form.js";
import { findMaterial, materialsOf, plateSurfaceDensityKgm2 } from "../core-acoustics/materials.js";
import { flowResistivityFromFiber } from "../core-acoustics/layer-models.js";
import { lineBridgeParameters } from "../core-acoustics/bridging.js";
import { SOUND_SOURCES } from "../core-acoustics/constants.js";
import { rangeTransmissionLossDb } from "../core-acoustics/source-ranges.js";
import { doubleWallResonanceHz, plateCriticalFrequencies } from "../core-acoustics/tmm.js";
import { mmToM, parseNumberField } from "./forms.js";

const MM_PER_M = 1000;

// 入力例（材料は材料データから選ぶ。値はすべて参考値として表示される）
const EXAMPLE_ROWS = [
  ["plate", "gypsum-board-gbr-12-5mm"],
  ["air", "", { thickness: "50" }],
  ["porous", "glass-wool-standard", { thickness: "50", density: "16" }],
  ["plate", "gypsum-board-gbr-12-5mm"],
];

function exampleRows() {
  return EXAMPLE_ROWS.map(([kind, materialId, texts = {}]) =>
    applyMaterial({ kind, materialId: "", texts, referenceKeys: [] }, materialId),
  );
}

function sourceSummary(material, key) {
  const item = material?.sources[key];
  return item
    ? `出典：${item.source.title}（信頼度：${item.reliability}）${item.note ? `／${item.note}` : ""}`
    : "";
}

function fieldInput(row, field, update, current) {
  const isReference = (row.referenceKeys ?? []).includes(field.key);
  const material = findMaterial(row.materialId);
  const children = [
    create("span", { text: `${field.label}${field.unit ? ` [${field.unit}]` : ""}` }),
    create("span", { class: "input-line" }, [
      create("input", {
        type: "text",
        inputmode: "decimal",
        value: row.texts[field.key] ?? "",
        "data-key": field.key,
        oninput: (event) => update(editField(current(), field.key, event.target.value), false),
      }),
      isReference
        ? create("span", {
            class: "reference-tag",
            text: "（参考値）",
            title: sourceSummary(material, field.key),
          })
        : "",
    ]),
  ];
  if (field.help) children.push(create("span", { class: "field-help", text: field.help }));
  return create("label", { class: "field" }, children);
}

function materialSelect(row, index, update, current) {
  const choices = materialChoices(row.kind);
  if (choices.length === 0) return "";
  const options = [create("option", { value: "", text: "自分で入力" })].concat(
    choices.map((material) => create("option", { value: material.id, text: material.name })),
  );
  const select = create(
    "select",
    {
      "aria-label": `${index + 1}層目の材料`,
      class: "material-select",
      onchange: (event) => update(applyMaterial(current(), event.target.value), true),
    },
    options,
  );
  select.value = row.materialId ?? "";
  return select;
}

function kindSelect(row, index, update) {
  const select = create(
    "select",
    {
      "aria-label": `${index + 1}層目の種類`,
      class: "kind-select",
      onchange: (event) =>
        update({ kind: event.target.value, materialId: "", texts: {}, referenceKeys: [] }, true),
    },
    Object.entries(LAYER_KINDS).map(([key, kind]) =>
      create("option", { value: key, text: kind.label }),
    ),
  );
  select.value = row.kind;
  return select;
}

function rowButtons(index, rows, redraw) {
  const move = (offset) => () => {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    redraw();
  };
  return create("div", { class: "row-buttons" }, [
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
}

function layerRow(rows, index, redraw) {
  const row = rows[index];
  const current = () => rows[index];
  // 入力のたびに作り直すと入力中の欄から外れるので、入力では行データだけ更新し、
  // 種類・材料を変えたときだけ描き直す
  const update = (next, shouldRedraw) => {
    rows[index] = next;
    if (shouldRedraw) redraw();
    else {
      redrawTags(index, next);
      drawLayers(document.getElementById("layer-drawing"), rows);
    }
  };
  return create("div", { class: "layer-row", "data-index": String(index) }, [
    create("span", { class: "row-number", text: `${index + 1}` }),
    create("div", { class: "row-selects" }, [
      kindSelect(row, index, update),
      materialSelect(row, index, update, current),
    ]),
    create(
      "div",
      { class: "row-fields" },
      LAYER_KINDS[row.kind].fields.map((field) => fieldInput(row, field, update, current)),
    ),
    rowButtons(index, rows, redraw),
  ]);
}

/**
 * 入力した欄の「（参考値）」の印を外し、計算し直された欄（密度から出す流れ抵抗）の値を入れ直す。
 * 入力中の欄は触らない（描き直すとカーソルが外れるため）
 */
function redrawTags(index, row) {
  const element = document.querySelector(`.layer-row[data-index="${index}"]`);
  for (const input of element.querySelectorAll("input[data-key]")) {
    const key = input.dataset.key;
    const tag = input.parentElement.querySelector(".reference-tag");
    if (tag && !(row.referenceKeys ?? []).includes(key)) tag.remove();
    if (input !== document.activeElement && input.value !== (row.texts[key] ?? "")) {
      input.value = row.texts[key] ?? "";
    }
  }
}

// ---- 計算の実行・中止（計算は別スレッド。中止したら途中の結果は使わない） ----

const run = { worker: null };

function setRunning(isRunning, message) {
  document.getElementById("calculate-wall").disabled = isRunning;
  document.getElementById("add-layer").disabled = isRunning;
  document.getElementById("cancel-wall").hidden = !isRunning;
  document.getElementById("wall-status").textContent = message;
}

function stopWorker() {
  run.worker?.terminate();
  run.worker = null;
}

function startCalculation(layers, rows, studSpacingM, onResults) {
  stopWorker();
  const worker = new Worker(new URL("./wall-worker.js", import.meta.url), { type: "module" });
  run.worker = worker;
  setRunning(true, "計算中…");
  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "progress") {
      setRunning(true, `計算中… ${message.done} / ${message.total} 帯域`);
      return;
    }
    stopWorker();
    setRunning(false, "");
    if (message.type === "done") {
      runSafely("結果を表示できませんでした", () => {
        showResults(layers, rows, studSpacingM, message.results);
        onResults(message.results);
      });
    } else {
      showError("計算できませんでした", [message.message]);
    }
  });
  worker.addEventListener("error", (event) => {
    stopWorker();
    setRunning(false, "");
    showError("計算できませんでした", [event.message || "計算用のスレッドを起動できませんでした"]);
  });
  worker.postMessage({ layers, studSpacingM });
}

function cancelCalculation() {
  if (!run.worker) return;
  stopWorker();
  setRunning(false, "計算を中止しました（前の結果はそのままです）");
}

function calculate(rows, onResults) {
  if (rows.length === 0) {
    showError("入力を確認してください", ["層が1つもありません。「層を追加」で追加してください"]);
    return;
  }
  const converted = rows.map((row, index) => toCoreLayer(row, index));
  const spacing = parseNumberField(
    document.getElementById("stud-spacing").value,
    "間柱の間隔 [mm]",
    { max: 10000 },
  );
  const errors = converted
    .flatMap((result) => (result.ok ? [] : result.errors.map((item) => item.message)))
    .concat(spacing.ok ? [] : [spacing.message]);
  if (errors.length > 0) {
    showError("入力を確認してください", errors);
    return;
  }
  runSafely("入力を確認してください", () =>
    startCalculation(
      converted.map((result) => result.layer),
      structuredClone(rows),
      mmToM(spacing.value),
      onResults,
    ),
  );
}

function resultNotes(layers, rows, studSpacingM, results) {
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
  const bridge = lineBridgeParameters(layers, studSpacingM);
  notes.push(
    bridge === null
      ? "「間柱でつながる」は、板・空気層（多孔質材）・板の二重壁のときだけ計算します（この積層は対象外）"
      : `「間柱でつながる」は Sharp の線接続のモデル（間柱の間隔 ${(studSpacingM * 1000).toFixed(0)} mm、臨界周波数 ${bridge.criticalHz.toFixed(0)} Hz、質量則に ${bridge.offsetDb.toFixed(1)} dB を足した値を間柱経由の上限とし、空気層経由と透過率で合成）。間柱の硬さや固定方法は考えていない目安`,
  );
  if (rows.some(rowUsesTentativeValues)) {
    notes.push("材料の参考値（二次情報・暫定の値）を使っているため、結果は暫定値を含みます");
  }
  return notes;
}

function sourceTable(results, studSpacingM) {
  const independent = results.map((band) => ({
    centerHz: band.centerHz,
    value: band.transmissionLossDb,
  }));
  const hasBridge = results.every((band) => band.bridgedTransmissionLossDb !== null);
  const bridged = hasBridge
    ? results.map((band) => ({ centerHz: band.centerHz, value: band.bridgedTransmissionLossDb }))
    : null;
  const rows = SOUND_SOURCES.map((source) => {
    const [low, high] = source.rangeHz;
    return [
      source.note.split("。")[0],
      low === high ? `${low}` : `${low}〜${high}`,
      bridged ? rangeTransmissionLossDb(bridged, low, high).toFixed(1) : "—（二重壁でない）",
      rangeTransmissionLossDb(independent, low, high).toFixed(1),
    ];
  });
  return table(
    [
      "楽器名",
      "周波数 [Hz]",
      `平均透過損失：間柱 ${(studSpacingM * 1000).toFixed(0)} mm でつながる [dB]`,
      "理論値：完全に独立 [dB]",
    ],
    rows,
  );
}

function showResults(layers, rows, studSpacingM, results) {
  const notes = resultNotes(layers, rows, studSpacingM, results);
  document
    .getElementById("wall-notes")
    .replaceChildren(...notes.map((text) => create("li", { text })));
  renderChart(
    document.getElementById("wall-chart"),
    [
      {
        label: "完全に独立",
        className: "primary",
        points: results.map((band) => ({ hz: band.nominalHz, value: band.transmissionLossDb })),
      },
      ...(results.every((band) => band.bridgedTransmissionLossDb !== null)
        ? [
            {
              label: "間柱でつながる",
              className: "secondary",
              points: results.map((band) => ({
                hz: band.nominalHz,
                value: band.bridgedTransmissionLossDb,
              })),
            },
          ]
        : []),
    ],
    { yLabel: "透過損失 [dB]" },
  );
  document.getElementById("wall-sources").replaceChildren(sourceTable(results, studSpacingM));
  document.getElementById("wall-table").replaceChildren(
    ...results.map((band) =>
      create("tr", { class: band.porousOutOfRange.length > 0 ? "reference" : "" }, [
        create("td", { text: String(band.nominalHz) }),
        create("td", { text: band.transmissionLossDb.toFixed(1) }),
        create("td", {
          text:
            band.bridgedTransmissionLossDb === null
              ? "—"
              : band.bridgedTransmissionLossDb.toFixed(1),
        }),
        create("td", { text: band.absorptionRatio.toFixed(2) }),
      ]),
    ),
  );
}

// ---- 参考表 ----

function plateReferenceTable() {
  const rows = materialsOf("plate").map((material) => {
    const thicknessM = material.values.thickness;
    const surface = plateSurfaceDensityKgm2(material, thicknessM);
    const product = material.values.coincidenceProduct;
    const densityKey = "surfaceDensity" in material.values ? "surfaceDensity" : "density";
    return [
      material.name,
      (thicknessM * MM_PER_M).toFixed(1),
      surface.toFixed(1),
      product > 0 ? (product / thicknessM).toFixed(0) : "—（重さだけで計算）",
      sourceLink(material.sources[densityKey].source),
      material.sources[densityKey].reliability,
    ];
  });
  return table(
    [
      "材料",
      "厚さ [mm]",
      "面密度 [kg/m²]",
      "コインシデンス限界周波数の目安 [Hz]",
      "面密度の出典",
      "信頼度",
    ],
    rows,
  );
}

function porousReferenceTable() {
  // 測定値のある材料と、密度が決まっていて流れ抵抗を計算できる材料（GCボードなど）を並べる
  const rows = materialsOf("porous").flatMap((material) => {
    const { density, flowResistivity, fiberDiameter } = material.values;
    const value =
      flowResistivity ??
      (density && fiberDiameter ? flowResistivityFromFiber(density, fiberDiameter) : null);
    if (value === null) return [];
    const sourceKey = flowResistivity === undefined ? "fiberDiameter" : "flowResistivity";
    return [
      [
        material.name,
        density === undefined ? "—" : density.toFixed(1),
        flowResistivity === undefined ? `${value.toFixed(0)}（計算）` : value.toFixed(0),
        sourceLink(material.sources[sourceKey].source),
        material.sources[sourceKey].reliability,
      ],
    ];
  });
  return table(["材料", "密度 [kg/m³]", "流れ抵抗 [Pa·s/m²]", "出典", "信頼度"], rows);
}

export function setupWallPanel(onResults) {
  const rows = exampleRows();
  const list = document.getElementById("layer-list");
  const redraw = () => {
    list.replaceChildren(...rows.map((_, index) => layerRow(rows, index, redraw)));
    drawLayers(document.getElementById("layer-drawing"), rows);
  };
  redraw();
  document.getElementById("add-layer").addEventListener("click", () => {
    rows.push({ kind: "air", materialId: "", texts: { thickness: "50" }, referenceKeys: [] });
    redraw();
  });
  document
    .getElementById("calculate-wall")
    .addEventListener("click", () => calculate(rows, onResults));
  document.getElementById("cancel-wall").addEventListener("click", cancelCalculation);
  document.getElementById("plate-reference").replaceChildren(plateReferenceTable());
  document.getElementById("porous-reference").replaceChildren(porousReferenceTable());
}
