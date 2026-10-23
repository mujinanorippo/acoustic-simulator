// 残響時間タブ：面ごとに材料（残響室法吸音率の表）を選ぶか自分で入力し、オクターブ帯域ごとに4つの式で計算する
import { create, runSafely, showError, sourceLink, table } from "./dom.js";
import { mmToM, parseNumberField } from "./forms.js";
import { findMaterial, materialsOf } from "../core-acoustics/materials.js";
import { rectangularRoom, reverberationTimes } from "../core-acoustics/reverberation.js";

// 材料データの吸音率は 125〜4000 Hz のオクターブ帯域（材料データの note に記載）
const OCTAVE_BANDS_HZ = [125, 250, 500, 1000, 2000, 4000];

const FACES = [
  ["xMin", "奥の壁（X=0）", "absorb-gypsum-board-air45"],
  ["xMax", "手前の壁", "absorb-gypsum-board-air45"],
  ["yMin", "左の壁（Y=0）", "absorb-gypsum-board-air45"],
  ["yMax", "右の壁", "absorb-gypsum-board-air45"],
  ["zMin", "床", "absorb-pile-carpet-10mm"],
  ["zMax", "天井", "absorb-gypsum-board-air45"],
];

function bandInputs(key) {
  return OCTAVE_BANDS_HZ.map((_, band) => document.getElementById(`face-${key}-${band}`));
}

/** 材料の6帯域の値を入れ、全部に「参考値」の印を付ける。「自分で入力」なら値はそのまま印だけ外す */
function fillFromMaterial(key, materialId) {
  const material = findMaterial(materialId);
  bandInputs(key).forEach((input, band) => {
    if (material) input.value = String(material.values.absorptionOctave[band]);
    input.classList.toggle("is-reference", Boolean(material));
    input.title = material
      ? `参考値：${material.name}（${material.sources.absorptionOctave.source.title}）`
      : "";
  });
}

function faceControl([key, label]) {
  const select = create(
    "select",
    {
      id: `face-${key}`,
      "aria-label": `${label}の材料`,
      onchange: (event) => fillFromMaterial(key, event.target.value),
    },
    [create("option", { value: "", text: "自分で入力" })].concat(
      materialsOf("absorption").map((material) =>
        create("option", { value: material.id, text: material.name }),
      ),
    ),
  );
  const inputs = OCTAVE_BANDS_HZ.map((hz, band) =>
    create("input", {
      type: "text",
      inputmode: "decimal",
      id: `face-${key}-${band}`,
      class: "band-input",
      "aria-label": `${label}の ${hz} Hz の吸音率`,
      // 書き換えた欄は参考値の印を外す
      oninput: (event) => {
        event.target.classList.remove("is-reference");
        event.target.title = "";
      },
    }),
  );
  return create("tr", {}, [
    create("th", { class: "face-label", scope: "row", text: label }),
    create("td", {}, [select]),
    ...inputs.map((input) => create("td", {}, [input])),
  ]);
}

function faceTable() {
  return create("div", { class: "table-scroll" }, [
    create("table", { class: "face-table" }, [
      create("thead", {}, [
        create(
          "tr",
          {},
          ["面", "材料"]
            .concat(OCTAVE_BANDS_HZ.map((hz) => `${hz} Hz`))
            .map((text) => create("th", { text })),
        ),
      ]),
      create("tbody", {}, FACES.map(faceControl)),
    ]),
  ]);
}

function readDimensions() {
  return [
    ["room-x", "部屋の奥行（X）"],
    ["room-y", "部屋の幅（Y）"],
    ["room-z", "天井高（Z）"],
  ].map(([id, label]) =>
    parseNumberField(document.getElementById(id).value, `${label} [mm]`, { max: 100000 }),
  );
}

/** 面ごとの帯域別吸音率 { key: [6帯域] } と入力の誤り（画面の欄の値を使う。材料を選んでいても書き換えた値が優先） */
function readFaces() {
  const errors = [];
  const absorption = {};
  for (const [key, label] of FACES) {
    const values = bandInputs(key).map((input, band) =>
      parseNumberField(input.value, `${label}の ${OCTAVE_BANDS_HZ[band]} Hz の吸音率`, {
        max: 1,
        allowZero: true,
      }),
    );
    errors.push(...values.filter((item) => !item.ok).map((item) => item.message));
    absorption[key] = values.map((item) => item.value);
  }
  return { absorption, errors };
}

function calculate() {
  const dimensions = readDimensions();
  const faces = readFaces();
  const errors = dimensions
    .filter((item) => !item.ok)
    .map((item) => item.message)
    .concat(faces.errors);
  if (errors.length > 0) {
    showError("入力を確認してください", errors);
    return;
  }
  const [lengthMm, widthMm, heightMm] = dimensions.map((item) => item.value);
  const size = { lengthXM: mmToM(lengthMm), widthYM: mmToM(widthMm), heightZM: mmToM(heightMm) };
  runSafely("計算できませんでした", () => {
    const rows = OCTAVE_BANDS_HZ.map((hz, band) => {
      const faceAbsorption = Object.fromEntries(
        FACES.map(([key]) => [key, faces.absorption[key][band]]),
      );
      const times = reverberationTimes(rectangularRoom(size, faceAbsorption));
      return [String(hz), times.sabineS, times.eyringS, times.fitzroyS, times.arauPuchadesS].map(
        (value) => (typeof value === "number" ? value.toFixed(2) : value),
      );
    });
    const volume = size.lengthXM * size.widthYM * size.heightZM;
    document
      .getElementById("reverberation-result")
      .replaceChildren(
        create("p", { class: "hint", text: `部屋の容積：${volume.toFixed(2)} m³。単位は秒` }),
        table(
          [
            "周波数 [Hz]",
            "Sabine",
            "Eyring",
            "Fitzroy（吸音が偏った部屋向け）",
            "Arau-Puchades（吸音が偏った部屋向け）",
          ],
          rows,
        ),
      );
  });
}

function referenceTable() {
  const rows = materialsOf("absorption").map((material) => [
    material.name,
    ...material.values.absorptionOctave.map((value) => value.toFixed(2)),
    material.sources.absorptionOctave.note?.split("。").slice(2).join("。") || "—",
    sourceLink(material.sources.absorptionOctave.source),
  ]);
  return table(["材料", ...OCTAVE_BANDS_HZ.map((hz) => `${hz} Hz`), "条件", "出典"], rows);
}

export function setupReverbPanel() {
  document.getElementById("face-absorption").replaceChildren(faceTable());
  for (const [key, , defaultId] of FACES) fillFromMaterial(key, defaultId);
  for (const [key, , defaultId] of FACES) document.getElementById(`face-${key}`).value = defaultId;
  document.getElementById("calculate-reverberation").addEventListener("click", calculate);
  document.getElementById("absorption-reference").replaceChildren(referenceTable());
}
