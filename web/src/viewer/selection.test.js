// ドラッグの動かせる軸と、刻みでの丸め
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { dragPlane, snappedDelta } from "./selection.js";

const camera = new THREE.PerspectiveCamera();
camera.position.set(-3, -4, 3);
camera.up.set(0, 0, 1);
camera.lookAt(0, 0, 0);
const box = {
  type: "feature",
  item: { position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
};
const door = {
  type: "opening",
  item: { axis: "y", coordinate: 0, min: { x: 0.5, z: 0 }, max: { x: 1.3, z: 2 } },
};

describe("dragPlane", () => {
  it("形は床と平行に x・y、Shift で z だけ", () => {
    const hit = new THREE.Vector3(0.5, 0.5, 1);
    expect(dragPlane(box, hit, camera, false).axes).toEqual(["x", "y"]);
    expect(dragPlane(box, hit, camera, false).plane.distanceToPoint(hit)).toBeCloseTo(0, 12);
    expect(dragPlane(box, hit, camera, true).axes).toEqual(["z"]);
  });

  it("開口部は貼ってある面の中（y 面なら x・z）", () => {
    const result = dragPlane(door, new THREE.Vector3(1, 0, 1), camera, false);
    expect(result.axes).toEqual(["x", "z"]);
    expect(result.plane.normal.y).toBe(1);
  });
});

describe("snappedDelta", () => {
  it("動ける軸だけ、刻み（10 mm）で丸める", () => {
    const delta = snappedDelta(
      { x: 0, y: 0, z: 0 },
      { x: 0.1234, y: -0.0456, z: 0.5 },
      ["x", "y"],
      0.01,
    );
    expect(delta.x).toBeCloseTo(0.12, 12);
    expect(delta.y).toBeCloseTo(-0.05, 12);
    expect(delta.z).toBe(0);
  });
});
