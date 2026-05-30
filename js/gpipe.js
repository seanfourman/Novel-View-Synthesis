// gpipe.js - Slide 17: the 3D Gaussian Splatting training loop.
//
// A cinematic, click-to-advance walkthrough that mirrors the canonical 3DGS
// pipeline diagram: SfM init -> 3D Gaussians -> projection -> differentiable
// tile rasterizer -> loss vs ground truth -> gradient backflow -> adaptive
// density control (prune / clone / split) -> convergence.
//
// Self-contained (no THREE) so it can be unit-rendered in isolation. The whole
// frame is a single 2D canvas; the gaussian cloud is the SAME lego object the
// NeRF slide reconstructs, rendered here as anisotropic, view-rotating splats.

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
  const CYAN = "#15b4e6"; // gradient-flow colour (matches the diagram)
  const INK = "#1f2533";
  const INK_SOFT = "#5a6273";

  /* ---------- math ---------- */
  let _seed = 0x3d650a1;
  const rand = () =>
    ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = (k) =>
    k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  // smooth ramp from time a->b, returns 0..1 with eased shoulders
  const smooth = (a, b, x) => {
    const k = clamp01((x - a) / (b - a || 1));
    return k * k * (3 - 2 * k);
  };

  /* ---------- camera / projector ---------- */
  const CAM_DIST = 13;
  function makeCam(yaw, pitch, zoom, cx, cy, cz, vpx, vpy, focal) {
    return {
      cY: Math.cos(yaw),
      sY: Math.sin(yaw),
      cP: Math.cos(pitch),
      sP: Math.sin(pitch),
      zoom,
      cx,
      cy,
      cz,
      vpx,
      vpy,
      focal,
    };
  }
  function proj(cam, x, y, z) {
    const dx = x - cam.cx;
    const dy = y - cam.cy;
    const dz = z - cam.cz;
    const x1 = cam.cY * dx + cam.sY * dz;
    const z1 = -cam.sY * dx + cam.cY * dz;
    const y2 = cam.cP * dy - cam.sP * z1;
    const z2 = cam.sP * dy + cam.cP * z1;
    const denom = z2 + CAM_DIST;
    const f = cam.focal * cam.zoom;
    return {
      x: cam.vpx + (f * x1) / denom,
      y: cam.vpy - (f * y2) / denom,
      depth: denom,
      scale: f / denom,
    };
  }

  /* ---------- soft-blob sprite cache (fast tinted splats) ---------- */
  const SPR = 64;
  const SPR_R = 32;
  const spriteCache = new Map();
  function buildBlob(r, g, b) {
    const c = document.createElement("canvas");
    c.width = SPR;
    c.height = SPR;
    const x = c.getContext("2d");
    const grad = x.createRadialGradient(SPR_R, SPR_R, 0, SPR_R, SPR_R, SPR_R);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.62)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.beginPath();
    x.arc(SPR_R, SPR_R, SPR_R, 0, Math.PI * 2);
    x.fill();
    return c;
  }
  // push colours away from their luminance so the splats read vividly when
  // composited over white (the raw lego cloud is fairly desaturated).
  function satC(r, g, b) {
    const m = 0.299 * r + 0.587 * g + 0.114 * b;
    const amt = 1.45;
    const f = (c) => Math.max(0, Math.min(255, (m + (c - m) * amt) | 0));
    return [f(r), f(g), f(b)];
  }
  function spriteFor(r, g, b) {
    const qr = (r & 0xf0) + 8;
    const qg = (g & 0xf0) + 8;
    const qb = (b & 0xf0) + 8;
    const key = (qr << 16) | (qg << 8) | qb;
    let s = spriteCache.get(key);
    if (!s) {
      const [sr, sg, sb] = satC(qr, qg, qb);
      s = buildBlob(sr, sg, sb);
      spriteCache.set(key, s);
    }
    return s;
  }

  /* ---------- the gaussian cloud (lego object, == NeRF slide) ---------- */
  const OBJ_SIZE = 3.4;
  const MAXG = 1500;
  const gaussians = [];
  let gReady = false;

  function rotX(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: p.x, y: c * p.y - s * p.z, z: s * p.y + c * p.z };
  }
  function rotY(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: c * p.x + s * p.z, y: p.y, z: -s * p.x + c * p.z };
  }

  function buildFromPoints(pts) {
    // center + normalise to radius ~OBJ_SIZE
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
      const sz = OBJ_SIZE * (0.026 + rand() * 0.02);
      // random orthonormal-ish ellipsoid axes (anisotropy)
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
      const la = sz * (1.2 + rand() * 1.0);
      const lb = sz * (0.6 + rand() * 0.6);
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
        sprite: spriteFor(p.r, p.g, p.b),
        rank: 0,
        prune: rand() < 0.12,
        // small per-gaussian jitter phase for the "gradient update" wobble
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
    for (let i = 0; i < 900; i++) {
      // fibonacci sphere with a warm/teal gradient
      const k = i + 0.5;
      const phi = Math.acos(1 - (2 * k) / 900);
      const th = Math.PI * (1 + Math.sqrt(5)) * k;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      pts.push({
        x,
        y,
        z,
        r: 120 + 120 * (0.5 + 0.5 * y),
        g: 150 + 60 * (0.5 + 0.5 * x),
        b: 200 - 80 * (0.5 + 0.5 * z),
      });
    }
    buildFromPoints(pts);
  }

  fetch(new URL("../assets/generated/lego_points.json", import.meta.url).href)
    .then((r) => r.json())
    .then((d) => {
      const n = d.count;
      const u = d.scaleUnit;
      const step = Math.max(1, Math.floor(n / (MAXG * 1.5)));
      const pts = [];
      for (let i = 0; i < n; i += step) {
        let p = { x: d.pos[i * 3] * u, y: d.pos[i * 3 + 1] * u, z: d.pos[i * 3 + 2] * u };
        p = rotX(p, -Math.PI / 2);
        p = rotY(p, Math.PI / 2);
        pts.push({ x: p.x, y: p.y, z: p.z, r: d.col[i * 3], g: d.col[i * 3 + 1], b: d.col[i * 3 + 2] });
      }
      buildFromPoints(pts.slice(0, MAXG));
    })
    .catch(fallbackCloud);

  /* ---------- ground-truth photo (same lego capture as NeRF) ---------- */
  const gtImg = new Image();
  gtImg.decoding = "async";
  gtImg.src = new URL(
    "../assets/nerf/nerf video/lego/r_63.png",
    import.meta.url,
  ).href;

  /* ---------- SfM cameras (red, on a dome) ---------- */
  const sfmCams = [];
  for (let i = 0; i < 15; i++) {
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / 15) * 0.62; // upper hemisphere-ish
    const th = Math.PI * (1 + Math.sqrt(5)) * k;
    const r = 6.6;
    sfmCams.push({
      x: r * Math.sin(phi) * Math.cos(th),
      y: r * Math.cos(phi) * 0.7 + 0.6,
      z: r * Math.sin(phi) * Math.sin(th),
    });
  }
  const HERO = { x: 5.0, y: 2.4, z: 4.2 };

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
  function text(str, x, y, size, color, align, weight, dir) {
    ctx.font = `${weight || 600} ${size}px Heebo, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align || "right";
    ctx.textBaseline = "middle";
    ctx.direction = dir || "rtl";
    ctx.fillText(str, x, y);
    ctx.direction = "ltr";
  }
  function arrowHead(x, y, ang, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(ang - 0.42), y - size * Math.sin(ang - 0.42));
    ctx.lineTo(x - size * Math.cos(ang + 0.42), y - size * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
  }
  function curveArrow(x0, y0, x1, y1, bend, color, width, dashPhase) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cxp = mx + nx * bend;
    const cyp = my + ny * bend;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    if (dashPhase != null) {
      ctx.setLineDash([11, 9]);
      ctx.lineDashOffset = -dashPhase;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cxp, cyp, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y1 - cyp, x1 - cxp);
    arrowHead(x1, y1, ang, 9, color);
  }

  // anisotropic splat cloud, projected with `cam`, first `count` by rank.
  function drawGaussians(cam, count, sizeMul, alphaMul, pruneFade, jitter) {
    if (!gReady) return;
    const arr = [];
    for (let i = 0; i < gaussians.length; i++) {
      const g = gaussians[i];
      if (g.rank >= count) continue;
      let jx = 0;
      let jy = 0;
      let jz = 0;
      if (jitter) {
        const a = g.ph + wallT * 6;
        jx = Math.cos(a) * jitter;
        jy = Math.sin(a * 1.3) * jitter;
        jz = Math.cos(a * 0.7) * jitter;
      }
      const pc = proj(cam, g.x + jx, g.y + jy, g.z + jz);
      if (pc.depth <= 0.2) continue;
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
      let a = alphaMul * (g.prune ? 0.5 : 1);
      if (g.prune) a *= 1 - pruneFade;
      if (a <= 0.01) continue;
      ctx.globalAlpha = clamp01(a);
      ctx.save();
      ctx.transform(ux / SPR_R, uy / SPR_R, vx / SPR_R, vy / SPR_R, pc.x, pc.y);
      ctx.drawImage(g.sprite, -SPR_R, -SPR_R, SPR, SPR);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // sparse SfM points (small dots) for the first `count` gaussians
  function drawDots(cam, count, alpha) {
    if (!gReady || alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#3b4250";
    for (let i = 0; i < gaussians.length; i++) {
      const g = gaussians[i];
      if (g.rank >= count) continue;
      const p = proj(cam, g.x, g.y, g.z);
      if (p.depth <= 0.2) continue;
      const s = Math.max(1.1, p.scale * 0.013);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFrustum(cam, apex, target, size, stroke, alpha, lw) {
    let fX = target.x - apex.x;
    let fY = target.y - apex.y;
    let fZ = target.z - apex.z;
    const fl = Math.hypot(fX, fY, fZ) || 1;
    fX /= fl;
    fY /= fl;
    fZ /= fl;
    let rx = fY * 0 - fZ * 1;
    let ry = fZ * 0 - fX * 0;
    let rz = fX * 1 - fY * 0;
    let rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    const uxv = ry * fZ - rz * fY;
    const uyv = rz * fX - rx * fZ;
    const uzv = rx * fY - ry * fX;
    const depth = size * 1.5;
    const ccx = apex.x + fX * depth;
    const ccy = apex.y + fY * depth;
    const ccz = apex.z + fZ * depth;
    const hs = size * 0.62;
    const corners = [];
    for (const [sr, su] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      corners.push({
        x: ccx + rx * hs * sr + uxv * hs * su,
        y: ccy + ry * hs * sr + uyv * hs * su,
        z: ccz + rz * hs * sr + uzv * hs * su,
      });
    }
    const pa = proj(cam, apex.x, apex.y, apex.z);
    const pcs = corners.map((c) => proj(cam, c.x, c.y, c.z));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 1.4;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const p of pcs) {
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.moveTo(pcs[0].x, pcs[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pcs[i].x, pcs[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    return { apex: pa, corners: pcs };
  }

  function panelFrame(x, y, w, h, title, alpha, titleColor) {
    ctx.globalAlpha = alpha;
    rr(x, y, w, h, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.stroke();
    if (title) text(title, x + w / 2, y - 13, 14.5, titleColor || INK, "center", 700, "rtl");
    ctx.globalAlpha = 1;
  }

  // render the splat object into a panel rect (clipped), with a top-down wipe
  function renderedPanel(rect, sharp, reveal, alpha) {
    ctx.save();
    rr(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    if (reveal < 1) {
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h * reveal);
      ctx.clip();
    }
    const focal = Math.min(rect.w, rect.h) * 1.9;
    const pcam = makeCam(
      -0.55,
      0.28,
      1,
      0,
      0,
      0,
      rect.x + rect.w / 2,
      rect.y + rect.h * 0.52,
      focal,
    );
    const cnt = Math.floor(lerp(620, MAXG, sharp));
    const sizeMul = lerp(1.35, 0.62, sharp);
    drawGaussians(pcam, cnt, sizeMul, alpha, 1, 0);
    ctx.restore();
  }

  // "Tile Rasterizer" reveal: tiles sweep in along a diagonal
  function drawTileMask(rect, reveal, alpha) {
    const cols = 6;
    const rows = 6;
    const tw = rect.w / cols;
    const th = rect.h / rows;
    const maxd = cols + rows - 2;
    ctx.save();
    rr(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fbfcfe";
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if ((i + j) / maxd > reveal)
          ctx.fillRect(rect.x + i * tw, rect.y + j * th, tw + 0.6, th + 0.6);
      }
    }
    // faint tile grid + an accent sweep line at the active diagonal
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = "rgba(40,50,70,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) {
      ctx.moveTo(rect.x + i * tw, rect.y);
      ctx.lineTo(rect.x + i * tw, rect.y + rect.h);
    }
    for (let j = 1; j < rows; j++) {
      ctx.moveTo(rect.x, rect.y + j * th);
      ctx.lineTo(rect.x + rect.w, rect.y + j * th);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function gtPanel(rect, alpha) {
    ctx.save();
    rr(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#eef1f5";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (gtImg.complete && gtImg.naturalWidth) {
      const ir = gtImg.naturalWidth / gtImg.naturalHeight;
      const rrt = rect.w / rect.h;
      let dw = rect.w;
      let dh = rect.h;
      if (ir > rrt) dh = rect.w / ir;
      else dw = rect.h * ir;
      ctx.drawImage(
        gtImg,
        rect.x + (rect.w - dw) / 2,
        rect.y + (rect.h - dh) / 2,
        dw,
        dh,
      );
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ====================================================================
     chapters / playback (same UX model as the NeRF pipeline slide)
     ==================================================================== */
  // absolute storyboard times for each phase boundary
  const T = {
    init: 4.0, // SfM dots -> gaussians inflate
    initEnd: 7.5,
    param: 7.5, // 5 learnable params callout
    proj: 11.5, // projection
    rast: 15.5, // differentiable rasterizer + rendered panel
    loss: 19.0, // ground-truth + loss
    grad: 22.5, // gradient backflow
    adc: 25.5, // adaptive density control
    loop: 30.0, // converge
    end: 34.8,
  };
  const chapters = [
    { start: 0.0, end: T.init, title: "מבנה מתוך תנועה (SfM): מהתמונות מתקבל ענן נקודות ראשוני" },
    { start: T.init, end: T.param, title: "אתחול: כל נקודה הופכת ל-Gaussian תלת-ממדי" },
    { start: T.param, end: T.proj, title: "לכל Gaussian חמישה פרמטרים נלמדים" },
    { start: T.proj, end: T.rast, title: "הטלה: מטילים את ה-Gaussians אל מישור המצלמה" },
    { start: T.rast, end: T.loss, title: "ראסטרייזר דיפרנציאלי: מרכיבים את הספלאטים לתמונה" },
    { start: T.loss, end: T.grad, title: "משווים לתמונת האמת ומחשבים את ה-Loss" },
    { start: T.grad, end: T.adc, title: "זרימת גרדיאנט אחורה: מעדכנים את הפרמטרים" },
    { start: T.adc, end: T.loop, title: "בקרת צפיפות אדפטיבית: גיזום, שכפול ופיצול" },
    { start: T.loop, end: T.end, title: "חוזרים על הלולאה עד שהרינדור מתכנס לתמונת האמת" },
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
    if (hintEl) {
      hintEl.classList.toggle(
        "visible",
        paused && chapterIdx < chapters.length - 1,
      );
    }
  }

  function step(dtScale) {
    const dt = dtScale / 60;
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
        const f = k + Math.sin(Math.PI * k) / Math.PI;
        chapterT = decelStartT + (decelTargetT - decelStartT) * f;
      }
    } else {
      chapterT += dt;
    }
    t = chapters[chapterIdx].start + chapterT;
  }

  /* ====================================================================
     overlay compositions
     ==================================================================== */
  // C2 - five learnable parameters, exploded around one hero ellipsoid
  function drawParamCallout(alpha) {
    const cxp = W * 0.4;
    const cyp = H * 0.46;
    const R = Math.min(W, H) * 0.13;
    // hero ellipsoid
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cxp, cyp);
    ctx.rotate(-0.35);
    const grad = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R);
    grad.addColorStop(0, "rgba(150,210,150,0.98)");
    grad.addColorStop(0.6, "rgba(96,170,110,0.92)");
    grad.addColorStop(1, "rgba(70,140,90,0.86)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    // latitude hint arcs for a 3D read
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.66, R * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // labels on the right, leader lines back to the ellipsoid
    const labels = [
      ["מרכז", "μ  (Mean)"],
      ["מטריצת שונות", "Σ  (Covariance)"],
      ["צבע", "RGB"],
      ["שקיפות", "α  (Opacity)"],
      ["כיווניות", "SH coeff."],
    ];
    const lx = W * 0.6;
    const top = cyp - R * 0.95;
    const gap = (R * 1.9) / (labels.length - 1);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < labels.length; i++) {
      const ly = top + gap * i;
      // anchor on the ellipsoid edge
      const ang = -0.9 + (i / (labels.length - 1)) * 1.8;
      const axp = cxp + Math.cos(ang) * R * 0.95;
      const ayp = cyp + Math.sin(ang) * R * 0.6;
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(axp, ayp);
      ctx.lineTo(lx - 6, ly);
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(axp, ayp, 3, 0, Math.PI * 2);
      ctx.fill();
      // number chip
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(lx + 12, ly, 10, 0, Math.PI * 2);
      ctx.fill();
      text(String(i + 1), lx + 12, ly + 0.5, 12, "#fff", "center", 700, "ltr");
      text(labels[i][0], lx + 30, ly - 8, 17, INK, "left", 700, "rtl");
      text(labels[i][1], lx + 30, ly + 9, 12.5, INK_SOFT, "left", 500, "ltr");
    }
    // footnote
    text(
      "≈ 5 פרמטרים לכל Gaussian · מיליוני Gaussians בסצנה",
      W * 0.5,
      H * 0.82,
      15,
      INK_SOFT,
      "center",
      600,
      "rtl",
    );
    ctx.globalAlpha = 1;
  }

  // a formula card
  function formulaCard(cx, cy, str, label, alpha, w, fontSize) {
    const bw = w || 230;
    const bh = 58;
    ctx.globalAlpha = alpha;
    rr(cx - bw / 2, cy - bh / 2, bw, bh, 10);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.stroke();
    if (label) text(label, cx, cy - bh / 2 - 12, 13.5, INK_SOFT, "center", 600, "rtl");
    text(str, cx, cy + 2, fontSize || 19, INK, "center", 700, "ltr");
    ctx.globalAlpha = 1;
  }

  function drawLegend(x, y, alpha) {
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26, y);
    ctx.stroke();
    arrowHead(x + 26, y, 0, 8, INK);
    text("זרימת פעולה", x + 34, y, 13, INK, "left", 600, "rtl");
    const y2 = y + 22;
    ctx.strokeStyle = CYAN;
    ctx.beginPath();
    ctx.moveTo(x, y2);
    ctx.lineTo(x + 26, y2);
    ctx.stroke();
    arrowHead(x + 26, y2, 0, 8, CYAN);
    text("זרימת גרדיאנט", x + 34, y2, 13, CYAN, "left", 600, "rtl");
    ctx.globalAlpha = 1;
  }

  // C7 - adaptive density mini-cards (prune / clone / split)
  function drawADC(alpha, localT) {
    const cards = [
      { title: "גיזום", sub: "Pruning" },
      { title: "שכפול", sub: "Clone · Under-recon." },
      { title: "פיצול", sub: "Split · Over-recon." },
    ];
    const cw = Math.min(W * 0.2, 215);
    const ch = cw * 0.62;
    const gapx = Math.min(W * 0.03, 26);
    const totalW = cw * 3 + gapx * 2;
    const x0 = (W - totalW) / 2;
    const y0 = H * 0.62;
    const pulse = (Math.sin(localT * 2.4) + 1) / 2;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * (cw + gapx);
      ctx.globalAlpha = alpha;
      rr(x, y0, cw, ch, 12);
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,0.14)";
      ctx.stroke();
      text(cards[i].title, x + cw / 2, y0 + 17, 16, INK, "center", 700, "rtl");
      text(cards[i].sub, x + cw / 2, y0 + 34, 11.5, INK_SOFT, "center", 500, "ltr");
      const my = y0 + ch * 0.66;
      const mxL = x + cw * 0.3;
      const mxR = x + cw * 0.7;
      const blob = (bx, by, rx, ry, a, col) => {
        ctx.globalAlpha = alpha * a;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(rx, ry));
        g.addColorStop(0, col + "1)");
        g.addColorStop(0.6, col + "0.55)");
        g.addColorStop(1, col + "0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      const green = "rgba(70,150,95,";
      if (i === 0) {
        // pruning: a faint blob fades out
        blob(x + cw / 2, my, 16, 11, 1 - pulse * 0.9, green);
      } else if (i === 1) {
        // clone: one blob -> two identical, drifting apart
        const sp = pulse * 12;
        blob(mxL - sp, my, 13, 9, 1, green);
        blob(mxR + sp - cw * 0.4, my, 13, 9, pulse, green);
      } else {
        // split: one big blob -> two smaller
        const sp = pulse * 14;
        const big = 1 - pulse;
        blob(x + cw / 2, my, 16 * (0.6 + big * 0.4), 12 * (0.6 + big * 0.4), 1, green);
        blob(x + cw / 2 - sp, my, 10, 7, pulse, green);
        blob(x + cw / 2 + sp, my, 10, 7, pulse, green);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ====================================================================
     main draw
     ==================================================================== */
  function draw() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (!W || !H) return;

    /* ---- phase progress (all derived from absolute t) ---- */
    const inflate = smooth(T.init, T.initEnd, t);
    const dotsAlpha = clamp01(1 - smooth(T.init + 0.2, T.initEnd - 0.3, t));
    const sfmAlpha = clamp01(1 - smooth(T.init, T.init + 1.6, t));
    const paramWin = smooth(T.param + 0.3, T.param + 1.1, t) * (1 - smooth(T.proj - 0.7, T.proj, t));
    const panelsIn = smooth(T.rast - 0.2, T.rast + 1.1, t);
    const projWin = smooth(T.proj, T.proj + 0.8, t) * (1 - smooth(T.loss + 1.0, T.loss + 2.0, t));
    const heroWin = smooth(T.proj - 0.2, T.proj + 0.8, t);
    const lossWin = smooth(T.loss - 0.1, T.loss + 1.0, t);
    const gradWin = smooth(T.grad, T.grad + 0.7, t) * (1 - smooth(T.adc - 0.4, T.adc + 0.2, t));
    const adcWin = smooth(T.adc, T.adc + 0.7, t) * (1 - smooth(T.loop - 0.5, T.loop, t));
    const converge = smooth(T.loop, T.end - 0.6, t);
    const legendWin = smooth(T.loss - 0.2, T.loss + 0.8, t);

    // cloud dims during the param callout; thins prunables during ADC
    const cloudAlpha = lerp(1, 0.16, paramWin);
    const pruneFade = smooth(T.adc + 0.4, T.adc + 1.7, t);
    // jitter during gradient update
    const jitter = gradWin * 0.05 * (1 - converge);

    // visible gaussian count grows during ADC and convergence
    let count = 420;
    count = lerp(count, 1080, smooth(T.adc + 0.4, T.loop, t));
    count = lerp(count, MAXG, converge);
    count = Math.round(count);
    const sizeMul = (0.0 + inflate) * lerp(1.0, 0.72, converge);

    /* ---- main cinematic camera (orbits; shifts left when panels show) ---- */
    const orbit = wallT * 0.16;
    const yaw = Math.sin(orbit) * 0.5 + 0.35 + panelsIn * 0.15;
    const pitch = 0.16 + Math.sin(orbit * 0.7 + 0.5) * 0.06;
    const zoom = 1 + 0.05 * Math.sin(orbit * 0.5);
    const vpx = lerp(W * 0.5, W * 0.33, panelsIn);
    const vpy = H * 0.47;
    const focal = Math.min(W, H) * lerp(0.72, 0.66, panelsIn);
    const cam = makeCam(yaw, pitch, zoom, 0, 0, 0, vpx, vpy, focal);

    /* ---- SfM red cameras (chapter 0) ---- */
    if (sfmAlpha > 0.01) {
      for (const c of sfmCams) {
        drawFrustum(cam, c, { x: 0, y: 0, z: 0 }, 0.62, "rgba(220,60,48,0.9)", sfmAlpha * 0.9, 1.3);
      }
      text("Structure from Motion", vpx, H * 0.12, 16, "rgba(200,55,45,0.95)", "center", 700, "ltr");
    }

    /* ---- the cloud ---- */
    if (dotsAlpha > 0.01) drawDots(cam, 420, dotsAlpha);
    if (sizeMul > 0.01) drawGaussians(cam, count, sizeMul, cloudAlpha, pruneFade, jitter);

    /* ---- hero camera + projection (chapters 3-5) ---- */
    if (heroWin > 0.01) {
      drawFrustum(cam, HERO, { x: 0, y: 0, z: 0 }, 0.85, ACCENT, heroWin, 2.2);
      if (projWin > 0.01) {
        // a few projection rays from gaussians to the hero apex
        const pa = proj(cam, HERO.x, HERO.y, HERO.z);
        ctx.globalAlpha = projWin * 0.5;
        ctx.strokeStyle = "rgba(60,70,90,0.5)";
        ctx.lineWidth = 1;
        for (let i = 0; i < gaussians.length; i += Math.max(1, (count / 24) | 0)) {
          const g = gaussians[i];
          if (g.rank >= count) continue;
          const pg = proj(cam, g.x, g.y, g.z);
          ctx.beginPath();
          ctx.moveTo(pg.x, pg.y);
          ctx.lineTo(pa.x, pa.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        formulaCard(W * 0.3, H * 0.85, "Σ' = J W Σ Wᵀ Jᵀ", "הטלת השונות למסך", projWin, 250);
      }
    }

    /* ---- C2 param callout ---- */
    if (paramWin > 0.01) drawParamCallout(paramWin);

    /* ---- right column: rendered / ground-truth / loss ---- */
    if (panelsIn > 0.01) {
      const ps = Math.min(W * 0.19, H * 0.24);
      const rightX = W - ps - W * 0.06;
      const rendered = { x: rightX, y: H * 0.14, w: ps, h: ps };
      const gt = { x: rightX, y: rendered.y + ps + 44, w: ps, h: ps };
      const rastReveal = smooth(T.rast + 0.1, T.rast + 1.9, t);
      const renderSharp = converge;

      panelFrame(rendered.x, rendered.y, rendered.w, rendered.h, "רינדור", panelsIn, INK);
      renderedPanel(rendered, renderSharp, 1, panelsIn);
      if (t < T.rast + 2.0) drawTileMask(rendered, rastReveal, panelsIn);

      if (lossWin > 0.01) {
        panelFrame(gt.x, gt.y, gt.w, gt.h, "תמונת אמת", lossWin, INK);
        gtPanel(gt, lossWin);
        // loss formula + decreasing value (kept on-screen)
        const lossVal = lerp(0.42, 0.012, converge);
        const lw = Math.min(ps + 96, W * 0.36);
        formulaCard(
          W - 12 - lw / 2,
          gt.y + ps + 42,
          "ℒ = (1−λ)ℒ₁ + λℒ_DSSIM",
          "Loss = " + lossVal.toFixed(3),
          lossWin,
          lw,
          16.5,
        );
      }

      // operation-flow arrow (cloud -> rendered), black
      const op = panelsIn * (1 - gradWin * 0.0);
      ctx.globalAlpha = op;
      curveArrow(W * 0.5, H * 0.42, rendered.x - 8, rendered.y + rendered.h / 2, -40, INK, 2.4, null);
      ctx.globalAlpha = 1;
    }

    /* ---- C6 gradient backflow (cyan, loss -> cloud) ---- */
    if (gradWin > 0.01) {
      const ps = Math.min(W * 0.19, H * 0.24);
      const rightX = W - ps - W * 0.06;
      const phase = (wallT * 90) % 20;
      curveArrow(rightX - 4, H * 0.66, W * 0.4, H * 0.5, 70, CYAN, 2.6, phase);
      curveArrow(rightX + ps * 0.2, H * 0.5, W * 0.34, H * 0.36, 50, CYAN, 2.4, phase + 6);
      text("∂ℒ / ∂(μ, Σ, c, α)", W * 0.46, H * 0.6, 14, CYAN, "center", 700, "ltr");
    }

    /* ---- C7 adaptive density ---- */
    if (adcWin > 0.01) drawADC(adcWin, t - T.adc);

    /* ---- legend ---- */
    if (legendWin > 0.01) drawLegend(W * 0.045, H * 0.12, legendWin * 0.9);

    /* ---- convergence checkmark ---- */
    if (converge > 0.6) {
      ctx.globalAlpha = smooth(0.6, 1, converge);
      text("✓ הרינדור תואם לתמונת האמת", W * 0.33, H * 0.78, 17, "rgba(36,150,88,0.96)", "center", 700, "rtl");
      ctx.globalAlpha = 1;
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
    // test hook: render a specific storyboard time deterministically
    __drawAt(time) {
      wallT = time;
      t = time;
      draw();
    },
  };
}
