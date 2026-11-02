// 矢印キーでの移動の向きと量
import { describe, expect, it } from "vitest";
import { movedItem, moveForKey } from "./move-keys.js";

const box = {
  type: "feature",
  item: { position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
};
const door = {
  type: "opening",
  item: { axis: "y", coordinate: 0, min: { x: 0.5, z: 0 }, max: { x: 1.3, z: 2 } },
};

describe("moveForKey", () => {
  it("形：→ は +x、↓ は −y、PageUp は +z。Shift で10倍", () => {
    expect(moveForKey({ key: "ArrowRight" }, box, 0.001)).toEqual({ x: 0.001, y: 0, z: 0 });
    expect(moveForKey({ key: "ArrowDown", shiftKey: true }, box, 0.001).y).toBeCloseTo(-0.01, 12);
    expect(moveForKey({ key: "PageUp" }, box, 0.001)).toEqual({ x: 0, y: 0, z: 0.001 });
  });

  it("形：Ctrl+↑ は +z、Ctrl+↓ は −z、Ctrl+Shift+↑ は z を10倍。Ctrl+→ は x のまま", () => {
    expect(moveForKey({ key: "ArrowUp", ctrlKey: true }, box, 0.001)).toEqual({
      x: 0,
      y: 0,
      z: 0.001,
    });
    expect(moveForKey({ key: "ArrowDown", ctrlKey: true }, box, 0.001)).toEqual({
      x: 0,
      y: 0,
      z: -0.001,
    });
    const shifted = moveForKey({ key: "ArrowUp", ctrlKey: true, shiftKey: true }, box, 0.001);
    expect(shifted.z).toBeCloseTo(0.01, 12);
    expect(moveForKey({ key: "ArrowRight", ctrlKey: true }, box, 0.001)).toEqual({
      x: 0.001,
      y: 0,
      z: 0,
    });
  });

  it("y 面のドア：→ は x、↑ は z。関係ないキーは null", () => {
    expect(moveForKey({ key: "ArrowRight" }, door, 0.01)).toEqual({ x: 0.01, y: 0, z: 0 });
    expect(moveForKey({ key: "ArrowUp" }, door, 0.01)).toEqual({ x: 0, y: 0, z: 0.01 });
    expect(moveForKey({ key: "ArrowUp", ctrlKey: true }, door, 0.01)).toEqual({
      x: 0,
      y: 0,
      z: 0.01,
    });
    expect(moveForKey({ key: "PageUp" }, door, 0.01)).toBeNull();
    expect(moveForKey({ key: "a" }, box, 0.01)).toBeNull();
  });
});

describe("movedItem", () => {
  it("形は位置、開口部は範囲が動き、元のデータは変えない", () => {
    expect(movedItem(box, { x: 0.1, y: 0, z: 0 }).position.x).toBeCloseTo(0.1, 12);
    const moved = movedItem(door, { x: 0.2, y: 0, z: 0.1 });
    expect(moved.min).toEqual({ x: 0.7, z: 0.1 });
    expect(moved.coordinate).toBe(0);
    expect(door.item.min.x).toBe(0.5);
  });
});
