// slides.js - per-slide initializers.

import * as THREE from "three";

function primeVideo(video, play = false) {
  if (!video) return;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
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
    videos.forEach((v) => v.pause());
  }
  return {
    enter() {
      playVisible();
    },
    tick(visible) {
      if (visible) playVisible();
      else pauseAll();
    },
  };
}

/* =========================================================
   Slide 1: Title - wireframe background
   ========================================================= */
export function initTitleBg() {
  const canvas = document.getElementById("title-bg");
  const slide = canvas.closest(".slide");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setClearColor(0xffffff, 0);

  const matRoom = new THREE.LineBasicMaterial({
    color: 0x6c5ce7,
    transparent: true,
    opacity: 0.32,
  });
  const matObj = new THREE.LineBasicMaterial({
    color: 0xff5a36,
    transparent: true,
    opacity: 0.58,
  });

  // 1. A static wireframe room bounds
  const roomGeom = new THREE.BoxGeometry(24, 10, 24);
  const room = new THREE.LineSegments(
    new THREE.EdgesGeometry(roomGeom),
    matRoom,
  );
  room.position.y = 4;
  scene.add(room);

  // 2. A floor grid
  const floor = new THREE.GridHelper(24, 24, 0x6c5ce7, 0x6c5ce7);
  floor.material.transparent = true;
  floor.material.opacity = 0.26;
  floor.position.y = -1;
  scene.add(floor);

  // 3. Static geometric furniture/objects
  const objects = new THREE.Group();
  scene.add(objects);

  const addBox = (w, h, d, x, y, z) => {
    const mesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
      matObj,
    );
    mesh.position.set(x, y, z);
    objects.add(mesh);
  };

  // 1. Rug (flat box on floor)
  addBox(12, 0.05, 10, 0, -0.95, 0);

  // 2. Sofa (facing the table)
  // Seat
  addBox(7, 0.8, 2.5, 0, -0.6, 4);
  // Backrest
  addBox(7, 2.0, 0.6, 0, 0.4, 5);
  // Armrests
  addBox(0.8, 1.2, 3.1, -3.9, -0.4, 4.3);
  addBox(0.8, 1.2, 3.1, 3.9, -0.4, 4.3);

  // 3. Table
  addBox(4, 0.1, 2.5, 0, 0.5, 0); // tabletop
  addBox(0.1, 1.5, 0.1, -1.8, -0.25, -1.1); // legs
  addBox(0.1, 1.5, 0.1, 1.8, -0.25, -1.1);
  addBox(0.1, 1.5, 0.1, -1.8, -0.25, 1.1);
  addBox(0.1, 1.5, 0.1, 1.8, -0.25, 1.1);

  // 4. TV Stand and TV
  addBox(6, 1.0, 1.5, 0, -0.5, -5); // Stand
  addBox(4.5, 2.5, 0.2, 0, 1.5, -5); // Screen

  // 5. Bookshelf
  addBox(2.5, 6, 1.5, -6, 2, -4); // Frame
  addBox(2.3, 0.1, 1.3, -6, -0.5, -4); // Shelves
  addBox(2.3, 0.1, 1.3, -6, 1.0, -4);
  addBox(2.3, 0.1, 1.3, -6, 2.5, -4);
  addBox(2.3, 0.1, 1.3, -6, 4.0, -4);

  // 6. House Plant
  addBox(1.2, 1.2, 1.2, 5, -0.4, -4); // Pot
  const plantGeom = new THREE.IcosahedronGeometry(1.5, 0);
  const plantMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(plantGeom),
    matObj,
  );
  plantMesh.position.set(5, 1.5, -4);
  objects.add(plantMesh);

  // 7. Small objects on the table (laptop, books)
  addBox(1.0, 0.05, 0.8, -0.8, 0.55, 0); // Laptop
  addBox(0.6, 0.2, 0.8, 1.2, 0.6, 0.2); // Book

  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  let state = "HOLD";
  let timer = 0;
  let lastFrameTime = performance.now();
  const HOLD_TIME = 1.8; // seconds the camera stays still before switching positions
  const MOVE_TIME = 1.2; // seconds spent moving between positions

  const center = new THREE.Vector3(0, 1, 0);

  let startAngle = Math.PI / 4;
  let targetAngle = startAngle;
  let startRadius = 9;
  let targetRadius = 9;
  let startY = 4;
  let targetY = 4;

  function getNextTarget() {
    const angleDelta = Math.PI / 3 + Math.random() * (Math.PI / 2);
    const sign = Math.random() > 0.5 ? 1 : -1;
    targetAngle = startAngle + angleDelta * sign;
    targetRadius = 7.0 + Math.random() * 4.0; // 7.0 to 11.0 (inside the new 12-unit walls)
    targetY = 2.0 + Math.random() * 4.5; // 2.0 to 6.5 (inside the room)
  }

  camera.position.set(
    Math.cos(startAngle) * startRadius,
    startY,
    Math.sin(startAngle) * startRadius,
  );
  camera.lookAt(center);

  const resize = () => {
    const w = slide.clientWidth,
      h = slide.clientHeight;
    r.setSize(w, h, false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(slide);

  return {
    tick(visible) {
      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      if (!visible) return;

      timer += dt;

      if (state === "HOLD") {
        if (timer > HOLD_TIME) {
          state = "MOVE";
          timer = 0;
          startAngle = targetAngle;
          startRadius = targetRadius;
          startY = targetY;
          getNextTarget();
        }
      } else if (state === "MOVE") {
        let t = timer / MOVE_TIME;
        if (t >= 1.0) {
          t = 1.0;
          state = "HOLD";
          timer = 0;
        }

        const easeT = easeInOutCubic(t);
        const curAngle = THREE.MathUtils.lerp(startAngle, targetAngle, easeT);
        const curRadius = THREE.MathUtils.lerp(
          startRadius,
          targetRadius,
          easeT,
        );
        const curY = THREE.MathUtils.lerp(startY, targetY, easeT);

        camera.position.set(
          Math.cos(curAngle) * curRadius,
          curY,
          Math.sin(curAngle) * curRadius,
        );
        camera.lookAt(center);
      }

      r.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 3: Concrete single-image depth-based NVS pipeline
   ========================================================= */
export function initDepthBasedNVS() {
  const root = document.getElementById("nvs-slide");
  if (!root) return { tick() {} };

  const board = document.getElementById("nvs-process-board");
  const stage = board;
  const canvas = document.getElementById("nvs-process-canvas");
  const loading = document.getElementById("nvs-loading");
  const title = document.getElementById("nvs-step-title");
  const text = document.getElementById("nvs-step-text");
  const ctx = canvas.getContext("2d", { alpha: false });

  const steps = [
    {
      title: "קלט: תמונת RGB",
      text: "תמונה אחת מהמצלמה, בלי עומק מפורש.",
      mode: "rgb",
    },
    {
      title: "הערכת עומק",
      text: "מפה שחורה-לבנה של קרוב מול רחוק.",
      mode: "depth",
    },
    {
      title: "עומק בצבע",
      text: "אותה מפת עומק, רק בצבע כדי לקרוא אותה מהר יותר.",
      mode: "depthColor",
    },
    {
      title: "הרמת RGB-D",
      text: "כל פיקסל מקבל עומק וזז לנקודה במרחב.",
      mode: "cloud",
    },
    {
      title: "בידוד האובייקט",
      text: "חותכים את המכונית מהרקע ומגדירים מסלול מצלמות סביבו.",
      mode: "warp",
    },
    {
      title: "מסלול מצלמות",
      text: "6 זוויות צפייה שנבחרו סביב האובייקט.",
      mode: "orbit",
    },
    {
      title: "מבטים חדשים",
      text: "אותו אובייקט משוחזר מכמה זוויות מצלמה.",
      mode: "refine",
    },
  ];

  let active = 0;
  let transitionFrom = 0;
  let transitionStart = performance.now();
  let animStart = performance.now();
  let capturedWarpCameraAlpha = 1;
  let sourceCanvas = null;
  let depthCanvas = null;
  let depthColorCanvas = null;
  let pointCloud = [];
  let cloudBounds = null;
  let warpCanvas = null;
  let holeMaskCanvas = null;
  let holeMap = null;
  let refinedCanvas = null;
  let isolatedCanvas = null;
  let isolatedBounds = null;
  let isolatedOutlineCanvas = null;
  let orbitGridCanvas = null;
  let prepareError = null;
  let sourcePromise = null;
  let depthPromise = null;

  function makeCanvas(width, height) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }

  function updateStageSize() {
    const sourceW = sourceCanvas?.width || 504;
    const sourceH = sourceCanvas?.height || 384;
    const naturalWidth = sourceW * 1.55;
    const ratio = sourceW / sourceH;
    const slide = root.closest(".slide");
    const viewportW = slide?.clientWidth || window.innerWidth;
    const viewportH = slide?.clientHeight || window.innerHeight;
    const compact = viewportH <= 820;
    const widthLimit = Math.max(340, viewportW - (compact ? 144 : 56));
    const reservedHeight =
      viewportH <= 660 ? 260 : viewportH <= 720 ? 276 : compact ? 300 : 324;
    const heightLimit = Math.max(280, viewportH - reservedHeight);
    const displayWidth = Math.round(
      Math.max(340, Math.min(naturalWidth, widthLimit, heightLimit * ratio)),
    );
    const nextRatio = `${sourceW} / ${sourceH}`;
    const nextWidth = `${displayWidth}px`;

    if (root.style.getPropertyValue("--nvs-source-ratio") !== nextRatio) {
      root.style.setProperty("--nvs-source-ratio", nextRatio);
    }
    if (root.style.getPropertyValue("--nvs-display-width") !== nextWidth) {
      root.style.setProperty("--nvs-display-width", nextWidth);
    }
  }

  function setLoading(message, show = true) {
    if (!loading) return;
    loading.textContent = message;
    loading.hidden = !show;
  }

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function transitionDuration(from, to) {
    const fromMode = steps[from]?.mode;
    const toMode = steps[to]?.mode;
    if (fromMode === "rgb" && toMode === "depth") return 1.15;
    if (fromMode === "depth" && toMode === "depthColor") return 0.9;
    if (fromMode === "depthColor" && toMode === "cloud") return 1.85;
    if (fromMode === "cloud" && toMode === "warp") return 1.65;
    if (fromMode === "warp" && toMode === "orbit") return 4.5;
    if (fromMode === "orbit" && toMode === "refine") return 2.5;
    return 1.0;
  }

  function transitionProgress(now = performance.now()) {
    if (transitionFrom === active) return 1;
    const elapsed = (now - transitionStart) / 1000;
    return clamp01(elapsed / transitionDuration(transitionFrom, active));
  }

  function imageRect(width, height) {
    return { x: 0, y: 0, width, height };
  }

  async function loadImageCanvas(src, maxSide = 640) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (img.decode) {
      await img.decode();
    } else {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    }

    const scale = Math.min(
      1,
      maxSide /
        Math.max(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
        ),
    );
    const width = Math.max(
      1,
      Math.round((img.naturalWidth || img.width) * scale),
    );
    const height = Math.max(
      1,
      Math.round((img.naturalHeight || img.height) * scale),
    );
    const out = makeCanvas(width, height);
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, 0, 0, width, height);
    return out;
  }

  function fitRect(srcW, srcH, dstW, dstH, padding = 0) {
    const availableW = Math.max(1, dstW - padding * 2);
    const availableH = Math.max(1, dstH - padding * 2);
    const scale = Math.min(availableW / srcW, availableH / srcH);
    const width = srcW * scale;
    const height = srcH * scale;
    return {
      x: padding + (availableW - width) / 2,
      y: padding + (availableH - height) / 2,
      width,
      height,
    };
  }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, canvas.clientWidth | 0);
    const height = Math.max(1, canvas.clientHeight | 0);
    const pixelW = Math.round(width * dpr);
    const pixelH = Math.round(height * dpr);
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function drawCanvasContained(src, dstW, dstH, padding = 34) {
    const rect = fitRect(src.width, src.height, dstW, dstH, padding);
    ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height);
    return rect;
  }

  function getImageDataFrom(source) {
    return source
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, source.width, source.height);
  }

  function isObjectPixel(r, g, b, a) {
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const darkness = 255 - Math.min(r, g, b);
    return a > 16 && (darkness > 18 || chroma > 14);
  }

  function findNonWhiteBounds(src) {
    const image = getImageDataFrom(src);
    const { data, width, height } = image;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (isObjectPixel(r, g, b, a)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < 0) {
      return { x: 0, y: 0, width, height };
    }

    const pad = 10;
    const x = Math.max(0, minX - pad);
    const y = Math.max(0, minY - pad);
    const right = Math.min(width, maxX + pad + 1);
    const bottom = Math.min(height, maxY + pad + 1);
    return { x, y, width: right - x, height: bottom - y };
  }

  function buildObjectOutline(src, bounds) {
    const sourceImage = getImageDataFrom(src);
    const srcData = sourceImage.data;
    const width = bounds.width;
    const height = bounds.height;
    const mask = new Uint8Array(width * height);
    const exterior = new Uint8Array(width * height);
    const edge = new Uint8Array(width * height);
    const queue = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = bounds.x + x;
        const sy = bounds.y + y;
        const srcIdx = (sy * sourceImage.width + sx) * 4;
        mask[y * width + x] = isObjectPixel(
          srcData[srcIdx],
          srcData[srcIdx + 1],
          srcData[srcIdx + 2],
          srcData[srcIdx + 3],
        )
          ? 1
          : 0;
      }
    }

    const addExterior = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = y * width + x;
      if (mask[idx] || exterior[idx]) return;
      exterior[idx] = 1;
      queue.push(idx);
    };

    for (let x = 0; x < width; x++) {
      addExterior(x, 0);
      addExterior(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      addExterior(0, y);
      addExterior(width - 1, y);
    }

    for (let q = 0; q < queue.length; q++) {
      const idx = queue[q];
      const x = idx % width;
      const y = Math.floor(idx / width);
      addExterior(x - 1, y);
      addExterior(x + 1, y);
      addExterior(x, y - 1);
      addExterior(x, y + 1);
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (exterior[idx]) continue;
        if (
          exterior[idx - 1] ||
          exterior[idx + 1] ||
          exterior[idx - width] ||
          exterior[idx + width] ||
          exterior[idx - width - 1] ||
          exterior[idx - width + 1] ||
          exterior[idx + width - 1] ||
          exterior[idx + width + 1]
        ) {
          edge[idx] = 1;
        }
      }
    }

    const outline = makeCanvas(width, height);
    const outlineCtx = outline.getContext("2d");
    const outlineImage = outlineCtx.createImageData(width, height);
    const out = outlineImage.data;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!edge[y * width + x]) continue;
        const outIdx = (y * width + x) * 4;
        out[outIdx] = 255;
        out[outIdx + 1] = 90;
        out[outIdx + 2] = 54;
        out[outIdx + 3] = 190;
      }
    }

    outlineCtx.putImageData(outlineImage, 0, 0);
    return outline;
  }

  function depthAt(depthData, idx) {
    return depthData.data[idx * 4] / 255;
  }

  function buildPointCloud(rgbCanvas, depth) {
    const rgb = getImageDataFrom(rgbCanvas);
    const dep = getImageDataFrom(depth);
    const width = rgbCanvas.width;
    const height = rgbCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const focal = width * 0.95;
    const step = Math.max(3, Math.floor(Math.max(width, height) / 200));
    const points = [];

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = y * width + x;
        const d = depthAt(dep, idx);
        const z = 0.85 + (1 - d) * 2.55;
        const wx = ((x - cx) / focal) * z;
        const wy = ((y - cy) / focal) * z;
        const colorIdx = idx * 4;
        points.push({
          sx: x,
          sy: y,
          depth: d,
          x: wx,
          y: wy,
          z,
          r: rgb.data[colorIdx],
          g: rgb.data[colorIdx + 1],
          b: rgb.data[colorIdx + 2],
        });
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    cloudBounds = {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + maxZ) / 2,
      sizeX: maxX - minX,
      sizeY: maxY - minY,
      sizeZ: maxZ - minZ,
      size: Math.max(maxX - minX, maxY - minY, maxZ - minZ),
    };

    return points;
  }

  function attachDepthColors(points) {
    if (!depthColorCanvas) return;
    const depthColor = getImageDataFrom(depthColorCanvas);
    const width = depthColorCanvas.width;
    const height = depthColorCanvas.height;

    for (const point of points) {
      const x = Math.max(
        0,
        Math.min(
          width - 1,
          Math.round((point.sx / sourceCanvas.width) * width),
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          height - 1,
          Math.round((point.sy / sourceCanvas.height) * height),
        ),
      );
      const idx = (y * width + x) * 4;
      point.depthR = depthColor.data[idx];
      point.depthG = depthColor.data[idx + 1];
      point.depthB = depthColor.data[idx + 2];
    }
  }

  function buildRefinedResult(warpCanvasIn, holesMask) {
    const width = warpCanvasIn.width;
    const height = warpCanvasIn.height;
    const srcCtx = warpCanvasIn.getContext("2d", { willReadFrequently: true });
    const data = srcCtx.getImageData(0, 0, width, height);
    const pixels = data.data;
    const wasHole = new Uint8Array(width * height);
    for (let i = 0; i < wasHole.length; i++) wasHole[i] = holesMask[i] ? 0 : 1;
    const filled = new Uint8Array(holesMask);

    // Wavefront BFS: each hole pixel takes the color of the nearest filled pixel.
    // Seed the queue with every filled pixel that borders a hole.
    let frontier = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!filled[idx]) continue;
        let bordersHole = false;
        for (let dy = -1; dy <= 1 && !bordersHole; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (!filled[ny * width + nx]) {
              bordersHole = true;
              break;
            }
          }
        }
        if (bordersHole) frontier.push(idx);
      }
    }

    while (frontier.length > 0) {
      const next = [];
      for (let i = 0; i < frontier.length; i++) {
        const srcIdx = frontier[i];
        const srcY = (srcIdx / width) | 0;
        const srcX = srcIdx - srcY * width;
        const srcBase = srcIdx * 4;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = srcY + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = srcX + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (filled[nIdx]) continue;
            filled[nIdx] = 1;
            const nBase = nIdx * 4;
            pixels[nBase] = pixels[srcBase];
            pixels[nBase + 1] = pixels[srcBase + 1];
            pixels[nBase + 2] = pixels[srcBase + 2];
            pixels[nBase + 3] = 255;
            next.push(nIdx);
          }
        }
      }
      frontier = next;
    }

    // Smooth previously-hole regions so the wavefront streaks blend out.
    // Two passes of a 3x3 box blur, applied only to was-hole pixels.
    const buffer = new Uint8ClampedArray(pixels);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (!wasHole[idx]) continue;
          let r = 0,
            g = 0,
            b = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nBase = ((y + dy) * width + (x + dx)) * 4;
              r += pixels[nBase];
              g += pixels[nBase + 1];
              b += pixels[nBase + 2];
            }
          }
          const base = idx * 4;
          buffer[base] = r / 9;
          buffer[base + 1] = g / 9;
          buffer[base + 2] = b / 9;
          buffer[base + 3] = 255;
        }
      }
      pixels.set(buffer);
    }

    const out = makeCanvas(width, height);
    out.getContext("2d").putImageData(data, 0, 0);
    return out;
  }

  function writePixel(image, index, r, g, b, a = 255) {
    const base = index * 4;
    image.data[base] = r;
    image.data[base + 1] = g;
    image.data[base + 2] = b;
    image.data[base + 3] = a;
  }

  // Stage 4 used to "reproject to the right" with a 24° yaw + shift. With the
  // new object-centric pipeline (stage 5 = 6 orbit views from Zero123++) that
  // specific direction doesn't belong anymore - the depth-based projection just
  // collapses the cloud back to the source image plane, no camera movement.
  const TARGET_YAW = 0;
  const TARGET_SHIFT_X = 0;
  const TARGET_SHIFT_Z = 0;

  function buildTargetWarp(rgbCanvas, depth) {
    const width = rgbCanvas.width;
    const height = rgbCanvas.height;
    const rgb = getImageDataFrom(rgbCanvas);
    const dep = getImageDataFrom(depth);
    const outCanvas = makeCanvas(width, height);
    const maskCanvas = makeCanvas(width, height);
    const outCtx = outCanvas.getContext("2d");
    const maskCtx = maskCanvas.getContext("2d");
    const outImage = outCtx.createImageData(width, height);
    const maskImage = maskCtx.createImageData(width, height);
    const zBuffer = new Float32Array(width * height);
    const filled = new Uint8Array(width * height);

    zBuffer.fill(Number.POSITIVE_INFINITY);

    for (let i = 0; i < width * height; i++) {
      writePixel(outImage, i, 246, 247, 250, 255);
      writePixel(maskImage, i, 0, 0, 0, 0);
    }

    const focal = width * 0.95;
    const cx = width / 2;
    const cy = height / 2;
    const cos = Math.cos(TARGET_YAW);
    const sin = Math.sin(TARGET_YAW);

    // Forward-warp each source pixel with a 2x2 splat to avoid 1-pixel sampling gaps
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const d = depthAt(dep, idx);
        const z = 0.85 + (1 - d) * 2.55;
        const worldX = ((x - cx) / focal) * z;
        const worldY = ((y - cy) / focal) * z;
        const worldZ = z;
        const camX = cos * worldX + sin * worldZ + TARGET_SHIFT_X;
        const camZ = -sin * worldX + cos * worldZ + TARGET_SHIFT_Z;
        const camY = worldY;

        if (camZ <= 0.2) continue;

        const uF = (focal * camX) / camZ + cx;
        const vF = (focal * camY) / camZ + cy;
        const u0 = Math.floor(uF);
        const v0 = Math.floor(vF);
        const srcBase = idx * 4;

        for (let dv = 0; dv <= 1; dv++) {
          const v = v0 + dv;
          if (v < 0 || v >= height) continue;
          for (let du = 0; du <= 1; du++) {
            const u = u0 + du;
            if (u < 0 || u >= width) continue;
            const dst = v * width + u;
            if (camZ >= zBuffer[dst]) continue;
            zBuffer[dst] = camZ;
            filled[dst] = 1;
            writePixel(
              outImage,
              dst,
              rgb.data[srcBase],
              rgb.data[srcBase + 1],
              rgb.data[srcBase + 2],
              255,
            );
          }
        }
      }
    }

    // Close 1-pixel speckle gaps: if a hole pixel has >=5 filled neighbors,
    // average them. Real occlusion holes have far fewer filled neighbors and stay.
    for (let pass = 0; pass < 2; pass++) {
      const next = new Uint8Array(filled);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (filled[idx]) continue;
          let r = 0,
            g = 0,
            b = 0,
            count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = (y + dy) * width + (x + dx);
              if (!filled[nIdx]) continue;
              const base = nIdx * 4;
              r += outImage.data[base];
              g += outImage.data[base + 1];
              b += outImage.data[base + 2];
              count++;
            }
          }
          if (count >= 5) {
            const base = idx * 4;
            outImage.data[base] = r / count;
            outImage.data[base + 1] = g / count;
            outImage.data[base + 2] = b / count;
            outImage.data[base + 3] = 255;
            next[idx] = 1;
          }
        }
      }
      filled.set(next);
    }

    for (let i = 0; i < width * height; i++) {
      if (filled[i]) {
        writePixel(maskImage, i, 0, 0, 0, 0);
      } else {
        writePixel(maskImage, i, 255, 90, 54, 230);
      }
    }

    outCtx.putImageData(outImage, 0, 0);
    maskCtx.putImageData(maskImage, 0, 0);

    return { warp: outCanvas, mask: maskCanvas, holes: filled };
  }

  // Loads the assets generated offline:
  //   - redtoyota_isolated.jpg: source RGB with the car cut out of its parking-lot
  //     background (via rembg). Used to dissolve the background away during the
  //     4→5 transition.
  //   - redtoyota_orbit_grid.jpg: 640×960 grid of 6 novel views around the car
  //     (from Zero123++), laid out as 2 cols × 3 rows of 320×320 cells.
  // Returns true if both loaded; the slide falls back to the BFS hole-fill when
  // either is missing.
  async function loadOrbitAssets() {
    const [iso, grid] = await Promise.all([
      loadImageCanvas("assets/images/redtoyota_isolated.jpg").catch(() => null),
      loadImageCanvas("assets/images/redtoyota_orbit_grid.jpg", 960).catch(
        () => null,
      ),
    ]);
    isolatedCanvas = iso;
    isolatedBounds = iso ? findNonWhiteBounds(iso) : null;
    isolatedOutlineCanvas =
      iso && isolatedBounds ? buildObjectOutline(iso, isolatedBounds) : null;
    orbitGridCanvas = grid;
    return Boolean(iso && grid);
  }

  // Cell offsets (sx, sy) inside the 640×960 orbit_grid image. Each cell is 320×320.
  // Order matches view1..view6 in scripts/render_orbit_view.py (azimuths
  // 30, 90, 150, 210, 270, 330 - going round the car).
  const ORBIT_VIEW_OFFSETS = [
    [0, 0],
    [320, 0],
    [0, 320],
    [320, 320],
    [0, 640],
    [320, 640],
  ];

  // Compute one cell of the 3×2 display grid (3 cols, 2 rows) inside the stage canvas.
  function gridCellRect(i, width, height, pad = 8) {
    const COLS = 3;
    const ROWS = 2;
    const cellW = (width - pad * (COLS + 1)) / COLS;
    const cellH = (height - pad * (ROWS + 1)) / ROWS;
    const row = Math.floor(i / COLS);
    const col = i - row * COLS;
    return {
      x: pad + col * (cellW + pad),
      y: pad + row * (cellH + pad),
      w: cellW,
      h: cellH,
    };
  }

  // Draw one of the 6 orbit views from the grid at a target rect, aspect-preserving.
  function drawOrbitView(viewIdx, x, y, w, h) {
    if (!orbitGridCanvas) return;
    const [sx, sy] = ORBIT_VIEW_OFFSETS[viewIdx];
    const fit = fitRect(320, 320, w, h, 0);
    ctx.drawImage(
      orbitGridCanvas,
      sx,
      sy,
      320,
      320,
      x + fit.x,
      y + fit.y,
      fit.width,
      fit.height,
    );
  }

  function drawOrbitGrid(width, height) {
    for (let i = 0; i < 6; i++) {
      const cell = gridCellRect(i, width, height);
      drawOrbitView(i, cell.x, cell.y, cell.w, cell.h);
    }
  }

  function ensureSourceImage() {
    if (sourcePromise) return sourcePromise;
    sourcePromise = (async () => {
      setLoading("Loading input image...", true);
      sourceCanvas = await loadImageCanvas("assets/images/redtoyota.jpg");
      root.style.setProperty("--nvs-source-width", `${sourceCanvas.width}px`);
      updateStageSize();
      setLoading("", false);
      render();
      setTimeout(() => {
        ensureDepthArtifacts().catch((err) => {
          console.warn("background depth preparation failed", err);
        });
      }, 250);
      return sourceCanvas;
    })().catch((err) => {
      sourcePromise = null;
      throw err;
    });
    return sourcePromise;
  }

  function ensureDepthArtifacts() {
    if (depthPromise) return depthPromise;
    depthPromise = (async () => {
      await ensureSourceImage();

      if (active > 0) setLoading("Loading generated depth maps...", true);
      [depthCanvas, depthColorCanvas] = await Promise.all([
        loadImageCanvas(
          "assets/generated/single_image_pipeline/02_depth_gray.png",
          sourceCanvas.width,
        ),
        loadImageCanvas(
          "assets/generated/single_image_pipeline/03_depth_colormap.png",
          sourceCanvas.width,
        ),
      ]);

      if (active > 0) setLoading("Building RGB-D proxy...", true);
      pointCloud = buildPointCloud(sourceCanvas, depthCanvas);
      attachDepthColors(pointCloud);
      const warp = buildTargetWarp(sourceCanvas, depthCanvas);
      warpCanvas = warp.warp;
      holeMaskCanvas = warp.mask;
      holeMap = warp.holes;
      if (active > 0) setLoading("Loading object-centric model views...", true);
      const orbitOk = await loadOrbitAssets();
      // Fall back to in-browser BFS hole-fill when the offline assets are missing
      // (so the slide still works before scripts/render_orbit_view.py has been run).
      refinedCanvas = orbitOk ? null : buildRefinedResult(warpCanvas, holeMap);
      setLoading("", false);
      if (active > 0) {
        transitionFrom = Math.max(0, active - 1);
        transitionStart = performance.now();
        animStart = transitionStart;
      }
      render();
    })().catch((err) => {
      depthPromise = null;
      throw err;
    });
    return depthPromise;
  }

  async function prepareRealArtifacts(needsDepth = false) {
    try {
      if (needsDepth) {
        if (!depthCanvas) setLoading("Loading generated depth maps...", true);
        await ensureDepthArtifacts();
      } else await ensureSourceImage();
    } catch (err) {
      prepareError = err;
      console.error("failed to prepare depth-based NVS slide", err);
      setLoading("Depth assets failed to load.", true);
      render();
    }
  }

  function drawSpinner(width, height, t) {
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(108,92,231,0.28)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#6c5ce7";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 28, t * 4, t * 4 + Math.PI * 1.25);
    ctx.stroke();
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.font = "14px JetBrains Mono, monospace";
    ctx.fillStyle = "#555";
    ctx.fillText("running real depth inference", width / 2, height / 2 + 58);
    ctx.restore();
  }

  function drawRgb(width, height) {
    if (!sourceCanvas) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
  }

  function drawDepth(width, height, t, progressOverride = null) {
    if (!sourceCanvas || !depthCanvas) {
      drawRgb(width, height);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    const rect = imageRect(width, height);
    ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.width, rect.height);
    const wipe =
      progressOverride == null ? Math.min(1, 0.18 + t * 0.8) : progressOverride;
    if (wipe >= 0.995) {
      ctx.drawImage(depthCanvas, rect.x, rect.y, rect.width, rect.height);
    } else {
      const revealWidth = Math.min(rect.width, rect.width * wipe + 3);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, revealWidth, rect.height);
      ctx.clip();
      ctx.drawImage(depthCanvas, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(rect.x + revealWidth - 1, rect.y, 2, rect.height);
    }
  }

  function drawRgbToDepth(width, height, t, progress) {
    drawRgb(width, height);
    if (!depthCanvas) return;
    const p = easeInOutCubic(progress);
    const rect = imageRect(width, height);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.drawImage(depthCanvas, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  function drawDepthColor(width, height, t) {
    if (!depthColorCanvas) {
      drawDepth(width, height, t, 1);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    drawDepthColorImage(width, height);
  }

  function drawDepthColorImage(width, height) {
    const rect = imageRect(width, height);
    ctx.drawImage(depthColorCanvas, rect.x, rect.y, rect.width, rect.height);
  }

  function drawDepthToDepthColor(width, height, t, progress) {
    drawDepth(width, height, t, 1);
    if (!depthColorCanvas) return;
    const p = easeInOutCubic(progress);
    ctx.save();
    ctx.globalAlpha = p;
    drawDepthColorImage(width, height);
    ctx.restore();
  }

  function drawDepthColorToCloud(width, height, t, progress) {
    if (!pointCloud.length || !sourceCanvas) {
      drawDepthColor(width, height, t);
      return;
    }

    const pixelP = easeInOutCubic(clamp01(progress / 0.28));
    const moveP = easeInOutCubic(clamp01((progress - 0.18) / 0.82));
    const colorP = easeInOutCubic(clamp01((progress - 0.32) / 0.52));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    const rect = imageRect(width, height);

    ctx.save();
    ctx.globalAlpha = 1 - pixelP;
    if (depthColorCanvas) drawDepthColorImage(width, height);
    else drawDepth(width, height, t, 1);
    ctx.restore();

    const cellW = Math.max(2, rect.width / (sourceCanvas.width / 6));
    const baseSize = Math.max(3.0, Math.min(width, height) / 170);
    const refZ = cloudBounds ? cloudBounds.size * 0.95 : 2;

    const particles = pointCloud.map((point) => {
      const startX = rect.x + (point.sx / sourceCanvas.width) * rect.width;
      const startY = rect.y + (point.sy / sourceCanvas.height) * rect.height;
      const end = cloudProjection(point, width, height, t, true);
      return { point, startX, startY, end };
    });

    particles.sort((a, b) => b.end.z - a.end.z);

    ctx.save();
    ctx.globalAlpha = pixelP;
    for (const item of particles) {
      const x = lerp(item.startX, item.end.px, moveP);
      const y = lerp(item.startY, item.end.py, moveP);
      if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
      const sizeScale = Math.min(1.7, refZ / Math.max(item.end.z, 0.1));
      const endSize = baseSize * sizeScale;
      const size = lerp(cellW, endSize, moveP);
      drawDepthColorPixel(item.point, x, y, size, colorP);
    }
    ctx.restore();
  }

  function cloudProjection(point, width, height, _t, animated = true) {
    if (!cloudBounds) return { px: 0, py: 0, z: 1 };

    const dx = point.x - cloudBounds.cx;
    const dy = point.y - cloudBounds.cy;
    const dz = point.z - cloudBounds.cz;

    // Use wall-clock time so the orbit phase is continuous across step transitions
    // (per-step `animStart` reset would otherwise snap the cloud back to yaw=0).
    const orbitT = performance.now() / 1000;
    const yaw = animated ? Math.sin(orbitT * 0.45) * 0.42 : 0.28;
    const pitch = animated ? Math.cos(orbitT * 0.31) * 0.07 - 0.04 : 0.0;

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const xRot = cosY * dx + sinY * dz;
    const zRot = -sinY * dx + cosY * dz;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const yRot = cosP * dy - sinP * zRot;
    const zRot2 = sinP * dy + cosP * zRot;

    const camDist = cloudBounds.size * 0.95;
    const camZ = zRot2 + camDist;

    if (camZ <= 0.05) {
      return { px: -9999, py: -9999, z: camZ };
    }

    // Adaptive focal: scale so the cloud fills ~90% of whichever canvas axis is most constrained
    const halfWorldX = (cloudBounds.sizeX / 2) * 1.12;
    const halfWorldY = (cloudBounds.sizeY / 2) * 1.05;
    const focalX = (width * 0.46 * camDist) / halfWorldX;
    const focalY = (height * 0.46 * camDist) / halfWorldY;
    const focal = Math.min(focalX, focalY);

    const px = width / 2 + (focal * xRot) / camZ;
    const py = height / 2 + (focal * yRot) / camZ;

    return { px, py, z: camZ };
  }

  function targetProjection(point) {
    if (!sourceCanvas) return null;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const focal = width * 0.95;
    const cx = width / 2;
    const cy = height / 2;
    const cos = Math.cos(TARGET_YAW);
    const sin = Math.sin(TARGET_YAW);
    const camX = cos * point.x + sin * point.z + TARGET_SHIFT_X;
    const camZ = -sin * point.x + cos * point.z + TARGET_SHIFT_Z;
    const camY = point.y;

    if (camZ <= 0.2) return null;

    const u = (focal * camX) / camZ + cx;
    const v = (focal * camY) / camZ + cy;
    if (u < 0 || u >= width || v < 0 || v >= height) return null;
    return { u, v, z: camZ };
  }

  function drawMovingPixel(point, x, y, size, depthMix) {
    const g = Math.round(point.depth * 255);
    const r = Math.round(lerp(g, point.r, depthMix));
    const green = Math.round(lerp(g, point.g, depthMix));
    const b = Math.round(lerp(g, point.b, depthMix));
    ctx.fillStyle = `rgb(${r},${green},${b})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function drawDepthColorPixel(point, x, y, size, rgbMix) {
    const r = Math.round(lerp(point.depthR ?? point.r, point.r, rgbMix));
    const g = Math.round(lerp(point.depthG ?? point.g, point.g, rgbMix));
    const b = Math.round(lerp(point.depthB ?? point.b, point.b, rgbMix));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function drawDepthToCloud(width, height, t, progress) {
    if (!pointCloud.length || !sourceCanvas) {
      drawDepth(width, height, t, 1);
      return;
    }

    const pixelP = easeInOutCubic(clamp01(progress / 0.28));
    const moveP = easeInOutCubic(clamp01((progress - 0.18) / 0.82));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    const rect = imageRect(width, height);

    ctx.save();
    ctx.globalAlpha = 1 - pixelP;
    ctx.drawImage(depthCanvas, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();

    const cellW = Math.max(2, rect.width / (sourceCanvas.width / 6));
    const baseSize = Math.max(3.0, Math.min(width, height) / 170);
    const refZ = cloudBounds ? cloudBounds.size * 0.95 : 2;

    const particles = pointCloud.map((point) => {
      const startX = rect.x + (point.sx / sourceCanvas.width) * rect.width;
      const startY = rect.y + (point.sy / sourceCanvas.height) * rect.height;
      const end = cloudProjection(point, width, height, t, true);
      return { point, startX, startY, end };
    });

    particles.sort((a, b) => b.end.z - a.end.z);

    for (const item of particles) {
      const x = lerp(item.startX, item.end.px, moveP);
      const y = lerp(item.startY, item.end.py, moveP);
      if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
      const sizeScale = Math.min(1.7, refZ / Math.max(item.end.z, 0.1));
      const endSize = baseSize * sizeScale;
      const size = lerp(cellW, endSize, moveP);
      drawMovingPixel(item.point, x, y, size, moveP);
    }
  }

  function drawCloud(width, height, t) {
    if (!pointCloud.length) {
      drawDepth(width, height, t);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    const baseSize = Math.max(3.0, Math.min(width, height) / 170);
    const refZ = cloudBounds ? cloudBounds.size * 0.95 : 2;

    const projected = pointCloud
      .map((point) => ({
        point,
        ...cloudProjection(point, width, height, t, true),
      }))
      .filter(
        ({ px, py }) =>
          px >= -10 && px <= width + 10 && py >= -10 && py <= height + 10,
      );

    projected.sort((a, b) => b.z - a.z);

    for (const item of projected) {
      const sizeScale = Math.min(1.7, refZ / Math.max(item.z, 0.1));
      const size = baseSize * sizeScale;
      ctx.globalAlpha = 0.92;
      drawMovingPixel(item.point, item.px, item.py, size, 1);
    }
    ctx.globalAlpha = 1;
  }

  function imageSplatSize(width, height) {
    if (!sourceCanvas) return 4;
    const rect = imageRect(width, height);
    const fit = Math.min(
      rect.width / sourceCanvas.width,
      rect.height / sourceCanvas.height,
    );
    const step = Math.max(
      3,
      Math.floor(Math.max(sourceCanvas.width, sourceCanvas.height) / 200),
    );
    return step * fit * 1.4;
  }

  // Project the point cloud from a camera that is linearly interpolated between
  // the source view (alpha=0, identity - recreates the original image) and the
  // target view (alpha=1 - the novel viewpoint). Splats each point onto the
  // canvas. Holes where occluded background would be appear naturally.
  function drawSourceProjection(width, height, alpha, baseSize) {
    if (!pointCloud.length || !sourceCanvas) return;

    const focal = sourceCanvas.width * 0.95;
    const cx = sourceCanvas.width / 2;
    const cy = sourceCanvas.height / 2;
    const yaw = TARGET_YAW * alpha;
    const shiftX = TARGET_SHIFT_X * alpha;
    const shiftZ = TARGET_SHIFT_Z * alpha;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    const rect = imageRect(width, height);
    const scaleX = rect.width / sourceCanvas.width;
    const scaleY = rect.height / sourceCanvas.height;

    const projected = [];
    for (let i = 0; i < pointCloud.length; i++) {
      const pt = pointCloud[i];
      const camX = cos * pt.x + sin * pt.z + shiftX;
      const camZ = -sin * pt.x + cos * pt.z + shiftZ;
      if (camZ <= 0.2) continue;
      const u = (focal * camX) / camZ + cx;
      const v = (focal * pt.y) / camZ + cy;
      if (u < -40 || u >= sourceCanvas.width + 40) continue;
      if (v < -40 || v >= sourceCanvas.height + 40) continue;
      projected.push({ pt, u, v, z: camZ });
    }

    projected.sort((a, b) => b.z - a.z);

    for (let i = 0; i < projected.length; i++) {
      const item = projected[i];
      const x = rect.x + item.u * scaleX;
      const y = rect.y + item.v * scaleY;
      if (x < -10 || x > width + 10 || y < -10 || y > height + 10) continue;
      const sizeScale = Math.min(1.4, Math.max(0.7, 2.0 / item.z));
      const size = baseSize * sizeScale;
      const pt = item.pt;
      ctx.fillStyle = `rgb(${pt.r},${pt.g},${pt.b})`;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  // One-shot timeline for stage 4. `localT` is seconds since the cloud→warp
  // transition completed. A single smootherstep across the whole 3s phase -
  // f'(0) = f''(0) = f'''(0) = 0, so motion ramps up with no perceptual snap.
  // For the first ~0.4s alpha stays under 0.01 (effectively the source view),
  // which gives the "hold on the original" moment without a hard hold→rotate edge.
  function warpStageState(localT) {
    if (localT >= 3.0) return { cameraAlpha: 1 };
    const x = localT / 3.0;
    return { cameraAlpha: x * x * x * (x * (x * 6 - 15) + 10) };
  }

  function isolatedCropRect() {
    if (!isolatedCanvas) return null;
    return (
      isolatedBounds || {
        x: 0,
        y: 0,
        width: isolatedCanvas.width,
        height: isolatedCanvas.height,
      }
    );
  }

  function objectStageRect(width, height) {
    const crop = isolatedCropRect();
    if (!crop) return null;
    return fitRect(crop.width, crop.height, width, height, 44);
  }

  function drawIsolatedObject(rect) {
    const crop = isolatedCropRect();
    if (!crop || !isolatedCanvas) return;
    ctx.drawImage(
      isolatedCanvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
  }

  function drawObjectHighlight(rect) {
    if (!isolatedOutlineCanvas) return;
    ctx.save();
    ctx.drawImage(
      isolatedOutlineCanvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
    ctx.restore();
  }

  function drawOrbitCamera(x, y, targetX, targetY, scale, active) {
    const angle = Math.atan2(targetY - y, targetX - x);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineWidth = active ? 2.1 * scale : 1.4 * scale;
    ctx.strokeStyle = active ? "rgba(255,90,54,0.82)" : "rgba(30,38,58,0.36)";
    ctx.fillStyle = active ? "rgba(255,90,54,0.95)" : "#fff";
    ctx.beginPath();
    ctx.moveTo(7 * scale, -4 * scale);
    ctx.lineTo(28 * scale, -13 * scale);
    ctx.moveTo(7 * scale, 4 * scale);
    ctx.lineTo(28 * scale, 13 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draws only the orbit ellipse + camera markers at the given alpha.
  // Does NOT draw a background fill or the isolated car - use on top of an
  // existing car render so the cameras can fade in independently.
  function drawOrbitOverlay(width, height, t, alpha) {
    if (alpha <= 0) return;
    const rect = objectStageRect(width, height);
    if (!rect) return;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height * 0.54;
    const radiusX = Math.min(width * 0.44, rect.width * 0.6);
    const radiusY = Math.min(height * 0.24, rect.height * 0.43);
    const activeMarker = Math.floor((((t * 0.55) % 6) + 6) % 6);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(108,92,231,0.28)";
    ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.004);
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI + i * (Math.PI / 3);
      const x = centerX + Math.cos(angle) * radiusX;
      const y = centerY + Math.sin(angle) * radiusY;
      const isActive = i === activeMarker;
      const pulse = isActive ? 1 + Math.sin(t * 4.0) * 0.12 : 1;
      drawOrbitCamera(x, y, centerX, centerY, pulse, isActive);
    }
    ctx.restore();
  }

  function drawObjectOrbit(width, height, t, alpha = 1) {
    if (alpha <= 0) return;
    if (!isolatedCanvas) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      if (sourceCanvas) drawCanvasContained(sourceCanvas, width, height, 0);
      ctx.restore();
      return;
    }

    const rect = objectStageRect(width, height);
    if (!rect) return;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height * 0.54;
    const radiusX = Math.min(width * 0.44, rect.width * 0.6);
    const radiusY = Math.min(height * 0.24, rect.height * 0.43);
    const activeMarker = Math.floor((((t * 0.55) % 6) + 6) % 6);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    drawIsolatedObject(rect);

    ctx.save();
    ctx.strokeStyle = "rgba(108,92,231,0.28)";
    ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.004);
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI + i * (Math.PI / 3);
      const x = centerX + Math.cos(angle) * radiusX;
      const y = centerY + Math.sin(angle) * radiusY;
      const isActive = i === activeMarker;
      const pulse = isActive ? 1 + Math.sin(t * 4.0) * 0.12 : 1;
      drawOrbitCamera(x, y, centerX, centerY, pulse, isActive);
    }

    drawObjectHighlight(rect);
    ctx.restore();
  }

  function drawCloudToWarp(width, height, t, progress) {
    if (!pointCloud.length || !sourceCanvas || !cloudBounds) {
      drawCloud(width, height, t);
      return;
    }

    const p = easeInOutCubic(progress);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    const rect = imageRect(width, height);
    const scaleX = rect.width / sourceCanvas.width;
    const scaleY = rect.height / sourceCanvas.height;

    const cloudBase = Math.max(3.0, Math.min(width, height) / 170);
    const imageBase = imageSplatSize(width, height);
    const baseSize = lerp(cloudBase, imageBase, p);

    const projected = [];
    for (let i = 0; i < pointCloud.length; i++) {
      const pt = pointCloud[i];
      const cloud = cloudProjection(pt, width, height, t, true);
      const sourceX = rect.x + pt.sx * scaleX;
      const sourceY = rect.y + pt.sy * scaleY;
      projected.push({
        pt,
        x: lerp(cloud.px, sourceX, p),
        y: lerp(cloud.py, sourceY, p),
        z: lerp(cloud.z, pt.z, p),
        scale: lerp(1, Math.min(1.4, Math.max(0.7, 2.0 / pt.z)), p),
      });
    }

    projected.sort((a, b) => b.z - a.z);

    for (let i = 0; i < projected.length; i++) {
      const item = projected[i];
      if (
        item.x < -10 ||
        item.x > width + 10 ||
        item.y < -10 ||
        item.y > height + 10
      )
        continue;
      const size = baseSize * item.scale;
      const pt = item.pt;
      ctx.fillStyle = `rgb(${pt.r},${pt.g},${pt.b})`;
      ctx.fillRect(item.x - size / 2, item.y - size / 2, size, size);
    }
  }

  function drawWarp(width, height, t) {
    if (!pointCloud.length || !sourceCanvas) {
      drawCloud(width, height, t);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    // `t` includes the cloud→warp transition time. Subtract it so the stage 4
    // timeline starts cleanly at 0 when the reconstruction finishes.
    const localT = Math.max(0, t - transitionDuration(transitionFrom, active));
    const { cameraAlpha } = warpStageState(localT);
    drawSourceProjection(
      width,
      height,
      cameraAlpha,
      imageSplatSize(width, height),
    );
  }

  function drawRefine(width, height, t) {
    // Stage 6 displays the six orbit views generated by Zero123++ in a 3×2 grid
    // on white. (Falls back to the BFS refined canvas when offline assets are missing.)
    if (orbitGridCanvas) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      drawOrbitGrid(width, height);
      return;
    }
    if (!refinedCanvas) {
      drawWarp(width, height, t);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    drawCanvasContained(refinedCanvas, width, height, 0);
  }

  // splitT: 0 = six copies overlapping at the isolated-object rect; 1 = six cells in the grid.
  // For the second half of the animation each copy crossfades from the isolated car
  // into its specific orbit view, so the car visibly "rotates" into a different angle.
  function drawSplitToGrid(width, height, splitT) {
    const eased = easeInOutCubic(splitT);
    const crop = isolatedCropRect();
    const srcFit = objectStageRect(width, height);
    if (!crop || !srcFit) return;

    for (let i = 0; i < 6; i++) {
      const cell = gridCellRect(i, width, height);
      const tgtFit = fitRect(320, 320, cell.w, cell.h, 0);
      const tgtX = cell.x + tgtFit.x;
      const tgtY = cell.y + tgtFit.y;
      const tgtW = tgtFit.width;
      const tgtH = tgtFit.height;

      const curX = lerp(srcFit.x, tgtX, eased);
      const curY = lerp(srcFit.y, tgtY, eased);
      const curW = lerp(srcFit.width, tgtW, eased);
      const curH = lerp(srcFit.height, tgtH, eased);

      if (splitT < 0.5) {
        ctx.drawImage(
          isolatedCanvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          curX,
          curY,
          curW,
          curH,
        );
      } else {
        const cf = (splitT - 0.5) / 0.5;
        ctx.save();
        ctx.globalAlpha = 1 - cf;
        ctx.drawImage(
          isolatedCanvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          curX,
          curY,
          curW,
          curH,
        );
        ctx.restore();
        const [sx, sy] = ORBIT_VIEW_OFFSETS[i];
        ctx.save();
        ctx.globalAlpha = cf;
        ctx.drawImage(
          orbitGridCanvas,
          sx,
          sy,
          320,
          320,
          curX,
          curY,
          curW,
          curH,
        );
        ctx.restore();
      }
    }
  }

  // Transition: warp (pixel projection) → orbit (cameras circle).
  // Four beats over 4.5 s:
  //   0.00 .. P1  (~1.0 s)  warp pixels crossfade into the original photo.
  //   P1  .. P2  (~1.75 s)  hold the full source image.
  //   P2  .. P3  (~1.0 s)  background fades to white, isolated car appears.
  //   P3  .. 1.0 (~0.75 s)  orbit ellipse + cameras fade in.
  function drawWarpToOrbit(width, height, t, progress) {
    if (!isolatedCanvas) {
      // Fallback: no orbit assets - just show the warp projection.
      drawWarp(width, height, t);
      return;
    }

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    // Phase 1 is split into two sequential sub-phases so motion and opacity never
    // change at the same time - eliminating the "jump" visual artefact.
    const P1a = 0.09; // sub-phase 1a: pixels glide back (~0.4 s) - pure motion
    const P1b = 0.26; // sub-phase 1b: crossfade         (~0.76 s) - pure opacity
    const P2 = 0.64; // end of image hold               (~1.7 s)
    const P3 = 0.84; // end of background fade          (~0.9 s)
    //           1.0   // end of cameras fade-in           (~0.72 s)

    if (progress < P1a) {
      // Sub-phase 1a: un-shift pixels from where stage 4 left off back to the
      // source-image positions. No opacity change - pure spatial motion.
      const phase = easeInOutCubic(progress / P1a);
      const camAlpha = lerp(capturedWarpCameraAlpha, 0, phase);
      if (pointCloud.length)
        drawSourceProjection(
          width,
          height,
          camAlpha,
          imageSplatSize(width, height),
        );
    } else if (progress < P1b) {
      // Sub-phase 1b: pixels are now at source positions - crossfade to the smooth
      // source image. No spatial movement, pure opacity change.
      const phase = easeInOutCubic((progress - P1a) / (P1b - P1a));
      if (pointCloud.length) {
        ctx.save();
        ctx.globalAlpha = 1 - phase;
        drawSourceProjection(width, height, 0, imageSplatSize(width, height));
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = phase;
      drawCanvasContained(sourceCanvas, width, height, 0);
      ctx.restore();
    } else if (progress < P2) {
      drawCanvasContained(sourceCanvas, width, height, 0);
    } else if (progress < P3) {
      const phase = easeInOutCubic((progress - P2) / (P3 - P2));
      const rect = objectStageRect(width, height);
      ctx.save();
      ctx.globalAlpha = 1 - phase;
      drawCanvasContained(sourceCanvas, width, height, 0);
      ctx.restore();
      if (rect) {
        ctx.save();
        ctx.globalAlpha = phase;
        drawIsolatedObject(rect);
        ctx.restore();
      }
    } else {
      const phase = easeInOutCubic((progress - P3) / (1 - P3));
      const rect = objectStageRect(width, height);
      if (rect) drawIsolatedObject(rect);
      drawOrbitOverlay(width, height, t, phase);
    }
  }

  // Transition: orbit (cameras circle) → refine (6-view grid).
  // The isolated car copies split out into the 3×2 Zero123++ grid over 2.5 s.
  function drawOrbitToRefine(width, height, t, progress) {
    if (!isolatedCanvas || !orbitGridCanvas) {
      drawRefine(width, height, t);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    drawSplitToGrid(width, height, progress);
  }

  function drawResetToRgb(width, height, t, progress) {
    if (!sourceCanvas) {
      drawRgb(width, height);
      return;
    }
    drawRefine(width, height, t);
    const p = easeInOutCubic(progress);
    ctx.save();
    ctx.globalAlpha = p;
    drawRgb(width, height);
    ctx.restore();
  }

  function drawTransition(width, height, t, progress) {
    const fromMode = steps[transitionFrom]?.mode;
    const toMode = steps[active]?.mode;

    if (fromMode === "rgb" && toMode === "depth") {
      if (!depthCanvas) drawRgb(width, height);
      else drawRgbToDepth(width, height, t, progress);
      return;
    }
    if (fromMode === "depth" && toMode === "depthColor") {
      drawDepthToDepthColor(width, height, t, progress);
      return;
    }
    if (fromMode === "depthColor" && toMode === "cloud") {
      drawDepthColorToCloud(width, height, t, progress);
      return;
    }
    if (fromMode === "cloud" && toMode === "warp") {
      drawCloudToWarp(width, height, t, progress);
      return;
    }
    if (fromMode === "warp" && toMode === "orbit") {
      drawWarpToOrbit(width, height, t, progress);
      return;
    }
    if (fromMode === "orbit" && toMode === "refine") {
      drawOrbitToRefine(width, height, t, progress);
      return;
    }
    if (fromMode === "refine" && toMode === "rgb") {
      drawResetToRgb(width, height, t, progress);
      return;
    }

    drawCurrentStage(width, height, t);
  }

  function drawCurrentStage(width, height, t) {
    if (steps[active].mode === "rgb") drawRgb(width, height);
    else if (steps[active].mode === "depth") drawDepth(width, height, t);
    else if (steps[active].mode === "depthColor")
      drawDepthColor(width, height, t);
    else if (steps[active].mode === "cloud") drawCloud(width, height, t);
    else if (steps[active].mode === "warp") drawWarp(width, height, t);
    else if (steps[active].mode === "orbit")
      drawObjectOrbit(width, height, t, 1);
    else if (steps[active].mode === "refine") drawRefine(width, height, t);
  }

  function render() {
    updateStageSize();
    const { width, height } = sizeCanvas();
    const now = performance.now();
    const t = (now - animStart) / 1000;

    if (prepareError && !sourceCanvas) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.font = "15px JetBrains Mono, monospace";
      ctx.fillStyle = "#d63031";
      ctx.fillText("Depth assets failed to load", width / 2, height / 2);
      return;
    }

    if (!sourceCanvas) {
      drawSpinner(width, height, t);
      return;
    }

    const progress = transitionProgress(now);
    if (transitionFrom !== active && progress < 1) {
      drawTransition(width, height, t, progress);
    } else {
      drawCurrentStage(width, height, t);
    }
  }

  function setStep(index) {
    if (active > 0 && !depthCanvas) {
      prepareRealArtifacts(true);
      return;
    }
    const previous = active;
    active = (index + steps.length) % steps.length;
    transitionFrom = previous;
    transitionStart = performance.now();
    const step = steps[active];
    animStart = transitionStart;
    title.textContent = step.title;
    text.textContent = step.text;
    prepareRealArtifacts(active > 0);
    render();
  }

  function advance() {
    const next = active + 1;
    if (active === 2 && next === 3) {
      const procCanvas = document.getElementById("nvs-process-canvas");
      if (procCanvas && board) {
        // Snapshot the current canvas into an overlay image that will fade out
        const overlay = document.createElement("img");
        try {
          overlay.src = procCanvas.toDataURL();
        } catch (err) {
          // toDataURL can fail on cross-origin content; fall back to normal advance
          setStep(next);
          return;
        }
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.objectFit = "cover";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "999";
        overlay.style.transition = "opacity 0.85s cubic-bezier(.2,.9,.2,1)";
        overlay.style.opacity = "1";
        board.appendChild(overlay);

        // Immediately advance so the new stage is rendered underneath
        setStep(next);

        // Fade the overlay out to reveal the new stage instantly underneath
        requestAnimationFrame(() => (overlay.style.opacity = "0"));
        overlay.addEventListener(
          "transitionend",
          () => {
            try {
              board.removeChild(overlay);
            } catch {}
          },
          { once: true },
        );
        return;
      }
    }

    // Capture warp camera state before setStep resets animStart, so phase 1 of
    // the warp→orbit transition can start from exactly where stage 4 left off.
    if (steps[active]?.mode === "warp") {
      const currentT = (performance.now() - animStart) / 1000;
      const localT = Math.max(
        0,
        currentT - transitionDuration(transitionFrom, active),
      );
      capturedWarpCameraAlpha = warpStageState(localT).cameraAlpha;
    }

    setStep(next);
  }

  board.addEventListener("click", advance);
  board.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      advance();
    }
  });

  updateStageSize();
  new ResizeObserver(render).observe(stage);
  setStep(0);

  return {
    enter() {
      setStep(active);
    },
    tick(visible) {
      if (visible) render();
    },
  };
}

/* =========================================================
   Slides 4–6: NeRF project-page videos
   ========================================================= */
export function initApplications() {
  return controlVideos(document.querySelectorAll('.slide[data-id="4"] video'));
}

export function initWhyHard() {
  return controlVideos(document.querySelectorAll('.slide[data-id="5"] video'));
}

export function initClassic() {
  return controlVideos(document.querySelectorAll('.slide[data-id="6"] video'));
}

/* =========================================================
   Old approaches - two NeRF clips, autoplay loop
   ========================================================= */
export function initOldApproaches() {
  const vids = document.querySelectorAll(".old-card video");
  return {
    enter() {
      vids.forEach((v) => {
        v.loop = true;
        v.play().catch(() => {});
      });
    },
    tick(visible) {
      vids.forEach((v) => {
        if (!visible) v.pause();
        else if (v.paused) v.play().catch(() => {});
      });
    },
  };
}

/* =========================================================
   Slide 8: Rotatable - drag horizontally to scrub through orbit video
   ========================================================= */
export function initRotatable() {
  const stage = document.getElementById("rotatable-stage");
  const v = document.getElementById("rotatable-video");

  let dragging = false;
  let lastX = 0;
  let userTouched = false;

  v.loop = true;
  primeVideo(v);
  v.addEventListener(
    "loadedmetadata",
    () => {
      try {
        v.currentTime = 0;
      } catch {}
    },
    { once: true },
  );

  stage.addEventListener("pointerdown", (e) => {
    dragging = true;
    userTouched = true;
    lastX = e.clientX;
    stage.classList.add("grabbed");
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging || !v.duration) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    let t = v.currentTime + (dx / stage.clientWidth) * v.duration * 1.6;
    if (t < 0) t += v.duration;
    if (t >= v.duration) t -= v.duration;
    try {
      v.currentTime = t;
    } catch {}
  });
  const endDrag = () => {
    dragging = false;
    stage.classList.remove("grabbed");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("pointerleave", endDrag);

  return {
    enter() {
      userTouched = false;
      try {
        v.currentTime = 0;
      } catch {}
      primeVideo(v, true);
    },
    tick(visible) {
      if (!visible) {
        v.pause();
        return;
      }
      primeVideo(v, true);
    },
  };
}

/* =========================================================
   Slide 10: Ray demo - KEEP procedural (pedagogical)
   ========================================================= */
export function initRayDemo() {
  const container = document.getElementById("ray-stage");
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
    const w = container.clientWidth,
      h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(container);

  // translucent colored "blobs" as the implicit scene
  const blobs = [
    {
      p: new THREE.Vector3(-1.0, 0.6, 0.0),
      r: 0.8,
      c: new THREE.Color("#ff5a36"),
    },
    {
      p: new THREE.Vector3(0.6, 1.2, -0.3),
      r: 0.7,
      c: new THREE.Color("#6c5ce7"),
    },
    {
      p: new THREE.Vector3(0.0, 0.4, 1.0),
      r: 0.6,
      c: new THREE.Color("#00b894"),
    },
    {
      p: new THREE.Vector3(1.4, 0.5, 0.6),
      r: 0.5,
      c: new THREE.Color("#ffc23a"),
    },
  ];
  for (const b of blobs) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(b.r, 24, 24),
      new THREE.MeshBasicMaterial({
        color: b.c,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
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
    new THREE.MeshStandardMaterial({ color: 0x222222 }),
  );
  camMarker.add(camBody);
  const camLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16),
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.5,
      roughness: 0.3,
    }),
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
  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const planeCenter = camPos.clone().add(forward.clone().multiplyScalar(1.2));

  const pixels = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u = (i - (GRID - 1) / 2) * PIX;
      const vy = (j - (GRID - 1) / 2) * PIX;
      const pos = planeCenter
        .clone()
        .add(right.clone().multiplyScalar(u))
        .add(up.clone().multiplyScalar(vy));
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(PIX * 0.9, PIX * 0.9),
        new THREE.MeshBasicMaterial({
          color: 0xeeeeee,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
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
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    new THREE.LineBasicMaterial({ color: 0xff5a36 }),
  );
  rayLine.visible = false;
  scene.add(rayLine);

  const SAMPLES = 32;
  const sampleMeshes = [];
  for (let k = 0; k < SAMPLES; k++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff5a36 }),
    );
    m.visible = false;
    scene.add(m);
    sampleMeshes.push(m);
  }

  function colorOf(p) {
    let r = 0,
      g = 0,
      b = 0,
      w = 0;
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
      document.getElementById("rd-samples").textContent = "0";
      document.getElementById("rd-color").style.background = "#ddd";
      for (const p of pixels) p.material.color.set(0xeeeeee);
      return;
    }
    for (const p of pixels)
      p.material.color.set(p === pixel ? 0xff5a36 : 0xeeeeee);

    const start = camMarker.position.clone();
    const dir = pixel.userData.pos.clone().sub(start).normalize();
    const NEAR = 1.3,
      FAR = 8.0;
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
        acc.transmittance *= 1 - alpha;
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
    acc.r += acc.transmittance;
    acc.g += acc.transmittance;
    acc.b += acc.transmittance;

    const farP = start.clone().add(dir.clone().multiplyScalar(FAR));
    rayLine.geometry.setFromPoints([start, farP]);
    rayLine.visible = true;

    document.getElementById("rd-samples").textContent = String(hitCount);
    const r255 = Math.round(THREE.MathUtils.clamp(acc.r, 0, 1) * 255);
    const g255 = Math.round(THREE.MathUtils.clamp(acc.g, 0, 1) * 255);
    const b255 = Math.round(THREE.MathUtils.clamp(acc.b, 0, 1) * 255);
    document.getElementById("rd-color").style.background =
      `rgb(${r255},${g255},${b255})`;
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
  renderer.domElement.addEventListener("pointermove", (e) => {
    const p = pickPixelAt(e.clientX, e.clientY);
    hoveredPixel = p;
    fireRay(p);
  });
  renderer.domElement.addEventListener("pointerleave", () => {
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
   Slide 11: Training - prediction sharpens, error fades
   ========================================================= */
export function initTraining() {
  const pred = document.querySelector(".train-video.pred");
  const gt = document.querySelector(".train-video.gt");
  const err = document.getElementById("train-err");

  pred.loop = gt.loop = true;
  primeVideo(pred);
  primeVideo(gt);

  function syncVideos() {
    if (Math.abs(pred.currentTime - gt.currentTime) > 0.05) {
      try {
        pred.currentTime = gt.currentTime;
      } catch {}
    }
  }

  return {
    enter() {
      pred.classList.remove("sharp");
      primeVideo(gt, true);
      primeVideo(pred, true);
      setTimeout(() => pred.classList.add("sharp"), 100);
    },
    tick(visible) {
      if (!visible) {
        gt.pause();
        pred.pause();
        return;
      }
      primeVideo(gt, true);
      primeVideo(pred, true);
      syncVideos();

      const w = err.clientWidth * (window.devicePixelRatio || 1);
      const h = err.clientHeight * (window.devicePixelRatio || 1);
      if (err.width !== w) err.width = w;
      if (err.height !== h) err.height = h;
      const ctx = err.getContext("2d");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "difference";
      try {
        ctx.drawImage(gt, 0, 0, w, h);
        ctx.drawImage(pred, 0, 0, w, h);
      } catch (_) {}
      ctx.globalCompositeOperation = "source-over";
      try {
        const img = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
          const boost = Math.min(255, lum * 3.5);
          img.data[i] = Math.min(255, 255 - (255 - boost) * 0.3);
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
   Slide 12: Clickable viewpoints - camera buttons mapped to video time
   ========================================================= */
export function initClickableViews() {
  const v = document.getElementById("view-video");
  const ring = document.getElementById("cam-ring");
  const strip = document.getElementById("thumb-strip");

  const NUM = 8;
  primeVideo(v);
  ring.innerHTML = "";
  strip.innerHTML = "";
  const cams = [];
  const thumbs = [];
  const thumbCanvases = [];

  for (let i = 0; i < NUM; i++) {
    const theta = (i / NUM) * Math.PI * 2 - Math.PI / 2;
    const btn = document.createElement("button");
    btn.className = "cam";
    btn.style.left = 50 + Math.cos(theta) * 42 + "%";
    btn.style.top = 50 + Math.sin(theta) * 42 + "%";
    btn.style.transform = "translate(-50%, -50%)";
    btn.dataset.idx = i;
    ring.appendChild(btn);
    cams.push(btn);

    const d = document.createElement("div");
    d.className = "thumb";
    d.dataset.idx = i;
    const c = document.createElement("canvas");
    d.appendChild(c);
    const n = document.createElement("div");
    n.className = "thumb-num";
    n.textContent = String(i + 1);
    d.appendChild(n);
    strip.appendChild(d);
    thumbs.push(d);
    thumbCanvases.push(c);
  }

  let activeIdx = 0;
  let thumbsBuilt = false;
  const ov = document.createElement("video");
  ov.src = v.currentSrc || v.src;
  ov.muted = true;
  ov.playsInline = true;
  ov.preload = "auto";

  function timeForIdx(i) {
    if (!v.duration) return 0;
    return (i / NUM) * v.duration;
  }

  function setActive(i) {
    activeIdx = i;
    cams.forEach((b, k) => b.classList.toggle("active", k === i));
    thumbs.forEach((t, k) => t.classList.toggle("active", k === i));
    if (v.duration) {
      try {
        v.currentTime = timeForIdx(i);
      } catch {}
    }
  }

  cams.forEach((b, i) => b.addEventListener("click", () => setActive(i)));
  thumbs.forEach((d, i) => d.addEventListener("click", () => setActive(i)));

  async function buildThumbs() {
    if (thumbsBuilt || !ov.duration) return;
    for (let i = 0; i < NUM; i++) {
      await new Promise((res) => {
        const onSeek = () => {
          ov.removeEventListener("seeked", onSeek);
          res();
        };
        ov.addEventListener("seeked", onSeek);
        try {
          ov.currentTime = (i / NUM) * ov.duration;
        } catch {
          res();
        }
      });
      const c = thumbCanvases[i];
      const w = c.clientWidth * (window.devicePixelRatio || 1);
      const h = c.clientHeight * (window.devicePixelRatio || 1);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      try {
        c.getContext("2d").drawImage(ov, 0, 0, w, h);
      } catch {}
    }
    thumbsBuilt = true;
  }

  ov.addEventListener("loadedmetadata", buildThumbs, { once: true });
  v.addEventListener("loadedmetadata", () => setActive(0), { once: true });

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
   Slide 13: Orbit scrubber - slider maps to video time
   ========================================================= */
export function initOrbitScrubber() {
  const v = document.getElementById("orbit-video");
  const slider = document.getElementById("orbit-slider");
  let scrubbing = false;

  v.loop = true;
  primeVideo(v);

  function setSliderFraction(f, seekVideo = false) {
    const pct = THREE.MathUtils.clamp(f, 0, 1) * 100;
    slider.value = Math.round((pct / 100) * parseFloat(slider.max));
    slider.style.setProperty("--p", pct.toFixed(1) + "%");
    if (seekVideo && v.duration) {
      try {
        v.currentTime = (pct / 100) * v.duration;
      } catch {}
    }
  }

  slider.addEventListener("input", (e) => {
    scrubbing = true;
    setSliderFraction(
      parseFloat(e.target.value) / parseFloat(slider.max),
      true,
    );
  });
  slider.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  slider.addEventListener("change", () => {
    scrubbing = false;
  });

  v.addEventListener("loadedmetadata", () => setSliderFraction(0), {
    once: true,
  });

  return {
    enter() {
      scrubbing = false;
      try {
        v.currentTime = 0;
      } catch {}
      primeVideo(v, true);
      setSliderFraction(0);
    },
    tick(visible) {
      if (!visible) {
        v.pause();
        return;
      }
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
  const canvas = document.getElementById("end-bg");
  const slide = canvas.closest(".slide");
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
        color: i % 3 === 0 ? 0xff5a36 : i % 3 === 1 ? 0x6c5ce7 : 0x00b894,
        transparent: true,
        opacity: 0.35,
      }),
    );
    const r2 = 2 + Math.random() * 3;
    const t = Math.random() * Math.PI * 2;
    m.position.set(
      Math.cos(t) * r2,
      (Math.random() - 0.5) * 4,
      Math.sin(t) * r2,
    );
    m.userData.t = t;
    m.userData.r = r2;
    m.userData.spd =
      (0.0005 + Math.random() * 0.001) * (Math.random() < 0.5 ? -1 : 1);
    scene.add(m);
    dots.push(m);
  }

  const resize = () => {
    const w = slide.clientWidth,
      h = slide.clientHeight;
    r.setSize(w, h, false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
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

/* =========================================================
   Slide 3: The Problem - orbit camera + photo capture
   ========================================================= */
export function initProblemVis() {
  const canvas = document.getElementById("problem-canvas");
  if (!canvas) return { tick() {} };
  const pv3d = document.getElementById("pv-3d");
  const photoBtn = document.getElementById("photo-btn");
  const flash = document.getElementById("pv-flash");
  const stampOverlay = document.getElementById("pv-stamp-overlay");
  const stampInner = stampOverlay.querySelector(".pv-stamp-inner");
  const stampImg = document.getElementById("pv-stamp-img");
  const stampClose = document.getElementById("pv-stamp-close");

  // ── Scene ──────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);
  scene.fog = new THREE.Fog(0xf0f0f0, 22, 38);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  const r = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;

  // ── Lights ─────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d0d0, 0.9));

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(7, 13, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
  sun.shadow.camera.right = sun.shadow.camera.top = 10;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-5, 6, -8);
  scene.add(fill);

  // ── Ground ─────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(20, 20, 0xc0c0c0, 0xcecece);
  grid.position.y = -0.494;
  scene.add(grid);

  // ── Objects ────────────────────────────────────────────
  // All use MeshStandardMaterial (PBR) - shading gradients are dramatic and clearly 3D.
  // Each object also gets a dark edge outline so the geometry reads instantly.
  const std = (color, roughness = 0.55, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const withEdges = (mesh, geo) => {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.18,
      }),
    );
    mesh.add(edges);
    return mesh;
  };

  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    withEdges(m, geo);
    scene.add(m);
    return m;
  };

  add(
    new THREE.SphereGeometry(1.15, 32, 32),
    std(0xff5a36, 0.3, 0.06),
    -0.3,
    0.65,
    1.2,
  );
  add(
    new THREE.BoxGeometry(1.3, 1.3, 1.3),
    std(0x2ecc71, 0.4, 0.05),
    0.7,
    0.15,
    -0.5,
    Math.PI / 5,
  );
  add(
    new THREE.CylinderGeometry(0.48, 0.6, 2.6, 32),
    std(0x6c5ce7, 0.3, 0.1),
    -2.3,
    0.8,
    -0.3,
  );
  const torusGeo = new THREE.TorusGeometry(0.72, 0.27, 24, 64);
  const torus = add(torusGeo, std(0x0984e3, 0.25, 0.15), 2.3, 0.4, 0.6);
  torus.rotation.x = Math.PI / 2.8;
  add(
    new THREE.OctahedronGeometry(0.85),
    std(0xfdcb6e, 0.3, 0.08),
    0.4,
    0.35,
    -2.1,
  );
  add(
    new THREE.ConeGeometry(0.45, 1.4, 24),
    std(0xe84393, 0.35, 0.1),
    -2.5,
    0.2,
    -2.0,
  );

  // ── Orbit camera ──────────────────────────────────────
  // Spherical coords: theta = horizontal angle, phi = vertical angle
  const sph = { theta: 0.4, phi: 1.05, r: 9 };
  const target = new THREE.Vector3(0, 0.4, 0);

  const applyCamera = () => {
    const sinPhi = Math.sin(sph.phi);
    camera.position.set(
      target.x + sph.r * sinPhi * Math.sin(sph.theta),
      target.y + sph.r * Math.cos(sph.phi),
      target.z + sph.r * sinPhi * Math.cos(sph.theta),
    );
    camera.lookAt(target);
  };
  applyCamera();

  let isDown = false,
    px = 0,
    py = 0;
  const startDrag = (e) => {
    isDown = true;
    const t = e.touches ? e.touches[0] : e;
    px = t.clientX;
    py = t.clientY;
    canvas.style.cursor = "grabbing";
  };
  // Max phi that keeps camera above floor (floor y = -0.5, add 0.2 margin)
  const maxPhi = () => Math.acos(Math.max(-0.999, (-0.5 + 0.2 - target.y) / sph.r));

  const moveDrag = (e) => {
    if (!isDown) return;
    const t = e.touches ? e.touches[0] : e;
    sph.theta -= (t.clientX - px) * 0.007;
    sph.phi = Math.max(0.15, Math.min(maxPhi(), sph.phi + (t.clientY - py) * 0.007));
    px = t.clientX;
    py = t.clientY;
    applyCamera();
  };
  const endDrag = () => {
    isDown = false;
    canvas.style.cursor = "grab";
  };

  canvas.addEventListener("mousedown", startDrag);
  canvas.addEventListener("touchstart", startDrag, { passive: true });
  window.addEventListener("mousemove", moveDrag);
  window.addEventListener("touchmove", moveDrag, { passive: true });
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchend", endDrag);
  canvas.addEventListener(
    "wheel",
    (e) => {
      // Normalize across pixel (trackpad) and line (mouse wheel) deltaMode
      const delta = e.deltaMode === 0 ? e.deltaY * 0.02 : e.deltaY * 0.5;
      sph.r = Math.max(2.5, Math.min(12, sph.r + delta));
      sph.phi = Math.min(sph.phi, maxPhi());
      applyCamera();
      e.preventDefault();
    },
    { passive: false },
  );
  canvas.style.cursor = "grab";

  // ── Resize ─────────────────────────────────────────────
  const resize = () => {
    const w = pv3d.clientWidth | 0,
      h = pv3d.clientHeight | 0;
    if (!w || !h) return;
    r.setSize(w, h, false);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(pv3d);

  // ── Photo capture → stamp animation ────────────────────
  const openStamp = () => {
    r.render(scene, camera);
    stampImg.src = canvas.toDataURL("image/jpeg", 0.93);
    // Position centered on the canvas, slightly lower than mid
    const rect = pv3d.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.5;
    stampOverlay.style.left = cx + "px";
    stampOverlay.style.top = cy + "px";
    stampOverlay.style.transform = "translate(-50%, -50%)";
    // Reset animation so it replays every time
    stampInner.style.animation = "none";
    stampOverlay.offsetHeight; // force reflow
    stampInner.style.animation = "";
    stampOverlay.classList.add("active");
  };

  const closeStamp = () => stampOverlay.classList.remove("active");

  photoBtn.addEventListener("click", () => {
    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 220);
    setTimeout(openStamp, 180);
  });

  stampClose.addEventListener("click", closeStamp);
  window.addEventListener("wheel", closeStamp, { passive: true });
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown"," "].includes(e.key))
      closeStamp();
  }, { passive: true });

  // ── Tick ───────────────────────────────────────────────
  let t = 0;
  return {
    tick(visible) {
      if (!visible) closeStamp();
      t += 0.012;
      torus.rotation.z = t;
      r.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 4: Static → Spatial — 3-phase NeRF pipeline demo
   Phase 1 → input images (video)
   Phase 2 → camera-sphere visualization (Three.js)
   Phase 3 → 3D rotatable drum kit (Three.js)
   ========================================================= */
export function initStaticToSpatial() {
  const orb  = document.getElementById("sts-orb");
  const img1 = document.getElementById("sts-img");
  const c2   = document.getElementById("sts-c2");
  const img3 = document.getElementById("sts-img3");
  if (!orb || !img1 || !c2 || !img3) return { tick() {} };

  let phase = 1;

  // ── Phase 1: 20 evenly-spaced drum stills, slow cycling ──
  const P1_SLOW = 42; // ticks between frames (~700ms at 60fps)
  const p1Urls  = Array.from({ length: 20 }, (_, i) => `assets/test/r_${i * 10}.png`);
  let p1Idx = 0, p1Tick = 0;
  img1.src = p1Urls[0];

  // ── Phase 2: Three.js camera-sphere (NeRF paper style) ─
  const r2   = new THREE.WebGLRenderer({ canvas: c2, antialias: true, alpha: false });
  r2.setClearColor(0xffffff, 1);
  r2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const s2   = new THREE.Scene();
  const cam2 = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  // Impostor drum: actual render swapped per camera angle (looks pixel-perfect)
  // White scene background matches the renders' white background → seamless
  const impostorTex = new THREE.Texture();
  impostorTex.colorSpace = THREE.SRGBColorSpace;
  const impostorMat = new THREE.SpriteMaterial({ map: impostorTex, depthTest: false });
  const impostorSpr = new THREE.Sprite(impostorMat);
  impostorSpr.scale.set(3.6, 3.6, 1);
  impostorSpr.position.set(0, -0.4, 0);
  s2.add(impostorSpr);

  // Preload all 200 drum renders
  const iImgs = Array.from({ length: 200 }, (_, i) => {
    const img = new Image();
    img.src = `assets/test/r_${i}.png`;
    return img;
  });
  // Show first frame immediately once loaded
  iImgs[0].onload = () => { impostorTex.image = iImgs[0]; impostorTex.needsUpdate = true; };
  let lastIIdx = -1;

  // Camera frustums on dome (hemisphere, ring-based)
  const CAM_R  = 2.8;
  const FDEPTH = 0.30;
  const FHW    = 0.13;
  const FHH    = 0.09;

  const makeFrustum = (pos) => {
    const dir  = pos.clone().normalize().negate(); // inward toward drum
    const tmp  = Math.abs(dir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const rt   = new THREE.Vector3().crossVectors(dir, tmp).normalize();
    const up3  = new THREE.Vector3().crossVectors(rt, dir).normalize();
    const apex = pos.clone();
    const bc   = pos.clone().addScaledVector(dir, FDEPTH);
    const co   = [
      bc.clone().addScaledVector(rt,  FHW).addScaledVector(up3,  FHH),
      bc.clone().addScaledVector(rt, -FHW).addScaledVector(up3,  FHH),
      bc.clone().addScaledVector(rt, -FHW).addScaledVector(up3, -FHH),
      bc.clone().addScaledVector(rt,  FHW).addScaledVector(up3, -FHH),
    ];
    const pts = [
      apex, co[0], apex, co[1], apex, co[2], apex, co[3],
      co[0], co[1], co[1], co[2], co[2], co[3], co[3], co[0],
    ];
    return new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x222222 })
    );
  };

  // Concentric latitude rings — upper hemisphere only
  const domeRings = [
    { el: 10, count: 8, offset: 0 },
    { el: 32, count: 7, offset: Math.PI / 7 },
    { el: 54, count: 5, offset: Math.PI / 5 },
    { el: 74, count: 3, offset: Math.PI / 6 },
  ];
  const toRad = d => d * Math.PI / 180;
  for (const { el, count, offset } of domeRings) {
    const phi = toRad(el);
    const yp  = Math.sin(phi) * CAM_R;
    const rp  = Math.cos(phi) * CAM_R;
    for (let k = 0; k < count; k++) {
      const az  = (k / count) * Math.PI * 2 + offset;
      const pos = new THREE.Vector3(Math.cos(az) * rp, yp, Math.sin(az) * rp);
      const rayEnd = pos.clone().multiplyScalar(0.85);
      const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), rayEnd]);
      s2.add(new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: 0xcccccc })));
      s2.add(makeFrustum(pos));
    }
  }

  let theta2 = 0;
  const updateCam2 = () => {
    cam2.position.set(Math.sin(theta2) * 9.5, 3.2, Math.cos(theta2) * 9.5);
    cam2.lookAt(0, 0, 0);
  };
  updateCam2();

  // ── Phase 3: NeRF orbit — all 200 frames cycling ────────
  const NERF_N   = 200;
  const nerfUrls = Array.from({ length: NERF_N }, (_, i) => `assets/test/r_${i}.png`);
  let p3Idx = 0, p3Tick = 0;
  let p3Preloaded = false;

  const preloadPhase3 = () => {
    if (p3Preloaded) return;
    p3Preloaded = true;
    nerfUrls.forEach(url => { const pre = new Image(); pre.src = url; });
  };

  // ── Resize ─────────────────────────────────────────────
  const resize = () => {
    const s = orb.clientWidth | 0;
    if (!s) return;
    r2.setSize(s, s);
    cam2.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(orb);

  // ── Phase transitions ──────────────────────────────────
  function setPhase(p) {
    phase = p;
    orb.dataset.phase = String(p);
    if (p === 3) {
      preloadPhase3();
      p3Idx = 0; p3Tick = 0;
      img3.src = nerfUrls[0];
    }
  }

  orb.addEventListener("click", () => setPhase(phase === 3 ? 1 : phase + 1));

  return {
    tick(visible) {
      if (!visible) return;
      if (phase === 1) {
        p1Tick++;
        if (p1Tick >= P1_SLOW) {
          p1Tick = 0;
          p1Idx = (p1Idx + 1) % p1Urls.length;
          img1.src = p1Urls[p1Idx];
        }
      }
      if (phase === 2) {
        theta2 += 0.006;
        updateCam2();
        const norm = ((theta2 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const iIdx = Math.round((norm / (Math.PI * 2)) * 200) % 200;
        if (iIdx !== lastIIdx && iImgs[iIdx].complete) {
          impostorTex.image = iImgs[iIdx];
          impostorTex.needsUpdate = true;
          lastIIdx = iIdx;
        }
        r2.render(s2, cam2);
      }
      if (phase === 3) {
        p3Tick++;
        if (p3Tick >= 2) {
          p3Tick = 0;
          p3Idx = (p3Idx + 1) % NERF_N;
          img3.src = nerfUrls[p3Idx];
        }
      }
    },
    enter() {},
  };
}
