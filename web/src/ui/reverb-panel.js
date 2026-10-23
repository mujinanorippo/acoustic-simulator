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

function faceControl([key, label, defaultId]) {
  const custom = create("input", {
    type: "text",
    inputmode: "decimal",
    id: `face-${key}-custom`,
    value: "0.1",
    "aria-label": `${label}の吸音率（自分で入力・全帯域同じ値）`,
    disabled: true,
  });
  const select = create(
    "select",
    {
      id: `face-${key}`,
      "aria-label": `${label}の材料`,
      onchange: (event) => {
        custom.disabled = event.target.value !== "";
      },
    },
    [create("option", { value: "", text: "自分で入力（全帯域同じ値）" })].concat(
      materialsOf("absorption").map((material) =>
        create("option", { value: material.id, text: material.name }),
      ),
    ),
  );
  select.value = defaultId;
  return create("div", { class: "face-row" }, [
    create("span", { class: "face-label", text: label }),
    select,
    create("label", { class: "inline-field" }, [create("span", { text: "吸音率" }), custom]),
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

/** 面ごとの帯域別吸音率 { key: [6帯域] } と入力の誤り */
function readFaces() {
  const errors = [];
  const absorption = {};
  for (const [key, label] of FACES) {
    const material = findMaterial(document.getElementById(`face-${key}`).value);
    if (material) {
      absorption[key] = material.values.absorptionOctave;
      continue;
    }
    const value = parseNumberField(
      document.getElementById(`face-${key}-custom`).value,
      `${label}の吸音率`,
      {
        max: 1,
        allowZero: true,
      },
    );
    if (value.ok) absorption[key] = OCTAVE_BANDS_HZ.map(() => value.value);
    else errors.push(value.message);
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
  document.getElementById("face-absorption").replaceChildren(...FACES.map(faceControl));
  document.getElementById("calculate-reverberation").addEventListener("click", calculate);
  document.getElementById("absorption-reference").replaceChildren(referenceTable());
}
