// 選んだ形・開口部の強調表示と、マウスのドラッグでの移動。
// 形は床と平行な面の上で x・y に動き、Shift を押しながらだと上下（z）に動く。開口部は貼ってある面の上で動く。
// 動かす量は snapM（設定画面の値）ごとに丸める。離したときに onDragEnd(動かした量) を呼び、
// 本当に動かすか（部屋が分かれないか）は画面側が確かめる。
import * as THREE from "three";
import { CYLINDER_SEGMENTS } from "../core-model/geometry.js";
import { PLANE_AXES } from "../core-model/model.js";
import { openingCorners } from "./opening-shape.js";

const HIGHLIGHT_COLOR = 0xff7a00;
const HIGHLIGHT_OPACITY = 0.25;
const QUARTER_TURN_RAD = Math.PI / 2;

function boxObject(item) {
  const { size, position } = item;
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(position.x + size.x / 2, position.y + size.y / 2, position.z + size.z / 2);
  return geometry;
}

function cylinderObject(item) {
  const radius = item.diameter / 2;
  const geometry = new THREE.CylinderGeometry(radius, radius, item.length, CYLINDER_SEGMENTS);
  // three.js の円柱は y 向き。モデルの向き（x・y・z）に合わせて回し、底面の中心を位置に合わせる
  geometry.translate(0, item.length / 2, 0);
  if (item.axis === "x") geometry.rotateZ(-QUARTER_TURN_RAD);
  if (item.axis === "z") geometry.rotateX(QUARTER_TURN_RAD);
  geometry.translate(item.position.x, item.position.y, item.position.z);
  return geometry;
}

function openingObject(item) {
  const points = openingCorners(item).map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** 選んだもの { type: "feature" | "opening", item } の強調表示（半透明の塗り＋輪郭） */
export function highlightObject(selection) {
  const { type, item } = selection;
  let geometry;
  if (type === "opening") geometry = openingObject(item);
  else geometry = item.size ? boxObject(item) : cylinderObject(item);
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_COLOR,
      transparent: true,
      opacity: HIGHLIGHT_OPACITY,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  fill.name = "pick";
  group.add(
    fill,
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, depthTest: false }),
    ),
  );
  group.renderOrder = 1;
  return group;
}

/** ドラッグで動かす面と、動ける軸（開口部は貼ってある面、形は床と平行か縦） */
export function dragPlane(selection, hitPoint, camera, isVertical) {
  if (selection.type === "opening") {
    const normal = new THREE.Vector3(0, 0, 0).setComponent("xyz".indexOf(selection.item.axis), 1);
    return {
      plane: new THREE.Plane(normal, -selection.item.coordinate),
      axes: PLANE_AXES[selection.item.axis],
    };
  }
  if (isVertical) {
    const facing = new THREE.Vector3();
    camera.getWorldDirection(facing);
    facing.z = 0;
    if (facing.lengthSq() === 0) facing.set(0, 1, 0);
    return {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(facing.normalize(), hitPoint),
      axes: ["z"],
    };
  }
  return {
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -hitPoint.z),
    axes: ["x", "y"],
  };
}

/** 動かした量を、動ける軸だけ snapM ごとに丸める */
export function snappedDelta(start, current, axes, snapM) {
  const delta = { x: 0, y: 0, z: 0 };
  for (const axis of axes) {
    delta[axis] = Math.round((current[axis] - start[axis]) / snapM) * snapM;
  }
  return delta;
}
