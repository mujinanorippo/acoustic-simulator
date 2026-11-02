// 部屋の立体の3D表示（three.js）。座標はモデルと同じ m、z が上（床が z = 0）。
// 背景は IronCAD のような青系のグラデーション（仕様書「画面構成」）、床に1 m 方眼、原点に座標軸。
// 回転・ズームはマウス（OrbitControls）。選んだ形・開口部はドラッグで動かせる（selection.js）。
// 原点の座標軸と全体寸法は annotations.js。TriBall の配置操作はフェーズ4。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { dimensionAnnotations, originAxes } from "./annotations.js";
import { openingCorners } from "./opening-shape.js";
import { dragPlane, highlightObject, snappedDelta } from "./selection.js";

const ROOM_COLOR = 0xd9e2ec;
const EDGE_COLOR = 0x203040;
const OPENING_COLORS = { door: 0x8a5a2b, window: 0x3fa7d6, opening: 0xe08a1e };
const ROOM_OPACITY = 0.35;
const EDGE_ANGLE_DEG = 20;
const GRID_DIVISION_M = 1;
const GRID_MARGIN_M = 2;
const CAMERA_FOV_DEG = 40;
const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 1000;
const FIT_DISTANCE_RATIO = 2.3;
const VIEW_DIRECTION = new THREE.Vector3(-1.2, -1.6, 1.1).normalize();
const LIGHT_INTENSITY = 1.6;
const AMBIENT_INTENSITY = 0.9;
const LIGHT_POSITION = new THREE.Vector3(-3, -5, 8);

function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
    object.element?.remove();
  });
  group.clear();
}

function roomMeshes(result) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(result.mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(result.mesh.indices, 1));
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: ROOM_COLOR,
      transparent: true,
      opacity: ROOM_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, EDGE_ANGLE_DEG),
    new THREE.LineBasicMaterial({ color: EDGE_COLOR }),
  );
  return [surface, edges];
}

function openingMesh(opening) {
  const corners = openingCorners(opening);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(corners.flatMap((point) => [point.x, point.y, point.z])),
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: OPENING_COLORS[opening.kind],
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
}

function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.append(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = "view-labels";
  container.append(labels.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR_M, CAMERA_FAR_M);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
  const light = new THREE.DirectionalLight(0xffffff, LIGHT_INTENSITY);
  light.position.copy(LIGHT_POSITION);
  scene.add(light);
  const content = new THREE.Group();
  const overlay = new THREE.Group();
  scene.add(content, overlay);
  return { renderer, labels, scene, camera, controls, content, overlay };
}

function sceneContent(result, room) {
  const objects = [...roomMeshes(result)];
  for (const opening of room.openings ?? []) objects.push(openingMesh(opening));
  const span = Math.ceil(Math.max(result.bounds.max.x, result.bounds.max.y) + GRID_MARGIN_M);
  const grid = new THREE.GridHelper(span * 2, (span * 2) / GRID_DIVISION_M, 0x6f8faf, 0x9fb5cc);
  grid.rotation.x = Math.PI / 2;
  const { min, max } = result.bounds;
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  objects.push(grid, originAxes(size), dimensionAnnotations(result.bounds));
  return objects;
}

/** ドラッグ：選んだものを押したら回転を止め、面の上で動かして、離したら onDragEnd に動かした量を渡す */
function attachDrag(view, parts, options) {
  const { renderer, camera, controls } = parts;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  const pointOn = (event, plane) => {
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (!plane) return raycaster;
    return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  };
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !view.highlight) return;
    const [hit] = pointOn(event).intersectObject(view.highlight.getObjectByName("pick"));
    if (!hit) return;
    controls.enabled = false;
    const { plane, axes } = dragPlane(view.selection, hit.point, camera, event.shiftKey);
    drag = { plane, axes, start: hit.point.clone(), delta: { x: 0, y: 0, z: 0 } };
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const point = pointOn(event, drag.plane);
    if (!point) return;
    drag.delta = snappedDelta(drag.start, point, drag.axes, options.getSnapM());
    view.highlight.position.set(drag.delta.x, drag.delta.y, drag.delta.z);
    view.render();
  });
  renderer.domElement.addEventListener("pointerup", () => {
    if (!drag) return;
    const { delta } = drag;
    drag = null;
    controls.enabled = true;
    if (delta.x !== 0 || delta.y !== 0 || delta.z !== 0) options.onDragEnd(delta);
    else view.render();
  });
}

/** 部屋全体が見える位置にカメラを置く */
function fitCamera(camera, controls, bounds) {
  const center = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
  const size = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  camera.position.copy(center).addScaledVector(VIEW_DIRECTION, size * FIT_DISTANCE_RATIO);
  controls.target.copy(center);
  controls.update();
}

/**
 * 3D表示を作る。show(result, room) で表示を入れ替え、select(選んだもの) で強調表示、dispose() で片付ける。
 * options: { getSnapM()：ドラッグの刻み [m]、onDragEnd(動かした量 {x, y, z} [m]) }
 */
export function createRoomView(container, options) {
  const parts = createScene(container);
  const { renderer, labels, scene, camera, controls, content, overlay } = parts;
  const view = { highlight: null, selection: null };
  view.render = () => {
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    labels.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    view.render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  controls.addEventListener("change", view.render);
  attachDrag(view, parts, options);

  return {
    show(result, room, { refit = false } = {}) {
      disposeGroup(content);
      content.add(...sceneContent(result, room));
      if (refit) fitCamera(camera, controls, result.bounds);
      resize();
      view.render();
    },
    select(selection) {
      disposeGroup(overlay);
      view.selection = selection;
      view.highlight = selection ? highlightObject(selection) : null;
      if (view.highlight) overlay.add(view.highlight);
      view.render();
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      disposeGroup(overlay);
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
