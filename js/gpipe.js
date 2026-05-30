// gpipe.js - Slide 17: how 3D Gaussian Splatting works, step by step.
//
// White stage, click to advance, low-math but with real depth:
//   1. capture the scene from many camera angles (photos)
//   2. -> a sparse 3D point cloud (SfM)
//   3. -> each point becomes a 3D gaussian: position, shape, colour, opacity
//   4. -> "splatting": project the gaussians onto a camera and blend -> an image
//   5. -> compare that render to the real photo (where is it wrong?)
//   6. -> the error updates every gaussian, and we clone/split/prune them
//   7. -> after many iterations, a full 3D scene you can orbit
//
// Object = the NeRF "hotdog" scene, reconstructed offline into a coloured
// point cloud (assets/generated/hotdog_points.json, built by silhouette
// space-carving from the 100 training views). Self-contained, no THREE.

export function initGaussianPipeline() {
  const slide = document.getElementById("gaussian-pipeline");
  if (!slide) return { tick() {}, enter() {} };
  const canvas = document.getElementById("gpipe-canvas");
  const captionEl = document.getElementById("gpipe-caption");
  const hintEl = document.getElementById("gpipe-hint");
  if (!canvas) return { tick() {}, enter() {} };
  const ctx = canvas.getContext("2d");

  let W = 0;
  let H = 0;
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = slide.clientWidth | 0;
    H = slide.clientHeight | 0;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  new ResizeObserver(resize).observe(slide);

  /* ---------- palette ---------- */
  const ACCENT = "#ff5a36";
  const CYAN = "#1ba8d6";
  const INK = "#1f2533";
  const INK_SOFT = "#7b8494";

  /* ---------- math ---------- */
  let _seed = 0x40d0617;
  const rand = () =>
    ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = (k) =>
    k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const smooth = (a, b, x) => {
    const k = clamp01((x - a) / (b - a || 1));
    return k * k * (3 - 2 * k);
  };

  /* ---------- camera ---------- */
  const CAM_DIST = 13;
  function makeCam(yaw, pitch, zoom, vpx, vpy, focal) {
    return {
      cY: Math.cos(yaw),
      sY: Math.sin(yaw),
      cP: Math.cos(pitch),
      sP: Math.sin(pitch),
      zoom,
      vpx,
      vpy,
      focal,
    };
  }
  function proj(cam, x, y, z) {
    const x1 = cam.cY * x + cam.sY * z;
    const z1 = -cam.sY * x + cam.cY * z;
    const y2 = cam.cP * y - cam.sP * z1;
    const z2 = cam.sP * y + cam.cP * z1;
    const denom = z2 + CAM_DIST;
    const f = cam.focal * cam.zoom;
    return { x: cam.vpx + (f * x1) / denom, y: cam.vpy - (f * y2) / denom, depth: denom, scale: f / denom };
  }

  /* ---------- soft-blob sprite cache ---------- */
  const SPR = 64;
  const SPR_R = 32;
  const spriteCache = new Map();
  function buildBlob(r, g, b) {
    const c = document.createElement("canvas");
    c.width = SPR;
    c.height = SPR;
    const x = c.getContext("2d");
    const grad = x.createRadialGradient(SPR_R, SPR_R, 0, SPR_R, SPR_R, SPR_R);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.beginPath();
    x.arc(SPR_R, SPR_R, SPR_R, 0, Math.PI * 2);
    x.fill();
    return c;
  }
  // darken near-whites to ceramic grey + saturate colours so the (mostly white
  // plate) hotdog scene reads against a white background.
  function adjColor(r, g, b) {
    const m = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = 1.42;
    let R = m + (r - m) * sat;
    let G = m + (g - m) * sat;
    let B = m + (b - m) * sat;
    const ceil = 200;
    const k = (x) => (x > ceil ? ceil + (x - ceil) * 0.25 : x);
    return [c255(k(R)), c255(k(G)), c255(k(B))];
  }
  function spriteFor(r, g, b) {
    const qr = Math.min(255, (r & 0xf0) + 8);
    const qg = Math.min(255, (g & 0xf0) + 8);
    const qb = Math.min(255, (b & 0xf0) + 8);
    const key = (qr << 16) | (qg << 8) | qb;
    let s = spriteCache.get(key);
    if (!s) {
      s = buildBlob(qr, qg, qb);
      spriteCache.set(key, s);
    }
    return s;
  }

  /* ---------- hotdog cloud (carved point cloud -> gaussians) ---------- */
  const OBJ_SIZE = 3.4;
  const MAXG = 2200;
  const gaussians = [];
  let gReady = false;

  function buildFromPoints(pts) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    cx /= pts.length;
    cy /= pts.length;
    cz /= pts.length;
    let maxr = 1e-6;
    for (const p of pts) {
      const r = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      if (r > maxr) maxr = r;
    }
    const sc = OBJ_SIZE / maxr;
    for (const p of pts) {
      const x = (p.x - cx) * sc;
      const y = (p.y - cy) * sc;
      const z = (p.z - cz) * sc;
      const [cr, cg, cb] = adjColor(p.r, p.g, p.b);
      const sz = OBJ_SIZE * (0.028 + rand() * 0.02);
      let ax = rand() * 2 - 1;
      let ay = rand() * 2 - 1;
      let az = rand() * 2 - 1;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      let bx = rand() * 2 - 1;
      let by = rand() * 2 - 1;
      let bz = rand() * 2 - 1;
      const d = ax * bx + ay * by + az * bz;
      bx -= d * ax;
      by -= d * ay;
      bz -= d * az;
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl;
      by /= bl;
      bz /= bl;
      const la = sz * (1.1 + rand() * 0.7);
      const lb = sz * (0.6 + rand() * 0.4);
      gaussians.push({
        x,
        y,
        z,
        ax: ax * la,
        ay: ay * la,
        az: az * la,
        bx: bx * lb,
        by: by * lb,
        bz: bz * lb,
        sprite: spriteFor(cr, cg, cb),
        rank: 0,
        ph: rand() * Math.PI * 2,
      });
    }
    const order = gaussians.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    order.forEach((idx, r) => (gaussians[idx].rank = r));
    gReady = true;
  }

  function fallbackCloud() {
    const pts = [];
    for (let i = 0; i < 1600; i++) {
      const k = i + 0.5;
      const phi = Math.acos(1 - (2 * k) / 1600);
      const th = Math.PI * (1 + Math.sqrt(5)) * k;
      pts.push({
        x: Math.sin(phi) * Math.cos(th),
        y: Math.cos(phi) * 0.4,
        z: Math.sin(phi) * Math.sin(th),
        r: 210,
        g: 150 + 60 * Math.sin(th),
        b: 90,
      });
    }
    buildFromPoints(pts);
  }

  fetch(new URL("../assets/generated/hotdog_points.json", import.meta.url).href)
    .then((r) => r.json())
    .then((d) => {
      const u = d.scaleUnit;
      const n = d.count;
      const step = Math.max(1, Math.floor(n / MAXG));
      const pts = [];
      for (let i = 0; i < n && pts.length < MAXG; i += step) {
        // carved cloud is z-up; rotate to y-up: (x,y,z) -> (x, z, -y)
        const wx = d.pos[i * 3] * u;
        const wy = d.pos[i * 3 + 1] * u;
        const wz = d.pos[i * 3 + 2] * u;
        pts.push({
          x: wx,
          y: wz,
          z: -wy,
          r: d.col[i * 3],
          g: d.col[i * 3 + 1],
          b: d.col[i * 3 + 2],
        });
      }
      if (!pts.length) fallbackCloud();
      else buildFromPoints(pts);
    })
    .catch(fallbackCloud);

  /* ---------- real photos (hotdog training views) ---------- */
  const photoIdx = [0, 14, 28, 42, 70];
  const photos = photoIdx.map((n) => {
    const im = new Image();
    im.decoding = "async";
    im.src = new URL(
      `../assets/3dgs/hotdog/train/r_${n}.png`,
      import.meta.url,
    ).href;
    return im;
  });

  /* ====================================================================
     drawing helpers
     ==================================================================== */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(str, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${size}px Heebo, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";
    ctx.fillText(str, x, y);
    ctx.direction = "ltr";
  }
  function arrowHead(x, y, ang, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * Math.cos(ang - 0.42), y - s * Math.sin(ang - 0.42));
    ctx.lineTo(x - s * Math.cos(ang + 0.42), y - s * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
  }
  function curveArrow(x0, y0, x1, y1, bend, color, width, dash) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const cxp = mx + (-dy / len) * bend;
    const cyp = my + (dx / len) * bend;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    if (dash != null) {
      ctx.setLineDash([11, 9]);
      ctx.lineDashOffset = -dash;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cxp, cyp, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    arrowHead(x1, y1, Math.atan2(y1 - cyp, x1 - cxp), 9, color);
  }

  // a friendly tilted "photo" (real hotdog render) with a white polaroid border
  function drawPhoto(img, cx, cy, w, angle, alpha) {
    if (!img.complete || !img.naturalWidth) {
      // still draw the frame so layout reads even before load
    }
    const pad = w * 0.06;
    const iw = w - pad * 2;
    const ih = iw;
    const fh = ih + pad + w * 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = "rgba(20,25,40,0.22)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    rr(-w / 2, -fh / 2, w, fh, 7);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    rr(-w / 2 + pad, -fh / 2 + pad, iw, ih, 4);
    ctx.clip();
    ctx.fillStyle = "#f3f1ec";
    ctx.fillRect(-w / 2 + pad, -fh / 2 + pad, iw, ih);
    if (img.complete && img.naturalWidth) {
      const ir = img.naturalWidth / img.naturalHeight;
      let dw = iw;
      let dh = iw / ir;
      if (dh < ih) {
        dh = ih;
        dw = ih * ir;
      }
      ctx.drawImage(img, -dw / 2, -fh / 2 + pad + (ih - dh) / 2, dw, dh);
    }
    ctx.restore();
    ctx.restore();
  }

  function groundShadow(cam, alpha) {
    const p = proj(cam, 0, -OBJ_SIZE * 0.42, 0);
    const rw = OBJ_SIZE * 1.05 * p.scale;
    ctx.save();
    ctx.globalAlpha = alpha * 0.17;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rw);
    g.addColorStop(0, "rgba(30,37,51,1)");
    g.addColorStop(1, "rgba(30,37,51,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rw, rw * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDots(cam, count, alpha) {
    if (!gReady || alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#3b4250";
    for (let i = 0; i < gaussians.length; i++) {
      const g = gaussians[i];
      if (g.rank >= count) continue;
      const p = proj(cam, g.x, g.y, g.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGaussians(cam, count, sizeMul, alphaMul, jitter) {
    if (!gReady) return;
    const arr = [];
    for (let i = 0; i < gaussians.length; i++) {
      const g = gaussians[i];
      if (g.rank >= count) continue;
      let jx = 0;
      let jy = 0;
      let jz = 0;
      if (jitter) {
        const a = g.ph + wallT * 7;
        jx = Math.cos(a) * jitter;
        jy = Math.sin(a * 1.3) * jitter;
        jz = Math.cos(a * 0.7) * jitter;
      }
      const pc = proj(cam, g.x + jx, g.y + jy, g.z + jz);
      arr.push({ g, pc, jx, jy, jz });
    }
    arr.sort((p, q) => q.pc.depth - p.pc.depth);
    for (const it of arr) {
      const g = it.g;
      const pc = it.pc;
      const pa = proj(cam, g.x + it.jx + g.ax, g.y + it.jy + g.ay, g.z + it.jz + g.az);
      const pb = proj(cam, g.x + it.jx + g.bx, g.y + it.jy + g.by, g.z + it.jz + g.bz);
      const ux = (pa.x - pc.x) * sizeMul;
      const uy = (pa.y - pc.y) * sizeMul;
      const vx = (pb.x - pc.x) * sizeMul;
      const vy = (pb.y - pc.y) * sizeMul;
      ctx.globalAlpha = clamp01(alphaMul);
      ctx.save();
      ctx.transform(ux / SPR_R, uy / SPR_R, vx / SPR_R, vy / SPR_R, pc.x, pc.y);
      ctx.drawImage(g.sprite, -SPR_R, -SPR_R, SPR, SPR);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // render the cloud small into a soft rounded thumbnail (a camera's render)
  function renderThumb(rect, count, sharp, alpha, label) {
    ctx.save();
    ctx.globalAlpha = alpha;
    rr(rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.stroke();
    ctx.restore();
    ctx.save();
    rr(rect.x, rect.y, rect.w, rect.h, 12);
    ctx.clip();
    const focal = Math.min(rect.w, rect.h) * 2.0;
    const pcam = makeCam(-0.6, 0.32, 1, rect.x + rect.w / 2, rect.y + rect.h * 0.54, focal);
    const cnt = Math.floor(lerp(420, MAXG, sharp));
    drawGaussians(pcam, cnt, lerp(1.3, 0.8, sharp), alpha, 0);
    ctx.restore();
    if (label) text(label, rect.x + rect.w / 2, rect.y - 13, 14, INK_SOFT, "center", 600);
  }

  function drawDiff(cam, count, alpha) {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < gaussians.length; i += 6) {
      const g = gaussians[i];
      if (g.rank >= count) continue;
      if (0.5 + 0.5 * Math.sin(wallT * 6 + g.ph) < 0.6) continue;
      const p = proj(cam, g.x, g.y, g.z);
      ctx.fillStyle = i % 2 ? "rgba(255,90,42,0.95)" : "rgba(40,150,90,0.95)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // a single hero ellipsoid with its 4 properties (step 3)
  function drawGaussianProps(alpha) {
    const cxp = W * 0.4;
    const cyp = H * 0.46;
    const R = Math.min(W, H) * 0.12;
    const breathe = 1 + 0.06 * Math.sin(wallT * 1.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxp, cyp);
    ctx.rotate(-0.3);
    const grad = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R);
    grad.addColorStop(0, "rgba(255,176,70,0.98)");
    grad.addColorStop(0.6, "rgba(232,120,60,0.9)");
    grad.addColorStop(1, "rgba(190,70,55,0.85)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.25 * breathe, R * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.25 * breathe, R * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const labels = [
      ["מיקום", "איפה הוא במרחב"],
      ["צורה וגודל", "כמה מתוח, לאיזה כיוון"],
      ["צבע", "הגוון שהוא משדר"],
      ["שקיפות", "כמה הוא אטום"],
    ];
    const lx = W * 0.6;
    const top = cyp - R * 0.85;
    const gap = (R * 1.7) / (labels.length - 1);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < labels.length; i++) {
      const ly = top + gap * i;
      const ang = -0.8 + (i / (labels.length - 1)) * 1.6;
      const axp = cxp + Math.cos(ang) * R * 1.1;
      const ayp = cyp + Math.sin(ang) * R * 0.55;
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(axp, ayp);
      ctx.lineTo(lx - 6, ly);
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(lx + 11, ly, 9, 0, Math.PI * 2);
      ctx.fill();
      text(String(i + 1), lx + 11, ly + 0.5, 12, "#fff", "center", 700);
      text(labels[i][0], lx + 27, ly - 8, 17, INK, "left", 700);
      text(labels[i][1], lx + 27, ly + 9, 12.5, INK_SOFT, "left", 500);
    }
    ctx.globalAlpha = 1;
  }

  /* ====================================================================
     steps / playback
     ==================================================================== */
  const T = {
    capture: 0.0,
    points: 4.0,
    prop: 7.5,
    splat: 12.0,
    compare: 16.0,
    optimize: 20.0,
    result: 25.0,
    end: 30.0,
  };
  const chapters = [
    { start: T.capture, end: T.points, title: "מצלמים את הסצנה מעשרות זוויות שונות" },
    { start: T.points, end: T.prop, title: "מהתמונות מחלצים ענן נקודות דליל במרחב" },
    { start: T.prop, end: T.splat, title: "כל נקודה הופכת ל-Gaussian: מיקום, צורה, צבע ושקיפות" },
    { start: T.splat, end: T.compare, title: "מטילים ומשטחים את כל ה-Gaussians למסך (Splatting)" },
    { start: T.compare, end: T.optimize, title: "משווים את הרינדור לתמונה האמיתית — איפה יש טעות" },
    { start: T.optimize, end: T.result, title: "הטעות מעדכנת כל Gaussian, ומוסיפים/מפצלים/מסירים" },
    { start: T.result, end: T.end, title: "אחרי אלפי איטרציות — סצנה תלת-ממדית שאפשר לטוס בה" },
  ];

  const DECEL = 0.85;
  let wallT = 0;
  let t = 0;
  let chapterIdx = 0;
  let chapterT = 0;
  let paused = false;
  let decelMode = false;
  let decelStartT = 0;
  let decelTargetT = 0;
  let decelElapsed = 0;
  let lastCaption = "";

  const chapterDur = (i) => chapters[i].end - chapters[i].start;
  function beginDecel() {
    if (decelMode) return;
    decelMode = true;
    decelStartT = chapterT;
    decelTargetT = chapterDur(chapterIdx);
    decelElapsed = 0;
  }
  function advanceChapter() {
    chapterIdx = (chapterIdx + 1) % chapters.length;
    chapterT = 0;
    paused = false;
    decelMode = false;
    updateCaption();
  }
  function updateCaption() {
    if (captionEl) {
      const next = chapters[chapterIdx].title;
      if (next !== lastCaption) {
        lastCaption = next;
        captionEl.textContent = next;
        captionEl.classList.toggle("visible", next !== "");
      }
    }
    if (hintEl)
      hintEl.classList.toggle("visible", paused && chapterIdx < chapters.length - 1);
  }
  function step(dtScale) {
    const dt = (dtScale || 1) / 60;
    wallT += dt;
    if (paused) {
      updateCaption();
      return;
    }
    const dur = chapterDur(chapterIdx);
    if (!decelMode && chapterT >= dur - DECEL / 2) beginDecel();
    if (decelMode) {
      decelElapsed += dt;
      if (decelElapsed >= DECEL) {
        chapterT = decelTargetT;
        decelMode = false;
        paused = true;
        updateCaption();
      } else {
        const k = decelElapsed / DECEL;
        chapterT = decelStartT + (decelTargetT - decelStartT) * (k + Math.sin(Math.PI * k) / Math.PI);
      }
    } else {
      chapterT += dt;
    }
    t = chapters[chapterIdx].start + chapterT;
  }

  /* ====================================================================
     main draw
     ==================================================================== */
  function draw() {
    if (!W || !H) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    /* phase progresses (from t) */
    const captureWin = clamp01(1 - smooth(T.points - 0.3, T.points + 0.7, t));
    const dotsWin = smooth(T.points, T.points + 0.9, t) * (1 - smooth(T.prop + 0.4, T.prop + 1.4, t));
    const propWin = smooth(T.prop + 0.3, T.prop + 1.1, t) * (1 - smooth(T.splat - 0.7, T.splat, t));
    const splatGrow = smooth(T.prop + 0.6, T.prop + 2.0, t); // gaussians exist from step 3 on
    const objDim = propWin; // dim the full cloud while showing the single hero gaussian
    const heroCamWin = smooth(T.splat, T.splat + 0.8, t) * (1 - smooth(T.compare + 1.2, T.compare + 2.2, t));
    const projWin = smooth(T.splat + 0.2, T.splat + 1.0, t) * (1 - smooth(T.compare - 0.3, T.compare + 0.4, t));
    const compareWin = smooth(T.compare, T.compare + 0.7, t) * (1 - smooth(T.optimize + 0.3, T.optimize + 1.0, t));
    const optimizeWin = smooth(T.optimize, T.optimize + 0.7, t) * (1 - smooth(T.result, T.result + 0.5, t));
    const resultWin = smooth(T.result + 0.2, T.result + 1.2, t);

    // sparse during steps 2-5, densify during optimize, full at result
    let count = 460;
    count = lerp(count, MAXG, smooth(T.optimize + 0.3, T.result, t));
    count = Math.round(count);

    // panels shift the object left while a render/photo is on the right
    const panelsIn = smooth(T.splat - 0.2, T.splat + 1.0, t) * (1 - smooth(T.result, T.result + 0.6, t));
    const vpx = lerp(W * 0.5, W * 0.4, panelsIn);

    const yaw = -0.5 + Math.sin(wallT * 0.16) * 0.5 + wallT * 0.04;
    const pitch = 0.34 + Math.sin(wallT * 0.26) * 0.05 - resultWin * 0.06;
    const zoom = 1 + 0.04 * Math.sin(wallT * 0.4);
    const focal = Math.min(W, H) * 0.74;
    const cam = makeCam(yaw, pitch, zoom, vpx, H * 0.5, focal);

    /* ---- step 1: capture (cameras + photos) ---- */
    if (captureWin > 0.01) {
      const cx = W * 0.5;
      const cy = H * 0.42;
      const pw = Math.min(W * 0.17, 210);
      const angs = [-0.18, -0.06, 0.06, 0.18];
      for (let i = 0; i < 4; i++) {
        const a = easeOut(clamp01(captureWin * 1.3 - i * 0.1));
        const fan = (i - 1.5) * pw * 0.82;
        drawPhoto(photos[i], cx + fan * a, cy - Math.abs(i - 1.5) * pw * 0.05 * a, pw, angs[i], captureWin);
      }
    }

    /* ---- ground shadow once object exists ---- */
    if (splatGrow > 0.02 && panelsIn < 0.99) groundShadow(cam, splatGrow * (1 - 0.4 * panelsIn));

    /* ---- steps 2+: dots / gaussians ---- */
    if (dotsWin > 0.01) drawDots(cam, 460, dotsWin);
    if (splatGrow > 0.01) {
      const jitter = optimizeWin * 0.05;
      const sizeMul = splatGrow * lerp(1.0, 0.82, smooth(T.optimize, T.result, t));
      const a = 1 - objDim * 0.86;
      drawGaussians(cam, count, sizeMul, a, jitter);
    }

    /* ---- step 3: one gaussian + properties ---- */
    if (propWin > 0.01) drawGaussianProps(propWin);

    /* ---- step 4: splatting (hero camera + projection lines + render) ---- */
    if (heroCamWin > 0.01) {
      const HERO = { x: OBJ_SIZE * 1.7, y: OBJ_SIZE * 1.0, z: OBJ_SIZE * 1.3 };
      const pa = proj(cam, HERO.x, HERO.y, HERO.z);
      // little camera glyph
      ctx.globalAlpha = heroCamWin;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      if (projWin > 0.01) {
        ctx.globalAlpha = projWin * 0.4;
        ctx.strokeStyle = "rgba(60,70,90,0.5)";
        ctx.lineWidth = 1;
        for (let i = 0; i < gaussians.length; i += Math.max(1, (count / 20) | 0)) {
          const g = gaussians[i];
          if (g.rank >= count) continue;
          const pg = proj(cam, g.x, g.y, g.z);
          ctx.beginPath();
          ctx.moveTo(pg.x, pg.y);
          ctx.lineTo(pa.x, pa.y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ---- right-side render + real photo + comparison ---- */
    if (panelsIn > 0.01) {
      const ps = Math.min(W * 0.2, H * 0.3);
      const rx = W - ps - W * 0.06;
      const rendered = { x: rx, y: H * 0.16, w: ps, h: ps };
      renderThumb(rendered, count, smooth(T.optimize, T.result, t), panelsIn, "הרינדור שלנו");
      if (compareWin > 0.01 || optimizeWin > 0.01) {
        const realA = Math.max(compareWin, optimizeWin);
        drawPhoto(photos[0], rx + ps / 2, rendered.y + ps + 18 + ps / 2, ps * 1.04, 0.04, realA);
        text("התמונה האמיתית", rx + ps / 2, rendered.y + ps + 18 + ps + 14, 14, INK_SOFT, "center", 600);
      }
    }

    /* ---- step 5: differences on the object ---- */
    if (compareWin > 0.01) drawDiff(cam, count, compareWin * 0.9);

    /* ---- step 6: optimize — gradient backflow + densify/prune ---- */
    if (optimizeWin > 0.01) {
      const ps = Math.min(W * 0.2, H * 0.3);
      const rx = W - ps - W * 0.06;
      const phase = (wallT * 90) % 20;
      curveArrow(rx - 6, H * 0.5, vpx + OBJ_SIZE * 0.2 * focal / CAM_DIST, H * 0.5, 70, CYAN, 2.6, phase);
      text("מתקנים · מוסיפים · מפצלים · מסירים", W * 0.5, H * 0.12, 16, ACCENT, "center", 700);
    }

    /* ---- step 7: orbit ---- */
    if (resultWin > 0.01) {
      text("אפשר לטוס סביב הסצנה ולראות מכל זווית", W * 0.5, H * 0.12, 16, "rgba(40,150,90,0.95)", "center", 700);
    }

    updateCaption();
  }

  /* ---------- interaction ---------- */
  slide.addEventListener("click", () => {
    if (!paused) return;
    if (chapterIdx >= chapters.length - 1) return;
    advanceChapter();
  });

  return {
    enter() {
      resize();
      chapterIdx = 0;
      chapterT = 0;
      t = 0;
      paused = false;
      decelMode = false;
      lastCaption = "";
      updateCaption();
    },
    tick(visible, dtScale) {
      if (!visible) {
        if (captionEl) captionEl.classList.remove("visible");
        if (hintEl) hintEl.classList.remove("visible");
        return;
      }
      if (!W || !H) resize();
      if (!W || !H) return;
      step(dtScale || 1);
      draw();
    },
    __drawAt(time) {
      t = time;
      wallT = time;
      draw();
    },
  };
}
