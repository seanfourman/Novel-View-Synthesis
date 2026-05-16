// slides.js — per-slide initializers. Each is lazy: called when slide first
// becomes visible. Each returns an object with a `tick(visible)` method we
// call every frame, plus optional `enter()` / `exit()` hooks.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildDiorama, makeStudio, placeCamera, renderTile } from './scene.js';

/* =========================================================
   Slide 1: Title — animated wireframe background
   ========================================================= */
export function initTitleBg() {
  const canvas = document.getElementById('title-bg');
  const slide = canvas.closest('.slide');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const r2 = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r2.setClearColor(0xffffff, 0);

  // create floating wireframe geometric shapes
  const shapes = [];
  const mat = new THREE.LineBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.18 });
  const mat2 = new THREE.LineBasicMaterial({ color: 0x6c5ce7, transparent: true, opacity: 0.15 });

  const geos = [
    new THREE.IcosahedronGeometry(0.8, 0),
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.TetrahedronGeometry(0.8, 0),
    new THREE.TorusKnotGeometry(0.5, 0.16, 64, 8),
  ];
  for (let i = 0; i < 10; i++) {
    const g = geos[i % geos.length];
    const edges = new THREE.EdgesGeometry(g);
    const line = new THREE.LineSegments(edges, i % 2 ? mat2 : mat);
    const r = 5 + Math.random() * 3;
    const t = Math.random() * Math.PI * 2;
    line.position.set(Math.cos(t) * r, (Math.random() - 0.5) * 4, Math.sin(t) * r - 3);
    line.userData = {
      vx: (Math.random() - 0.5) * 0.003,
      vy: (Math.random() - 0.5) * 0.003,
      vz: (Math.random() - 0.5) * 0.003,
      sp: 0.002 + Math.random() * 0.004,
    };
    scene.add(line);
    shapes.push(line);
  }

  camera.position.set(0, 0, 8);

  const resize2 = () => {
    const w = slide.clientWidth, h = slide.clientHeight;
    r2.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize2();
  new ResizeObserver(resize2).observe(slide);

  return {
    tick() {
      for (const s of shapes) {
        s.rotation.x += s.userData.sp;
        s.rotation.y += s.userData.sp * 1.4;
      }
      r2.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 2: Question — single render of diorama in a card (shared renderer)
   ========================================================= */
export function initQuestion() {
  const canvas = document.getElementById('q-canvas');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d8e8, 0.6));
  const k = new THREE.DirectionalLight(0xfff3e0, 1.0); k.position.set(4, 6, 4); scene.add(k);
  scene.add(buildDiorama());

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  placeCamera(camera, Math.PI * 0.35, 6.5, 2.6);

  let t0 = 0;
  return {
    tick(visible) {
      if (!visible) return;
      t0 += 0.002;
      placeCamera(camera, Math.PI * 0.35 + Math.sin(t0) * 0.08, 6.5, 2.6);
      renderTile(canvas, scene, camera);
    },
  };
}

/* =========================================================
   Slide 3: Live demo — 1 input + 6 outputs of the same scene
   Uses the shared offscreen renderer so all 7 tiles share one WebGL ctx.
   ========================================================= */
export function initMultiView() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f6f6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d8e8, 0.6));
  const k = new THREE.DirectionalLight(0xfff3e0, 1.0); k.position.set(4, 6, 4); scene.add(k);
  const f = new THREE.DirectionalLight(0xb0d0ff, 0.35); f.position.set(-5, 3, -3); scene.add(f);
  scene.add(buildDiorama());

  const inputCanvas = document.getElementById('demo-input');
  const inputCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  placeCamera(inputCam, Math.PI * 0.25, 6.5, 2.5);

  const outCanvases = Array.from(document.querySelectorAll('.out-card canvas'));
  const outCams = outCanvases.map((_, i) => {
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const theta = Math.PI * 0.25 + (i + 1) * (Math.PI * 2 / 7);
    placeCamera(cam, theta, 6.5, 2.5 + Math.sin(i) * 0.4);
    return cam;
  });

  let revealedCount = 0;
  let revealTimer = null;
  function startReveal() {
    revealedCount = 0;
    const cards = document.querySelectorAll('.out-card');
    cards.forEach(c => c.classList.remove('in'));
    if (revealTimer) clearInterval(revealTimer);
    revealTimer = setInterval(() => {
      if (revealedCount >= cards.length) { clearInterval(revealTimer); return; }
      cards[revealedCount].classList.add('in');
      revealedCount++;
    }, 280);
  }

  let t = 0;
  return {
    enter() { startReveal(); },
    tick(visible) {
      if (!visible) return;
      t += 0.003;
      placeCamera(inputCam, Math.PI * 0.25 + Math.sin(t) * 0.05, 6.5, 2.5);
      renderTile(inputCanvas, scene, inputCam);
      for (let i = 0; i < outCams.length; i++) {
        const theta = Math.PI * 0.25 + (i + 1) * (Math.PI * 2 / 7) + t * 0.5;
        placeCamera(outCams[i], theta, 6.5, 2.4 + Math.sin(t + i) * 0.4);
        renderTile(outCanvases[i], scene, outCams[i]);
      }
    },
  };
}

/* =========================================================
   Slide 6: Old approaches — mesh wireframe + photo-tour mockup
   ========================================================= */
export function initOldApproaches() {
  const meshCanvas = document.getElementById('mesh-canvas');
  const ptCanvas = document.getElementById('phototour-canvas');

  // wireframe diorama scene
  const meshScene = new THREE.Scene();
  meshScene.background = new THREE.Color(0xfafafa);
  meshScene.add(new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.8));
  const wireGroup = buildDiorama();
  wireGroup.traverse(o => {
    if (o.isMesh) {
      o.material = new THREE.MeshBasicMaterial({
        color: 0x333333, wireframe: true, transparent: true, opacity: 0.45,
      });
    }
  });
  meshScene.add(wireGroup);
  const meshCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  meshCam.position.set(0, 1.5, 6);
  meshCam.lookAt(0, 0.6, 0);

  // photo tour scene
  const ptScene = new THREE.Scene();
  ptScene.background = new THREE.Color(0xfafafa);
  ptScene.add(new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.6));
  const ptKey = new THREE.DirectionalLight(0xffffff, 1.0); ptKey.position.set(4, 6, 4); ptScene.add(ptKey);
  ptScene.add(buildDiorama());
  const ptCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  let t = 0;
  return {
    tick(visible) {
      if (!visible) return;
      t += 0.005;
      wireGroup.rotation.y += 0.004;
      renderTile(meshCanvas, meshScene, meshCam);

      const u = (Math.sin(t) + 1) / 2;
      const theta = THREE.MathUtils.lerp(Math.PI * 0.2, Math.PI * 0.8, u);
      placeCamera(ptCam, theta, 6.5, 2.5);
      renderTile(ptCanvas, ptScene, ptCam);
    },
  };
}

/* =========================================================
   Slide 8: Interactive rotatable diorama
   ========================================================= */
export function initBunny() {
  const container = document.getElementById('bunny-stage');
  const { scene, camera, renderer } = makeStudio(container, { background: 0xfafafa });
  camera.position.set(5, 3.2, 5);

  scene.add(buildDiorama());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.8, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.7;

  // stop auto-rotate once user interacts
  let userTouched = false;
  controls.addEventListener('start', () => {
    userTouched = true;
    controls.autoRotate = false;
  });

  return {
    tick(visible) {
      if (!visible) return;
      controls.update();
      renderer.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 10: Ray demo
   Show: a virtual "image plane" of pixels in front of a camera position,
   when user hovers a pixel a ray fires into a volumetric blob and samples
   along the ray accumulate into a final color.
   ========================================================= */
export function initRayDemo() {
  const container = document.getElementById('ray-stage');
  const { scene, camera, renderer } = makeStudio(container, { background: 0xfafafa, shadows: false });
  camera.position.set(5.5, 3.5, 6.5);
  camera.lookAt(0.5, 0.5, 0);

  // ---------- world volume: a few translucent colored "blobs" representing
  // the implicit scene (densities at points). Each has a color + radius.
  const blobs = [
    { p: new THREE.Vector3(-1.0, 0.6, 0.0), r: 0.8, c: new THREE.Color('#ff5a36') },
    { p: new THREE.Vector3(0.6,  1.2, -0.3), r: 0.7, c: new THREE.Color('#6c5ce7') },
    { p: new THREE.Vector3(0.0,  0.4, 1.0),  r: 0.6, c: new THREE.Color('#00b894') },
    { p: new THREE.Vector3(1.4,  0.5, 0.6),  r: 0.5, c: new THREE.Color('#ffc23a') },
  ];
  for (const b of blobs) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(b.r, 24, 24),
      new THREE.MeshBasicMaterial({
        color: b.c, transparent: true, opacity: 0.32, depthWrite: false
      })
    );
    m.position.copy(b.p);
    scene.add(m);
  }

  // ground hint
  const grid = new THREE.GridHelper(8, 16, 0xd0d0d0, 0xeaeaea);
  grid.position.y = -0.001;
  scene.add(grid);

  // ---------- camera marker (the virtual NeRF camera)
  const camMarker = new THREE.Group();
  camMarker.position.set(-3.0, 1.4, 2.8);
  const camBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.25, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  camMarker.add(camBody);
  const camLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5, roughness: 0.3 })
  );
  camLens.rotation.x = Math.PI / 2;
  camLens.position.z = 0.3;
  camMarker.add(camLens);
  scene.add(camMarker);
  scene.add(new THREE.DirectionalLight(0xffffff, 0.6));

  // ---------- image plane: a small grid of pixels in front of camMarker
  const GRID = 7;
  const PIX = 0.16;
  const planeGroup = new THREE.Group();
  const planeOffset = new THREE.Vector3(1.2, 0, -1.0); // local in front of cam
  // we'll build the plane oriented toward the scene origin
  const camPos = camMarker.position.clone();
  const target = new THREE.Vector3(0, 0.6, 0);
  const forward = target.clone().sub(camPos).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const planeCenter = camPos.clone().add(forward.clone().multiplyScalar(1.2));

  const pixels = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u = (i - (GRID - 1) / 2) * PIX;
      const v = (j - (GRID - 1) / 2) * PIX;
      const pos = planeCenter.clone()
        .add(right.clone().multiplyScalar(u))
        .add(up.clone().multiplyScalar(v));
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(PIX * 0.9, PIX * 0.9),
        new THREE.MeshBasicMaterial({ color: 0xeeeeee, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      m.position.copy(pos);
      m.lookAt(camPos);
      m.userData = { i, j, pos: pos.clone(), color: new THREE.Color(0xeeeeee) };
      planeGroup.add(m);
      pixels.push(m);
    }
  }
  scene.add(planeGroup);

  // ---------- ray line + sample dots (single highlighted ray)
  const rayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xff5a36, linewidth: 2 })
  );
  rayLine.visible = false;
  scene.add(rayLine);

  const SAMPLES = 32;
  const sampleMeshes = [];
  for (let k = 0; k < SAMPLES; k++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff5a36 })
    );
    m.visible = false;
    scene.add(m);
    sampleMeshes.push(m);
  }

  // ---------- mouse interaction
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredPixel = null;
  let autoIdx = 0;
  let autoTimer = 0;

  function pickPixelAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(pixels, false);
    return hits.length ? hits[0].object : null;
  }

  function colorOf(p) {
    // accumulate color from blobs at point p using a soft Gaussian-ish kernel
    let r = 0, g = 0, b = 0, w = 0;
    for (const blob of blobs) {
      const d = blob.p.distanceTo(p);
      const wt = Math.exp(-(d * d) / (blob.r * blob.r));
      r += blob.c.r * wt;
      g += blob.c.g * wt;
      b += blob.c.b * wt;
      w += wt;
    }
    if (w < 0.001) return null;
    return { r: r / w, g: g / w, b: b / w, density: Math.min(w, 1) };
  }

  function fireRay(pixel) {
    if (!pixel) {
      rayLine.visible = false;
      for (const s of sampleMeshes) s.visible = false;
      document.getElementById('rd-samples').textContent = '0';
      const sw = document.getElementById('rd-color');
      sw.style.background = '#ddd';
      // reset all pixel colors back to gray
      for (const p of pixels) {
        p.material.color.set(0xeeeeee);
      }
      return;
    }
    // highlight active pixel
    for (const p of pixels) {
      p.material.color.set(p === pixel ? 0xff5a36 : 0xeeeeee);
    }

    const start = camMarker.position.clone();
    const dir = pixel.userData.pos.clone().sub(start).normalize();
    // walk from near the camera toward 7 units away
    const NEAR = 0.6;
    const FAR  = 7.0;
    const stepPositions = [];
    let acc = { r: 0, g: 0, b: 0, transmittance: 1 };
    let hitCount = 0;
    const dt = (FAR - NEAR) / SAMPLES;
    for (let k = 0; k < SAMPLES; k++) {
      const t = NEAR + dt * (k + 0.5);
      const p = start.clone().add(dir.clone().multiplyScalar(t));
      stepPositions.push(p);
      const c = colorOf(p);
      if (c) {
        // simple "alpha compositing" front-to-back
        const alpha = c.density * 0.18;
        acc.r += acc.transmittance * alpha * c.r;
        acc.g += acc.transmittance * alpha * c.g;
        acc.b += acc.transmittance * alpha * c.b;
        acc.transmittance *= (1 - alpha);
        const m = sampleMeshes[k];
        m.position.copy(p);
        m.material.color.setRGB(c.r, c.g, c.b);
        m.scale.setScalar(0.6 + c.density * 1.3);
        m.visible = true;
        hitCount++;
      } else {
        sampleMeshes[k].visible = false;
      }
    }
    // background
    acc.r += acc.transmittance * 1.0;
    acc.g += acc.transmittance * 1.0;
    acc.b += acc.transmittance * 1.0;

    // draw ray line
    const farPoint = start.clone().add(dir.clone().multiplyScalar(FAR));
    rayLine.geometry.setFromPoints([start, farPoint]);
    rayLine.visible = true;

    // update readouts
    document.getElementById('rd-samples').textContent = String(hitCount);
    const sw = document.getElementById('rd-color');
    const r255 = Math.round(THREE.MathUtils.clamp(acc.r, 0, 1) * 255);
    const g255 = Math.round(THREE.MathUtils.clamp(acc.g, 0, 1) * 255);
    const b255 = Math.round(THREE.MathUtils.clamp(acc.b, 0, 1) * 255);
    sw.style.background = `rgb(${r255},${g255},${b255})`;

    // also color the pixel itself with the resulting color (this is what NeRF does)
    pixel.material.color.setRGB(acc.r, acc.g, acc.b);
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    const p = pickPixelAt(e.clientX, e.clientY);
    hoveredPixel = p;
    fireRay(p);
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hoveredPixel = null;
    fireRay(null);
    autoTimer = 0;
  });

  return {
    enter() {
      // when slide enters, start auto-demo
      autoIdx = Math.floor(pixels.length / 2);
      hoveredPixel = pixels[autoIdx];
      fireRay(hoveredPixel);
    },
    tick(visible) {
      if (!visible) return;
      // gentle auto-cycle through pixels when user isn't hovering
      if (!hoveredPixel || hoveredPixel === pixels[autoIdx]) {
        autoTimer++;
        if (autoTimer > 90) {
          autoTimer = 0;
          // pick a pixel that points at a blob
          autoIdx = Math.floor(Math.random() * pixels.length);
          hoveredPixel = pixels[autoIdx];
          fireRay(hoveredPixel);
        }
      }
      renderer.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 11: Training — 3 mini renders + error visualization
   ========================================================= */
export function initTraining() {
  const predCanvas = document.getElementById('train-pred');
  const gtCanvas = document.getElementById('train-gt');
  const errCanvas = document.getElementById('train-err');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafafa);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.6));
  const k = new THREE.DirectionalLight(0xffffff, 1.0); k.position.set(4, 6, 4); scene.add(k);
  scene.add(buildDiorama());

  const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 100);
  placeCamera(camera, Math.PI * 0.3, 6.2, 2.5);

  // both pred and gt are 2D canvases now (drawImage targets from shared renderer)
  let quality = 0.18;   // start very blurry
  let t = 0;

  return {
    enter() { quality = 0.18; },
    tick(visible) {
      if (!visible) return;
      t += 0.01;
      quality = Math.min(quality + 0.0035, 1.0);

      placeCamera(camera, Math.PI * 0.3 + Math.sin(t * 0.4) * 0.05, 6.2, 2.5);
      // GT: full quality
      renderTile(gtCanvas, scene, camera, 1.0);
      // Pred: low-res then upscaled in CSS for blurry look
      renderTile(predCanvas, scene, camera, quality);

      // Error: difference of the two 2D canvases
      const errCtx = errCanvas.getContext('2d');
      const w = errCanvas.clientWidth * (window.devicePixelRatio || 1);
      const h = errCanvas.clientHeight * (window.devicePixelRatio || 1);
      if (errCanvas.width !== w) errCanvas.width = w;
      if (errCanvas.height !== h) errCanvas.height = h;
      errCtx.globalCompositeOperation = 'source-over';
      errCtx.fillStyle = '#ffffff';
      errCtx.fillRect(0, 0, w, h);
      errCtx.globalCompositeOperation = 'difference';
      errCtx.drawImage(gtCanvas, 0, 0, w, h);
      errCtx.drawImage(predCanvas, 0, 0, w, h);
      errCtx.globalCompositeOperation = 'source-over';
      try {
        const img = errCtx.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
          const boosted = Math.min(255, lum * 3.5);
          // colorize: more error → more orange
          img.data[i]     = Math.min(255, 255 - (255 - boosted) * 0.3);
          img.data[i + 1] = Math.max(0, 255 - boosted * 1.4);
          img.data[i + 2] = Math.max(0, 255 - boosted * 1.7);
          img.data[i + 3] = 255;
        }
        errCtx.putImageData(img, 0, 0);
      } catch (e) { /* ignore */ }
    },
  };
}

/* =========================================================
   Slide 12: Clickable viewpoints
   Main scene shows diorama with N camera widgets around it.
   Click a widget -> main camera smoothly moves to that position.
   ========================================================= */
export function initClickableViews() {
  const container = document.getElementById('view-stage');
  const { scene, camera, renderer } = makeStudio(container, { background: 0xfafafa });
  scene.add(buildDiorama());

  const NUM = 8;
  const RADIUS = 6.0;
  const HEIGHT = 2.5;
  const cameraMarkers = [];

  // make camera widget meshes
  for (let i = 0; i < NUM; i++) {
    const theta = (i / NUM) * Math.PI * 2;
    const x = Math.cos(theta) * RADIUS;
    const z = Math.sin(theta) * RADIUS;

    const group = new THREE.Group();
    group.position.set(x, HEIGHT, z);
    group.lookAt(0, 0.8, 0);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    body.userData.isCamWidget = true;
    body.userData.idx = i;
    body.userData.parentGroup = group;
    group.add(body);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.18, 16),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.2 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.35;
    group.add(lens);

    // frustum lines
    const fGeom = new THREE.BufferGeometry();
    const fLen = 0.7;
    const fW = 0.4;
    const fH = 0.3;
    const o = new THREE.Vector3(0, 0, 0.45);
    const corners = [
      new THREE.Vector3( fW,  fH, fLen + 0.45),
      new THREE.Vector3(-fW,  fH, fLen + 0.45),
      new THREE.Vector3(-fW, -fH, fLen + 0.45),
      new THREE.Vector3( fW, -fH, fLen + 0.45),
    ];
    const pts = [];
    for (const c of corners) { pts.push(o, c); }
    pts.push(corners[0], corners[1], corners[1], corners[2], corners[2], corners[3], corners[3], corners[0]);
    fGeom.setFromPoints(pts);
    const frustum = new THREE.LineSegments(
      fGeom,
      new THREE.LineBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.5 })
    );
    group.add(frustum);
    group.userData.frustum = frustum;
    group.userData.idx = i;
    group.userData.theta = theta;

    scene.add(group);
    cameraMarkers.push(group);
  }

  // hit-test layer to receive clicks for cam widgets
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let activeIdx = 2;
  setActive(activeIdx);

  function setActive(i) {
    activeIdx = i;
    for (let k = 0; k < cameraMarkers.length; k++) {
      const sel = (k === i);
      cameraMarkers[k].userData.frustum.material.opacity = sel ? 1 : 0.4;
      cameraMarkers[k].userData.frustum.material.color.setHex(sel ? 0xff5a36 : 0xb0b0b0);
    }
    // also update thumb strip
    const thumbs = document.querySelectorAll('#thumb-strip .thumb');
    thumbs.forEach(t => t.classList.remove('active'));
    if (thumbs[i]) thumbs[i].classList.add('active');
  }

  // smooth camera motion
  let camTheta = 0;
  let targetTheta = 0;
  let camRadius = 8;
  let targetRadius = 8;
  let camHeight = 3.2;
  let targetHeight = 3.2;

  function gotoView(i) {
    targetTheta = (i / NUM) * Math.PI * 2;
    targetRadius = RADIUS + 0.4;
    targetHeight = HEIGHT + 0.3;
    setActive(i);
  }

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      let obj = h.object;
      while (obj && !obj.userData.isCamWidget) obj = obj.parent;
      if (obj && obj.userData.isCamWidget) {
        return obj.userData.idx;
      }
    }
    return -1;
  }

  renderer.domElement.addEventListener('click', (e) => {
    const idx = pick(e.clientX, e.clientY);
    if (idx >= 0) gotoView(idx);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const idx = pick(e.clientX, e.clientY);
    renderer.domElement.style.cursor = (idx >= 0) ? 'pointer' : '';
  });

  // ---------- thumb strip (small renders, all via shared offscreen) ----------
  const strip = document.getElementById('thumb-strip');
  strip.innerHTML = '';
  const thumbCanvases = [];
  const thumbCams = [];
  for (let i = 0; i < NUM; i++) {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.dataset.idx = i;
    const c = document.createElement('canvas');
    d.appendChild(c);
    const n = document.createElement('div');
    n.className = 'thumb-num';
    n.textContent = String(i + 1);
    d.appendChild(n);
    strip.appendChild(d);
    d.addEventListener('click', () => gotoView(i));

    thumbCanvases.push(c);
    const cam = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 100);
    placeCamera(cam, (i / NUM) * Math.PI * 2, RADIUS + 0.4, HEIGHT + 0.3);
    thumbCams.push(cam);
  }

  // initial main camera
  camTheta = (activeIdx / NUM) * Math.PI * 2;
  targetTheta = camTheta;

  // hide widgets from thumb views by making them invisible only when rendering thumbs
  // Easier: render thumbs with widgets hidden
  function setWidgetsVisible(v) {
    for (const w of cameraMarkers) w.visible = v;
  }

  return {
    enter() {
      setActive(activeIdx);
    },
    tick(visible) {
      if (!visible) return;

      // smooth follow
      // shortest path angular interpolation
      let dTheta = targetTheta - camTheta;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;
      camTheta += dTheta * 0.08;
      camRadius += (targetRadius - camRadius) * 0.08;
      camHeight += (targetHeight - camHeight) * 0.08;
      placeCamera(camera, camTheta, camRadius, camHeight);

      // main render with widgets visible
      setWidgetsVisible(true);
      renderer.render(scene, camera);

      // thumbs (no widgets so they look like "novel views"), shared renderer
      setWidgetsVisible(false);
      for (let i = 0; i < NUM; i++) {
        renderTile(thumbCanvases[i], scene, thumbCams[i]);
      }
      setWidgetsVisible(true);
    },
  };
}

/* =========================================================
   Slide 13: Orbit scrubber
   ========================================================= */
export function initOrbitScrubber() {
  const container = document.getElementById('orbit-stage');
  const { scene, camera, renderer } = makeStudio(container, { background: 0xfafafa });
  scene.add(buildDiorama());

  const slider = document.getElementById('orbit-slider');
  let angle = 0;
  let targetAngle = 0;
  let userInteracting = false;

  slider.addEventListener('input', (e) => {
    targetAngle = (parseFloat(e.target.value) / 360) * Math.PI * 2;
    userInteracting = true;
    slider.style.setProperty('--p', e.target.value / 3.6 + '%');
  });

  return {
    enter() {
      angle = 0;
      targetAngle = 0;
      userInteracting = false;
      slider.value = 0;
      slider.style.setProperty('--p', '0%');
    },
    tick(visible) {
      if (!visible) return;
      if (!userInteracting) {
        // gentle auto-orbit when idle
        targetAngle += 0.005;
        slider.value = ((targetAngle * 180 / Math.PI) % 360 + 360) % 360;
        slider.style.setProperty('--p', slider.value / 3.6 + '%');
      }
      angle += (targetAngle - angle) * 0.15;
      placeCamera(camera, angle, 6.5, 2.8);
      renderer.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 16: End background
   ========================================================= */
export function initEndBg() {
  const canvas = document.getElementById('end-bg');
  const slide = canvas.closest('.slide');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setClearColor(0xffffff, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // ring of orbiting tiny dioramas? too heavy. instead floating dots.
  const dotGeom = new THREE.SphereGeometry(0.08, 8, 8);
  const dots = [];
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(
      dotGeom,
      new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xff5a36 : (i % 3 === 1 ? 0x6c5ce7 : 0x00b894),
        transparent: true, opacity: 0.35,
      })
    );
    const r2 = 2 + Math.random() * 3;
    const t = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(t) * r2, (Math.random() - 0.5) * 4, Math.sin(t) * r2);
    m.userData.t = t;
    m.userData.r = r2;
    m.userData.y = m.position.y;
    m.userData.spd = (0.0005 + Math.random() * 0.001) * (Math.random() < 0.5 ? -1 : 1);
    scene.add(m);
    dots.push(m);
  }

  const resize = () => {
    const w = slide.clientWidth, h = slide.clientHeight;
    r.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(slide);

  return {
    tick(visible) {
      if (!visible) return;
      for (const d of dots) {
        d.userData.t += d.userData.spd;
        d.position.x = Math.cos(d.userData.t) * d.userData.r;
        d.position.z = Math.sin(d.userData.t) * d.userData.r;
      }
      r.render(scene, camera);
    },
  };
}
