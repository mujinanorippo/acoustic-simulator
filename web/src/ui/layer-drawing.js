// 積層の断面図：室内側（左）から順に、厚さの比率で層を並べて描く（SVG）。
// 色とハッチングは材料の種類で決める。ハッチングの形は JIS A 0150 の材料構造表示記号に
// 合わせるつもりで描いているが、規格の図はまだ確認できていない（docs/README.md の未確認事項）。
const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 640;
const TOP = 22;
const STRIP_HEIGHT = 96;
const HEIGHT = TOP + STRIP_HEIGHT + 20;
const MIN_LAYER_WIDTH = 4;
const LABEL_MIN_WIDTH = 14;
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
export function layerWidths(thicknessesMm, totalWidth = WIDTH) {
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

/** 断面図を描き直す */
export function drawLayers(container, rows) {
  const svg = element("svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
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
  let cursor = 0;
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
    if (width >= LABEL_MIN_WIDTH) {
      svg.append(
        element(
          "text",
          {
            x: cursor + width / 2,
            y: TOP + STRIP_HEIGHT + 14,
            class: "tick",
            "text-anchor": "middle",
          },
          String(index + 1),
        ),
      );
    }
    cursor += width;
  });
  container.replaceChildren(svg);
}
