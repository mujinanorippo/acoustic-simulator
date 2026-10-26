// 開口部（面の上の四角いサーフェス）の四隅の座標。表示とテストで使う純粋な関数。
import { PLANE_AXES } from "../core-model/model.js";

/** 四隅 [min-min, max-min, max-max, min-max] の順（面内の2軸で） */
export function openingCorners(opening) {
  const [first, second] = PLANE_AXES[opening.axis];
  const corner = (along, across) => ({
    [opening.axis]: opening.coordinate,
    [first]: along,
    [second]: across,
  });
  return [
    corner(opening.min[first], opening.min[second]),
    corner(opening.max[first], opening.min[second]),
    corner(opening.max[first], opening.max[second]),
    corner(opening.min[first], opening.max[second]),
  ];
}
