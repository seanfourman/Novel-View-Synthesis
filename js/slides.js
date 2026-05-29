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
  const cSfm = document.getElementById("c-sfm");
  const cMvs = document.getElementById("c-mvs");
  const cPhoto = document.getElementById("c-photo");
  const cLidar = document.getElementById("c-lidar");
  const cLf = document.getElementById("c-lf");
  if (!cSfm) return { tick() {} };

  const ACCENT = "#ff5a36";
  const INK = "#1a1a1a";
  const BG = "#f5f5f5";

  // ── SfM: sparse points appearing + cameras orbiting ──
  // ── SfM: camera moves along arc, sparse points accumulate ──
  const sfmDraw = (() => {
    const ctx = cSfm.getContext("2d");
    const W = cSfm.width,
      H = cSfm.height;
    const S = W / 200;
    const cx = W * 0.5,
      cy = H * 0.62;
    const arcR = W * 0.38,
      arcY = H * 0.18;

    const scenePts = [
      { x: W * 0.22, y: H * 0.52 },
      { x: W * 0.35, y: H * 0.44 },
      { x: W * 0.5, y: H * 0.55 },
      { x: W * 0.62, y: H * 0.42 },
      { x: W * 0.76, y: H * 0.5 },
      { x: W * 0.42, y: H * 0.64 },
      { x: W * 0.58, y: H * 0.63 },
      { x: W * 0.28, y: H * 0.68 },
      { x: W * 0.7, y: H * 0.6 },
    ].map((p) => ({ ...p, found: false }));

    const camPath = Array.from({ length: 7 }, (_, i) => ({
      x: W * 0.12 + (i / 6) * W * 0.76,
      y: arcY + Math.sin((i / 6) * Math.PI) * (-18 * S),
    }));

    const SWEEP = 200,
      HOLD = 40,
      CYCLE = (SWEEP + HOLD) * 2;
    let t = 0;

    const drawCamIcon = (x, y, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(-6 * S, -4 * S, 12 * S, 8 * S);
      ctx.beginPath();
      ctx.arc(7 * S, 0, 3 * S, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
    };

    return (dtScale = 1) => {
      t += dtScale;
      const phase = t % CYCLE;

      let prog;
      if (phase < SWEEP) prog = phase / SWEEP;
      else if (phase < SWEEP + HOLD) prog = 1;
      else if (phase < SWEEP * 2 + HOLD)
        prog = 1 - (phase - SWEEP - HOLD) / SWEEP;
      else prog = 0;

      const goingRight = phase < SWEEP + HOLD;
      const camX = W * 0.12 + prog * W * 0.76;
      const camY = arcY + Math.sin(prog * Math.PI) * (-18 * S);

      scenePts.forEach((p) => {
        if (goingRight && !p.found && camX >= p.x) p.found = true;
        if (!goingRight && p.found && camX <= p.x) p.found = false;
      });

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      ctx.setLineDash([3 * S, 5 * S]);
      ctx.beginPath();
      ctx.moveTo(W * 0.12, arcY);
      ctx.lineTo(W * 0.88, arcY);
      ctx.strokeStyle = "rgba(255,90,54,0.1)";
      ctx.lineWidth = S;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(W * 0.12, arcY);
      ctx.lineTo(camX, camY);
      ctx.strokeStyle = "rgba(255,90,54,0.38)";
      ctx.lineWidth = S;
      ctx.stroke();

      camPath.forEach((stop) => {
        if (goingRight) {
          if (stop.x > camX + 4 * S) return;
        } else {
          if (stop.x > camX) return;
        }
        ctx.save();
        ctx.translate(stop.x, stop.y);
        ctx.fillStyle = "rgba(255,90,54,0.5)";
        ctx.fillRect(-4 * S, -2.5 * S, 8 * S, 5 * S);
        ctx.restore();
      });

      scenePts.forEach((p) => {
        if (!p.found) return;
        ctx.beginPath();
        ctx.moveTo(camX, camY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = "rgba(255,90,54,0.12)";
        ctx.lineWidth = 0.7 * S;
        ctx.stroke();
      });

      scenePts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.found ? 2.8 * S : 1.5 * S, 0, Math.PI * 2);
        ctx.fillStyle = p.found ? INK : "rgba(0,0,0,0.15)";
        ctx.fill();
      });

      const angle = Math.PI * 0.5 + (prog - 0.5) * 0.4;
      drawCamIcon(camX, camY, angle);
    };
  })();

  // ── MVS: sparse → dense split with sweeping divider ──
  const mvsDraw = (() => {
    const ctx = cMvs.getContext("2d");
    const W = cMvs.width,
      H = cMvs.height;
    const S = W / 200;
    const cx = W * 0.5,
      cy = H * 0.5;
    const R = Math.round(42 * S);
    const STEP = 4.5 * S,
      SPARSE = 13 * S;

    const dense = [],
      sparse = [];
    for (let dy = -R; dy <= R; dy += STEP) {
      for (let dx = -R; dx <= R; dx += STEP) {
        if (dx * dx + dy * dy > R * R) continue;
        const dz = Math.sqrt(Math.max(0, 1 - (dx * dx + dy * dy) / (R * R)));
        const p = { x: cx + dx, y: cy + dy, z: dz };
        dense.push(p);
        if (Math.abs(dx % SPARSE) < 5 * S && Math.abs(dy % SPARSE) < 5 * S)
          sparse.push(p);
      }
    }

    let t = 0;
    return (dtScale = 1) => {
      t += dtScale;
      const divX = cx + Math.sin(t * 0.016) * (W * 0.44);

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      sparse.forEach((p) => {
        if (p.x > divX) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * S, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fill();
      });

      dense.forEach((p) => {
        if (p.x <= divX) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * S, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,80,200,0.85)";
        ctx.fill();
      });

      ctx.beginPath();
      ctx.moveTo(divX, cy - R - 4 * S);
      ctx.lineTo(divX, cy + R + 4 * S);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5 * S;
      ctx.stroke();
    };
  })();

  // ── Photogrammetry: rotating vase wireframe + orbiting camera ──
  const photoDraw = (() => {
    const ctx = cPhoto.getContext("2d");
    const W = cPhoto.width,
      H = cPhoto.height,
      cx = W / 2,
      cy = H / 2;
    const pxS = W / 200;
    const S = 20 * pxS;
    const STEPS = 10; // rotational segments
    // Vase profile: {y, r} pairs from bottom to top
    const profile = [
      { y: -2.8, r: 0.25 },
      { y: -2.2, r: 1.4 },
      { y: -1.2, r: 1.7 },
      { y: 0.0, r: 1.3 },
      { y: 1.2, r: 1.6 },
      { y: 2.0, r: 1.1 },
      { y: 2.5, r: 0.7 },
      { y: 2.8, r: 0.8 },
    ];
    const RINGS = profile.length;
    // Build vertices
    const v3 = [];
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < STEPS; s++) {
        const a = (s / STEPS) * Math.PI * 2;
        v3.push([
          Math.cos(a) * profile[r].r,
          profile[r].y,
          Math.sin(a) * profile[r].r,
        ]);
      }
    }
    // Build edges: ring edges + vertical edges
    const edges = [];
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < STEPS; s++) {
        edges.push([r * STEPS + s, r * STEPS + ((s + 1) % STEPS)]); // ring
        if (r < RINGS - 1) edges.push([r * STEPS + s, (r + 1) * STEPS + s]); // vertical
      }
    }
    let t = 0;
    return (dtScale = 1) => {
      t += dtScale;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      const rx = t * 0.008,
        ry = t * 0.018;
      const cX = Math.cos(rx),
        sX = Math.sin(rx),
        cY = Math.cos(ry),
        sY = Math.sin(ry);
      const proj = v3.map(([x, y, z]) => {
        const y2 = y * cX - z * sX,
          z2 = y * sX + z * cX;
        const x3 = x * cY + z2 * sY;
        return [cx + x3 * S, cy - y2 * S];
      });
      ctx.strokeStyle = "rgba(26,26,26,0.7)";
      ctx.lineWidth = pxS;
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(...proj[a]);
        ctx.lineTo(...proj[b]);
        ctx.stroke();
      });
      // Orbiting camera
      const ca = t * 0.032;
      const bx = cx + Math.cos(ca) * W * 0.41,
        by = cy + Math.sin(ca) * H * 0.37;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = "rgba(255,90,54,0.22)";
      ctx.lineWidth = 0.9 * pxS;
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.fillRect(bx - 5 * pxS, by - 3.5 * pxS, 10 * pxS, 7 * pxS);
    };
  })();

  // ── LiDAR: sweeping beam accumulating hit points ──
  const lidarDraw = (() => {
    const ctx = cLidar.getContext("2d");
    const W = cLidar.width,
      H = cLidar.height;
    const S = W / 200;
    const sx = W * 0.5,
      sy = H * 0.88;
    const walls = [
      [W * 0.18, H * 0.28, W * 0.5, H * 0.28],
      [W * 0.5, H * 0.28, W * 0.5, H * 0.68],
      [W * 0.18, H * 0.28, W * 0.18, H * 0.68],
      [W * 0.62, H * 0.38, W * 0.82, H * 0.38],
      [W * 0.82, H * 0.38, W * 0.82, H * 0.68],
    ];
    const intersect = (ax, ay, bx, by, cx, cy, dx, dy) => {
      const rx = bx - ax,
        ry = by - ay,
        sx2 = dx - cx,
        sy2 = dy - cy,
        cross = rx * sy2 - ry * sx2;
      if (Math.abs(cross) < 1e-9) return null;
      const t = (cx - ax) * sy2 - (cy - ay) * sx2,
        u = (cx - ax) * ry - (cy - ay) * rx;
      return t / cross >= 0 && u / cross >= 0 && u / cross <= 1
        ? [ax + (t / cross) * rx, ay + (t / cross) * ry]
        : null;
    };
    const pts = [];
    const SWEEP_F = 220,
      PAUSE_F = 70,
      CYCLE = SWEEP_F + PAUSE_F;
    let t = 0;
    let prevCycle = 0;
    return (dtScale = 1) => {
      t += dtScale;
      const phase = t % CYCLE;
      const cycleIdx = Math.floor(t / CYCLE);
      if (cycleIdx !== prevCycle) {
        pts.length = 0;
        prevCycle = cycleIdx;
      }
      const sweeping = phase < SWEEP_F;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // draw walls gray
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1.2 * S;
      walls.forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // paint blue over walls - fade out during pause phase
      const fadeAlpha = sweeping
        ? 0.85
        : 0.85 * (1 - (phase - SWEEP_F) / PAUSE_F);
      if (fadeAlpha > 0) {
        pts.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2 * S, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(10,80,200,${fadeAlpha})`;
          ctx.fill();
        });
      }

      ctx.beginPath();
      ctx.arc(sx, sy, 4 * S, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();

      if (!sweeping) return;

      const FADE_IN = 20,
        FADE_OUT = 35;
      const laserAlpha =
        phase < FADE_IN
          ? phase / FADE_IN
          : phase > SWEEP_F - FADE_OUT
            ? (SWEEP_F - phase) / FADE_OUT
            : 1;

      const sweep = (phase / SWEEP_F) * Math.PI - Math.PI * 0.5;
      const ang = -Math.PI / 2 + sweep;
      const edx = Math.cos(ang) * H * 1.6,
        edy = Math.sin(ang) * H * 1.6;
      let hit = null,
        minD = Infinity;
      walls.forEach(([x1, y1, x2, y2]) => {
        const h = intersect(sx, sy, sx + edx, sy + edy, x1, y1, x2, y2);
        if (h) {
          const d = Math.hypot(h[0] - sx, h[1] - sy);
          if (d < minD) {
            minD = d;
            hit = h;
          }
        }
      });
      const beamEnd = hit
        ? [hit[0], hit[1]]
        : [sx + edx * 0.25, sy + edy * 0.25];
      if (hit) pts.push({ x: hit[0], y: hit[1] });
      // glow halo under beam
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(beamEnd[0], beamEnd[1]);
      ctx.strokeStyle = `rgba(255,90,54,${0.15 * laserAlpha})`;
      ctx.lineWidth = 2.5 * S;
      ctx.stroke();
      // main beam
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(beamEnd[0], beamEnd[1]);
      ctx.strokeStyle = `rgba(255,90,54,${0.92 * laserAlpha})`;
      ctx.lineWidth = 0.8 * S;
      ctx.stroke();
      // wall impact flash
      if (hit) {
        const ig = ctx.createRadialGradient(
          hit[0],
          hit[1],
          0,
          hit[0],
          hit[1],
          6 * S,
        );
        ig.addColorStop(0, `rgba(255,200,140,${laserAlpha})`);
        ig.addColorStop(0.4, `rgba(255,90,54,${0.7 * laserAlpha})`);
        ig.addColorStop(1, "rgba(255,90,54,0)");
        ctx.beginPath();
        ctx.arc(hit[0], hit[1], 6 * S, 0, Math.PI * 2);
        ctx.fillStyle = ig;
        ctx.fill();
      }
    };
  })();

  // ── Light Fields: grid of cameras pulsing rays to centre ──
  const lfDraw = (() => {
    const ctx = cLf.getContext("2d");
    const W = cLf.width,
      H = cLf.height,
      cx = W / 2,
      cy = H * 0.62;
    const S = W / 200;
    const grid = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++)
        grid.push({
          x: W * 0.1 + c * ((W * 0.8) / 4),
          y: H * 0.1 + r * ((H * 0.32) / 2),
          ph: (r * 5 + c) * 0.42,
        });
    let t = 0;
    return (dtScale = 1) => {
      t += dtScale;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      grid.forEach((cam) => {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.028 + cam.ph);
        ctx.beginPath();
        ctx.moveTo(cam.x, cam.y);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = `rgba(255,90,54,${0.04 + pulse * 0.82})`;
        ctx.lineWidth = 0.5 * S;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cam.x, cam.y, (1 + pulse * 1.2) * S, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(26,26,26,${0.15 + pulse * 0.85})`;
        ctx.fill();
      });
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * S, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * S, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 * S;
      ctx.stroke();
    };
  })();

  const draws = [sfmDraw, mvsDraw, photoDraw, lidarDraw, lfDraw];

  return {
    tick(visible, dtScale = 1) {
      if (!visible) return;
      draws.forEach((fn) => fn(dtScale));
    },
    enter() {},
  };
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
   NeRF ray demo - procedural pedagogical volume rendering
   ========================================================= */
export function initRayDemo() {
  const container = document.getElementById("ray-stage");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafafa);

  // lighting + camera
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d8e8, 0.7));
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const viewTarget = new THREE.Vector3(0.5, 0.5, 0);
  const viewOffset = new THREE.Vector3(7.5, 4.5, 8.5)
    .sub(viewTarget)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(60));
  camera.position.copy(viewTarget).add(viewOffset);
  camera.lookAt(viewTarget);

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
    tick(visible, dtScale = 1) {
      if (!visible) return;
      if (!hoveredPixel || hoveredPixel === pixels[autoIdx]) {
        autoTimer += dtScale;
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
    tick(visible, dtScale = 1) {
      if (!visible) return;
      for (const d of dots) {
        d.userData.t += d.userData.spd * dtScale;
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
  const maxPhi = () =>
    Math.acos(Math.max(-0.999, (-0.5 + 0.2 - target.y) / sph.r));

  const moveDrag = (e) => {
    if (!isDown) return;
    const t = e.touches ? e.touches[0] : e;
    sph.theta -= (t.clientX - px) * 0.007;
    sph.phi = Math.max(
      0.15,
      Math.min(maxPhi(), sph.phi + (t.clientY - py) * 0.007),
    );
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
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "PageUp",
          "PageDown",
          " ",
        ].includes(e.key)
      )
        closeStamp();
    },
    { passive: true },
  );

  // ── Tick ───────────────────────────────────────────────
  let t = 0;
  return {
    tick(visible, dtScale = 1) {
      if (!visible) closeStamp();
      t += 0.012 * dtScale;
      torus.rotation.z = t;
      r.render(scene, camera);
    },
  };
}

/* =========================================================
   Slide 4: Static → Spatial - 3-phase NeRF pipeline demo
   Phase 1 → input images (video)
   Phase 2 → camera-sphere visualization (Three.js)
   Phase 3 → 3D rotatable drum kit (Three.js)
   ========================================================= */
export function initStaticToSpatial() {
  const orb = document.getElementById("sts-orb");
  const img1 = document.getElementById("sts-img");
  const c2 = document.getElementById("sts-c2");
  const img3 = document.getElementById("sts-img3");
  if (!orb || !img1 || !c2 || !img3) return { tick() {} };

  let phase = 1;

  // ── Phase 1: 20 evenly-spaced drum stills, slow cycling ──
  const P1_SLOW = 42; // ticks between frames (~700ms at 60fps)
  const p1Urls = Array.from(
    { length: 20 },
    (_, i) => `assets/test/r_${i * 10}.png`,
  );
  let p1Idx = 0,
    p1Tick = 0;
  img1.src = p1Urls[0];

  // ── Phase 2: Three.js camera-sphere (NeRF paper style) ─
  const r2 = new THREE.WebGLRenderer({
    canvas: c2,
    antialias: true,
    alpha: false,
  });
  r2.setClearColor(0xffffff, 1);
  r2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const s2 = new THREE.Scene();
  const cam2 = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  // Impostor drum: actual render swapped per camera angle (looks pixel-perfect)
  // White scene background matches the renders' white background → seamless
  const impostorTex = new THREE.Texture();
  impostorTex.colorSpace = THREE.SRGBColorSpace;
  const impostorMat = new THREE.SpriteMaterial({
    map: impostorTex,
    blending: THREE.MultiplyBlending,
    depthTest: false,
    depthWrite: false,
  });
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
  iImgs[0].onload = () => {
    impostorTex.image = iImgs[0];
    impostorTex.needsUpdate = true;
  };
  let lastIIdx = -1;

  // Camera frustums on dome (hemisphere, ring-based)
  const CAM_R = 2.8;
  const FDEPTH = 0.3;
  const FHW = 0.13;
  const FHH = 0.09;

  const makeFrustum = (pos) => {
    const dir = pos.clone().normalize().negate(); // inward toward drum
    const tmp =
      Math.abs(dir.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const rt = new THREE.Vector3().crossVectors(dir, tmp).normalize();
    const up3 = new THREE.Vector3().crossVectors(rt, dir).normalize();
    const apex = pos.clone();
    const bc = pos.clone().addScaledVector(dir, FDEPTH);
    const co = [
      bc.clone().addScaledVector(rt, FHW).addScaledVector(up3, FHH),
      bc.clone().addScaledVector(rt, -FHW).addScaledVector(up3, FHH),
      bc.clone().addScaledVector(rt, -FHW).addScaledVector(up3, -FHH),
      bc.clone().addScaledVector(rt, FHW).addScaledVector(up3, -FHH),
    ];
    const pts = [
      apex,
      co[0],
      apex,
      co[1],
      apex,
      co[2],
      apex,
      co[3],
      co[0],
      co[1],
      co[1],
      co[2],
      co[2],
      co[3],
      co[3],
      co[0],
    ];
    return new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x222222 }),
    );
  };

  // Concentric latitude rings - dome + base ring at drum level
  const domeRings = [
    { el: -12, count: 9, offset: Math.PI / 9 },
    { el: 10, count: 8, offset: 0 },
    { el: 32, count: 7, offset: Math.PI / 7 },
    { el: 54, count: 5, offset: Math.PI / 5 },
    { el: 74, count: 3, offset: Math.PI / 6 },
  ];
  const toRad = (d) => (d * Math.PI) / 180;
  for (const { el, count, offset } of domeRings) {
    const phi = toRad(el);
    const yp = Math.sin(phi) * CAM_R;
    const rp = Math.cos(phi) * CAM_R;
    for (let k = 0; k < count; k++) {
      const az = (k / count) * Math.PI * 2 + offset;
      const pos = new THREE.Vector3(Math.cos(az) * rp, yp, Math.sin(az) * rp);
      const rayEnd = pos.clone().multiplyScalar(0.85);
      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        rayEnd,
      ]);
      s2.add(
        new THREE.LineSegments(
          rayGeo,
          new THREE.LineBasicMaterial({ color: 0xcccccc }),
        ),
      );
      s2.add(makeFrustum(pos));
    }
  }

  let theta2 = 0;
  const updateCam2 = () => {
    cam2.position.set(Math.sin(theta2) * 7.45, 2.6, Math.cos(theta2) * 7.45);
    cam2.lookAt(0, 0, 0);
  };
  updateCam2();

  // ── Phase 3: NeRF orbit - all 200 frames cycling ────────
  const NERF_N = 200;
  const nerfUrls = Array.from(
    { length: NERF_N },
    (_, i) => `assets/test/r_${i}.png`,
  );
  let p3Idx = 0,
    p3Tick = 0;
  let p3Preloaded = false;

  const preloadPhase3 = () => {
    if (p3Preloaded) return;
    p3Preloaded = true;
    nerfUrls.forEach((url) => {
      const pre = new Image();
      pre.src = url;
    });
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
      p3Idx = 0;
      p3Tick = 0;
      img3.src = nerfUrls[0];
    }
  }

  orb.addEventListener("click", () => setPhase(phase === 3 ? 1 : phase + 1));

  return {
    tick(visible, dtScale = 1) {
      if (!visible) return;
      if (phase === 1) {
        p1Tick += dtScale;
        if (p1Tick >= P1_SLOW) {
          p1Tick = 0;
          p1Idx = (p1Idx + 1) % p1Urls.length;
          img1.src = p1Urls[p1Idx];
        }
      }
      if (phase === 2) {
        theta2 += 0.006 * dtScale;
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
        p3Tick += dtScale;
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

/* ============================================================
   SLIDE 7 - SfM vs LiDAR interactive split
   ============================================================ */
export function initSfMLiDAR() {
  const split = document.getElementById("compare-split");
  if (!split) return { tick() {}, enter() {} };

  const panels = Array.from(split.querySelectorAll(".cp-panel"));
  const fills = {};
  panels.forEach((p) => {
    fills[p.dataset.side] = p.querySelector(".cp-charge-fill");
  });

  const charges = { sfm: 0, lidar: 0 };
  const pressing = { sfm: false, lidar: false };
  let active = null;

  const VIS_ACCENT = "#ff5a36";
  const VIS_INK = "#1a1a1a";

  // ── SfM panel canvas: bunny polaroids → still bunny surrounded by recovered camera frustums ──
  const sfmVisDraw = (() => {
    const cv = split.querySelector(".cp-vis-sfm");
    if (!cv) return () => {};
    const ctx = cv.getContext("2d");
    const W = cv.width,
      H = cv.height; // 520 × 340

    const BASE = "assets/generated/bunny_renders/";
    const SPRITE_COLS = 6;
    const SPRITE_FW = 300,
      SPRITE_FH = 300;
    // Frame used as the still bunny render. Row 0, col 1 — top-down view of the bunny's front.
    const STILL_FRAME = 1;

    // Real bunny polaroid images (9 angles) shown on the left
    const polaroidImgs = Array.from({ length: 9 }, (_, i) => {
      const img = new Image();
      img.src = BASE + `polaroid_${String(i).padStart(2, "0")}.png`;
      return img;
    });

    // Sprite sheet — one frame is drawn as the still 3D bunny render
    const spriteSheet = new Image();
    spriteSheet.src = BASE + "sprite_sheet.png";

    // Photo positions: (x, y, rotation_rad) - scattered 3×3 grid on left zone
    const photos = [
      [76, 78, -0.28],
      [124, 58, 0.16],
      [172, 80, -0.1],
      [52, 158, 0.13],
      [106, 155, -0.22],
      [164, 157, 0.19],
      [76, 236, -0.07],
      [126, 226, 0.23],
      [172, 238, -0.16],
    ];

    const PW = 72,
      PH = 84;

    const drawPolaroid = (px, py, angle, img) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.shadowColor = "rgba(0,0,0,0.16)";
      ctx.shadowBlur = 7;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = "#f8f6f2";
      ctx.fillRect(-PW / 2, -PH / 2, PW, PH);
      ctx.shadowColor = "transparent";
      const m = 4,
        bot = 11;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -PW / 2 + m, -PH / 2 + m, PW - m * 2, PH - m - bot);
      } else {
        ctx.fillStyle = "#d8d4ce";
        ctx.fillRect(-PW / 2 + m, -PH / 2 + m, PW - m * 2, PH - m - bot);
      }
      ctx.restore();
    };

    // ── 3D scene: still bunny + two horizontal rings of recovered cameras ──
    // Viewer is above and slightly in front of the scene, looking down at the
    // bunny at the origin. World Y is up, world Z is forward (toward viewer).
    const ox = 390,
      oy = H * 0.55;
    const SCALE = 90;
    const Y_FACTOR = 0.86; // world Y → screen Y compression (mostly preserved)
    const Z_FACTOR = 0.50; // world Z → screen Y compression (top-down tilt)

    const project = (x, y, z) => ({
      sx: ox + x * SCALE,
      sy: oy - y * SCALE * Y_FACTOR + z * SCALE * Z_FACTOR,
    });

    const buildRing = (count, radius, yLevel, phase = 0) => {
      const cams = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + phase;
        cams.push([Math.cos(a) * radius, yLevel, Math.sin(a) * radius]);
      }
      return cams;
    };

    // Two horizontal rings — outer/lower and inner/upper, like the classic SfM diagram
    const ringA = buildRing(48, 1.05, -0.16);
    const ringB = buildRing(42, 0.92, 0.30, Math.PI / 48);

    // For a camera at world position camPos pointing at the origin, build the
    // frustum geometry: apex at the camera, 4 corners of the far image plane
    // between the camera and the bunny. The view spreads outward from the
    // apex toward the scene.
    const frustumOf = (camPos) => {
      const [cx, cy, cz] = camPos;
      const len = Math.hypot(cx, cy, cz) || 1;
      const lx = -cx / len,
        ly = -cy / len,
        lz = -cz / len;
      // right = cross(look, worldUp=(0,1,0)) = (-lz, 0, lx)
      let rxv = -lz,
        ryv = 0,
        rzv = lx;
      const rLen = Math.hypot(rxv, ryv, rzv) || 1;
      rxv /= rLen;
      ryv /= rLen;
      rzv /= rLen;
      // up = cross(right, look)
      const uxv = ryv * lz - rzv * ly;
      const uyv = rzv * lx - rxv * lz;
      const uzv = rxv * ly - ryv * lx;

      const d = 0.18,
        fw = 0.16,
        fh = 0.11;
      const ccx = cx + lx * d,
        ccy = cy + ly * d,
        ccz = cz + lz * d;
      const corner = (sR, sU) => [
        ccx + rxv * (fw / 2) * sR + uxv * (fh / 2) * sU,
        ccy + ryv * (fw / 2) * sR + uyv * (fh / 2) * sU,
        ccz + rzv * (fw / 2) * sR + uzv * (fh / 2) * sU,
      ];
      return {
        apex: [cx, cy, cz],
        corners: [
          corner(-1, -1),
          corner(-1, 1),
          corner(1, 1),
          corner(1, -1),
        ],
        worldZ: cz,
      };
    };

    const allFrustums = [...ringA, ...ringB].map(frustumOf);
    const backFrustums = allFrustums.filter((f) => f.worldZ <= 0);
    const frontFrustums = allFrustums.filter((f) => f.worldZ > 0);

    const drawFrustum = (f, alpha) => {
      const a = project(f.apex[0], f.apex[1], f.apex[2]);
      const cs = f.corners.map((c) => project(c[0], c[1], c[2]));
      ctx.strokeStyle = `rgba(220,40,30,${alpha})`;
      ctx.lineWidth = 1;
      // apex → each corner of the far plane
      for (const c of cs) {
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.stroke();
      }
      // far-plane rectangle
      ctx.beginPath();
      ctx.moveTo(cs[0].sx, cs[0].sy);
      for (let i = 1; i < cs.length; i++) {
        ctx.lineTo(cs[i].sx, cs[i].sy);
      }
      ctx.closePath();
      ctx.stroke();
    };

    return (_dtScale = 1) => {
      ctx.clearRect(0, 0, W, H);

      // Polaroid photos (input)
      photos.forEach(([x, y, a], i) => drawPolaroid(x, y, a, polaroidImgs[i]));

      // Arrow
      const ax = 210,
        ay = H * 0.5,
        aw = 32,
        ah = 8;
      ctx.fillStyle = "#909090";
      ctx.beginPath();
      ctx.moveTo(ax, ay - ah / 2);
      ctx.lineTo(ax + aw - ah, ay - ah / 2);
      ctx.lineTo(ax + aw - ah, ay - ah);
      ctx.lineTo(ax + aw, ay);
      ctx.lineTo(ax + aw - ah, ay + ah);
      ctx.lineTo(ax + aw - ah, ay + ah / 2);
      ctx.lineTo(ax, ay + ah / 2);
      ctx.closePath();
      ctx.fill();

      // Back-half frustums (behind the bunny) — drawn first, slightly faded
      backFrustums.forEach((f) => drawFrustum(f, 0.32));

      // Still bunny render in the centre
      if (spriteSheet.complete && spriteSheet.naturalWidth > 0) {
        const fc = STILL_FRAME % SPRITE_COLS;
        const fr = Math.floor(STILL_FRAME / SPRITE_COLS);
        const bSize = 130;
        ctx.drawImage(
          spriteSheet,
          fc * SPRITE_FW,
          fr * SPRITE_FH,
          SPRITE_FW,
          SPRITE_FH,
          ox - bSize / 2,
          oy - bSize / 2 - 6,
          bSize,
          bSize,
        );
      }

      // Front-half frustums (in front of the bunny) — drawn over it, fully opaque
      frontFrustums.forEach((f) => drawFrustum(f, 0.82));
    };
  })();

  // ── Light Fields panel canvas: all 6 pipeline stages live simultaneously ──
  const lfVisDraw = (() => {
    const cv = split.querySelector(".cp-vis-lf");
    if (!cv) return () => {};
    const ctx = cv.getContext("2d");
    const W = cv.width,
      H = cv.height; // 400 × 340

    const BASE = "assets/generated/bunny_pipeline/";
    const mk = (s) => {
      const i = new Image();
      i.src = BASE + s;
      return i;
    };
    const imgRGB = mk("01_input_rgb.png");
    const imgDepth = mk("03_depth_colormap.png");
    const imgHoles = mk("07_left_view_holes_overlay.png");
    const imgLeft = mk("08_left_view_inpainted.png");
    const imgRight = mk("12_right_view_inpainted.png");

    // Grid: 2 columns × 3 rows
    const COLS = 2,
      ROWS = 3,
      GAP = 4,
      LABEL_H = 16;
    const CW = Math.floor((W - GAP * (COLS - 1)) / COLS); // ~198
    const CH = Math.floor((H - GAP * (ROWS - 1)) / ROWS); // ~110
    const IMG_H = CH - LABEL_H; // image area height

    const LABELS = [
      "קלט RGB",
      "מפת עומק",
      "פרוקסי 3D",
      "הזזה + חורים",
      "מבט ימין",
      "מבט שמאל",
    ];

    // Cell positions [cx, cy]
    const cells = [
      [0, 0], // 0: RGB
      [CW + GAP, 0], // 1: Depth
      [0, CH + GAP], // 2: Particles
      [CW + GAP, CH + GAP], // 3: Warp
      [0, 2 * (CH + GAP)], // 4: Left novel view
      [CW + GAP, 2 * (CH + GAP)], // 5: Right novel view
    ];

    // Pixel buffer for the particle cell (dirty-rect update, transparent background)
    const pixBuf = ctx.createImageData(W, H);
    const pd = pixBuf.data;

    let particles = null;
    fetch(BASE + "particles.json")
      .then((r) => r.json())
      .then((d) => {
        particles = d;
      });

    // ── helpers ─────────────────────────────────────────────────────────────

    // Draw an image contained + centred inside a cell's image area (above label)
    function drawCell(img, ci, alpha = 1, zoom = 1) {
      if (!img.complete || !img.naturalWidth) return;
      const [cx, cy] = cells[ci];
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, CW, IMG_H);
      ctx.clip();
      ctx.globalAlpha = alpha;
      const iw = img.naturalWidth,
        ih = img.naturalHeight;
      const s = Math.min(CW / iw, IMG_H / ih) * zoom;
      const dw = iw * s,
        dh = ih * s;
      ctx.drawImage(img, cx + (CW - dw) / 2, cy + (IMG_H - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Draw label text below the image area (no background bar)
    function drawLabel(ci) {
      const [cx, cy] = cells[ci];
      ctx.fillStyle = "#6b6560";
      ctx.font = "500 10px 'Heebo', 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LABELS[ci], cx + CW / 2, cy + IMG_H + LABEL_H / 2);
      ctx.textBaseline = "alphabetic";
    }

    // Render particles into the pixel buffer for cell 2 (image area only)
    function drawParticleCell(t) {
      if (!particles) return;
      const [cx, cy] = cells[2];
      const IH = IMG_H;
      // Clear image area to transparent so panel background shows through
      for (let y = cy; y < cy + IH; y++) {
        for (let x = cx; x < cx + CW; x++) {
          const i = (y * W + x) * 4;
          pd[i] = 0;
          pd[i + 1] = 0;
          pd[i + 2] = 0;
          pd[i + 3] = 0;
        }
      }
      const tilt = Math.min(t / 120, 1);
      const CX = cx + CW / 2,
        CY = cy + IH / 2;
      const SX = CW * 0.82,
        SY = IH * 0.86;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const nx = p[0],
          ny = p[1],
          nz = p[2],
          r = p[3],
          g = p[4],
          b = p[5];
        const phase = (i * 2.3999) % 6.2832;
        const wz = nz + tilt * Math.sin(t * 0.045 + phase) * 0.048;
        const fx = cx + (nx + 0.5) * CW;
        const fy = cy + (ny + 0.5) * IH;
        const px3 = CX + (nx + 0.3 * wz) * SX;
        const py3 = CY + (ny - 0.18 * wz) * SY;
        const px = Math.round(fx + tilt * (px3 - fx));
        const py = Math.round(fy + tilt * (py3 - fy));
        if (px < cx || px >= cx + CW - 1 || py < cy || py >= cy + IH - 1)
          continue;
        const idx = (py * W + px) * 4;
        pd[idx] = r;
        pd[idx + 1] = g;
        pd[idx + 2] = b;
        pd[idx + 3] = 255;
        pd[idx + 4] = r;
        pd[idx + 5] = g;
        pd[idx + 6] = b;
        pd[idx + 7] = 255;
        const idx2 = ((py + 1) * W + px) * 4;
        pd[idx2] = r;
        pd[idx2 + 1] = g;
        pd[idx2 + 2] = b;
        pd[idx2 + 3] = 255;
      }
      ctx.putImageData(pixBuf, 0, 0, cx, cy, CW, IH);
    }

    let t = 0;

    return (dtScale = 1) => {
      t += dtScale;
      ctx.clearRect(0, 0, W, H);

      // Cell 0 - Input RGB (slow Ken Burns)
      const zoom = 1 + 0.04 * Math.abs(Math.sin(t * 0.003));
      drawCell(imgRGB, 0, 1, zoom);
      drawLabel(0);

      // Cell 1 - Depth colormap
      drawCell(imgDepth, 1);
      drawLabel(1);

      // Cell 2 - 3D particle proxy (fly-in + dance)
      drawParticleCell(t);
      drawLabel(2);

      // Cell 3 - Camera shift: oscillate normal ↔ holes
      const osc = (1 - Math.cos(t * 0.055)) / 2;
      drawCell(imgRGB, 3, 1);
      drawCell(imgHoles, 3, osc);
      drawLabel(3);

      // Cell 4 - Left novel view
      drawCell(imgLeft, 4);
      drawLabel(4);

      // Cell 5 - Right novel view
      drawCell(imgRight, 5);
      drawLabel(5);
    };
  })();

  const CHARGE_RATE = 1 / 30; // ~0.5 s hold to select
  const DRAIN_RATE = 1 / 25; // drains faster than it charges

  function select(side) {
    active = side;
    split.dataset.active = side;
    charges.sfm = charges.lidar = 0;
    pressing.sfm = pressing.lidar = false;
    panels.forEach((p) => {
      p.style.setProperty("--charge", 0);
    });
    fills[side] && (fills[side].style.width = "0%");
  }

  function reset() {
    active = null;
    split.dataset.active = "";
    charges.sfm = charges.lidar = 0;
    pressing.sfm = pressing.lidar = false;
    panels.forEach((p) => {
      p.style.setProperty("--charge", 0);
      const f = p.querySelector(".cp-charge-fill");
      if (f) f.style.width = "0%";
    });
  }

  // Long-press listeners (inactive panels) + single-click on collapsed panel to go back
  panels.forEach((p) => {
    const side = p.dataset.side;
    const start = () => {
      if (!active) pressing[side] = true;
    };
    const stop = () => {
      pressing[side] = false;
    };
    p.addEventListener("mousedown", start);
    p.addEventListener("touchstart", start, { passive: true });
    p.addEventListener("mouseup", stop);
    p.addEventListener("mouseleave", stop);
    p.addEventListener("touchend", stop);
    p.addEventListener("touchcancel", stop);
    // clicking the collapsed (thin) panel resets back to neutral
    p.addEventListener("click", () => {
      if (active && active !== side) reset();
    });
  });

  // Back buttons also reset (and stop propagation so panel click doesn't double-fire)
  split.querySelectorAll(".cp-back-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reset();
    });
  });

  // Prevent text selection while holding
  split.addEventListener("mousedown", (e) => e.preventDefault());

  return {
    tick(visible, dtScale = 1) {
      if (!visible) return;
      if (active === "sfm") {
        sfmVisDraw(dtScale);
        return;
      }
      if (active === "lidar") {
        lfVisDraw(dtScale);
        return;
      }
      ["sfm", "lidar"].forEach((side) => {
        if (pressing[side]) {
          charges[side] = Math.min(1, charges[side] + CHARGE_RATE * dtScale);
          if (charges[side] >= 1) {
            select(side);
            return;
          }
        } else {
          charges[side] = Math.max(0, charges[side] - DRAIN_RATE * dtScale);
        }
        const panel = panels.find((p) => p.dataset.side === side);
        if (panel)
          panel.style.setProperty("--charge", charges[side].toFixed(3));
        if (fills[side])
          fills[side].style.width = (charges[side] * 100).toFixed(1) + "%";
      });
    },
    enter() {
      reset();
    },
  };
}

/* ============================================================
   SLIDE 8 - Why classical methods failed (Utah Teapot point cloud)
   ============================================================ */
export function initLimits() {
  const canvas = document.getElementById("c-limits");
  if (!canvas) return { tick() {}, enter() {} };
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;

  // Build fallback sphere (used until teapot JSON loads)
  function makeSphere(n) {
    return Array.from({ length: n }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.55 + Math.random() * 0.45;
      return {
        ox: Math.sin(phi) * Math.cos(theta) * r,
        oy: Math.sin(phi) * Math.sin(theta) * r * 0.75,
        oz: Math.cos(phi) * r,
        phase: Math.random() * Math.PI * 2,
        rng: Math.random(),
      };
    });
  }

  // pts starts as a sphere; replaced by teapot once JSON loads
  // Python coord convention: x=left/right, y=front/back, z=up
  // JS convention: oy=up axis (rotates around y), so swap z↔y and negate new oy for upright display
  let pts = makeSphere(520);

  // Saturn model is z-up: map px→ox, -pz→oy (flip so top is up), py→oz (depth)
  fetch("assets/generated/limits_model.json")
    .then((r) => r.json())
    .then((data) => {
      pts = data.map(([px, py, pz]) => ({
        ox: px,
        oy: -pz, // negate: positive z (top) renders above screen centre
        oz: py,
        phase: Math.random() * Math.PI * 2,
        rng: Math.random(),
      }));
    })
    .catch(() => {
      /* keep sphere fallback */
    });

  // Click-driven mode: each click advances to the next failure mode (0-4)
  let currentMode = -1; // -1 = clean/idle, 0-4 = active failure mode
  let modeT = 0; // 60fps-equivalent ticks since current mode became active
  let t = 0; // 60fps-equivalent ticks since this slide initialised
  let lastMode = -2;

  const items = Array.from(document.querySelectorAll(".limit-item"));

  // Advance mode on click anywhere on the slide
  const slide = canvas.closest(".slide");
  const clickTarget = slide || canvas;
  clickTarget.style.cursor = "pointer";
  clickTarget.addEventListener("click", () => {
    currentMode = (currentMode + 1) % 5;
    modeT = 0;
    lastMode = -2;
  });

  function draw() {
    const mode = currentMode;
    const progress = Math.min(modeT / 200, 1.0); // 0→1 over ~3.3 s
    const baseRot = t * 0.006;

    // Update highlighted item
    if (mode !== lastMode) {
      lastMode = mode;
      items.forEach((el, i) => el.classList.toggle("lim-active", i === mode));
    }

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1c1812";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines (reference frame)
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const gstep = 60;
    for (let gx = 0; gx < W; gx += gstep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += gstep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    const CX = W * 0.5,
      CY = H * 0.5;
    const SCALE = Math.min(W, H) * 0.68;

    // Build projected points
    const projected = pts.map((p) => {
      let { ox, oy, oz, phase, rng } = p;
      let alpha = 1.0;
      let glitch = false;
      let wrongColor = false;

      const cosY = Math.cos(baseRot),
        sinY = Math.sin(baseRot);
      let rx = ox * cosY - oz * sinY;
      let ry = oy;
      let rz = ox * sinY + oz * cosY;

      // ── Mode effects ──────────────────────────────────────────
      if (mode === 0) {
        // Motion stutter: freeze rotation in bands, then snap
        const stutterPhase = t % 22;
        if (stutterPhase < 16) {
          const frozenRot = Math.floor(t / 22) * 22 * 0.006;
          const cf = Math.cos(frozenRot),
            sf = Math.sin(frozenRot);
          rx = ox * cf - oz * sf;
          rz = ox * sf + oz * cf;
        }
        // Extra jitter on right hemisphere
        if (rz > 0.1) {
          rx += Math.sin(t * 0.41 + phase) * 0.03;
          ry += Math.cos(t * 0.37 + phase) * 0.025;
        }
      } else if (mode === 1) {
        // Scan sweep reveals only what cameras can capture.
        // Blind spots stay dark the entire time - they simply never light up.
        const patch =
          Math.sin(ox * 4.7 + oz * 3.3) * Math.cos(oy * 5.1 + oz * 2.8);
        const blind =
          oy > 0.28 || (oy > 0.1 && rng < (oy - 0.1) / 0.18) || patch > 0.68;

        if (blind) {
          alpha = 0;
        } else {
          // Beam sweeps oy from -1.05 → +1 over 0.75 of progress, then holds
          const scanPos = -1.05 + 2.05 * Math.min(progress / 0.75, 1);
          if (oy > scanPos + 0.06) {
            alpha = 0; // ahead of scanner, not yet reached
          } else if (oy > scanPos - 0.04) {
            alpha = 2.0; // beam glow
          }
          // else already scanned: alpha stays 1
        }
      } else if (mode === 2) {
        // Wrong colors: random glitch hits
        wrongColor = Math.sin(t * 0.13 + phase * 3.7) > 0.4;
        if (wrongColor) {
          rx += Math.sin(t * 0.09 + phase) * 0.05;
          ry += Math.cos(t * 0.11 + phase) * 0.04;
        }
      } else if (mode === 3) {
        // Real-time lag: ultra-slow rotation then time-warp jump
        const lagRot = Math.floor(t / 8) * 8 * 0.0008;
        const cl = Math.cos(lagRot),
          sl = Math.sin(lagRot);
        rx = ox * cl - oz * sl;
        rz = ox * sl + oz * cl;
        // Every 50 ticks: "frame skip" jitter
        if (t % 50 > 46) {
          rx += (rng - 0.5) * 0.25;
          ry += (rng - 0.5) * 0.2;
        }
      } else if (mode === 4) {
        // Zoom in/out: shift all points along depth axis → perspective compression
        // changes continuously, showing how depth affects what you see
        rz += Math.sin(modeT * 0.022) * 0.5;
      }

      // Perspective project: viewer at z = -3.5, focal = 2.0
      // Near (rz ≈ -1) → larger proj; far (rz ≈ +1) → smaller proj
      const proj = 2.0 / (rz + 3.5);
      const sx = CX + rx * SCALE * proj;
      const sy = CY + ry * SCALE * proj;
      const depth = (1 - rz) / 2; // 0=far(rz=1), 1=near(rz=-1)

      return { sx, sy, depth, alpha, wrongColor, proj, rng };
    });

    // Sort far→near (depth 0 first, depth 1 on top)
    projected.sort((a, b) => a.depth - b.depth);

    // Draw scan line for mode 1 during sweep phase
    if (mode === 1 && progress < 0.75) {
      const scanPos = -1.05 + 2.05 * (progress / 0.75);
      const scanY = CY + scanPos * SCALE * (2.0 / 3.5);
      const grad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6);
      grad.addColorStop(0, "rgba(160,230,255,0)");
      grad.addColorStop(0.5, "rgba(160,230,255,0.35)");
      grad.addColorStop(1, "rgba(160,230,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, scanY - 6, W, 12);
    }

    projected.forEach(({ sx, sy, depth, alpha, wrongColor, proj, rng }) => {
      if (alpha < 0.05) return;
      const size = (1.4 + depth * 1.8) * proj;

      let color;
      if (alpha > 1.2) {
        // Scan beam glow: bright cyan-white flash
        color = `rgba(160,230,255,0.95)`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.8, size * 1.5), 0, Math.PI * 2);
        ctx.fill();
        return;
      } else if (wrongColor) {
        const hues = ["255,80,30", "80,200,255", "200,255,80"];
        const h = hues[Math.floor(rng * hues.length)];
        color = `rgba(${h},${(alpha * 0.92).toFixed(2)})`;
      } else {
        const v = Math.round(80 + depth * 120);
        const r = Math.min(255, v + 40),
          g = Math.round(v * 0.72),
          b = Math.round(v * 0.52);
        color = `rgba(${r},${g},${b},${(alpha * 0.88).toFixed(2)})`;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  return {
    tick(visible, dtScale = 1) {
      if (!visible) return;
      t += dtScale;
      modeT += dtScale;
      draw();
    },
    enter() {
      t = 0;
      modeT = 0;
      currentMode = -1;
      lastMode = -2;
      items.forEach((el) => el.classList.remove("lim-active"));
    },
  };
}

/* ============================================================
   SLIDE 9 - Transition to NVS + model history timeline.
   Auto-cycles through SRN → NeRF → Mip-NeRF → Instant-NGP → 3DGS → 4D-GS.
   The fill bar travels toward the next node and that node only lights up
   when the bar arrives (so the active orange dot doesn't snap on early).
   After the last dot the bar exits off the right edge, resets, and the
   leading comet re-enters from the left edge to start the cycle again.
   ============================================================ */
export function initSRN() {
  const slide = document.querySelector('.slide[data-id="10"]');
  if (!slide) return { tick() {} };

  const hero = document.getElementById("srn-hero");
  const thumbBtns = Array.from(slide.querySelectorAll(".srn-thumb"));

  thumbBtns.forEach((btn) => {
    const thumbVid = btn.querySelector("video");

    btn.addEventListener("click", () => {
      hero.src = btn.dataset.src;
      hero.load();
      hero.play().catch(() => {});
      thumbBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

    btn.addEventListener("mouseenter", () => {
      if (thumbVid) {
        thumbVid.loop = true;
        thumbVid.play().catch(() => {});
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (thumbVid) thumbVid.pause();
    });
  });

  return {
    enter() {
      primeVideo(hero, true);
    },
    tick(visible) {
      if (visible) {
        if (hero && hero.paused) hero.play().catch(() => {});
      } else {
        if (hero) hero.pause();
      }
    },
  };
}

export function initNeRFIntro() {
  const slide = document.querySelector('.slide[data-id="13"]');
  if (!slide) return { tick() {}, enter() {} };

  const carousel = slide.querySelector(".nerf-carousel");
  const videos = Array.from(slide.querySelectorAll("video"));
  videos.forEach((v) => {
    v.muted = true;
    v.playsInline = true;
    v.loop = true;
  });

  let slideVisible = false;
  let frameCount = 0;

  function pauseAll() {
    for (const v of videos) {
      if (!v.paused) v.pause();
    }
  }

  function updatePlayback() {
    if (!carousel) return;
    const cRect = carousel.getBoundingClientRect();
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      const inView =
        slideVisible && r.right > cRect.left - 80 && r.left < cRect.right + 80;
      if (inView) {
        if (v.readyState === 0) v.load();
        if (v.paused) v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    }
  }

  return {
    enter() {
      slideVisible = true;
      updatePlayback();
    },
    tick(visible) {
      if (visible) {
        if (!slideVisible) {
          slideVisible = true;
          updatePlayback();
          frameCount = 0;
        } else if (frameCount++ % 6 === 0) {
          updatePlayback();
        }
      } else if (slideVisible) {
        slideVisible = false;
        pauseAll();
      }
    },
  };
}

export function initNvsIntro() {
  const slide = document.querySelector('section[data-id="9"]');
  if (!slide) return { tick() {}, enter() {} };

  const fill = slide.querySelector("#nvs-tl-fill");
  const nodes = Array.from(slide.querySelectorAll(".nvs-tl-node"));
  const details = Array.from(slide.querySelectorAll(".nvs-tl-detail-slide"));
  if (!fill || !nodes.length || !details.length)
    return { tick() {}, enter() {} };

  // Node centres are positioned by inline left:% in the HTML. We mirror them
  // here so the fill bar can reach the same x position without DOM measurement.
  // Symmetric 10% margins on each side, 16% spacing between dots.
  const NODE_PCT = [10, 26, 42, 58, 74, 90];
  // Fill bar is anchored at left:0 (the screen's left edge) so the segment
  // before the first dot is also painted. Width grows to NODE_PCT[i].
  const TRANS_MS = 750; // matches the CSS transition duration
  const CYCLE_TICKS = 420; // ~7 s at 60fps between auto-advances

  let activeIdx = -1;
  let cycleT = 0;
  let isWrapping = false;
  let autoCycle = true;
  let activeTimer = null;

  function applyFillImmediate(left, width) {
    // Suspend transitions so we can teleport the bar (used by the wraparound).
    fill.style.transition = "none";
    fill.style.left = left;
    fill.style.width = width;
    // Force the browser to flush the change before re-enabling transitions,
    // otherwise the next style change just continues the prior animation.
    void fill.offsetWidth;
    fill.style.transition = "";
  }

  function setActive(i, immediate = false) {
    if (i === activeIdx) return;
    if (activeTimer) clearTimeout(activeTimer);

    activeIdx = i;
    cycleT = 0;

    // Past/default state applies immediately; the *new* active dot waits.
    nodes.forEach((n, j) => {
      n.classList.remove("tl-active");
      n.classList.toggle("tl-past", j < i);
    });
    // The detail card cross-fades over the same window as the fill travel.
    details.forEach((d, j) => d.classList.toggle("detail-active", j === i));

    // Bar is in motion - show the comet head so we have a leading indicator.
    fill.classList.remove("at-rest");

    // Animate the fill toward the target dot. Always anchored at left:0 so
    // the segment between the screen edge and the first dot stays painted.
    fill.style.left = "0";
    fill.style.width = NODE_PCT[i] + "%";

    if (immediate) {
      nodes[i].classList.add("tl-active");
      fill.classList.add("at-rest");
    } else {
      // Delay the active class so the dot lights up exactly when the bar
      // arrives. The comet also fades at the same moment, so the active
      // dot's appear animation plays cleanly without the comet on top of it.
      activeTimer = setTimeout(() => {
        nodes[i].classList.add("tl-active");
        fill.classList.add("at-rest");
      }, TRANS_MS);
    }
  }

  function startWrap() {
    isWrapping = true;
    if (activeTimer) clearTimeout(activeTimer);
    // Drop the current active flag so the last orange dot stops pulsing while
    // the bar carries it off. Past dots keep their pale-orange colour for now.
    nodes.forEach((n) => n.classList.remove("tl-active"));
    // Comet is moving (off to the right), make sure it's visible.
    fill.classList.remove("at-rest");

    // Phase 1: bar slides off the right edge as a whole - animate `left`
    // from 0 to 100% while keeping the width unchanged (~90% at this point).
    fill.style.left = "100%";

    setTimeout(() => {
      // Phase 2: reset all dot/detail state, teleport bar back to the left
      // edge at zero width (invisible).
      nodes.forEach((n) => n.classList.remove("tl-past", "tl-active"));
      details.forEach((d) => d.classList.remove("detail-active"));
      applyFillImmediate("0", "0");

      // Phase 3: regrow the bar from the left edge out to the first dot.
      requestAnimationFrame(() => {
        fill.style.width = NODE_PCT[0] + "%";
      });

      // Phase 4: when the leading edge reaches the first dot, light it up.
      setTimeout(() => {
        activeIdx = -1;
        cycleT = 0;
        isWrapping = false;
        setActive(0, true);
      }, TRANS_MS);
    }, TRANS_MS);
  }

  function advance() {
    if (activeIdx >= nodes.length - 1) startWrap();
    else setActive(activeIdx + 1);
  }

  nodes.forEach((n) => {
    n.addEventListener("click", () => {
      autoCycle = false;
      if (isWrapping) return;
      setActive(parseInt(n.dataset.idx, 10));
    });
  });

  return {
    tick(visible, dtScale = 1) {
      if (!visible) return;
      if (!autoCycle) return;
      if (isWrapping) return;
      cycleT += dtScale;
      if (cycleT >= CYCLE_TICKS) advance();
    },
    enter() {
      activeIdx = -1;
      cycleT = 0;
      isWrapping = false;
      autoCycle = true;
      if (activeTimer) clearTimeout(activeTimer);
      applyFillImmediate("0", "0");
      fill.classList.remove("at-rest");
      setActive(0, true);
    },
  };
}

/* =========================================================
   Slide 11: SRN network animation - pixel flows through MLP
   ========================================================= */
export function initSRNNetAnim() {
  const slide = document.querySelector('.slide[data-id="11"]');
  if (!slide) return { tick() {} };
  const canvas = slide.querySelector("#srn-net-canvas");
  if (!canvas) return { tick() {} };
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width;
    H = rect.height;
  }
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(canvas);
  }

  // ---- Input scene image (sampled from pixelated.png) ----
  const IMG_COLS = 20, IMG_ROWS = 20;
  function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  const imgPixels = [];
  // pre-fill with neutral grey so the grid renders before the image loads
  for (let i = 0; i < IMG_COLS * IMG_ROWS; i++) {
    imgPixels.push({ r: 180, g: 180, b: 185 });
  }
  let imageLoaded = false;

  const sourceImage = new Image();
  sourceImage.crossOrigin = "anonymous";
  sourceImage.onload = () => {
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = IMG_COLS;
    sampleCanvas.height = IMG_ROWS;
    const sctx = sampleCanvas.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(sourceImage, 0, 0, IMG_COLS, IMG_ROWS);
    const data = sctx.getImageData(0, 0, IMG_COLS, IMG_ROWS).data;
    for (let i = 0; i < IMG_COLS * IMG_ROWS; i++) {
      imgPixels[i] = {
        r: clamp255(data[i * 4]),
        g: clamp255(data[i * 4 + 1]),
        b: clamp255(data[i * 4 + 2]),
      };
    }
    imageLoaded = true;
  };
  sourceImage.src = "assets/srn/nn-photo-2.png";

  // ---- Network architecture ----
  // input (x,y,z + θ,φ) → 3 hidden layers → RGB output
  const layerCounts = [2, 6, 6, 6, 3];
  const OUT_RGB = [
    { r: 235, g: 70, b: 50 },
    { r: 0, g: 178, b: 130 },
    { r: 54, g: 130, b: 255 },
  ];

  // ---- Pulse state ----
  const pulses = [];
  let spawnTimer = 130; // spawn first pulse quickly
  let outColor = { r: 220, g: 220, b: 220 };
  let outFromColor = { r: 220, g: 220, b: 220 };
  let outToColor = { r: 220, g: 220, b: 220 };
  let outFlash = 0;

  // Phase durations in ticks (60fps reference)
  // 0: pixel highlight on image
  // 1: image -> input neurons
  // 2..5: layer L -> layer L+1 (4 transitions)
  // 6: output -> swatch
  const PHASE_DUR = [42, 50, 40, 40, 40, 40, 55];

  function spawnPulse() {
    const idx = Math.floor(Math.random() * imgPixels.length);
    pulses.push({
      px: idx % IMG_COLS,
      py: Math.floor(idx / IMG_COLS),
      color: imgPixels[idx],
      phase: 0,
      t: 0,
    });
  }

  function step(dtScale) {
    // Only spawn a new pulse when the previous one has finished, and only once
    // the source image has been sampled — otherwise the first pulse would lock
    // in the neutral-grey pre-fill color.
    if (pulses.length === 0 && imageLoaded) {
      spawnTimer += dtScale;
      if (spawnTimer > 40) {
        spawnPulse();
        spawnTimer = 0;
      }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const dur = PHASE_DUR[p.phase] || 40;
      p.t += dtScale / dur;
      if (p.t >= 1) {
        p.t = 0;
        p.phase++;
        if (p.phase === 6) {
          // Save current swatch color as the "from" and the pulse color as the "to";
          // the swatch will smoothly fade between them during phase 6 so it lands at
          // the new color exactly when the particles arrive.
          outFromColor = { r: outColor.r, g: outColor.g, b: outColor.b };
          outToColor = { r: p.color.r, g: p.color.g, b: p.color.b };
        }
        if (p.phase > 6) {
          // Particles have arrived: lock in the final color and trigger the flash.
          outColor = { r: outToColor.r, g: outToColor.g, b: outToColor.b };
          outFlash = 1;
          pulses.splice(i, 1);
        }
      }
      // Smoothly interpolate the swatch color during phase 6 (ease-in cubic so most
      // of the color change happens as the particles approach the swatch).
      // Ramp outFlash up with the same curve so the shadow grows in gradually too.
      if (p.phase === 6) {
        const tt = Math.min(1, p.t);
        const eased = tt * tt * tt;
        outColor = {
          r: outFromColor.r + (outToColor.r - outFromColor.r) * eased,
          g: outFromColor.g + (outToColor.g - outFromColor.g) * eased,
          b: outFromColor.b + (outToColor.b - outFromColor.b) * eased,
        };
        outFlash = Math.max(outFlash, eased);
      }
    }
    if (outFlash > 0) outFlash = Math.max(0, outFlash - dtScale * 0.02);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ---- Layout ----
    const imgSize = Math.min(W * 0.18, H * 0.78);
    const imgX = W * 0.025;
    const imgY = (H - imgSize) / 2;
    const imgW = imgSize;
    const imgH = imgSize;
    const cellW = imgW / IMG_COLS;
    const cellH = imgH / IMG_ROWS;

    const netX1 = W * 0.32;
    const netX2 = W * 0.83;
    const layerXs = layerCounts.map((_, i) =>
      netX1 + (netX2 - netX1) * (i / (layerCounts.length - 1))
    );
    const padTop = H * 0.16;
    const padBot = H * 0.16;
    const usableH = H - padTop - padBot;
    function nodeY(l, n) {
      const c = layerCounts[l];
      return padTop + (usableH * (n + 0.5)) / c;
    }

    const swX = W * 0.88;
    const swY = H * 0.4;
    const swW = W * 0.085;
    const swH = H * 0.2;

    // ---- Draw input image: white card with shadow ----
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fff";
    ctx.fillRect(imgX - 3, imgY - 3, imgW + 6, imgH + 6);
    ctx.restore();

    for (let y = 0; y < IMG_ROWS; y++) {
      for (let x = 0; x < IMG_COLS; x++) {
        const p = imgPixels[y * IMG_COLS + x];
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(
          imgX + x * cellW,
          imgY + y * cellH,
          cellW + 0.5,
          cellH + 0.5,
        );
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < IMG_COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(imgX + i * cellW, imgY);
      ctx.lineTo(imgX + i * cellW, imgY + imgH);
      ctx.stroke();
    }
    for (let i = 1; i < IMG_ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(imgX, imgY + i * cellH);
      ctx.lineTo(imgX + imgW, imgY + i * cellH);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(imgX - 0.5, imgY - 0.5, imgW + 1, imgH + 1);

    // Highlight selected pixels (phase 0)
    pulses.forEach((p) => {
      if (p.phase === 0) {
        const px = imgX + p.px * cellW;
        const py = imgY + p.py * cellH;
        const alpha = Math.min(1, Math.sin(p.t * Math.PI) * 1.1);
        ctx.save();
        // Strong yellow glow with a thin border
        ctx.shadowColor = `rgba(255,220,80,${alpha})`;
        ctx.shadowBlur = 42;
        ctx.strokeStyle = `rgba(255,220,80,${alpha})`;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(px - 0.5, py - 0.5, cellW + 1, cellH + 1);
        // Second pass for extra glow without thickening the line
        ctx.shadowBlur = 24;
        ctx.strokeRect(px - 0.5, py - 0.5, cellW + 1, cellH + 1);
        ctx.restore();
      } else if (p.phase >= 1) {
        // fading marker
        const fade = Math.max(0, 0.5 - p.phase * 0.07);
        if (fade > 0.02) {
          const px = imgX + p.px * cellW;
          const py = imgY + p.py * cellH;
          ctx.save();
          ctx.strokeStyle = `rgba(255,220,80,${fade})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(px - 0.5, py - 0.5, cellW + 1, cellH + 1);
          ctx.restore();
        }
      }
    });

    // ---- Faint background connections ----
    ctx.strokeStyle = "rgba(130,130,140,0.45)";
    ctx.lineWidth = 0.8;
    for (let l = 0; l < layerCounts.length - 1; l++) {
      for (let i = 0; i < layerCounts[l]; i++) {
        for (let j = 0; j < layerCounts[l + 1]; j++) {
          ctx.beginPath();
          ctx.moveTo(layerXs[l], nodeY(l, i));
          ctx.lineTo(layerXs[l + 1], nodeY(l + 1, j));
          ctx.stroke();
        }
      }
    }

    // ---- Highlighted connections + traveling particles (phases 2..5) ----
    pulses.forEach((p) => {
      if (p.phase >= 2 && p.phase <= 5) {
        const fromL = p.phase - 2;
        const toL = p.phase - 1;
        const x1 = layerXs[fromL];
        const x2 = layerXs[toL];
        const wave = 1 - Math.abs(p.t - 0.5) * 2;
        const lineAlpha = 0.45 * wave;
        if (lineAlpha > 0.02) {
          ctx.save();
          ctx.strokeStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${lineAlpha})`;
          ctx.lineWidth = 1.1;
          for (let i = 0; i < layerCounts[fromL]; i++) {
            for (let j = 0; j < layerCounts[toL]; j++) {
              ctx.beginPath();
              ctx.moveTo(x1, nodeY(fromL, i));
              ctx.lineTo(x2, nodeY(toL, j));
              ctx.stroke();
            }
          }
          ctx.restore();
        }
        // particles
        ctx.save();
        ctx.fillStyle = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
        ctx.shadowColor = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
        ctx.shadowBlur = 6;
        for (let i = 0; i < layerCounts[fromL]; i++) {
          for (let j = 0; j < layerCounts[toL]; j++) {
            const y1 = nodeY(fromL, i);
            const y2 = nodeY(toL, j);
            const x = x1 + (x2 - x1) * p.t;
            const y = y1 + (y2 - y1) * p.t;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    });

    // ---- Image → input neurons (phase 1) ----
    pulses.forEach((p) => {
      if (p.phase === 1) {
        const sx = imgX + p.px * cellW + cellW / 2;
        const sy = imgY + p.py * cellH + cellH / 2;
        for (let i = 0; i < layerCounts[0]; i++) {
          const tx = layerXs[0];
          const ty = nodeY(0, i);
          const cpx = (sx + tx) / 2;
          const cpy = (sy + ty) / 2 - 35;
          const t = p.t;
          const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cpx + t * t * tx;
          const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cpy + t * t * ty;

          ctx.save();
          ctx.strokeStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},0.4)`;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpx, cpy, tx, ty);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
          ctx.shadowColor = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    });

    // ---- Output neurons → swatch (phase 6) ----
    pulses.forEach((p) => {
      if (p.phase === 6) {
        for (let i = 0; i < layerCounts[layerCounts.length - 1]; i++) {
          const sx = layerXs[layerXs.length - 1];
          const sy = nodeY(layerCounts.length - 1, i);
          const tx = swX;
          const ty = swY + swH / 2;
          const t = p.t;
          const x = sx + (tx - sx) * t;
          const y = sy + (ty - sy) * t;
          ctx.save();
          ctx.fillStyle = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
          ctx.shadowColor = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    });

    // ---- Draw neurons ----
    for (let l = 0; l < layerCounts.length; l++) {
      for (let n = 0; n < layerCounts[l]; n++) {
        const cx = layerXs[l];
        const cy = nodeY(l, n);
        const baseR = l === 0 || l === layerCounts.length - 1 ? 11 : 7;

        // Activation 0..1 and the color of the pulse driving it
        let active = 0;
        let activeColor = null;
        pulses.forEach((p) => {
          let pa = 0;
          // Leaving layer l = phase l+2 starting
          if (p.phase === l + 2 && p.t < 0.45) {
            pa = Math.max(pa, 1 - p.t / 0.45);
          }
          // Arriving at layer l = phase l+1 ending
          if (p.phase === l + 1 && p.t > 0.55) {
            pa = Math.max(pa, (p.t - 0.55) / 0.45);
          }
          // Input layer also lights on phase 1
          if (l === 0 && p.phase === 1) {
            pa = Math.max(pa, Math.min(1, p.t * 1.6));
          }
          // Output layer also lights briefly during phase 6
          if (l === layerCounts.length - 1 && p.phase === 6 && p.t < 0.4) {
            pa = Math.max(pa, 1 - p.t / 0.4);
          }
          if (pa > active) {
            active = pa;
            activeColor = p.color;
          }
        });

        ctx.save();
        if (l === 0) {
          // input layer - use the pixel color when active, neutral when idle
          const c = activeColor || { r: 180, g: 180, b: 185 };
          ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${0.12 + active * 0.55})`;
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${0.7 + active * 0.3})`;
          if (active > 0.05) {
            ctx.shadowColor = `rgb(${c.r},${c.g},${c.b})`;
            ctx.shadowBlur = active * 14;
          }
        } else if (l === layerCounts.length - 1) {
          const c = OUT_RGB[n];
          ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${0.18 + active * 0.55})`;
          ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${0.75 + active * 0.25})`;
          if (active > 0.05) {
            ctx.shadowColor = `rgb(${c.r},${c.g},${c.b})`;
            ctx.shadowBlur = active * 14;
          }
        } else {
          // hidden layers - fill with pulse color when active, otherwise grey
          if (activeColor && active > 0.05) {
            const c = activeColor;
            ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${0.18 + active * 0.55})`;
            ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${0.7 + active * 0.3})`;
            ctx.shadowColor = `rgb(${c.r},${c.g},${c.b})`;
            ctx.shadowBlur = active * 11;
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "rgba(80,80,90,0.85)";
          }
        }
        ctx.lineWidth = 1.5 + active * 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR + active * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // RGB labels on output neurons
        if (l === layerCounts.length - 1) {
          const lbls = ["R", "G", "B"];
          const c = OUT_RGB[n];
          ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.95)`;
          ctx.font = "bold 16px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(lbls[n], cx, cy);
        }
      }
    }

    // ---- Input neuron labels (above first, below last) ----
    ctx.save();
    ctx.fillStyle = "rgba(80,80,85,0.95)";
    ctx.font = "italic 18px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    // (x, y, z) ABOVE the top input neuron
    ctx.textBaseline = "bottom";
    ctx.fillText("(x, y, z)", layerXs[0], nodeY(0, 0) - 18);
    // (θ, φ) BELOW the bottom input neuron
    ctx.textBaseline = "top";
    ctx.fillText("(θ, φ)", layerXs[0], nodeY(0, 1) + 18);
    ctx.restore();

    // ---- Weights/parameters label above hidden layers (F with Θ subscript) ----
    ctx.save();
    ctx.fillStyle = "rgba(70,70,80,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const fxCenter = (layerXs[1] + layerXs[3]) / 2;
    const fxY = padTop - 14;
    // Draw "F" then "Θ" smaller and lower as a true subscript
    ctx.font = "italic 26px 'Times New Roman', serif";
    const fWidth = ctx.measureText("F").width;
    const subWidth = (() => {
      ctx.font = "italic 20px 'Times New Roman', serif";
      return ctx.measureText("Θ").width;
    })();
    const totalWidth = fWidth + subWidth;
    const startX = fxCenter - totalWidth / 2;
    ctx.font = "italic 26px 'Times New Roman', serif";
    ctx.textAlign = "left";
    ctx.fillText("F", startX, fxY);
    ctx.font = "italic 20px 'Times New Roman', serif";
    ctx.fillText("Θ", startX + fWidth, fxY + 7);
    ctx.restore();

    // ---- Output swatch ----
    ctx.save();
    ctx.shadowColor = `rgba(${outColor.r},${outColor.g},${outColor.b},${0.3 + outFlash * 0.6})`;
    ctx.shadowBlur = 10 + outFlash * 18;
    ctx.fillStyle = `rgb(${outColor.r},${outColor.g},${outColor.b})`;
    ctx.fillRect(swX, swY, swW, swH);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(swX, swY, swW, swH);
    ctx.fillStyle = "rgba(80,80,85,0.95)";
    ctx.font = "italic 18px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("c = (R, G, B)", swX + swW / 2, swY + swH + 14);
  }

  return {
    enter() {
      resize();
    },
    tick(visible, dtScale) {
      if (!visible) return;
      if (W === 0) resize();
      if (W === 0) return;
      step(dtScale);
      draw();
    },
  };
}

/* =========================================================
   Slide 2: Spatial transition — animated horizon grid + particles
   ========================================================= */
export function initSpatialTransition() {
  const slide = document.querySelector('.slide[data-id="2"]');
  if (!slide) return { tick() {} };
  const canvas = slide.querySelector("#spatial-bg");
  if (!canvas) return { tick() {} };
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width;
    H = rect.height;
  }
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(canvas);
  }

  let time = 0;

  // Perspective grid params
  const COLS = 24;
  const ROWS = 14;
  const CELL = 1.0;

  // Project 3D world point (x: side, y: up, z: depth) to screen
  function project(x, y, z) {
    const camDist = 4.5;
    const focal = 520;
    const wz = z + camDist;
    if (wz <= 0.1) return null;
    const sx = W / 2 + (x * focal) / wz;
    const sy = H * 0.7 + ((-y + 1) * focal) / wz;
    return { sx, sy, depth: wz };
  }

  // Floating particles (drift upward)
  const PARTICLE_COUNT = 26;
  const particles = [];
  function spawnParticle(initial = false) {
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + 10 + Math.random() * 40,
      vy: 0.18 + Math.random() * 0.35,
      vx: (Math.random() - 0.5) * 0.06,
      size: 1 + Math.random() * 1.8,
      hue: Math.random() < 0.5 ? "accent" : "accent2",
      opacityBase: 0.18 + Math.random() * 0.25,
    };
  }
  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(spawnParticle(true));

  function step(dtScale) {
    time += dtScale * 0.014;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.vy * dtScale;
      p.x += p.vx * dtScale;
      if (p.y < -20 || p.x < -20 || p.x > W + 20) {
        particles[i] = spawnParticle(false);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Compute grid points
    const points = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const x = (c - COLS / 2) * CELL;
        const z = r * CELL;
        const wave =
          Math.sin(x * 0.5 + time * 1.2) * 0.18 +
          Math.cos(z * 0.45 + time * 0.9) * 0.18;
        row.push(project(x, wave, z));
      }
      points.push(row);
    }

    // Draw grid lines (rows + cols)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = points[r][c];
        if (!p) continue;
        // Depth-based fade — farther = fainter
        const depthFactor = Math.max(0, Math.min(1, 1 - (p.depth - 4.5) / 12));
        const alpha = 0.22 * depthFactor;
        if (alpha < 0.02) continue;
        ctx.strokeStyle = `rgba(255, 90, 54, ${alpha})`;
        ctx.lineWidth = 0.9;
        // Line to right neighbor
        if (c < COLS - 1) {
          const pr = points[r][c + 1];
          if (pr) {
            ctx.beginPath();
            ctx.moveTo(p.sx, p.sy);
            ctx.lineTo(pr.sx, pr.sy);
            ctx.stroke();
          }
        }
        // Line to back neighbor
        if (r < ROWS - 1) {
          const pb = points[r + 1][c];
          if (pb) {
            ctx.beginPath();
            ctx.moveTo(p.sx, p.sy);
            ctx.lineTo(pb.sx, pb.sy);
            ctx.stroke();
          }
        }
      }
    }

    // Draw floating particles
    for (const p of particles) {
      const dist01 = Math.max(0, Math.min(1, (p.y - H * 0.2) / (H * 0.8)));
      const alpha = p.opacityBase * dist01;
      if (alpha < 0.02) continue;
      const color =
        p.hue === "accent"
          ? `rgba(255, 90, 54, ${alpha})`
          : `rgba(108, 92, 231, ${alpha})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    enter() {
      resize();
    },
    tick(visible, dtScale) {
      if (!visible) return;
      if (W === 0) resize();
      if (W === 0) return;
      step(dtScale);
      draw();
    },
  };
}
