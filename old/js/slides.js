// slides.js — per-slide initializers.

import * as THREE from 'three';
import { subscribe } from './userImage.js';
import { buildDepthScene, buildWireframeScene, renderTo, makeCamera, disposeScene } from './views.js';

/* =========================================================
   Slide 1: Title — wireframe background
   ========================================================= */
export function initTitleBg() {
  const canvas = document.getElementById('title-bg');
  const slide = canvas.closest('.slide');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setClearColor(0xffffff, 0);

  const matA = new THREE.LineBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.18 });
  const matB = new THREE.LineBasicMaterial({ color: 0x6c5ce7, transparent: true, opacity: 0.15 });
  const geos = [
    new THREE.IcosahedronGeometry(0.8, 0),
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.TetrahedronGeometry(0.8, 0),
    new THREE.TorusKnotGeometry(0.5, 0.16, 64, 8),
  ];
  const shapes = [];
  for (let i = 0; i < 10; i++) {
    const g = geos[i % geos.length];
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(g), i % 2 ? matB : matA);
    const rr = 5 + Math.random() * 3;
    const t = Math.random() * Math.PI * 2;
    line.position.set(Math.cos(t) * rr, (Math.random() - 0.5) * 4, Math.sin(t) * rr - 3);
    line.userData = { sp: 0.002 + Math.random() * 0.004 };
    scene.add(line);
    shapes.push(line);
  }
  camera.position.set(0, 0, 8);

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
      for (const s of shapes) {
        s.rotation.x += s.userData.sp;
        s.rotation.y += s.userData.sp * 1.4;
      }
      r.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 3: REVEAL — 4 novel views of the user's photo (live).
   Re-renders whenever user image/depth changes.
   ========================================================= */
export function initReveal() {
  const root = document.getElementById('reveal-slide');
  const inputCanvas = root.querySelector('canvas[data-reveal=input]');
  const cards = Array.from(root.querySelectorAll('.rev-card'));
  const outCanvases = cards.map(c => c.querySelector('canvas'));
  const prompt = root.querySelector('.no-image-prompt');

  let depthScene = null;
  let cam = null;
  let state = null;
  let visible = false;
  let revealed = false;

  function rebuild(imgC, depC) {
    if (depthScene) { disposeScene(depthScene); depthScene = null; }
    if (!imgC || !depC) return;
    depthScene = buildDepthScene(imgC, depC, { shader: 'basic', strength: 0.45, tess: 180 });
    cam = makeCamera(38);
    revealed = false;
    cards.forEach(c => c.classList.remove('in'));
  }

  function drawInput(srcCanvas) {
    if (!srcCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, inputCanvas.clientWidth * dpr);
    const h = Math.max(1, inputCanvas.clientHeight * dpr);
    if (inputCanvas.width !== w) inputCanvas.width = w;
    if (inputCanvas.height !== h) inputCanvas.height = h;
    const ctx = inputCanvas.getContext('2d');
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);
    const sr = srcCanvas.width / srcCanvas.height;
    const tr = w / h;
    let dw, dh, dx, dy;
    if (sr > tr) { dw = w; dh = w / sr; dx = 0; dy = (h - dh) / 2; }
    else         { dh = h; dw = h * sr; dy = 0; dx = (w - dw) / 2; }
    ctx.drawImage(srcCanvas, dx, dy, dw, dh);
  }

  const VIEWS = [
    { dir: 'left',  x: -0.30, y:  0.0  },
    { dir: 'right', x:  0.30, y:  0.0  },
    { dir: 'up',    x:  0.0,  y:  0.22 },
    { dir: 'down',  x:  0.0,  y: -0.22 },
  ];

  function renderAll() {
    if (!depthScene || !cam) return;
    for (let i = 0; i < cards.length; i++) {
      const view = VIEWS[i];
      cam.position.set(view.x, view.y, 2.6);
      cam.lookAt(0, 0, 0);
      renderTo(outCanvases[i], depthScene.scene, cam);
    }
  }

  function maybeReveal() {
    if (!visible || !depthScene || revealed) return;
    revealed = true;
    cards.forEach((c, i) => setTimeout(() => c.classList.add('in'), 120 + i * 180));
  }

  subscribe((s) => {
    state = s;
    if (s.status === 'ready' && s.image && s.depth) {
      prompt.hidden = true;
      drawInput(s.image);
      rebuild(s.image, s.depth);
      renderAll();
      maybeReveal();
    } else {
      prompt.hidden = false;
      // clear cards
      cards.forEach(c => c.classList.remove('in'));
      outCanvases.forEach(c => {
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, c.width || 100, c.height || 100);
      });
      const ctx = inputCanvas.getContext('2d');
      inputCanvas.width = inputCanvas.clientWidth * (window.devicePixelRatio || 1);
      inputCanvas.height = inputCanvas.clientHeight * (window.devicePixelRatio || 1);
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, inputCanvas.width, inputCanvas.height);
      ctx.fillStyle = '#999';
      ctx.font = '16px Heebo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('—', inputCanvas.width / 2, inputCanvas.height / 2);
    }
  });

  return {
    enter() { visible = true; maybeReveal(); },
    tick(isVisible) {
      visible = isVisible;
      // we only need to render once per upload, but if the canvas resizes
      // we'd want to redo. cheap: re-render every ~30 frames.
      if (isVisible && depthScene && cam) renderAll();
    },
  };
}

/* =========================================================
   Slide 4: APPLICATIONS — 4 mini-animations of the user's photo
   ========================================================= */
export function initApplications() {
  const cards = Array.from(document.querySelectorAll('.app-card'));
  const prompt = document.querySelector('.slide[data-id="4"] .no-image-prompt');

  // build a single shared DepthScene + plus a specular & heatmap variant
  let basicScene = null, specularScene = null, heatmapScene = null;
  let cam = null;
  let t = 0;

  function rebuild(img, dep) {
    [basicScene, specularScene, heatmapScene].forEach(disposeScene);
    if (!img || !dep) { basicScene = specularScene = heatmapScene = null; return; }
    basicScene    = buildDepthScene(img, dep, { shader: 'basic',    strength: 0.45 });
    specularScene = buildDepthScene(img, dep, { shader: 'specular', strength: 0.45 });
    heatmapScene  = buildDepthScene(img, dep, { shader: 'heatmap',  strength: 0.45 });
    cam = makeCamera(36);
  }

  subscribe((s) => {
    if (s.status === 'ready' && s.image && s.depth) {
      prompt.hidden = true;
      rebuild(s.image, s.depth);
    } else {
      prompt.hidden = false;
      rebuild(null, null);
    }
  });

  function clearCanvases() {
    for (const card of cards) {
      const c = card.querySelector('canvas');
      const w = c.clientWidth * (window.devicePixelRatio || 1);
      const h = c.clientHeight * (window.devicePixelRatio || 1);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, w, h);
    }
  }

  return {
    tick(visible) {
      if (!visible) return;
      if (!basicScene) { clearCanvases(); return; }
      t += 0.012;

      // App 1: VR walkthrough — dolly forward (z 2.6 → 1.6) with slight pan
      {
        const c = cards.find(c => c.dataset.app === 'walk').querySelector('canvas');
        const u = (Math.sin(t * 0.6) + 1) / 2;        // 0..1
        cam.position.set(0.04 * Math.sin(t), 0.02 * Math.cos(t), 2.6 - u * 0.9);
        cam.lookAt(0, 0, 0.2);
        renderTo(c, basicScene.scene, cam);
      }

      // App 2: stereo — render left and right viewports side-by-side
      {
        const card = cards.find(c => c.dataset.app === 'stereo');
        const c = card.querySelector('canvas');
        const dpr = window.devicePixelRatio || 1;
        const cw = c.clientWidth | 0, chh = c.clientHeight | 0;
        const bw = cw * dpr, bh = chh * dpr;
        if (c.width !== bw) c.width = bw;
        if (c.height !== bh) c.height = bh;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, bw, bh);

        // create a tmp canvas for each eye
        const half = document.createElement('canvas');
        half.width = bw / 2; half.height = bh;
        // left eye
        cam.position.set(-0.10, 0, 2.5); cam.lookAt(0, 0, 0);
        renderTo(half, basicScene.scene, cam);
        ctx.drawImage(half, 0, 0);
        // right eye
        cam.position.set( 0.10, 0, 2.5); cam.lookAt(0, 0, 0);
        renderTo(half, basicScene.scene, cam);
        ctx.drawImage(half, bw / 2, 0);
        // divider
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bw / 2, 0); ctx.lineTo(bw / 2, bh); ctx.stroke();
      }

      // App 3: spin — camera orbits at small radius
      {
        const c = cards.find(c => c.dataset.app === 'spin').querySelector('canvas');
        const a = t * 0.7;
        cam.position.set(Math.sin(a) * 0.4, 0.05 * Math.sin(a * 1.7), 2.4 + Math.cos(a) * 0.3);
        cam.lookAt(0, 0, 0);
        renderTo(c, basicScene.scene, cam);
      }

      // App 4: depth heatmap (mix oscillates)
      {
        const c = cards.find(c => c.dataset.app === 'depth').querySelector('canvas');
        const mix = 0.35 + 0.35 * (Math.sin(t * 1.2) + 1) / 2;
        heatmapScene.uniforms.mixAmt.value = mix;
        cam.position.set(0.1 * Math.sin(t * 0.4), 0, 2.6);
        cam.lookAt(0, 0, 0);
        renderTo(c, heatmapScene.scene, cam);
      }
    },
  };
}

/* =========================================================
   Slide 5: WHY HARD — 4 demos of difficulties on the user's photo
   ========================================================= */
export function initWhyHard() {
  const cards = Array.from(document.querySelectorAll('.hard-card-v'));
  const prompt = document.querySelector('.slide[data-id="5"] .no-image-prompt');

  let scene3D = null, sceneFlat = null, sceneSpec = null;
  let cam = null;
  let t = 0;

  function rebuild(img, dep) {
    [scene3D, sceneFlat, sceneSpec].forEach(disposeScene);
    if (!img || !dep) { scene3D = sceneFlat = sceneSpec = null; return; }
    scene3D   = buildDepthScene(img, dep, { shader: 'basic',    strength: 0.6 });
    sceneFlat = buildDepthScene(img, dep, { shader: 'basic',    flat: true });
    sceneSpec = buildDepthScene(img, dep, { shader: 'specular', strength: 0.5 });
    // larger background for occlusion demo so voids are obvious as gray, not white
    scene3D.scene.background = new THREE.Color(0x202020);
    cam = makeCamera(36);
  }

  subscribe((s) => {
    if (s.status === 'ready' && s.image && s.depth) {
      prompt.hidden = true;
      rebuild(s.image, s.depth);
    } else { prompt.hidden = false; rebuild(null, null); }
  });

  return {
    tick(visible) {
      if (!visible || !scene3D) return;
      t += 0.012;

      // 01 depth: flip between flat and 3D every 2.5s
      {
        const c = cards.find(c => c.dataset.hard === 'depth').querySelector('canvas');
        const phase = Math.floor(t / 2) % 2;
        const sc = phase === 0 ? sceneFlat : scene3D;
        const yaw = Math.sin(t * 0.8) * 0.5;
        cam.position.set(Math.sin(yaw) * 2.6, 0, Math.cos(yaw) * 2.6);
        cam.lookAt(0, 0, 0);
        sc.scene.background = new THREE.Color(0xffffff);
        renderTo(c, sc.scene, cam);
      }

      // 02 occlusion: extreme rotation, dark background to make voids obvious
      {
        const c = cards.find(c => c.dataset.hard === 'occlusion').querySelector('canvas');
        const a = Math.sin(t * 0.6) * 1.0;
        cam.position.set(Math.sin(a) * 2.4, 0, Math.cos(a) * 2.4);
        cam.lookAt(0, 0, 0);
        scene3D.scene.background = new THREE.Color(0x202020);
        renderTo(c, scene3D.scene, cam);
      }

      // 03 lighting: specular highlight moves in a circle
      {
        const c = cards.find(c => c.dataset.hard === 'lighting').querySelector('canvas');
        const lx = 0.5 + Math.cos(t * 1.4) * 0.35;
        const ly = 0.5 + Math.sin(t * 1.4) * 0.35;
        sceneSpec.uniforms.lightPos.value.set(lx, ly, 0.5);
        cam.position.set(0, 0, 2.4); cam.lookAt(0, 0, 0);
        sceneSpec.scene.background = new THREE.Color(0xffffff);
        renderTo(c, sceneSpec.scene, cam);
      }

      // 04 consistency: jittered orbit — camera shakes randomly
      {
        const c = cards.find(c => c.dataset.hard === 'consistency').querySelector('canvas');
        const phase = Math.floor(t / 1.5) % 2;
        const jitter = phase === 0
          ? new THREE.Vector3((Math.random() - .5) * 0.18, (Math.random() - .5) * 0.18, 0)
          : new THREE.Vector3(0.04 * Math.sin(t), 0, 0);
        cam.position.set(0.2 + jitter.x, jitter.y, 2.4);
        cam.lookAt(0, 0, 0);
        scene3D.scene.background = new THREE.Color(0xffffff);
        renderTo(c, scene3D.scene, cam);
      }
    },
  };
}

/* =========================================================
   Slide 6: CLASSIC METHODS — wireframe mesh + photo tour crossfade
   ========================================================= */
export function initClassic() {
  const meshCard = document.querySelector('.old-card-v[data-old=mesh]');
  const tourCard = document.querySelector('.old-card-v[data-old=phototour]');
  const meshCanvas = meshCard?.querySelector('canvas');
  const tourCanvas = tourCard?.querySelector('canvas');
  const prompt = document.querySelector('.slide[data-id="6"] .no-image-prompt');

  let wireScene = null, basicScene = null;
  let cam = null;
  let t = 0;

  function rebuild(img, dep) {
    if (wireScene) disposeScene(wireScene);
    if (basicScene) disposeScene(basicScene);
    if (!img || !dep) { wireScene = basicScene = null; return; }
    wireScene  = buildWireframeScene(img, dep, { strength: 0.5, tess: 70 });
    basicScene = buildDepthScene(img, dep, { shader: 'basic', strength: 0.45 });
    cam = makeCamera(36);
  }

  subscribe((s) => {
    if (s.status === 'ready' && s.image && s.depth) {
      prompt.hidden = true;
      rebuild(s.image, s.depth);
    } else { prompt.hidden = false; rebuild(null, null); }
  });

  return {
    tick(visible) {
      if (!visible || !wireScene) return;
      t += 0.01;

      // Mesh: rotate wireframe slowly
      const yaw = Math.sin(t * 0.6) * 0.45;
      cam.position.set(Math.sin(yaw) * 2.6, 0.05, Math.cos(yaw) * 2.6);
      cam.lookAt(0, 0, 0);
      renderTo(meshCanvas, wireScene.scene, cam);

      // Photo tour: ping-pong between 2 nearby camera positions, with quick cut
      const phase = (t * 0.5) % 2;
      const dx = phase < 1 ? -0.22 : 0.22;
      // sharp transitions like a slideshow
      cam.position.set(dx, 0, 2.4);
      cam.lookAt(0, 0, 0);
      renderTo(tourCanvas, basicScene.scene, cam);
    },
  };
}

/* =========================================================
   Slide 6: Old approaches — two NeRF clips, autoplay loop
   ========================================================= */
export function initOldApproaches() {
  const vids = document.querySelectorAll('.old-card video');
  return {
    enter() { vids.forEach(v => { v.loop = true; v.play().catch(() => {}); }); },
    tick(visible) {
      vids.forEach(v => {
        if (!visible) v.pause();
        else if (v.paused) v.play().catch(() => {});
      });
    },
  };
}

/* =========================================================
   Slide 8: Rotatable — drag horizontally to scrub through orbit video
   ========================================================= */
export function initRotatable() {
  const stage = document.getElementById('rotatable-stage');
  const v = document.getElementById('rotatable-video');

  let dragging = false;
  let lastX = 0;
  let userTouched = false;
  let autoT = 0;

  // make sure the video is ready and not auto-playing forever
  v.loop = true;
  v.muted = true;

  function onReady() {
    if (!v.duration) return;
    // start at a nice frame
    try { v.currentTime = 0.0; } catch {}
  }
  v.addEventListener('loadedmetadata', onReady, { once: true });

  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    userTouched = true;
    lastX = e.clientX;
    stage.classList.add('grabbed');
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    if (!v.duration) return;
    // RTL: positive dx = drag right → go "forward". Adjust feel.
    let t = v.currentTime + (dx / stage.clientWidth) * v.duration * 1.6;
    // wrap
    if (t < 0) t = v.duration + t;
    if (t >= v.duration) t = t - v.duration;
    try { v.currentTime = t; } catch {}
  });
  const endDrag = () => { dragging = false; stage.classList.remove('grabbed'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', endDrag);

  return {
    enter() {
      userTouched = false;
      autoT = 0;
      v.play().then(() => v.pause()).catch(() => {});
    },
    tick(visible) {
      if (!visible || !v.duration) return;
      if (!userTouched && !dragging) {
        // gentle auto-rotation before first interaction
        autoT += 0.012;
        let t = (autoT) % v.duration;
        try { v.currentTime = t; } catch {}
      }
    },
  };
}

/* =========================================================
   Slide 10: Ray demo — KEEP procedural (pedagogical)
   ========================================================= */
export function initRayDemo() {
  const container = document.getElementById('ray-stage');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafafa);

  // lighting + camera
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d8e8, 0.7));
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(5.5, 3.5, 6.5);
  camera.lookAt(0.5, 0.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(container);

  // translucent colored "blobs" as the implicit scene
  const blobs = [
    { p: new THREE.Vector3(-1.0, 0.6, 0.0), r: 0.8, c: new THREE.Color('#ff5a36') },
    { p: new THREE.Vector3(0.6,  1.2, -0.3), r: 0.7, c: new THREE.Color('#6c5ce7') },
    { p: new THREE.Vector3(0.0,  0.4, 1.0),  r: 0.6, c: new THREE.Color('#00b894') },
    { p: new THREE.Vector3(1.4,  0.5, 0.6),  r: 0.5, c: new THREE.Color('#ffc23a') },
  ];
  for (const b of blobs) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(b.r, 24, 24),
      new THREE.MeshBasicMaterial({ color: b.c, transparent: true, opacity: 0.32, depthWrite: false })
    );
    m.position.copy(b.p);
    scene.add(m);
  }

  const grid = new THREE.GridHelper(8, 16, 0xd0d0d0, 0xeaeaea);
  grid.position.y = -0.001;
  scene.add(grid);

  // virtual camera marker
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

  // image plane: 7×7 pixels
  const GRID = 7;
  const PIX = 0.16;
  const camPos = camMarker.position.clone();
  const target = new THREE.Vector3(0, 0.6, 0);
  const forward = target.clone().sub(camPos).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up    = new THREE.Vector3().crossVectors(right, forward).normalize();
  const planeCenter = camPos.clone().add(forward.clone().multiplyScalar(1.2));

  const pixels = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u = (i - (GRID - 1) / 2) * PIX;
      const vy = (j - (GRID - 1) / 2) * PIX;
      const pos = planeCenter.clone()
        .add(right.clone().multiplyScalar(u))
        .add(up.clone().multiplyScalar(vy));
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(PIX * 0.9, PIX * 0.9),
        new THREE.MeshBasicMaterial({ color: 0xeeeeee, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      m.position.copy(pos);
      m.lookAt(camPos);
      m.userData = { pos: pos.clone() };
      scene.add(m);
      pixels.push(m);
    }
  }

  // ray line + sample dots
  const rayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xff5a36 })
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

  function colorOf(p) {
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
      document.getElementById('rd-color').style.background = '#ddd';
      for (const p of pixels) p.material.color.set(0xeeeeee);
      return;
    }
    for (const p of pixels) p.material.color.set(p === pixel ? 0xff5a36 : 0xeeeeee);

    const start = camMarker.position.clone();
    const dir = pixel.userData.pos.clone().sub(start).normalize();
    const NEAR = 1.3, FAR = 8.0;
    let acc = { r: 0, g: 0, b: 0, transmittance: 1 };
    let hitCount = 0;
    const dt = (FAR - NEAR) / SAMPLES;
    for (let k = 0; k < SAMPLES; k++) {
      const t = NEAR + dt * (k + 0.5);
      const p = start.clone().add(dir.clone().multiplyScalar(t));
      const c = colorOf(p);
      if (c) {
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
    acc.r += acc.transmittance; acc.g += acc.transmittance; acc.b += acc.transmittance;

    const farP = start.clone().add(dir.clone().multiplyScalar(FAR));
    rayLine.geometry.setFromPoints([start, farP]);
    rayLine.visible = true;

    document.getElementById('rd-samples').textContent = String(hitCount);
    const r255 = Math.round(THREE.MathUtils.clamp(acc.r, 0, 1) * 255);
    const g255 = Math.round(THREE.MathUtils.clamp(acc.g, 0, 1) * 255);
    const b255 = Math.round(THREE.MathUtils.clamp(acc.b, 0, 1) * 255);
    document.getElementById('rd-color').style.background = `rgb(${r255},${g255},${b255})`;
    pixel.material.color.setRGB(acc.r, acc.g, acc.b);
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredPixel = null;
  let autoIdx = Math.floor(pixels.length / 2);
  let autoTimer = 0;
  function pickPixelAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(pixels, false);
    return hits.length ? hits[0].object : null;
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
      hoveredPixel = pixels[autoIdx];
      fireRay(hoveredPixel);
    },
    tick(visible) {
      if (!visible) return;
      if (!hoveredPixel || hoveredPixel === pixels[autoIdx]) {
        autoTimer++;
        if (autoTimer > 90) {
          autoTimer = 0;
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
   Slide 11: Training — same video shown twice (pred blurry → sharpens),
   plus a live pixel-diff error canvas.
   ========================================================= */
export function initTraining() {
  const pred = document.querySelector('.train-video.pred');
  const gt   = document.querySelector('.train-video.gt');
  const err  = document.getElementById('train-err');

  function syncVideos() {
    if (Math.abs(pred.currentTime - gt.currentTime) > 0.05) {
      try { pred.currentTime = gt.currentTime; } catch {}
    }
  }
  pred.loop = gt.loop = true;
  pred.muted = gt.muted = true;

  let entered = false;
  return {
    enter() {
      pred.classList.remove('sharp');
      gt.play().catch(() => {});
      pred.play().catch(() => {});
      // sharpen the prediction over ~5s
      setTimeout(() => pred.classList.add('sharp'), 100);
      entered = true;
    },
    tick(visible) {
      if (!visible) { gt.pause(); pred.pause(); return; }
      if (gt.paused) gt.play().catch(() => {});
      if (pred.paused) pred.play().catch(() => {});
      syncVideos();

      // pixel diff to error canvas
      const w = err.clientWidth * (window.devicePixelRatio || 1);
      const h = err.clientHeight * (window.devicePixelRatio || 1);
      if (err.width !== w) err.width = w;
      if (err.height !== h) err.height = h;
      const ctx = err.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'difference';
      try {
        ctx.drawImage(gt, 0, 0, w, h);
        ctx.drawImage(pred, 0, 0, w, h);
      } catch (_) { /* video not ready */ }
      ctx.globalCompositeOperation = 'source-over';
      try {
        const img = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
          const boost = Math.min(255, lum * 3.5);
          img.data[i]     = Math.min(255, 255 - (255 - boost) * 0.3);
          img.data[i + 1] = Math.max(0, 255 - boost * 1.4);
          img.data[i + 2] = Math.max(0, 255 - boost * 1.7);
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      } catch (_) {}
    },
  };
}

/* =========================================================
   Slide 12: Clickable viewpoints — N camera buttons arranged in a ring
   around the video. Each maps to a preset video.currentTime (a different
   orbit angle). Thumbs render that same frame.
   ========================================================= */
export function initClickableViews() {
  const stage = document.getElementById('view-stage');
  const v = document.getElementById('view-video');
  const ring = document.getElementById('cam-ring');
  const strip = document.getElementById('thumb-strip');

  const NUM = 8;
  // arrange cam buttons around an ellipse inset from stage edges
  const cams = [];
  for (let i = 0; i < NUM; i++) {
    const theta = (i / NUM) * Math.PI * 2 - Math.PI / 2;
    const cx = 50 + Math.cos(theta) * 42;  // % position
    const cy = 50 + Math.sin(theta) * 42;
    const btn = document.createElement('button');
    btn.className = 'cam';
    btn.style.left = cx + '%';
    btn.style.top  = cy + '%';
    btn.style.transform = 'translate(-50%, -50%)';
    btn.dataset.idx = i;
    ring.appendChild(btn);
    cams.push(btn);
  }

  // thumbs
  strip.innerHTML = '';
  const thumbs = [];
  const thumbCanvases = [];
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
    thumbs.push(d);
    thumbCanvases.push(c);
  }

  let activeIdx = 0;
  function timeForIdx(i) {
    if (!v.duration) return 0;
    return (i / NUM) * v.duration;
  }

  function setActive(i) {
    activeIdx = i;
    cams.forEach((b, k) => b.classList.toggle('active', k === i));
    thumbs.forEach((t, k) => t.classList.toggle('active', k === i));
    if (v.duration) {
      try { v.currentTime = timeForIdx(i); } catch {}
    }
  }
  cams.forEach((b, i) => b.addEventListener('click', () => setActive(i)));
  thumbs.forEach((d, i) => d.addEventListener('click', () => setActive(i)));

  // render thumbs by grabbing frames at each preset time. Approach: cycle
  // a single offscreen <video> through each time and drawImage to each thumb.
  const ov = document.createElement('video');
  ov.src = v.src;
  ov.muted = true;
  ov.playsInline = true;
  ov.preload = 'auto';
  let thumbsBuilt = false;

  async function buildThumbs() {
    if (thumbsBuilt) return;
    if (!ov.duration) return;
    for (let i = 0; i < NUM; i++) {
      await new Promise(res => {
        const onSeek = () => { ov.removeEventListener('seeked', onSeek); res(); };
        ov.addEventListener('seeked', onSeek);
        try { ov.currentTime = (i / NUM) * ov.duration; } catch { res(); }
      });
      const c = thumbCanvases[i];
      const w = c.clientWidth * (window.devicePixelRatio || 1);
      const h = c.clientHeight * (window.devicePixelRatio || 1);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const ctx = c.getContext('2d');
      try { ctx.drawImage(ov, 0, 0, w, h); } catch {}
    }
    thumbsBuilt = true;
  }
  ov.addEventListener('loadedmetadata', buildThumbs, { once: true });
  v.addEventListener('loadedmetadata', () => { setActive(0); }, { once: true });

  return {
    enter() {
      v.pause();
      if (v.readyState >= 1) setActive(activeIdx);
    },
    tick(visible) {
      if (!visible) return;
      if (!thumbsBuilt && ov.readyState >= 2) buildThumbs();
    },
  };
}

/* =========================================================
   Slide 13: Orbit scrubber — slider maps to video.currentTime
   ========================================================= */
export function initOrbitScrubber() {
  const v = document.getElementById('orbit-video');
  const slider = document.getElementById('orbit-slider');
  let userInteracting = false;
  let autoT = 0;

  v.muted = true; v.loop = true;

  slider.addEventListener('input', (e) => {
    userInteracting = true;
    const f = parseFloat(e.target.value) / parseFloat(slider.max);
    if (v.duration) {
      try { v.currentTime = f * v.duration; } catch {}
    }
    slider.style.setProperty('--p', (f * 100).toFixed(1) + '%');
  });

  v.addEventListener('loadedmetadata', () => {
    try { v.currentTime = 0; } catch {}
  }, { once: true });

  return {
    enter() {
      userInteracting = false;
      autoT = 0;
      try { v.pause(); v.currentTime = 0; } catch {}
      slider.value = 0;
      slider.style.setProperty('--p', '0%');
    },
    tick(visible) {
      if (!visible) return;
      if (!userInteracting && v.duration) {
        autoT += 1 / 60 * 0.15; // slow auto-orbit
        const f = (autoT % 1);
        try { v.currentTime = f * v.duration; } catch {}
        slider.value = Math.round(f * parseFloat(slider.max));
        slider.style.setProperty('--p', (f * 100).toFixed(1) + '%');
      }
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
