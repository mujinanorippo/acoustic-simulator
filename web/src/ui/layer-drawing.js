// 積層の断面図：壁を上から見た縦長の断面として、室内側（左）から順に厚さの比率で層を並べる（SVG）。
// 画面の横幅いっぱいには広げず、壁とわかる程度の大きさ（幅 380 の枠の中）に収める。
// 色とハッチングは材料の種類で決める。ハッチングの形は JIS A 0150 の材料構造表示記号に
// 合わせるつもりで描いているが、規格の図はまだ確認できていない（docs/README.md の未確認事項）。
import { findMaterial } from "../core-acoustics/materials.js";
import { create } from "./dom.js";
import { LAYER_KINDS } from "./layer-form.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 380;
const WALL_LEFT = 40;
const WALL_WIDTH = 300;
const TOP = 22;
const STRIP_HEIGHT = 216;
const MIN_LAYER_WIDTH = 3;
const LABEL_ROW_GAP = 12;
const LABEL_CHAR_WIDTH = 6.5;
const LABEL_GAP = 1;
const LABEL_BOTTOM_MARGIN = 4;
const HATCH_SPACING = 6;

// 材料の種類ごとの見た目。fill は塗り、hatch はハッチングの種類
const APPEARANCES = Object.freeze({
  air: { fill: "#dcefff", hatch: "none", label: "空気層" },
  insulation: { fill: "#fff6c8", hatch: "insulation", label: "グラスウール系" },
  sponge: { fill: "#c8c8c8", hatch: "none", label: "スポンジ" },
  gypsum: { fill: "#ffffff", hatch: "diagonal", label: "せっこうボード" },
  wood: { fill: "#e3c9a4", hatch: "wood", label: "木質ボード" },
  glass: { fill: "#e4f2f2", hatch: "none", label: "ガラス" },
  siding: { fill: "#d9d6cf", hatch: "none", label: "サイディング" },
  sheet: { fill: "#6b6f75", hatch: "none", label: "遮音シート" },
  cardboard: { fill: "#d8b98a", hatch: "none", label: "段ボール" },
  perforated: { fill: "#ffffff", hatch: "perforated", label: "有孔板" },
  plate: { fill: "#eeeeee", hatch: "none", label: "板" },
});

const PLATE_PREFIXES = [
  ["gypsum-board", "gypsum"],
  ["structural-plywood", "wood"],
  ["particleboard", "wood"],
  ["float-glass", "glass"],
  ["fiber-cement-siding", "siding"],
  ["sound-insulation-sheet", "sheet"],
  ["cardboard", "cardboard"],
];

/** 行（種類・材料）から見た目の種類を決める */
export function appearanceKey(row) {
  const id = row.materialId ?? "";
  if (row.kind === "air") return "air";
  if (row.kind === "perforated") return "perforated";
  if (row.kind === "porous") {
    if (id.startsWith("urethane")) return "sponge";
    return "insulation";
  }
  const match = PLATE_PREFIXES.find(([prefix]) => id.startsWith(prefix));
  return match ? match[1] : "plate";
}

export function appearanceOf(row) {
  return APPEARANCES[appearanceKey(row)];
}

/** 層の幅 [px]：厚さの比率。厚さが読めない層は最小幅 */
export function layerWidths(thicknessesMm, totalWidth = WALL_WIDTH) {
  const valid = thicknessesMm.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = valid.reduce((sum, value) => sum + value, 0);
  const flexible = totalWidth - MIN_LAYER_WIDTH * valid.length;
  return valid.map((value) =>
    total > 0 && flexible > 0 ? MIN_LAYER_WIDTH + (flexible * value) / total : MIN_LAYER_WIDTH,
  );
}

function element(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}

function hatchPattern(id, content) {
  const pattern = element("pattern", {
    id,
    width: HATCH_SPACING,
    height: HATCH_SPACING,
    patternUnits: "userSpaceOnUse",
  });
  pattern.append(...content);
  return pattern;
}

function patterns() {
  const line = (path) => element("path", { d: path, class: "hatch-line" });
  const step = HATCH_SPACING;
  const defs = element("defs");
  defs.append(
    hatchPattern("hatch-diagonal", [line(`M0,${step} L${step},0`)]),
    hatchPattern("hatch-wood", [line(`M0,0 L${step},${step}`)]),
    hatchPattern("hatch-insulation", [line(`M0,0 L${step / 2},${step} L${step},0`)]),
    hatchPattern("hatch-perforated", [line(`M${step / 2},0 L${step / 2},${step / 2}`)]),
  );
  return defs;
}

function thicknessOf(row) {
  const value = Number(String(row.texts?.thickness ?? "").trim());
  return Number.isFinite(value) ? value : 0;
}

/**
 * 番号の文字を置く段を決める：左から順に、前の文字と重ならないいちばん上の段。
 * rowEnds は段ごとの、最後に置いた文字の右端（呼ぶたびに更新する）
 */
export function labelRowFor(rowEnds, center, text) {
  const half = (text.length * LABEL_CHAR_WIDTH) / 2;
  let row = rowEnds.findIndex((end) => end + LABEL_GAP <= center - half);
  if (row === -1) row = rowEnds.length;
  rowEnds[row] = center + half;
  return row;
}

/** 層の名前：材料を選んでいれば材料名、なければ種類。厚さを付ける */
export function layerName(row) {
  const material = findMaterial(row.materialId);
  const base = material ? material.name : (LAYER_KINDS[row.kind]?.label ?? "（種類なし）");
  const thickness = String(row.texts?.thickness ?? "").trim();
  return thickness && !material?.name.includes(`${thickness}mm`)
    ? `${base}（厚さ ${thickness} mm）`
    : base;
}

/** 断面図と、右側の層の一覧（1から順）を描き直す */
export function drawLayers(container, rows) {
  const list = create(
    "ol",
    { class: "layer-names" },
    rows.map((row) => create("li", { text: layerName(row) })),
  );
  const svg = element("svg", {
    class: "layer-drawing",
    role: "img",
    "aria-label": "積層の断面図（左が室内側）",
  });
  svg.append(patterns());
  svg.append(
    element("text", { x: 0, y: 14, class: "tick" }, "室内側"),
    element("text", { x: WIDTH, y: 14, class: "tick", "text-anchor": "end" }, "室外側"),
  );
  const widths = layerWidths(rows.map(thicknessOf));
  let cursor = WALL_LEFT;
  const rowEnds = [];
  rows.forEach((row, index) => {
    const look = appearanceOf(row);
    const width = widths[index];
    const box = { x: cursor, y: TOP, width, height: STRIP_HEIGHT };
    const title = element(
      "title",
      {},
      `${index + 1}層目：${look.label} ${row.texts?.thickness ?? ""} mm`,
    );
    const base = element("rect", { ...box, fill: look.fill, class: "layer-box" });
    base.append(title);
    svg.append(base);
    if (look.hatch !== "none") {
      svg.append(
        element("rect", { ...box, fill: `url(#hatch-${look.hatch})`, "pointer-events": "none" }),
      );
    }
    svg.append(element("rect", { ...box, fill: "none", class: "layer-outline" }));
    // 番号は全部の層に付ける（重ならない段に置く。細い層が続くと段が増える）
    const center = cursor + width / 2;
    const labelRow = labelRowFor(rowEnds, center, String(index + 1));
    svg.append(
      element(
        "text",
        {
          x: center,
          y: TOP + STRIP_HEIGHT + LABEL_ROW_GAP * (labelRow + 1),
          class: "tick",
          "text-anchor": "middle",
        },
        String(index + 1),
      ),
    );
    cursor += width;
  });
  // 番号の段の数に合わせて図の高さを決める
  const height =
    TOP + STRIP_HEIGHT + LABEL_ROW_GAP * Math.max(rowEnds.length, 1) + LABEL_BOTTOM_MARGIN;
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${height}`);
  container.replaceChildren(create("div", { class: "layer-figure" }, [svg, list]));
}
