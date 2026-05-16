// scene.js — procedural showcase scene used across the deck.
// One reusable "diorama" that looks different from every angle, so it
// works as a believable novel-view-synthesis subject.

import * as THREE from 'three';

/** Build a small, colorful diorama: ground + cottage + tree + rocks + flag. */
export function buildDiorama() {
  const group = new THREE.Group();

  // ---------- ground disk ----------
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.6, 0.25, 64),
    new THREE.MeshStandardMaterial({ color: 0x9bd17a, roughness: 0.95 })
  );
  ground.position.y = -0.125;
  ground.receiveShadow = true;
  group.add(ground);

  // tiny dirt path
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xc9a875, roughness: 1 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0.4, 0.005, 1.0);
  path.rotation.z = -0.35;
  group.add(path);

  // ---------- cottage ----------
  const cottage = new THREE.Group();
  cottage.position.set(-0.6, 0, -0.2);

  // walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xf2e3c6, roughness: 0.85 })
  );
  walls.position.y = 0.55;
  walls.castShadow = true; walls.receiveShadow = true;
  cottage.add(walls);

  // roof (prism via cone with 4 sides)
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.35, 0.9, 4),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 })
  );
  roof.position.y = 1.55;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  cottage.add(roof);

  // door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.55, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 })
  );
  door.position.set(0, 0.28, 0.71);
  cottage.add(door);

  // windows
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x67c2ff,
        roughness: 0.2,
        metalness: 0.3,
        emissive: 0x143a55,
        emissiveIntensity: 0.4,
      })
    );
    win.position.set(side * 0.45, 0.7, 0.71);
    cottage.add(win);
  }
  // back window
  const winB = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x67c2ff, roughness: 0.2, metalness: 0.3,
      emissive: 0x143a55, emissiveIntensity: 0.4
    })
  );
  winB.position.set(0, 0.7, -0.71);
  cottage.add(winB);

  // chimney
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.55, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x8a6f5a, roughness: 0.9 })
  );
  chimney.position.set(-0.5, 1.5, -0.3);
  cottage.add(chimney);

  group.add(cottage);

  // ---------- tree ----------
  const tree = new THREE.Group();
  tree.position.set(1.4, 0, 0.4);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 })
  );
  trunk.position.y = 0.45;
  trunk.castShadow = true;
  tree.add(trunk);

  // 3-stacked leaves
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.7, flatShading: true });
  const leaves = [
    [0.6, 0.95],
    [0.5, 1.3],
    [0.38, 1.6],
  ];
  for (const [r, y] of leaves) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, 0.55, 7), leafMat);
    m.position.y = y;
    m.castShadow = true;
    tree.add(m);
  }
  group.add(tree);

  // ---------- rocks ----------
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 1, flatShading: true });
  const rockData = [
    [1.3, 0.18, -1.1, 0.32, 0.3],
    [-1.7, 0.14, 0.8, 0.26, 1.1],
    [-1.4, 0.12, 1.5, 0.18, 0.7],
    [0.9, 0.13, 1.8, 0.22, 2.0],
    [-2.0, 0.18, -0.8, 0.3, 0.5],
  ];
  for (const [x, y, z, s, rot] of rockData) {
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
    r.position.set(x, y, z);
    r.rotation.y = rot;
    r.castShadow = true; r.receiveShadow = true;
    group.add(r);
  }

  // ---------- flag pole ----------
  const flagPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 })
  );
  flagPole.position.set(0.5, 0.7, -1.6);
  flagPole.castShadow = true;
  group.add(flagPole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xff5a36, roughness: 0.7, side: THREE.DoubleSide })
  );
  flag.position.set(0.73, 1.25, -1.6);
  group.add(flag);

  // ---------- bushes ----------
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x5cb85c, roughness: 0.9, flatShading: true });
  for (const pos of [[-1.2, 0, -1.4], [1.9, 0, -0.8], [-0.4, 0, 1.8]]) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), bushMat);
    bush.position.set(pos[0], 0.2, pos[2]);
    bush.castShadow = true;
    group.add(bush);
  }

  // ---------- birds / little spheres in the air ----------
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (let i = 0; i < 3; i++) {
    const bird = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), birdMat);
    bird.position.set(-0.8 + i * 0.5, 2.4 + 0.1 * i, -0.3 + i * 0.2);
    bird.userData.isBird = true;
    group.add(bird);
  }

  return group;
}

/** Wrap a Three.js scene with consistent lighting + camera + renderer. */
export function makeStudio(container, opts = {}) {
  const {
    background = 0xffffff,
    fov = 38,
    shadows = true,
    transparent = false,
  } = opts;

  const scene = new THREE.Scene();
  if (!transparent) scene.background = new THREE.Color(background);

  // lighting — bright key + warm fill + cool rim
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8d8e8, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff3e0, 1.05);
  key.position.set(4, 6, 4);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0005;
  }
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb0d0ff, 0.35);
  fill.position.set(-5, 3, -3);
  scene.add(fill);

  // camera
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(4, 3.2, 4);
  camera.lookAt(0, 0.8, 0);

  // renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: transparent,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (transparent) renderer.setClearColor(0x000000, 0);

  container.appendChild(renderer.domElement);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  return { scene, camera, renderer, resize };
}

/** Position camera at angle (theta in radians, around Y) at given radius/height,
 *  looking at the diorama center. */
export function placeCamera(camera, theta, radius = 5.5, height = 2.4, target = [0, 0.8, 0]) {
  camera.position.set(
    Math.cos(theta) * radius,
    height,
    Math.sin(theta) * radius
  );
  camera.lookAt(target[0], target[1], target[2]);
}

/* =========================================================
   Shared offscreen renderer
   -----------------------------------------------------------
   Browsers cap WebGL contexts (~16). Slides with many small
   "tile" views share a single offscreen WebGL renderer and
   draw its output to plain 2D-context canvases via drawImage.
   ========================================================= */

let _shared = null;
function getShared() {
  if (_shared) return _shared;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, preserveDrawingBuffer: true, alpha: true,
  });
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  _shared = { canvas, renderer };
  return _shared;
}

/** Render `scene` from `camera` and copy the result to `target` (a 2D canvas).
 *  target.getContext('2d') is used — after this call target is a 2D canvas
 *  forever. `quality` (default 1) shrinks the offscreen render size to
 *  produce a blurry/low-fi look when upscaled. */
export function renderTile(target, scene, camera, quality = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (target.clientWidth | 0) || 1;
  const h = (target.clientHeight | 0) || 1;
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  const rw = Math.max(1, Math.round(bw * quality));
  const rh = Math.max(1, Math.round(bh * quality));

  if (target.width !== bw) target.width = bw;
  if (target.height !== bh) target.height = bh;

  const { canvas: off, renderer } = getShared();
  if (off.width !== rw || off.height !== rh) {
    off.width = rw; off.height = rh;
  }
  renderer.setSize(rw, rh, false);
  if (camera.isPerspectiveCamera) {
    const a = w / h;
    if (camera.aspect !== a) { camera.aspect = a; camera.updateProjectionMatrix(); }
  }
  renderer.render(scene, camera);

  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = quality >= 1;
  ctx.clearRect(0, 0, bw, bh);
  ctx.drawImage(off, 0, 0, bw, bh);
}
