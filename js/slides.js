// slides.js — per-slide initializers.

import * as THREE from 'three';

function primeVideo(video, play = false) {
  if (!video) return;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (video.readyState === 0) video.load();
  if (play && (video.paused || video.readyState < 2)) {
    video.play().catch(() => {});
  }
}

function controlVideos(videoList) {
  const videos = Array.from(videoList);
  function playVisible() {
    for (const v of videos) {
      v.loop = true;
      primeVideo(v, true);
    }
  }
  function pauseAll() {
    videos.forEach(v => v.pause());
  }
  return {
    enter() { playVisible(); },
    tick(visible) {
      if (visible) playVisible();
      else pauseAll();
    },
  };
}

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
  const matC = new THREE.LineBasicMaterial({ color: 0x00b894, transparent: true, opacity: 0.15 });

  // NVS-related shapes:
  // 1. Camera Frustums (4-sided pyramids)
  const geomCamera = new THREE.CylinderGeometry(0.4, 0, 1, 4, 1);
  geomCamera.rotateY(Math.PI / 4);
  geomCamera.rotateX(Math.PI / 2);
  // 2. Image Plane grids
  const geomPlane = new THREE.PlaneGeometry(1.2, 1.2, 3, 3);
  // 3. Voxel cubes
  const geomBox = new THREE.BoxGeometry(1, 1, 1);
  // 4. Ray lines
  const geomRay = new THREE.CylinderGeometry(0.02, 0.02, 4, 3);

  const geos = [geomCamera, geomPlane, geomBox, geomRay];
  const mats = [matA, matB, matC];

  const shapes = [];
  // Spread 40 shapes all over the background
  for (let i = 0; i < 40; i++) {
    const g = geos[Math.floor(Math.random() * geos.length)];
    const mat = mats[Math.floor(Math.random() * mats.length)];
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(g), mat);
    
    line.position.set(
      (Math.random() - 0.5) * 30, // x spread
      (Math.random() - 0.5) * 20, // y spread
      (Math.random() - 0.5) * 15 - 5 // z spread (mostly behind)
    );
    line.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    line.userData = { 
      spX: (Math.random() - 0.5) * 0.004, 
      spY: (Math.random() - 0.5) * 0.004,
      spZ: (Math.random() - 0.5) * 0.004
    };
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
        s.rotation.x += s.userData.spX;
        s.rotation.y += s.userData.spY;
        s.rotation.z += s.userData.spZ;
      }
      r.render(scene, camera);
    },
  };
}

/* =========================================================
   Slides 3–5: NeRF project-page videos
   ========================================================= */
export function initApplications() {
  return controlVideos(document.querySelectorAll('.slide[data-id="3"] video'));
}

export function initWhyHard() {
  return controlVideos(document.querySelectorAll('.slide[data-id="4"] video'));
}

export function initClassic() {
  return controlVideos(document.querySelectorAll('.slide[data-id="5"] video'));
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
   Slide 7: Rotatable — drag horizontally to scrub through orbit video
   ========================================================= */
export function initRotatable() {
  const stage = document.getElementById('rotatable-stage');
  const v = document.getElementById('rotatable-video');

  let dragging = false;
  let lastX = 0;
  let userTouched = false;

  v.loop = true;
  primeVideo(v);
  v.addEventListener('loadedmetadata', () => {
    try { v.currentTime = 0; } catch {}
  }, { once: true });

  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    userTouched = true;
    lastX = e.clientX;
    stage.classList.add('grabbed');
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || !v.duration) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    let t = v.currentTime + (dx / stage.clientWidth) * v.duration * 1.6;
    if (t < 0) t += v.duration;
    if (t >= v.duration) t -= v.duration;
    try { v.currentTime = t; } catch {}
  });
  const endDrag = () => { dragging = false; stage.classList.remove('grabbed'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', endDrag);

  return {
    enter() {
      userTouched = false;
      try { v.currentTime = 0; } catch {}
      primeVideo(v, true);
    },
    tick(visible) {
      if (!visible) { v.pause(); return; }
      primeVideo(v, true);
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
   Slide 10: Training — prediction sharpens, error fades
   ========================================================= */
export function initTraining() {
  const pred = document.querySelector('.train-video.pred');
  const gt   = document.querySelector('.train-video.gt');
  const err  = document.getElementById('train-err');

  pred.loop = gt.loop = true;
  primeVideo(pred);
  primeVideo(gt);

  function syncVideos() {
    if (Math.abs(pred.currentTime - gt.currentTime) > 0.05) {
      try { pred.currentTime = gt.currentTime; } catch {}
    }
  }

  return {
    enter() {
      pred.classList.remove('sharp');
      primeVideo(gt, true);
      primeVideo(pred, true);
      setTimeout(() => pred.classList.add('sharp'), 100);
    },
    tick(visible) {
      if (!visible) { gt.pause(); pred.pause(); return; }
      primeVideo(gt, true);
      primeVideo(pred, true);
      syncVideos();

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
      } catch (_) {}
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
   Slide 11: Clickable viewpoints — camera buttons mapped to video time
   ========================================================= */
export function initClickableViews() {
  const v = document.getElementById('view-video');
  const ring = document.getElementById('cam-ring');
  const strip = document.getElementById('thumb-strip');

  const NUM = 8;
  primeVideo(v);
  ring.innerHTML = '';
  strip.innerHTML = '';
  const cams = [];
  const thumbs = [];
  const thumbCanvases = [];

  for (let i = 0; i < NUM; i++) {
    const theta = (i / NUM) * Math.PI * 2 - Math.PI / 2;
    const btn = document.createElement('button');
    btn.className = 'cam';
    btn.style.left = (50 + Math.cos(theta) * 42) + '%';
    btn.style.top  = (50 + Math.sin(theta) * 42) + '%';
    btn.style.transform = 'translate(-50%, -50%)';
    btn.dataset.idx = i;
    ring.appendChild(btn);
    cams.push(btn);

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
  let thumbsBuilt = false;
  const ov = document.createElement('video');
  ov.src = v.currentSrc || v.src;
  ov.muted = true;
  ov.playsInline = true;
  ov.preload = 'auto';

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

  async function buildThumbs() {
    if (thumbsBuilt || !ov.duration) return;
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
      try { c.getContext('2d').drawImage(ov, 0, 0, w, h); } catch {}
    }
    thumbsBuilt = true;
  }

  ov.addEventListener('loadedmetadata', buildThumbs, { once: true });
  v.addEventListener('loadedmetadata', () => setActive(0), { once: true });

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
   Slide 12: Orbit scrubber — slider maps to video time
   ========================================================= */
export function initOrbitScrubber() {
  const v = document.getElementById('orbit-video');
  const slider = document.getElementById('orbit-slider');
  let scrubbing = false;

  v.loop = true;
  primeVideo(v);

  function setSliderFraction(f, seekVideo = false) {
    const pct = THREE.MathUtils.clamp(f, 0, 1) * 100;
    slider.value = Math.round((pct / 100) * parseFloat(slider.max));
    slider.style.setProperty('--p', pct.toFixed(1) + '%');
    if (seekVideo && v.duration) {
      try { v.currentTime = (pct / 100) * v.duration; } catch {}
    }
  }

  slider.addEventListener('input', (e) => {
    scrubbing = true;
    setSliderFraction(parseFloat(e.target.value) / parseFloat(slider.max), true);
  });
  slider.addEventListener('pointerup', () => { scrubbing = false; });
  slider.addEventListener('change', () => { scrubbing = false; });

  v.addEventListener('loadedmetadata', () => setSliderFraction(0), { once: true });

  return {
    enter() {
      scrubbing = false;
      try { v.currentTime = 0; } catch {}
      primeVideo(v, true);
      setSliderFraction(0);
    },
    tick(visible) {
      if (!visible) { v.pause(); return; }
      primeVideo(v, true);
      if (!scrubbing && v.duration) {
        setSliderFraction((v.currentTime % v.duration) / v.duration);
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
