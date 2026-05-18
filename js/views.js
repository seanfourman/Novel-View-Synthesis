// views.js - reusable depth-displaced plane scene.
//
// Given a photo + depth map, builds a tessellated plane mesh in Three.js whose
// vertices are pushed forward proportional to depth. Renderable from any
// camera angle - this is the workhorse for all photo-based visualizations on
// slides 3–6.

import * as THREE from "three";

const _shared = {
  canvas: null,
  renderer: null,
};

function ensureRenderer() {
  if (_shared.renderer) return _shared;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const r = new THREE.WebGLRenderer({
    canvas: c,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0xffffff, 1);
  _shared.canvas = c;
  _shared.renderer = r;
  return _shared;
}

const VERT = /* glsl */ `
  uniform sampler2D depthMap;
  uniform float strength;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    float d = texture2D(depthMap, uv).r;
    vDepth = d;
    vec3 p = position;
    p.z += d * strength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG_BASIC = /* glsl */ `
  uniform sampler2D image;
  uniform float bgFill;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(image, vUv).rgb;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const FRAG_SPECULAR = /* glsl */ `
  uniform sampler2D image;
  uniform vec3  lightPos;       // in normalized UV space (with .z = height)
  uniform float specStrength;
  uniform float specSize;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec3 c = texture2D(image, vUv).rgb;
    float dx = vUv.x - lightPos.x;
    float dy = vUv.y - lightPos.y;
    float r2 = dx * dx + dy * dy;
    // shinier where vDepth is high
    float spec = exp(-r2 / specSize) * specStrength * vDepth;
    c += vec3(spec);
    gl_FragColor = vec4(min(c, vec3(1.0)), 1.0);
  }
`;

const FRAG_HEATMAP = /* glsl */ `
  uniform sampler2D image;
  uniform float mixAmt;
  varying vec2 vUv;
  varying float vDepth;
  vec3 turbo(float t) {
    // Viridis-ish low-cost turbo
    vec3 a = vec3(0.13, 0.13, 0.50);
    vec3 b = vec3(0.0, 0.6, 0.9);
    vec3 c = vec3(0.0, 0.9, 0.5);
    vec3 d = vec3(0.95, 0.85, 0.1);
    vec3 e = vec3(0.9, 0.2, 0.1);
    if (t < 0.25) return mix(a, b, t/0.25);
    if (t < 0.5)  return mix(b, c, (t-0.25)/0.25);
    if (t < 0.75) return mix(c, d, (t-0.5)/0.25);
    return mix(d, e, (t-0.75)/0.25);
  }
  void main() {
    vec3 c = texture2D(image, vUv).rgb;
    vec3 heat = turbo(vDepth);
    gl_FragColor = vec4(mix(c, heat, mixAmt), 1.0);
  }
`;

const FRAG_FLAT = /* glsl */ `
  uniform sampler2D image;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(image, vUv).rgb, 1.0);
  }
`;

/** Build a Three.js scene from a photo + depth pair.
 *
 *  options.shader: 'basic' | 'specular' | 'heatmap'
 *  options.strength: depth displacement scale (default 0.42)
 *  options.flat: if true, no depth displacement (used for "without depth" demo)
 *  options.tess: tessellation along the longer axis (default 180)
 *  options.bgColor: scene background (default white)
 */
export function buildDepthScene(imageCanvas, depthCanvas, options = {}) {
  const {
    shader = "basic",
    strength = 0.42,
    flat = false,
    tess = 180,
    bgColor = 0xffffff,
  } = options;

  const aspect = imageCanvas.width / imageCanvas.height;
  const W = 2,
    H = 2 / aspect;
  const segX = aspect >= 1 ? tess : Math.max(40, Math.round(tess * aspect));
  const segY = aspect >= 1 ? Math.max(40, Math.round(tess / aspect)) : tess;

  const geom = new THREE.PlaneGeometry(W, H, segX, segY);

  const imageTex = new THREE.CanvasTexture(imageCanvas);
  imageTex.colorSpace = THREE.SRGBColorSpace;
  imageTex.minFilter = THREE.LinearFilter;
  imageTex.magFilter = THREE.LinearFilter;

  const depthTex = new THREE.CanvasTexture(depthCanvas);
  depthTex.colorSpace = THREE.NoColorSpace;
  depthTex.minFilter = THREE.LinearFilter;
  depthTex.magFilter = THREE.LinearFilter;

  const uniforms = {
    image: { value: imageTex },
    depthMap: { value: depthTex },
    strength: { value: flat ? 0.0 : strength },
    bgFill: { value: 1.0 },
  };
  let frag = FRAG_BASIC;
  if (shader === "specular") {
    frag = FRAG_SPECULAR;
    uniforms.lightPos = { value: new THREE.Vector3(0.5, 0.5, 0.5) };
    uniforms.specStrength = { value: 0.85 };
    uniforms.specSize = { value: 0.04 };
  } else if (shader === "heatmap") {
    frag = FRAG_HEATMAP;
    uniforms.mixAmt = { value: 0.55 };
  } else if (shader === "flat") {
    frag = FRAG_FLAT;
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: frag,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, material);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  scene.add(mesh);

  // Edge-padding: render a slightly larger background so rotation doesn't show
  // hard edge of the plane. Use a faint colored quad behind.
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.3, H * 1.3),
    new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
  );
  bg.position.z = -0.5;
  scene.add(bg);

  return {
    scene,
    mesh,
    geom,
    material,
    uniforms,
    imageTex,
    depthTex,
    aspect,
    W,
    H,
  };
}

/** A live wireframe version of the depth-displaced mesh, baked once. */
export function buildWireframeScene(imageCanvas, depthCanvas, options = {}) {
  const { strength = 0.42, tess = 80, bgColor = 0xffffff } = options;
  const aspect = imageCanvas.width / imageCanvas.height;
  const W = 2,
    H = 2 / aspect;
  const segX = aspect >= 1 ? tess : Math.max(30, Math.round(tess * aspect));
  const segY = aspect >= 1 ? Math.max(30, Math.round(tess / aspect)) : tess;

  const geom = new THREE.PlaneGeometry(W, H, segX, segY);
  // bake depth into positions
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const dctx = depthCanvas.getContext("2d");
  const dw = depthCanvas.width,
    dh = depthCanvas.height;
  const data = dctx.getImageData(0, 0, dw, dh).data;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const x = Math.max(0, Math.min(dw - 1, Math.floor(u * (dw - 1))));
    const y = Math.max(0, Math.min(dh - 1, Math.floor((1 - v) * (dh - 1))));
    const d = data[(y * dw + x) * 4] / 255;
    pos.setZ(i, pos.getZ(i) + d * strength);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: 0x333333,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geom, mat);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  scene.add(mesh);
  return { scene, mesh, geom, material: mat, aspect, W, H };
}

/** Render a scene + camera to the target 2D canvas via the shared offscreen WebGL renderer. */
export function renderTo(targetCanvas, scene, camera) {
  const { canvas: off, renderer } = ensureRenderer();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = targetCanvas.clientWidth | 0 || 1;
  const h = targetCanvas.clientHeight | 0 || 1;
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));

  if (targetCanvas.width !== bw) targetCanvas.width = bw;
  if (targetCanvas.height !== bh) targetCanvas.height = bh;
  if (off.width !== bw || off.height !== bh) {
    off.width = bw;
    off.height = bh;
  }
  renderer.setSize(bw, bh, false);
  if (camera.isPerspectiveCamera) {
    const a = w / h;
    if (Math.abs(camera.aspect - a) > 1e-3) {
      camera.aspect = a;
      camera.updateProjectionMatrix();
    }
  }
  renderer.render(scene, camera);
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, bw, bh);
  ctx.drawImage(off, 0, 0, bw, bh);
}

/** Build a camera with sane defaults for the depth plane. */
export function makeCamera(fov = 38) {
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 100);
  cam.position.set(0, 0, 2.6);
  cam.lookAt(0, 0, 0);
  return cam;
}

/** Dispose all GPU resources for a scene returned by buildDepthScene/buildWireframeScene. */
export function disposeScene(s) {
  if (!s) return;
  s.imageTex?.dispose?.();
  s.depthTex?.dispose?.();
  s.geom?.dispose?.();
  s.material?.dispose?.();
}
