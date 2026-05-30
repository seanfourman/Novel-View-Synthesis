// gpipe.js - Slide 17: how 3D Gaussian Splatting works, step by step.
//
// White stage, click to advance. Story:
//   1. capture the scene from many angles  -> camera pyramids all around it
//   2. each pyramid collapses into a point -> a sparse 3D point cloud
//   3. each point becomes a Gaussian (a soft coloured 3D blob); a little row
//      up top shows what a Gaussian is made of (position / shape / colour /
//      opacity) - as small dots, not a big diagram
//   4. splatting: project all Gaussians onto a camera and blend -> an image
//   5. compare that render to the real photo
//   6. the error updates / clones / splits / prunes the Gaussians
//   7. after many iterations: a full 3D scene you can orbit
//
// Object = the NeRF "hotdog" scene, reconstructed offline into a coloured
// point cloud by silhouette space-carving (assets/generated/hotdog_points.json).
// Self-contained, no THREE.

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
  const FRUST = "rgba(70,80,100,0.8)";

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
  const photoNums = [0, 8, 16, 24, 33, 42, 50, 58, 66, 74, 82, 90];
  const photos = photoNums.map((n) => {
    const im = new Image();
    im.decoding = "async";
    im.src = new URL(`../assets/3dgs/hotdog/train/r_${n}.png`, import.meta.url).href;
    return im;
  });

  /* ---------- capture cameras on a dome (NeRF-style frustums) ---------- */
  const NCAM = 40;
  const GA = Math.PI * (3 - Math.sqrt(5));
  const sfmCams = [];
  for (let i = 0; i < NCAM; i++) {
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / NCAM); // full sphere dome (all angles)
    const th = GA * k;
    const r = OBJ_SIZE * 2.5;
    sfmCams.push({
      x: r * Math.sin(phi) * Math.cos(th),
      y: r * Math.cos(phi) * 0.85 + OBJ_SIZE * 0.12,
      z: r * Math.sin(phi) * Math.sin(th),
      img: photos[i % photos.length],
    });
  }

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

  // affine-warp an image onto a screen triangle (src in image px, dst screen)
  function imgTri(img, s0, s1, s2, d0, d1, d2) {
    const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(den) < 1e-6) return;
    const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
    const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
    const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
    const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
    const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;
    const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  function imgQuad(img, q, alpha) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    ctx.globalAlpha = alpha;
    imgTri(img, { x: 0, y: 0 }, { x: iw, y: 0 }, { x: iw, y: ih }, q[0], q[1], q[2]);
    imgTri(img, { x: 0, y: 0 }, { x: iw, y: ih }, { x: 0, y: ih }, q[0], q[2], q[3]);
    ctx.globalAlpha = 1;
  }

  // a camera pyramid pointing at the origin, with its photo on the base plane
  function drawFrustum(cam, apex, size, img, alpha) {
    let fX = -apex.x;
    let fY = -apex.y;
    let fZ = -apex.z;
    const fl = Math.hypot(fX, fY, fZ) || 1;
    fX /= fl;
    fY /= fl;
    fZ /= fl;
    // right = forward x worldUp
    let rx = fY * 0 - fZ * 1;
    let ry = fZ * 0 - fX * 0;
    let rz = fX * 1 - fY * 0;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    const ux = ry * fZ - rz * fY;
    const uy = rz * fX - rx * fZ;
    const uz = rx * fY - ry * fX;
    const depth = size * 1.35;
    const cxp = apex.x + fX * depth;
    const cyp = apex.y + fY * depth;
    const czp = apex.z + fZ * depth;
    const hs = size * 0.6;
    const C = [];
    for (const [sr, su] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      C.push(proj(cam, cxp + rx * hs * sr + ux * hs * su, cyp + ry * hs * sr + uy * hs * su, czp + rz * hs * sr + uz * hs * su));
    }
    const pa = proj(cam, apex.x, apex.y, apex.z);
    // base fill (white) so the photo reads, then warp the photo on
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(C[0].x, C[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(C[i].x, C[i].y);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (img) imgQuad(img, C, alpha * 0.96);
    // edges
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = FRUST;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const p of C) {
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.moveTo(C[0].x, C[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(C[i].x, C[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function groundShadow(cam, alpha) {
    const p = proj(cam, 0, -OBJ_SIZE * 0.42, 0);
    const rw = OBJ_SIZE * 1.05 * p.scale;
    ctx.save();
    ctx.globalAlpha = alpha * 0.16;
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
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
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

  // small top row: what a single Gaussian is made of (as little glyphs)
  function drawPropsRow(alpha) {
    const items = ["מיקום", "צורה וגודל", "צבע", "שקיפות"];
    const n = items.length;
    const gap = Math.min(W * 0.13, 170);
    const x0 = W / 2 - (gap * (n - 1)) / 2;
    const gy = H * 0.12;
    ctx.globalAlpha = alpha;
    text("כל Gaussian מחזיק:", W / 2, gy - 34, 14, INK_SOFT, "center", 600);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      if (i === 0) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(x, gy, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (i === 1) {
        ctx.save();
        ctx.translate(x, gy);
        ctx.rotate(-0.5);
        ctx.fillStyle = "rgba(120,130,150,0.85)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (i === 2) {
        const g = ctx.createLinearGradient(x - 8, gy, x + 8, gy);
        g.addColorStop(0, "#ffb046");
        g.addColorStop(1, "#e0563a");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, gy, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(x, gy, 0, x, gy, 8);
        g.addColorStop(0, "rgba(90,110,140,0.9)");
        g.addColorStop(1, "rgba(90,110,140,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, gy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      text(items[i], x, gy + 20, 13, INK, "center", 600);
    }
    ctx.globalAlpha = 1;
  }

  /* ====================================================================
     steps / playback
     ==================================================================== */
  const T = {
    cameras: 0.0,
    points: 4.5,
    gauss: 8.5,
    splat: 13.0,
    compare: 17.0,
    optimize: 21.0,
    result: 26.0,
    end: 31.0,
  };
  const chapters = [
    { start: T.cameras, end: T.points, title: "מצלמים את הסצנה ממלא מצלמות, מכל הזוויות" },
    { start: T.points, end: T.gauss, title: "כל מצלמה הופכת לנקודה — ומתקבל ענן נקודות דליל" },
    { start: T.gauss, end: T.splat, title: "כל נקודה הופכת ל-Gaussian: כתם תלת-ממדי רך" },
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

    /* progresses */
    const converge = smooth(T.points, T.gauss - 0.6, t); // cameras -> points
    const camAlpha = clamp01(1 - smooth(T.gauss - 1.0, T.gauss - 0.2, t));
    const dotsWin = smooth(T.points + 0.2, T.points + 1.4, t) * (1 - smooth(T.gauss + 0.5, T.gauss + 1.5, t));
    const splatGrow = smooth(T.gauss + 0.3, T.gauss + 1.9, t);
    const propsWin = smooth(T.gauss + 0.5, T.gauss + 1.3, t) * (1 - smooth(T.splat - 0.6, T.splat + 0.2, t));
    const projWin = smooth(T.splat + 0.2, T.splat + 1.0, t) * (1 - smooth(T.compare - 0.3, T.compare + 0.4, t));
    const heroCamWin = smooth(T.splat, T.splat + 0.8, t) * (1 - smooth(T.compare - 0.4, T.compare + 0.3, t));
    const compareWin = smooth(T.compare, T.compare + 0.7, t) * (1 - smooth(T.optimize + 0.3, T.optimize + 1.0, t));
    const optimizeWin = smooth(T.optimize, T.optimize + 0.7, t) * (1 - smooth(T.result, T.result + 0.5, t));
    const resultWin = smooth(T.result + 0.2, T.result + 1.2, t);

    let count = 460;
    count = lerp(count, MAXG, smooth(T.optimize + 0.3, T.result, t));
    count = Math.round(count);

    const vpx = W * 0.5;

    const yaw = -0.5 + Math.sin(wallT * 0.16) * 0.5 + wallT * 0.04;
    const pitch = 0.34 + Math.sin(wallT * 0.26) * 0.05 - resultWin * 0.06;
    const zoom = 1 + 0.04 * Math.sin(wallT * 0.4);
    const focal = Math.min(W, H) * 0.74;
    const cam = makeCam(yaw, pitch, zoom, vpx, H * 0.5, focal);

    /* ---- steps 1-2: capture cameras that collapse into points ---- */
    if (camAlpha > 0.01) {
      // draw far-to-near so nearer frustums overlap correctly
      const list = sfmCams
        .map((c, i) => ({ c, i, d: proj(cam, c.x, c.y, c.z).depth }))
        .sort((a, b) => b.d - a.d);
      for (const { c, i } of list) {
        const ti = easeInOut(clamp01(converge * 1.25 - (i / NCAM) * 0.22));
        let tx = 0;
        let ty = 0;
        let tz = 0;
        if (gReady) {
          const g = gaussians[i % gaussians.length];
          tx = g.x;
          ty = g.y;
          tz = g.z;
        }
        const apex = {
          x: lerp(c.x, tx, ti),
          y: lerp(c.y, ty, ti),
          z: lerp(c.z, tz, ti),
        };
        const sz = OBJ_SIZE * 0.3 * (1 - 0.9 * ti);
        const a = camAlpha * (1 - 0.85 * ti);
        if (a > 0.02 && sz > 0.02) drawFrustum(cam, apex, sz, c.img, a);
      }
    }

    /* ---- ground shadow once the object exists ---- */
    if (splatGrow > 0.02) groundShadow(cam, splatGrow);

    /* ---- sparse points / gaussians ---- */
    if (dotsWin > 0.01) drawDots(cam, 460, dotsWin);
    if (splatGrow > 0.01) {
      const jitter = optimizeWin * 0.05;
      const sizeMul = splatGrow * lerp(1.0, 0.82, smooth(T.optimize, T.result, t));
      drawGaussians(cam, count, sizeMul, 1, jitter);
    }

    /* ---- step 3: properties row up top ---- */
    if (propsWin > 0.01) drawPropsRow(propsWin);

    /* ---- step 4: splatting (camera + projection lines) ---- */
    if (heroCamWin > 0.01) {
      const HERO = { x: OBJ_SIZE * 1.7, y: OBJ_SIZE * 1.0, z: OBJ_SIZE * 1.3 };
      const pa = proj(cam, HERO.x, HERO.y, HERO.z);
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

    /* ---- compare/optimize: small real-photo reference (top-right) ---- */
    const refWin = Math.max(compareWin, optimizeWin);
    let refRect = null;
    if (refWin > 0.01) {
      const ps = Math.min(W * 0.16, H * 0.24);
      const rx = W - ps - W * 0.05;
      const ry = H * 0.09;
      refRect = { x: rx, y: ry, w: ps, h: ps };
      ctx.save();
      ctx.globalAlpha = refWin;
      rr(rx, ry, ps, ps, 12);
      ctx.fillStyle = "#f3f1ec";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.stroke();
      rr(rx, ry, ps, ps, 12);
      ctx.clip();
      const img = photos[0];
      if (img.complete && img.naturalWidth) {
        const ir = img.naturalWidth / img.naturalHeight;
        let dw = ps;
        let dh = ps / ir;
        if (dh < ps) {
          dh = ps;
          dw = ps * ir;
        }
        ctx.drawImage(img, rx + (ps - dw) / 2, ry + (ps - dh) / 2, dw, dh);
      }
      ctx.restore();
      text("התמונה האמיתית", rx + ps / 2, ry + ps + 13, 13, INK_SOFT, "center", 600);
    }

    /* ---- step 5: differences between our render (centre) and the photo ---- */
    if (compareWin > 0.01) drawDiff(cam, count, compareWin * 0.9);

    /* ---- step 6: optimize — error flows from the photo back to the gaussians ---- */
    if (optimizeWin > 0.01 && refRect) {
      const phase = (wallT * 90) % 20;
      curveArrow(refRect.x, refRect.y + refRect.h * 0.6, W * 0.5 + 50, H * 0.5, -80, CYAN, 2.6, phase);
      text("מתקנים · מוסיפים · מפצלים · מסירים", W * 0.5, H * 0.13, 16, ACCENT, "center", 700);
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
