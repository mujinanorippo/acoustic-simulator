// 矢印キーで選んだ形・開口部を動かすときの、キーと動かす向きの対応（画面に触れない純粋な関数）。
// 形：← → が x、↑ ↓ が y、Ctrl+↑ ↓ か PageUp・PageDown が z（上下）。
// 開口部：貼ってある面の中で、← → が1つ目の軸、↑ ↓ が2つ目の軸（壁なら z）。Ctrl は関係しない。
// Shift を押すと設定の移動量の10倍。
import { PLANE_AXES } from "../core-model/model.js";

const SHIFT_FACTOR = 10;

const FEATURE_KEYS = {
  ArrowRight: ["x", 1],
  ArrowLeft: ["x", -1],
  ArrowUp: ["y", 1],
  ArrowDown: ["y", -1],
  PageUp: ["z", 1],
  PageDown: ["z", -1],
};
// Ctrl を押しながらの ↑ ↓ は上下（z）
const FEATURE_CTRL_KEYS = {
  ArrowUp: ["z", 1],
  ArrowDown: ["z", -1],
};

/** キーの押し方から、動かす量 {x, y, z} [m] を返す。動かさないキーは null */
export function moveForKey(event, selection, stepM) {
  let axis;
  let sign;
  if (selection.type === "opening") {
    const [first, second] = PLANE_AXES[selection.item.axis];
    const keys = {
      ArrowRight: [first, 1],
      ArrowLeft: [first, -1],
      ArrowUp: [second, 1],
      ArrowDown: [second, -1],
    };
    [axis, sign] = keys[event.key] ?? [];
  } else {
    const ctrlMove = event.ctrlKey ? FEATURE_CTRL_KEYS[event.key] : undefined;
    [axis, sign] = ctrlMove ?? FEATURE_KEYS[event.key] ?? [];
  }
  if (!axis) return null;
  const factor = event.shiftKey ? SHIFT_FACTOR : 1;
  const delta = { x: 0, y: 0, z: 0 };
  delta[axis] = sign * stepM * factor;
  return delta;
}

/** 選んだものを動かした新しいデータ（形は位置、開口部は面の中の範囲） */
export function movedItem(selection, delta) {
  const item = structuredClone(selection.item);
  if (selection.type === "opening") {
    for (const axis of PLANE_AXES[item.axis]) {
      item.min[axis] += delta[axis];
      item.max[axis] += delta[axis];
    }
    return item;
  }
  for (const axis of ["x", "y", "z"]) item.position[axis] += delta[axis];
  return item;
}
