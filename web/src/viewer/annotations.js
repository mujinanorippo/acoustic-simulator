// 3D表示の注記：原点の座標軸（X 赤・Y 緑・Z 青の矢印と文字。常に表示）と、全体寸法（CAD の3D図面の書き方）。
// 文字は CSS2DRenderer で画面の文字として重ねる（回してもいつも正面を向いて読める）。
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { overallDimensions } from "./dimensions.js";

const AXIS_COLORS = { x: 0xd03030, y: 0x2e9e3e, z: 0x2f5fd0 };
const AXIS_DIRECTIONS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
// 座標軸の矢印の長さ（部屋の大きさに対する割合）、矢じりの長さ・太さ（矢印の長さに対する割合）
const AXIS_LENGTH_RATIO = 0.22;
const AXIS_HEAD_RATIO = 0.18;
const AXIS_HEAD_WIDTH_RATIO = 0.09;
const AXIS_LABEL_GAP_RATIO = 1.12;
const DIMENSION_COLOR = 0x111111;

function label(text, className, position) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  const object = new CSS2DObject(element);
  object.position.copy(position);
  return object;
}

/** 原点の座標軸。size は部屋のいちばん長い辺 [m] */
export function originAxes(size) {
  const group = new THREE.Group();
  const length = size * AXIS_LENGTH_RATIO;
  for (const [axis, direction] of Object.entries(AXIS_DIRECTIONS)) {
    group.add(
      new THREE.ArrowHelper(
        direction,
        new THREE.Vector3(0, 0, 0),
        length,
        AXIS_COLORS[axis],
        length * AXIS_HEAD_RATIO,
        length * AXIS_HEAD_WIDTH_RATIO,
      ),
      label(
        axis.toUpperCase(),
        `axis-label axis-${axis}`,
        direction.clone().multiplyScalar(length * AXIS_LABEL_GAP_RATIO),
      ),
    );
  }
  return group;
}

/** 全体寸法の線と数値 */
export function dimensionAnnotations(bounds) {
  const group = new THREE.Group();
  for (const dimension of overallDimensions(bounds)) {
    const points = dimension.lines.flatMap(([start, end]) => [
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ]);
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: DIMENSION_COLOR }),
      ),
      label(
        dimension.label.text,
        "dimension-label",
        new THREE.Vector3(
          dimension.label.position.x,
          dimension.label.position.y,
          dimension.label.position.z,
        ),
      ),
    );
  }
  return group;
}
