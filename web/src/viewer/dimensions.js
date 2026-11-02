// 立体の全体寸法（幅・奥行き・高さ）を、CAD の3D図面の書き方で描くための線と文字の位置。
// 寸法補助線（形の角から外へ引き出す線）、寸法線（補助線の間の、測る辺と平行な線。両端に矢印）、
// 寸法数値（寸法線の中央、単位 mm は書かない）。座標はモデルと同じ m、z が上。画面に触れない純粋な関数。

const MM_PER_M = 1000;
// 寸法線を形から離す距離・補助線を寸法線より少し先まで伸ばす長さ・矢印の長さ（形の大きさに対する割合）
const OFFSET_RATIO = 0.12;
const OVERSHOOT_RATIO = 0.03;
const ARROW_RATIO = 0.035;
// 矢印の開き（矢印の長さに対する、羽根の横幅の割合）
const ARROW_WIDTH_RATIO = 0.35;

const add = (first, second) => ({
  x: first.x + second.x,
  y: first.y + second.y,
  z: first.z + second.z,
});
const scale = (vector, factor) => ({
  x: vector.x * factor,
  y: vector.y * factor,
  z: vector.z * factor,
});
const sub = (first, second) => add(first, scale(second, -1));

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

/** 矢印の2本の羽根（tip から back の向きへ、side の向きに開く） */
function arrowHead(tip, direction, side, size) {
  const back = add(tip, scale(direction, -size));
  const wing = scale(side, size * ARROW_WIDTH_RATIO);
  return [
    [tip, add(back, wing)],
    [tip, sub(back, wing)],
  ];
}

/**
 * 1つの寸法：start・end は測る辺の両端、away は寸法線を出す向き（単位ベクトル）、side は矢印を開く向き。
 * 戻り値 { lines: [[点, 点], …], label: { position, text } }
 */
export function linearDimension(start, end, away, side, size) {
  const offset = scale(away, size * OFFSET_RATIO);
  const overshoot = scale(away, size * (OFFSET_RATIO + OVERSHOOT_RATIO));
  const lineStart = add(start, offset);
  const lineEnd = add(end, offset);
  const span = sub(lineEnd, lineStart);
  const direction = scale(span, 1 / length(span));
  const arrow = size * ARROW_RATIO;
  return {
    lines: [
      [start, add(start, overshoot)],
      [end, add(end, overshoot)],
      [lineStart, lineEnd],
      ...arrowHead(lineStart, scale(direction, -1), side, arrow),
      ...arrowHead(lineEnd, direction, side, arrow),
    ],
    label: {
      position: scale(add(lineStart, lineEnd), 1 / 2),
      text: String(Math.round(length(sub(end, start)) * MM_PER_M)),
    },
  };
}

/**
 * 外形（bounds）の幅 x・奥行き y・高さ z の3つの寸法。
 * x は手前下の辺の手前側、y は左下の辺の左側、z は左奥の縦の辺の左側に出す（原点の座標軸と重ならないように）
 */
export function overallDimensions(bounds) {
  const { min, max } = bounds;
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const minus = (axis) => ({ x: 0, y: 0, z: 0, [axis]: -1 });
  return [
    linearDimension(min, { ...min, x: max.x }, minus("y"), { x: 0, y: 0, z: 1 }, size),
    linearDimension(min, { ...min, y: max.y }, minus("x"), { x: 0, y: 0, z: 1 }, size),
    linearDimension(
      { ...min, y: max.y },
      { ...min, y: max.y, z: max.z },
      minus("x"),
      { x: 0, y: 1, z: 0 },
      size,
    ),
  ];
}
