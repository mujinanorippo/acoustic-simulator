// 部屋の立体の3D表示（three.js）。座標はモデルと同じ m、z が上（床が z = 0）。
// 背景は IronCAD のような青系のグラデーション（仕様書「画面構成」）、床に1 m 方眼、原点に座標軸。
// 回転・ズームはマウス（OrbitControls）。TriBall の配置操作はフェーズ4。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { openingCorners } from "./opening-shape.js";

const ROOM_COLOR = 0xd9e2ec;
const EDGE_COLOR = 0x203040;
const OPENING_COLORS = { door: 0x8a5a2b, window: 0x3fa7d6, opening: 0xe08a1e };
const ROOM_OPACITY = 0.35;
const EDGE_ANGLE_DEG = 20;
const GRID_DIVISION_M = 1;
const GRID_MARGIN_M = 2;
const AXES_LENGTH_M = 0.5;
const CAMERA_FOV_DEG = 40;
const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 1000;
const FIT_DISTANCE_RATIO = 1.8;
const VIEW_DIRECTION = new THREE.Vector3(-1.2, -1.6, 1.1).normalize();
const LIGHT_INTENSITY = 1.6;
const AMBIENT_INTENSITY = 0.9;
const LIGHT_POSITION = new THREE.Vector3(-3, -5, 8);

function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
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
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR_M, CAMERA_FAR_M);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
  const light = new THREE.DirectionalLight(0xffffff, LIGHT_INTENSITY);
  light.position.copy(LIGHT_POSITION);
  scene.add(light);
  const content = new THREE.Group();
  scene.add(content, new THREE.AxesHelper(AXES_LENGTH_M));
  return { renderer, scene, camera, controls, content };
}

/** 3D表示を作る。戻り値の show(result, room) で表示を入れ替え、dispose() で片付ける */
export function createRoomView(container) {
  const { renderer, scene, camera, controls, content } = createScene(container);

  const render = () => renderer.render(scene, camera);
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  controls.addEventListener("change", render);

  function fit(bounds) {
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

  return {
    show(result, room, { refit = false } = {}) {
      disposeGroup(content);
      content.add(...roomMeshes(result));
      for (const opening of room.openings ?? []) content.add(openingMesh(opening));
      const span = Math.ceil(Math.max(result.bounds.max.x, result.bounds.max.y) + GRID_MARGIN_M);
      const grid = new THREE.GridHelper(span * 2, (span * 2) / GRID_DIVISION_M, 0x6f8faf, 0x9fb5cc);
      grid.rotation.x = Math.PI / 2;
      content.add(grid);
      if (refit) fit(result.bounds);
      resize();
      render();
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
