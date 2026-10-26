// 部屋の形タブ（フェーズ2：モデラーの骨組み）。形4種（ブロック・ブロック穴・円柱・円柱穴）を数値で置き、
// 一体化・くり抜きした部屋を3D表示する。開口部（ドア・窓・開口部）を壁・床・天井の面に貼る。
// 変更のたびに立体を作り直し、部屋が分かれる・面にない開口部などのエラーは理由を出して元に戻す。
// 画面の入力は mm、内部とファイルは m（変換はここで1回だけ）。
import { buildRoom } from "../core-model/geometry.js";
import { loadManifold } from "../core-model/manifold-loader.js";
import { AXES, nextId, OPENING_KINDS, PLANE_AXES, SHAPE_KINDS } from "../core-model/model.js";
import { canChooseSaveLocation, readFileText, saveTextFile } from "../io/file-access.js";
import { parseProject, serializeProject } from "../io/project-file.js";
import { createRoomView } from "../viewer/room-view.js";
import { create, runSafely, showError } from "./dom.js";
import { parseNumberField } from "./forms.js";

const MM_PER_M = 1000;
const MM_DECIMALS = 1;
const MAX_ABS_MM = 1000000;
const DEFAULT_ROOM_MM = { x: 3640, y: 2730, z: 2400 };
const NEW_BLOCK_MM = { x: 1000, y: 1000 };
const NEW_HOLE_MM = { x: 1200, y: 600, z: 700 };
const NEW_CYLINDER_MM = { diameter: 300 };
const NEW_DOOR_MM = { offset: 500, width: 800, height: 2000 };
const NEW_WINDOW_MM = { sill: 900, height: 900, width: 1200 };
// 開口部を置ける場所を探すときのずらし幅 [m]
const CANDIDATE_STEP_M = 0.1;
const SAVE_FILE_NAME = "部屋.json";

const toMm = (valueM) => Number((valueM * MM_PER_M).toFixed(MM_DECIMALS));
const toM = (valueMm) => valueMm / MM_PER_M;

function defaultRoom() {
  return {
    features: [
      {
        id: "b1",
        kind: "block",
        position: { x: 0, y: 0, z: 0 },
        size: { x: toM(DEFAULT_ROOM_MM.x), y: toM(DEFAULT_ROOM_MM.y), z: toM(DEFAULT_ROOM_MM.z) },
      },
    ],
    openings: [],
  };
}

const state = { wasm: null, view: null, name: "部屋", room: defaultRoom(), result: null };

// ---- 立体を作り直す（失敗したら元に戻す） ----

function apply(candidate, { refit = false } = {}) {
  try {
    const result = buildRoom(state.wasm, candidate);
    state.room = candidate;
    state.result = result;
    state.view.show(result, candidate, { refit });
    renderAll();
    return true;
  } catch (error) {
    showError("この形にはできません（元に戻しました）", [error.message]);
    renderAll();
    return false;
  }
}

function edited(change) {
  const candidate = structuredClone(state.room);
  change(candidate);
  apply(candidate);
}

// ---- 入力欄 ----

function numberInput(valueM, label, onValue, { isLength }) {
  return create("input", {
    type: "text",
    inputmode: "decimal",
    class: "cell-input",
    value: String(toMm(valueM)),
    "aria-label": label,
    onchange: (event) => {
      const parsed = parseNumberField(event.target.value, `${label} [mm]`, {
        allowNegative: !isLength,
        allowZero: !isLength,
        max: MAX_ABS_MM,
      });
      if (!parsed.ok) {
        showError("入力を確認してください（元に戻しました）", [parsed.message]);
        renderAll();
        return;
      }
      onValue(toM(parsed.value));
    },
  });
}

function select(options, value, label, onValue) {
  const element = create(
    "select",
    { class: "cell-select", "aria-label": label, onchange: (event) => onValue(event.target.value) },
    Object.entries(options).map(([key, text]) => create("option", { value: key, text })),
  );
  element.value = value;
  return element;
}

const cell = (child) => create("td", {}, [child]);
const kindLabels = (kinds) =>
  Object.fromEntries(Object.entries(kinds).map(([key, kind]) => [key, kind.label]));

function featureSizeCells(feature, index) {
  const set = (apply) => (value) => edited((room) => apply(room.features[index], value));
  if (SHAPE_KINDS[feature.kind].primitive === "box") {
    return AXES.map((axis) =>
      cell(
        numberInput(
          feature.size[axis],
          `${index + 1}番目の形の ${axis} 方向の大きさ`,
          set((item, value) => {
            item.size[axis] = value;
          }),
          { isLength: true },
        ),
      ),
    );
  }
  return [
    cell(
      select(
        { x: "x 向き", y: "y 向き", z: "z 向き" },
        feature.axis,
        `${index + 1}番目の形の向き`,
        set((item, value) => {
          item.axis = value;
        }),
      ),
    ),
    cell(
      numberInput(
        feature.diameter,
        `${index + 1}番目の形の直径`,
        set((item, value) => {
          item.diameter = value;
        }),
        { isLength: true },
      ),
    ),
    cell(
      numberInput(
        feature.length,
        `${index + 1}番目の形の長さ`,
        set((item, value) => {
          item.length = value;
        }),
        { isLength: true },
      ),
    ),
  ];
}

function featureRow(feature, index) {
  const set = (apply) => (value) => edited((room) => apply(room.features[index], value));
  return create("tr", { "data-index": String(index) }, [
    create("td", { class: "row-number", text: String(index + 1) }),
    cell(create("span", { text: SHAPE_KINDS[feature.kind].label })),
    ...AXES.map((axis) =>
      cell(
        numberInput(
          feature.position[axis],
          `${index + 1}番目の形の位置 ${axis}`,
          set((item, value) => {
            item.position[axis] = value;
          }),
          { isLength: false },
        ),
      ),
    ),
    ...featureSizeCells(feature, index),
    cell(
      create("button", {
        type: "button",
        text: "削除",
        "aria-label": `${index + 1}番目の形を削除`,
        onclick: () => edited((room) => room.features.splice(index, 1)),
      }),
    ),
  ]);
}

function openingKindCells(opening, index, set) {
  return [
    cell(
      select(
        kindLabels(OPENING_KINDS),
        opening.kind,
        `${index + 1}番目の開口部の種類`,
        set((item, value) => {
          item.kind = value;
        }),
      ),
    ),
    cell(
      select(
        { x: "x 面（yz）", y: "y 面（xz）", z: "z 面（xy）" },
        opening.axis,
        `${index + 1}番目の開口部の面`,
        (value) =>
          edited((room) => {
            room.openings[index] = changedOpeningAxis(room.openings[index], value);
          }),
      ),
    ),
  ];
}

function openingRow(opening, index) {
  const set = (apply) => (value) => edited((room) => apply(room.openings[index], value));
  const [first, second] = PLANE_AXES[opening.axis];
  const range = (axis, end) =>
    cell(
      numberInput(
        opening[end][axis],
        `${index + 1}番目の開口部の ${axis} の${end === "min" ? "始まり" : "終わり"}`,
        set((item, value) => {
          item[end][axis] = value;
        }),
        { isLength: false },
      ),
    );
  return create("tr", { "data-index": String(index) }, [
    create("td", { class: "row-number", text: String(index + 1) }),
    ...openingKindCells(opening, index, set),
    cell(
      numberInput(
        opening.coordinate,
        `${index + 1}番目の開口部の面の位置`,
        set((item, value) => {
          item.coordinate = value;
        }),
        { isLength: false },
      ),
    ),
    create("td", { class: "axis-label", text: first }),
    range(first, "min"),
    range(first, "max"),
    create("td", { class: "axis-label", text: second }),
    range(second, "min"),
    range(second, "max"),
    cell(
      create("button", {
        type: "button",
        text: "削除",
        "aria-label": `${index + 1}番目の開口部を削除`,
        onclick: () => edited((room) => room.openings.splice(index, 1)),
      }),
    ),
  ]);
}

/** 面の向きを変えたら、範囲を新しい面の2軸に付け替える（部屋の範囲の中央に置き直す） */
function changedOpeningAxis(opening, axis) {
  const bounds = state.result.bounds;
  const [first, second] = PLANE_AXES[axis];
  const width = Math.max(
    ...PLANE_AXES[opening.axis].map((key) => opening.max[key] - opening.min[key]),
  );
  const middle = (key) => (bounds.min[key] + bounds.max[key]) / 2;
  const span = (key) => Math.min(width, bounds.max[key] - bounds.min[key]) / 2;
  return {
    ...opening,
    axis,
    coordinate: bounds.min[axis],
    min: { [first]: middle(first) - span(first), [second]: middle(second) - span(second) },
    max: { [first]: middle(first) + span(first), [second]: middle(second) + span(second) },
  };
}

function renderAll() {
  document.getElementById("feature-table").replaceChildren(...state.room.features.map(featureRow));
  document
    .getElementById("opening-surface-table")
    .replaceChildren(...state.room.openings.map(openingRow));
  const summary = state.result
    ? `容積 ${state.result.volumeM3.toFixed(2)} m³、表面積 ${state.result.surfaceAreaM2.toFixed(2)} m²、形 ${state.room.features.length} 個、開口部 ${state.room.openings.length} 個`
    : "";
  document.getElementById("room-summary").textContent = summary;
}

// ---- 形・開口部を足す（いまの部屋の範囲を基準に、つながる位置に置く） ----

function newFeature(kind) {
  const { min, max } = state.result.bounds;
  const id = nextId(SHAPE_KINDS[kind].additive ? "b" : "h", state.room.features);
  const height = max.z - min.z;
  if (kind === "block") {
    return {
      id,
      kind,
      position: { x: max.x, y: min.y, z: min.z },
      size: { x: toM(NEW_BLOCK_MM.x), y: toM(NEW_BLOCK_MM.y), z: height },
    };
  }
  if (kind === "blockHole") {
    return {
      id,
      kind,
      position: { x: min.x, y: min.y, z: min.z },
      size: { x: toM(NEW_HOLE_MM.x), y: toM(NEW_HOLE_MM.y), z: toM(NEW_HOLE_MM.z) },
    };
  }
  const diameter = toM(NEW_CYLINDER_MM.diameter);
  return {
    id,
    kind,
    position: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: min.z },
    axis: "z",
    diameter,
    length: height,
  };
}

/** 開口部の候補：4つの壁のそれぞれで、端から順にずらした位置（ドアは床から、窓は腰の高さから） */
function openingCandidates(kind) {
  const { min, max } = state.result.bounds;
  const isDoor = kind === "door";
  const widthM = toM(isDoor ? NEW_DOOR_MM.width : NEW_WINDOW_MM.width);
  const bottom = min.z + (isDoor ? 0 : toM(NEW_WINDOW_MM.sill));
  const top = bottom + toM(isDoor ? NEW_DOOR_MM.height : NEW_WINDOW_MM.height);
  const walls = [
    ["y", min.y, "x"],
    ["x", min.x, "y"],
    ["y", max.y, "x"],
    ["x", max.x, "y"],
  ];
  return walls.flatMap(([axis, coordinate, along]) => {
    const steps = Math.floor((max[along] - min[along] - widthM) / CANDIDATE_STEP_M);
    return Array.from({ length: Math.max(steps, 0) + 1 }, (_, step) => {
      const start = min[along] + toM(NEW_DOOR_MM.offset) + step * CANDIDATE_STEP_M;
      return {
        kind,
        axis,
        coordinate,
        min: { [along]: start, z: bottom },
        max: { [along]: start + widthM, z: top },
      };
    });
  });
}

/** 部屋の面の上に置ける最初の候補を返す（どこにも置けないときは最初の候補。適用時に理由が出る） */
function newOpening(kind) {
  const id = nextId("o", state.room.openings);
  const candidates = openingCandidates(kind).map((candidate) => ({ id, ...candidate }));
  const fits = candidates.find((candidate) => {
    try {
      buildRoom(state.wasm, { ...state.room, openings: [...state.room.openings, candidate] });
      return true;
    } catch {
      return false;
    }
  });
  return fits ?? candidates[0];
}

// ---- ファイル ----

async function saveProject() {
  const text = serializeProject({ name: state.name, room: state.room });
  const status = await saveTextFile(text, SAVE_FILE_NAME);
  const messages = {
    saved: "保存しました",
    downloaded: "ダウンロードとして保存しました",
    cancelled: "保存をやめました（何も変えていません）",
  };
  document.getElementById("file-status").textContent = messages[status];
}

async function openProject(file) {
  try {
    const project = parseProject(await readFileText(file));
    state.name = project.name;
    if (apply(project.room, { refit: true })) {
      document.getElementById("file-status").textContent = `「${file.name}」を開きました`;
    }
  } catch (error) {
    showError("ファイルを開けませんでした（今の部屋はそのままです）", [error.message]);
  }
}

function setupButtons() {
  for (const kind of Object.keys(SHAPE_KINDS)) {
    document
      .getElementById(`add-${kind}`)
      .addEventListener("click", () => edited((room) => room.features.push(newFeature(kind))));
  }
  for (const kind of Object.keys(OPENING_KINDS)) {
    document
      .getElementById(`add-${kind}`)
      .addEventListener("click", () => edited((room) => room.openings.push(newOpening(kind))));
  }
  document.getElementById("new-project").addEventListener("click", () => {
    state.name = "部屋";
    apply(defaultRoom(), { refit: true });
    document.getElementById("file-status").textContent = "新しい部屋にしました";
  });
  document
    .getElementById("save-project")
    .addEventListener("click", () =>
      saveProject().catch((error) => showError("保存できませんでした", [error.message])),
    );
  const fileInput = document.getElementById("open-file");
  document.getElementById("open-project").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files;
    fileInput.value = "";
    if (file) openProject(file);
  });
  if (!canChooseSaveLocation()) {
    document.getElementById("file-status").textContent =
      "このブラウザは保存先を選べないため、保存はダウンロードになります";
  }
}

export async function setupModelerPanel() {
  setupButtons();
  state.view = createRoomView(document.getElementById("room-view"));
  try {
    state.wasm = await loadManifold();
  } catch (error) {
    showError("3Dの計算部品を読み込めませんでした", [String(error?.message ?? error)]);
    return;
  }
  runSafely("部屋を表示できませんでした", () => apply(state.room, { refit: true }));
}
