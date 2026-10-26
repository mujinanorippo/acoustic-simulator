// 周波数特性の折れ線グラフ（横軸は対数の周波数）。外部ライブラリを使わず SVG で描く。
const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { left: 48, right: 12, top: 28, bottom: 32 };
const X_TICKS_HZ = [63, 125, 250, 500, 1000, 2000, 4000];
const NICE_STEPS = [5, 10, 20, 25, 50];
const MAX_Y_TICKS = 6;

function element(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function scales(xRange, yRange) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const logMin = Math.log10(xRange[0]);
  const logSpan = Math.log10(xRange[1]) - logMin;
  return {
    toX: (hz) => MARGIN.left + ((Math.log10(hz) - logMin) / logSpan) * plotWidth,
    toY: (value) =>
      MARGIN.top + plotHeight - ((value - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight,
  };
}

function niceRange(values) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const step =
    NICE_STEPS.find((candidate) => (high - low) / candidate <= MAX_Y_TICKS) ?? NICE_STEPS.at(-1);
  const start = Math.floor(low / step) * step;
  const end = Math.max(Math.ceil(high / step) * step, start + step);
  return { range: [start, end], step };
}

function drawAxes(svg, scale, xRange, { range: yRange, step: yStep }, yLabel) {
  const bottom = HEIGHT - MARGIN.bottom;
  for (const hz of X_TICKS_HZ.filter((tick) => tick >= xRange[0] && tick <= xRange[1])) {
    const tickX = scale.toX(hz);
    svg.append(
      element("line", { x1: tickX, x2: tickX, y1: MARGIN.top, y2: bottom, class: "grid" }),
    );
    svg.append(
      element(
        "text",
        { x: tickX, y: bottom + 16, class: "tick", "text-anchor": "middle" },
        String(hz),
      ),
    );
  }
  for (let value = yRange[0]; value <= yRange[1] + 1e-9; value += yStep) {
    const tickY = scale.toY(value);
    svg.append(
      element("line", {
        x1: MARGIN.left,
        x2: WIDTH - MARGIN.right,
        y1: tickY,
        y2: tickY,
        class: "grid",
      }),
    );
    svg.append(
      element(
        "text",
        { x: MARGIN.left - 6, y: tickY + 4, class: "tick", "text-anchor": "end" },
        value.toFixed(0),
      ),
    );
  }
  svg.append(element("text", { x: 4, y: 14, class: "axis-label" }, yLabel));
  svg.append(
    element(
      "text",
      { x: WIDTH - MARGIN.right, y: HEIGHT - 2, class: "axis-label", "text-anchor": "end" },
      "周波数 [Hz]",
    ),
  );
}

function drawLegend(svg, series) {
  const LEGEND_WIDTH = 110;
  series.forEach((item, index) => {
    const left = WIDTH - MARGIN.right - LEGEND_WIDTH * (series.length - index);
    const baseline = 14;
    svg.append(
      element("line", {
        x1: left,
        x2: left + 20,
        y1: baseline - 4,
        y2: baseline - 4,
        class: `series ${item.className ?? ""}`,
      }),
    );
    svg.append(element("text", { x: left + 24, y: baseline, class: "axis-label" }, item.label));
  });
}

/** series: [{ label, className, points: [{ hz, value }] }] */
export function renderChart(container, series, { yLabel }) {
  const allPoints = series.flatMap((item) => item.points);
  const xRange = [
    Math.min(...allPoints.map((point) => point.hz)),
    Math.max(...allPoints.map((point) => point.hz)),
  ];
  const yAxis = niceRange(allPoints.map((point) => point.value));
  const svg = element("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: "chart", role: "img" });
  const scale = scales(xRange, yAxis.range);
  drawAxes(svg, scale, xRange, yAxis, yLabel);
  drawLegend(svg, series);
  for (const item of series) {
    const path = item.points.map(
      (point, i) => `${i === 0 ? "M" : "L"}${scale.toX(point.hz)},${scale.toY(point.value)}`,
    );
    svg.append(element("path", { d: path.join(" "), class: `series ${item.className ?? ""}` }));
  }
  container.replaceChildren(svg);
}
