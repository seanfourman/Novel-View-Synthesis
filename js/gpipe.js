// gpipe.js - Slide 17: how 3D Gaussian Splatting builds a scene, step by step,
// advanced by MOUSE CLICK (like the NeRF pipeline slide - nothing auto-plays).
//
// Story (one click per step):
//   0. a pile of real photos of the chair, shot from many angles (polaroids)
//   1. the photos collapse into a sparse 3D point cloud
//   2. every point becomes a Gaussian - a soft, oriented 3D blob
//   3. splatting: project all the Gaussians onto a camera and blend -> an image
//   4. compare that render to a real photo - where is it wrong?
//   5. the error clones / splits / prunes the Gaussians (densification)
//   6. after many iterations: a full 3D scene you can orbit
//
// Clicks bump a `target` step; a smoothed `flow` value eases toward it, and every
// visual is keyed off `flow`, so each step morphs smoothly into the next but only
// when the presenter clicks. Object = the NeRF "chair", carved offline from its
// training photos into an oriented colour+normal splat cloud
// (assets/generated/chair_splats.json). Self-contained, no THREE.

export function initGaussianPipeline() {
  const slide = document.getElementById("gaussian-pipeline");
  if (!slide) return { tick() {}, enter() {} };
  const canvas = document.getElementById("gpipe-canvas");
  const captionEl = document.getElementById("gpipe-caption");
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
  const DOT = "#3b4250";

  /* ---------- math ---------- */
  let _seed = 0x40d0617;
  const rand = () =>
    (_seed = (_seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = (k) =>
    k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const smooth = (a, b, x) => {
    const k = clamp01((x - a) / (b - a || 1));
    return k * k * (3 - 2 * k);
  };

  /* ---------- camera ---------- */
  function makeCam(yaw, pitch, dist, vpx, vpy, focal) {
    return {
      cY: Math.cos(yaw),
      sY: Math.sin(yaw),
      cP: Math.cos(pitch),
      sP: Math.sin(pitch),
      dist,
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
    const denom = z2 + cam.dist;
    const f = cam.focal;
    return {
      x: cam.vpx + (f * x1) / denom,
      y: cam.vpy - (f * y2) / denom,
      depth: denom,
    };
  }

  /* ---------- soft-blob sprite cache (drawn anisotropically -> ellipse) ---------- */
  const SPR = 64;
  const SPR_R = 32;
  const spriteCache = new Map();
  function buildBlob(r, g, b) {
    const c = document.createElement("canvas");
    c.width = SPR;
    c.height = SPR;
    const x = c.getContext("2d");
    const grad = x.createRadialGradient(SPR_R, SPR_R, 0, SPR_R, SPR_R, SPR_R);
    grad.addColorStop(0.0, `rgba(${r},${g},${b},0.97)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(0.75, `rgba(${r},${g},${b},0.16)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.beginPath();
    x.arc(SPR_R, SPR_R, SPR_R, 0, Math.PI * 2);
    x.fill();
    return c;
  }
  function adjColor(r, g, b) {
    const m = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = 1.4;
    const R = m + (r - m) * sat;
    const G = m + (g - m) * sat;
    const B = m + (b - m) * sat;
    const ceil = 210;
    const k = (v) => (v > ceil ? ceil + (v - ceil) * 0.3 : v);
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

  /* ---------- chair splat cloud (baked: position / colour / normal / spacing) ---------- */
  const OBJ_SIZE = 3.4;
  const MAXG = 40000;
  const SPARSE_N = 760; // points shown as the "sparse cloud"
  const splats = [];
  let ready = false;

  function basisFromNormal(nx, ny, nz) {
    let hx = 0;
    let hy = 0;
    let hz = 0;
    if (Math.abs(nx) < 0.9) hx = 1;
    else hy = 1;
    let ux = ny * hz - nz * hy;
    let uy = nz * hx - nx * hz;
    let uz = nx * hy - ny * hx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    return [ux, uy, uz, vx, vy, vz];
  }

  function buildSplats(d) {
    const n = d.count;
    for (let i = 0; i < n; i++) {
      const x = d.pos[i * 3] * OBJ_SIZE;
      const y = d.pos[i * 3 + 1] * OBJ_SIZE;
      const z = d.pos[i * 3 + 2] * OBJ_SIZE;
      const nx = d.nrm[i * 3];
      const ny = d.nrm[i * 3 + 1];
      const nz = d.nrm[i * 3 + 2];
      const spc = d.spc[i] * OBJ_SIZE;
      const [cr, cg, cb] = adjColor(
        d.col[i * 3],
        d.col[i * 3 + 1],
        d.col[i * 3 + 2],
      );
      const [ux, uy, uz, vx, vy, vz] = basisFromNormal(nx, ny, nz);
      const ang = rand() * Math.PI;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const la = spc * (1.5 + rand() * 0.4);
      const lb = spc * (0.85 + rand() * 0.3);
      splats.push({
        x,
        y,
        z,
        ax: (ca * ux + sa * vx) * la,
        ay: (ca * uy + sa * vy) * la,
        az: (ca * uz + sa * vz) * la,
        bx: (-sa * ux + ca * vx) * lb,
        by: (-sa * uy + ca * vy) * lb,
        bz: (-sa * uz + ca * vz) * lb,
        sprite: spriteFor(cr, cg, cb),
        r: cr,
        g: cg,
        b: cb,
        rank: 0,
        ph: rand() * Math.PI * 2,
      });
    }
    // random draw order so "first K" is a representative sparse subset
    const order = splats.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    order.forEach((idx, r) => (splats[idx].rank = r));
    // give each polaroid its own distinct point in the sparse cloud to fly into
    const sparseList = [];
    for (let i = 0; i < splats.length; i++) {
      if (splats[i].rank < SPARSE_N) sparseList.push(i);
    }
    for (let i = sparseList.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = sparseList[i];
      sparseList[i] = sparseList[j];
      sparseList[j] = tmp;
    }
    for (let i = 0; i < polaroids.length; i++) {
      polaroids[i].targetIdx = sparseList.length
        ? sparseList[i % sparseList.length]
        : -1;
    }
    ready = true;
  }

  function fallbackCloud() {
    const n = 1800;
    const d = { count: n, pos: [], col: [], nrm: [], spc: [] };
    for (let i = 0; i < n; i++) {
      const k = i + 0.5;
      const phi = Math.acos(1 - (2 * k) / n);
      const th = Math.PI * (1 + Math.sqrt(5)) * k;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      d.pos.push(x, y, z);
      d.nrm.push(x, y, z);
      d.spc.push(0.05);
      d.col.push(120, 170, 110);
    }
    buildSplats(d);
  }

  fetch(new URL("../assets/generated/chair_splats.json", import.meta.url).href)
    .then((r) => r.json())
    .then((d) => (d && d.count ? buildSplats(d) : fallbackCloud()))
    .catch(fallbackCloud);

  /* ---------- dedicated comparison photo (r_92) ---------- */
  const refImg = new Image();
  refImg.decoding = "async";
  refImg.src = new URL(
    "../assets/3dgs/chair/train/r_56.png",
    import.meta.url,
  ).href;

  /* ---------- final result gif — rendered as a real DOM element, not via canvas ----------
     ctx.drawImage() freezes GIF animation; overlaying an <img> lets the browser animate it. */
  const chairGif = new Image();
  chairGif.src = new URL("../assets/nerf/chair.gif", import.meta.url).href;
  chairGif.style.cssText =
    "position:absolute;left:0;top:0;opacity:0;pointer-events:none;object-fit:contain;";
  slide.appendChild(chairGif);

  /* ---------- real chair photos (training views) for polaroids + compare ---------- */
  const photoNums = [
    3, 9, 15, 21, 28, 34, 41, 47, 53, 60, 66, 72, 79, 85, 91, 97,
  ];
  const photos = photoNums.map((num) => {
    const im = new Image();
    im.decoding = "async";
    im.src = new URL(
      `../assets/3dgs/chair/train/r_${num}.png`,
      import.meta.url,
    ).href;
    return im;
  });
  // a loose, seeded scatter of polaroid cards across the stage (collage feel)
  const polaroids = photos
    .map((img, i) => ({
      img,
      fx: 0.16 + 0.68 * ((i % 4) / 3) + (rand() - 0.5) * 0.12,
      fy: 0.16 + 0.66 * (((i / 4) | 0) / 3) + (rand() - 0.5) * 0.12,
      rot: (rand() - 0.5) * 0.5,
      bob: rand() * Math.PI * 2,
      scl: 0.92 + rand() * 0.22,
      depth: rand(),
      targetIdx: -1,
    }))
    .filter(p => !(p.fy > 0.70 && p.fx > 0.25 && p.fx < 0.75));

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

  // a single polaroid card: white frame + (square) chair photo on a light mat
  function polaroidCard(img, cx, cy, w, rot, alpha) {
    if (alpha <= 0.01) return;
    const pad = w * 0.07;
    const cap = w * 0.2;
    const cw = w + pad * 2;
    const chh = w + pad + cap;
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.shadowColor = "rgba(20,30,50,0.20)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = "#ffffff";
    rr(-cw / 2, -chh / 2, cw, chh, 8);
    ctx.fill();
    ctx.shadowColor = "transparent";
    const px = -cw / 2 + pad;
    const py = -chh / 2 + pad;
    ctx.save();
    rr(px, py, w, w, 3);
    ctx.clip();
    ctx.fillStyle = "#eef0f3";
    ctx.fillRect(px, py, w, w);
    if (img && img.complete && img.naturalWidth)
      ctx.drawImage(img, px, py, w, w);
    ctx.restore();
    ctx.restore();
  }

  function drawPolaroids(win, flow, cam) {
    // win: 1 at step 0, ->0 as we collapse into the cloud. each card flies to its
    // OWN point in the sparse cloud (a distinct splat), shrinking + fading as it
    // "becomes" that point. staggered so they peel off and land one after another.
    const baseW = Math.min(W, H) * 0.19;
    const collapse = smooth(0.05, 0.98, flow); // 0..1 progress toward the cloud
    const list = polaroids
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p.depth - b.p.depth);
    for (const { p, i } of list) {
      // target = where this photo dissolves into the cloud (its own splat)
      let tx = W / 2;
      let ty = H / 2;
      if (ready && p.targetIdx >= 0) {
        const s = splats[p.targetIdx];
        const pp = proj(cam, s.x, s.y, s.z);
        tx = pp.x;
        ty = pp.y;
      }
      const prog = collapse * 1.4 - (i / polaroids.length) * 0.36; // staggered
      const k = easeInOut(clamp01(prog));
      const bx = p.fx * W + Math.cos(p.bob + wallT * 0.6) * 6 * win;
      const by = p.fy * H + Math.sin(p.bob + wallT * 0.6) * 6 * win;
      const cx = lerp(bx, tx, k);
      const cy = lerp(by, ty, k);
      const w = baseW * p.scl * (1 - 0.93 * k);
      // stay vivid in flight, fade only in the last stretch as it lands on its point
      const a = win * (1 - smooth(0.72, 1.0, prog));
      polaroidCard(p.img, cx, cy, w, p.rot * (1 - k), a);
    }
  }

  function drawDots(cam, count, alpha) {
    if (!ready || alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < splats.length; i++) {
      const s = splats[i];
      if (s.rank >= count) continue;
      const p = proj(cam, s.x, s.y, s.z);
      ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGaussians(cam, count, sizeMul, alphaMul, jitter) {
    if (!ready) return;
    const arr = [];
    for (let i = 0; i < splats.length; i++) {
      const s = splats[i];
      if (s.rank >= count) continue;
      let jx = 0;
      let jy = 0;
      let jz = 0;
      if (jitter) {
        const a = s.ph + wallT * 6;
        jx = Math.cos(a) * jitter;
        jy = Math.sin(a * 1.3) * jitter;
        jz = Math.cos(a * 0.7) * jitter;
      }
      const pc = proj(cam, s.x + jx, s.y + jy, s.z + jz);
      arr.push({ s, pc, jx, jy, jz });
    }
    arr.sort((p, q) => q.pc.depth - p.pc.depth);
    for (const it of arr) {
      const s = it.s;
      const pc = it.pc;
      const pa = proj(
        cam,
        s.x + it.jx + s.ax * sizeMul,
        s.y + it.jy + s.ay * sizeMul,
        s.z + it.jz + s.az * sizeMul,
      );
      const pb = proj(
        cam,
        s.x + it.jx + s.bx * sizeMul,
        s.y + it.jy + s.by * sizeMul,
        s.z + it.jz + s.bz * sizeMul,
      );
      const ux = pa.x - pc.x;
      const uy = pa.y - pc.y;
      const vx = pb.x - pc.x;
      const vy = pb.y - pc.y;
      const revealT = s.rank / Math.max(1, count - 1);
      const localA = clamp01((alphaMul - revealT * 0.6) / 0.4);
      ctx.globalAlpha = localA;
      ctx.save();
      ctx.transform(ux / SPR_R, uy / SPR_R, vx / SPR_R, vy / SPR_R, pc.x, pc.y);
      ctx.drawImage(s.sprite, -SPR_R, -SPR_R, SPR, SPR);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // glowing error dots over the render
  function drawDiff(cam, count, alpha) {
    if (alpha <= 0.01) return;
    for (let i = 0; i < splats.length; i += 6) {
      const s = splats[i];
      if (s.rank >= count) continue;
      const pulse = 0.5 + 0.5 * Math.sin(wallT * 6 + s.ph);
      if (pulse < 0.62) continue;
      const p = proj(cam, s.x, s.y, s.z);
      const r = 5 + 4 * pulse;
      const a = alpha * pulse;
      // glow halo
      const col = i % 2 ? "255,80,30" : "255,190,30";
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${col},${a.toFixed(2)})`);
      g.addColorStop(0.45, `rgba(${col},${(a * 0.5).toFixed(2)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      // bright core
      ctx.fillStyle = `rgba(255,255,220,${(a * 0.9).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fast square-pixel renderer for the high-density final result — mirrors the
  // tractor cloud approach in slides.js (fillRect + typed arrays, no arc/save/restore).
  let _rpSX = null,
    _rpSY = null,
    _rpSD = null,
    _rpSI = null,
    _rpOrder = null;
  function drawResultPoints(cam, count, alpha) {
    if (!ready || alpha <= 0.01) return;
    const cap = Math.min(count, splats.length);
    if (!_rpSX || _rpSX.length < cap) {
      _rpSX = new Float32Array(cap);
      _rpSY = new Float32Array(cap);
      _rpSD = new Float32Array(cap);
      _rpSI = new Int32Array(cap); // splat index
      _rpOrder = new Int32Array(cap); // sort order
    }
    let n = 0;
    let scaleAccum = 0;
    for (let i = 0; i < splats.length; i++) {
      const s = splats[i];
      if (s.rank >= count) continue;
      const pc = proj(cam, s.x, s.y, s.z);
      if (pc.depth <= 0.1) continue;
      if (pc.x < -8 || pc.x > W + 8 || pc.y < -8 || pc.y > H + 8) continue;
      _rpSX[n] = pc.x;
      _rpSY[n] = pc.y;
      _rpSD[n] = pc.depth;
      _rpSI[n] = i;
      _rpOrder[n] = n;
      scaleAccum += 1 / pc.depth;
      n++;
    }
    // Sort slot-indices 0..n-1 by depth descending (far first, near overwrites)
    const sd = _rpSD;
    const order = Array.from(_rpOrder.subarray(0, n));
    order.sort((a, b) => sd[b] - sd[a]);

    // Size so squares tile the surface: pixels-per-unit / √density
    const pxPerUnit = cam.focal / Math.max(cam.dist, 0.1);
    const ptHalf = Math.max(
      2.5,
      ((pxPerUnit * OBJ_SIZE) / Math.sqrt(Math.max(n, 1))) * 0.55,
    );
    const sz = ptHalf * 2;

    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    for (let k = 0; k < n; k++) {
      const slot = order[k];
      const s = splats[_rpSI[slot]];
      ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
      ctx.fillRect(_rpSX[slot] - ptHalf, _rpSY[slot] - ptHalf, sz, sz);
    }
    ctx.restore();
  }

  function drawCameraIcon(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);

    const bw = 52,
      bh = 34,
      br = 5;
    const bx = x - bw / 2,
      by = y - bh / 2 + 4;

    // Camera body
    ctx.fillStyle = "#1e2535";
    ctx.strokeStyle = "#3a4460";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.fill();
    ctx.stroke();

    // Viewfinder bump (top-right — lens is on the left facing scene)
    const vfw = 14,
      vfh = 7;
    ctx.fillStyle = "#252e44";
    ctx.strokeStyle = "#3a4460";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(bx + bw - vfw - 6, by - vfh + 1, vfw, vfh, [3, 3, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Shutter button (top-left)
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(bx + 10, by - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Lens barrel — left side of body, facing the scene
    const lx = x - 10,
      ly = y + 5;
    const lR = 11;
    const lensGrad = ctx.createRadialGradient(lx + 3, ly - 3, 1, lx, ly, lR);
    lensGrad.addColorStop(0, "#3a4f72");
    lensGrad.addColorStop(1, "#0d1220");
    ctx.fillStyle = lensGrad;
    ctx.strokeStyle = "#4a5570";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, lR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Lens barrel mid ring
    ctx.strokeStyle = `rgba(255,90,54,0.5)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(lx, ly, lR * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    // Lens pupil
    ctx.fillStyle = "#04060e";
    ctx.beginPath();
    ctx.arc(lx, ly, lR * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Lens gleam
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(lx + lR * 0.28, ly - lR * 0.28, lR * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Flash / indicator light (top-right of body)
    ctx.fillStyle = "rgba(120,200,255,0.7)";
    ctx.beginPath();
    ctx.arc(bx + bw - 10, by + 8, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // clone / split / prune demo (adaptive densification, visualised)
  function drawDensify(alpha, lt) {
    const pulse = (Math.sin(lt * 1.9) + 1) / 2;
    const G = "rgba(58,150,96,";
    const blob = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, G + 0.95 * a + ")");
      g.addColorStop(0.6, G + 0.5 * a + ")");
      g.addColorStop(1, G + "0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const arr = (x, y) => {
      ctx.strokeStyle = "#9aa3b2";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 4, y);
      ctx.stroke();
      arrowHead(x + 4, y, 0, 7, "#9aa3b2");
    };
    const demos = ["שכפול", "פיצול", "גיזום"];
    const dw = Math.min(W * 0.2, 240);
    const gx = Math.min(W * 0.035, 36);
    const total = dw * 3 + gx * 2;
    const c0 = W / 2 - total / 2 + dw / 2;
    const cy = H * 0.82;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 3; i++) {
      const x = c0 + i * (dw + gx);
      text(demos[i], x, cy - 40, 15, INK, "center", 700);
      if (i === 0) {
        blob(x - dw * 0.26, cy, 12, 1);
        arr(x - 2, cy);
        blob(x + dw * 0.16, cy, 12, 1);
        blob(x + dw * 0.3, cy, 12, pulse);
      } else if (i === 1) {
        blob(x - dw * 0.26, cy, 17 - 5 * pulse, 1);
        arr(x - 2, cy);
        blob(x + dw * 0.16, cy - 5, 10, 1);
        blob(x + dw * 0.3, cy + 6, 10, 1);
      } else {
        // Thanos snap: fast explosion, slow recovery
        const ePer = 1.6,
          rPer = 5.5;
        const phase = lt % (ePer + rPer);
        const prunePulse =
          phase < ePer
            ? easeInOut(phase / ePer)
            : 1 - easeInOut((phase - ePer) / rPer);
        const snapT = clamp01((prunePulse - 0.18) / 0.82);
        blob(x, cy, 14 * (1 - snapT * 0.45), 1 - snapT);
        const NPART = 26;
        for (let p = 0; p < NPART; p++) {
          const ang = (p / NPART) * Math.PI * 2 + p * 0.65;
          const delay = (p % 5) * 0.06;
          const pt = clamp01((snapT - delay) / (1 - delay + 0.001));
          if (pt <= 0.01) continue;
          const e = easeInOut(pt);
          const drift = e * (9 + (p % 4) * 4);
          const rise = e * e * 7;
          blob(
            x + Math.cos(ang) * drift,
            cy + Math.sin(ang) * drift - rise,
            2.2 + (p % 3) * 1.1,
            (1 - pt) * 0.9,
          );
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // top row: what a single Gaussian stores (shown during the "gaussian" step)
  function propIcon(kind, x, y) {
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (kind === "pos") {
      ctx.strokeStyle = "#aab2c0";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 18);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 13, y + 11);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "shape") {
      // isometric cube wireframe
      const s = 14;
      const oy = y + 2;
      ctx.strokeStyle = "#66718a";
      const top = [x, oy - s];
      const ml = [x - s * 0.866, oy - s * 0.5];
      const mr = [x + s * 0.866, oy - s * 0.5];
      const bl = [x - s * 0.866, oy + s * 0.5];
      const br = [x + s * 0.866, oy + s * 0.5];
      const bot = [x, oy + s];
      const mid = [x, oy];
      ctx.fillStyle = "#66718a";
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(mr[0], mr[1]);
      ctx.lineTo(mid[0], mid[1]);
      ctx.lineTo(ml[0], ml[1]);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(mid[0], mid[1]);
      ctx.lineTo(mr[0], mr[1]);
      ctx.lineTo(br[0], br[1]);
      ctx.lineTo(bot[0], bot[1]);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(mid[0], mid[1]);
      ctx.lineTo(ml[0], ml[1]);
      ctx.lineTo(bl[0], bl[1]);
      ctx.lineTo(bot[0], bot[1]);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(mr[0], mr[1]);
      ctx.moveTo(mr[0], mr[1]);
      ctx.lineTo(br[0], br[1]);
      ctx.moveTo(br[0], br[1]);
      ctx.lineTo(bot[0], bot[1]);
      ctx.moveTo(bot[0], bot[1]);
      ctx.lineTo(bl[0], bl[1]);
      ctx.moveTo(bl[0], bl[1]);
      ctx.lineTo(ml[0], ml[1]);
      ctx.moveTo(ml[0], ml[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(mid[0], mid[1]);
      ctx.moveTo(br[0], br[1]);
      ctx.lineTo(mid[0], mid[1]);
      ctx.moveTo(bl[0], bl[1]);
      ctx.lineTo(mid[0], mid[1]);
      ctx.stroke();
    } else if (kind === "color") {
      ctx.fillStyle = "#3aa860";
      ctx.beginPath();
      ctx.arc(x - 8, y + 4, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d8b34a";
      ctx.beginPath();
      ctx.arc(x + 8, y + 4, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#cfd3da";
      ctx.beginPath();
      ctx.arc(x, y - 7, 7.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "sh") {
      // Spherical harmonics — sphere with latitude/longitude grid lines
      ctx.strokeStyle = "#66718a";
      const r = 14;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.27, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.55, r * 0.83, r * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.32, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(x - 17, y, x + 17, y);
      g.addColorStop(0, "rgba(90,105,130,0.95)");
      g.addColorStop(1, "rgba(90,105,130,0.05)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(90,105,130,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Circular zoom inset — shows Gaussians up close during the properties step
  function drawZoomInset(alpha) {
    if (!ready || alpha <= 0.01) return;
    const ix = W * 0.3;
    const iy = H * 0.5;
    const ir = Math.min(W * 0.115, 115);

    // Zoom camera: very close, nearly eye-level, lively yaw + pitch oscillation
    const zCam = makeCam(wallT * 0.18, 1.25, 3.5, ix, iy, Math.min(W, H) * 1.8);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = "#f9f8f6";
    ctx.fillRect(ix - ir - 1, iy - ir - 1, (ir + 1) * 2, (ir + 1) * 2);

    // Render Gaussians close-up
    drawGaussians(zCam, SPARSE_N, 1.1, 1.0, 0);

    ctx.restore();

    // Border ring
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(31,37,51,0.13)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPropsRow(alpha) {
    const items = [
      ["מיקום", "pos"],
      ["צורה וגודל", "shape"],
      ["צבע", "color"],
      ["שקיפות", "opacity"],
      ["תאורה זוויתית", "sh"],
    ];
    const n = items.length;
    const gap = Math.min(W * 0.125, 162);
    const x0 = W / 2 - (gap * (n - 1)) / 2;
    const gy = H * 0.145;
    ctx.globalAlpha = alpha;
    text("מה כל Gaussian מכיל:", W / 2, gy - 58, 28, INK, "center", 700);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap;
      propIcon(items[i][1], x, gy);
      text(items[i][0], x, gy + 46, 21, INK, "center", 600);
    }
    ctx.globalAlpha = 1;
  }

  // Reference photo card — corner style with frame
  function drawRealPhoto(alpha, cx, cy, w) {
    cx = cx ?? W * 0.14;
    cy = cy ?? H * 0.2;
    w = w ?? Math.min(W * 0.15, H * 0.21);
    const pad = w * 0.06;
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.shadowColor = "rgba(20,30,50,0.15)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#fff";
    rr(cx - w / 2 - pad, cy - w / 2 - pad, w + pad * 2, w + pad * 2, 7);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    rr(cx - w / 2, cy - w / 2, w, w, 3);
    ctx.clip();
    ctx.fillStyle = "#eef0f3";
    ctx.fillRect(cx - w / 2, cy - w / 2, w, w);
    if (refImg.complete && refImg.naturalWidth)
      ctx.drawImage(refImg, cx - w / 2, cy - w / 2, w, w);
    ctx.restore();
    ctx.restore();
  }

  // Compare photo always at center-left (burst animation handled separately)
  function drawComparePhoto(alpha) {
    if (alpha <= 0.01) return;
    const cx = W * 0.32;
    const cy = H * 0.5;
    const w = Math.min(W * 0.29, H * 0.47);
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    if (refImg.complete && refImg.naturalWidth)
      ctx.drawImage(refImg, cx - w / 2, cy - w / 2, w, w);
    ctx.restore();
  }

  // Corner polaroid during splatting — pops open and slides the photo to compare position
  function drawCornerPolaroid(outerAlpha, burstT) {
    const cx = W * 0.14;
    const cy = H * 0.2;
    const baseW = Math.min(W * 0.15, H * 0.21);

    // End position matches drawComparePhoto so the handoff is seamless
    const endCX = W * 0.32;
    const endCY = H * 0.5;
    const endW = Math.min(W * 0.29, H * 0.47);

    // Shake just before the pop
    const shakeAmt = smooth(0, 0.1, burstT) * (1 - smooth(0.22, 0.38, burstT));
    const sx = Math.sin(wallT * 44) * shakeAmt * 12;
    const sy = Math.cos(wallT * 37) * shakeAmt * 8;

    // Polaroid frame fades as the photo pops free
    const frameAlpha = outerAlpha * (1 - smooth(0.12, 0.48, burstT));
    if (frameAlpha > 0.01) {
      polaroidCard(refImg, cx + sx, cy + sy, baseW, 0, frameAlpha);
      ctx.save();
      ctx.globalAlpha = frameAlpha;
      text(
        "תמונת אימון",
        cx + sx,
        cy + sy + baseW * 0.535,
        14,
        "#888fa0",
        "center",
        600,
      );
      ctx.restore();
    }

    // Photo slides from polaroid corner to compare position
    if (burstT > 0.06 && refImg.complete && refImg.naturalWidth) {
      const slideT = easeInOut(clamp01(smooth(0.12, 0.88, burstT)));
      // Brief scale overshoot — the "pop" feel as it breaks free of the frame
      const popBump =
        Math.sin(clamp01(smooth(0.12, 0.38, burstT)) * Math.PI) * 0.2;

      const photoCX = lerp(cx + sx, endCX, slideT);
      const photoCY = lerp(cy + sy, endCY, slideT);
      const photoW = lerp(baseW, endW, slideT) * (1 + popBump);

      // Fades in as it pops, then fades out right at the end so drawComparePhoto takes over
      const photoAlpha =
        smooth(0.06, 0.22, burstT) * (1 - smooth(0.82, 0.98, burstT));

      if (photoAlpha > 0.005) {
        ctx.save();
        ctx.globalAlpha = photoAlpha;
        ctx.drawImage(
          refImg,
          photoCX - photoW / 2,
          photoCY - photoW / 2,
          photoW,
          photoW,
        );
        ctx.restore();
      }
    }
  }

  /* ====================================================================
     step machine (click advances; `flow` eases toward the target step)
     ==================================================================== */
  const STEPS = [
    {
      title: "שלב 1 — תמונות קלט",
      body: "מצלמים את אותה סצנה ממספר זוויות שונות.\nהתמונות האלו משמשות כנתוני האימון של המודל.",
    },
    {
      title: "שלב 2 — נקודות ראשוניות",
      body: "מהתמונות משחזרים מיקומי מצלמות ונקודות התחלתיות במרחב.\nזה נותן בסיס ראשוני לבניית הסצנה.",
    },
    {
      title: "שלב 3 — יצירת Gaussians",
      body: "כל נקודה הופכת ל-Gaussian תלת-ממדי.",
    },
    {
      title: "שלב 4 — יצירת תמונה באימון",
      body: "בכל איטרציה המודל בוחר זווית צילום מתוך התמונות הקיימות.\nה-Gaussians מוקרנים אל אותה מצלמה ונוצרת תמונה משוערת.",
    },
    {
      title: "שלב 5 — חישוב טעות",
      body: "משווים בין התמונה שהמודל יצר לבין התמונה האמיתית מאותה זווית.\nההבדל ביניהן מחושב כ-Loss.",
    },
    {
      title: "שלב 6 — עדכון ה-Gaussians",
      body: "לפי ה-Loss, המודל מעדכן את ה-Gaussians: מיקום, צבע, שקיפות, גודל וצורה.\nהתהליך חוזר אלפי פעמים, עד שהתמונה שנוצרת דומה יותר לתמונות האמיתיות.",
    },
    {
      title: "שלב 7 — צפייה בזמן אמת",
      body: "לאחר האימון מתקבלת סצנה תלת-ממדית יציבה.\nכעת ניתן להזיז מצלמה וירטואלית וליצור מבטים חדשים בזמן אמת.",
    },
  ];
  const LAST = STEPS.length - 1;

  let wallT = 0;
  let flow = 0; // smoothed position along the pipeline (0..LAST)
  let target = 0; // step the presenter has clicked to
  let lastCaption = "";

  function updateCaption() {
    if (captionEl) {
      const step = STEPS[Math.round(flow)];
      const next = step ? step.body.replace(/\n/g, "<br>") : "";
      if (next !== lastCaption) {
        lastCaption = next;
        captionEl.innerHTML = next;
        captionEl.classList.toggle("visible", !!step);
      }
    }
  }

  function step(dtScale) {
    const dt = (dtScale || 1) / 60;
    wallT += dt;
    // the photos -> points collapse (step 0 -> 1) eases slowly and deliberately;
    // the later steps settle a little quicker.
    const rate =
      target === 1 && flow < 1
        ? 1.5
        : target === 2 && flow < 2
          ? 0.95
          : target === 4 && flow < 4
            ? 1.1
            : 3.4;
    flow += (target - flow) * (1 - Math.exp(-dt * rate));
    if (Math.abs(target - flow) < 0.0005) flow = target;
    updateCaption();
  }

  /* ====================================================================
     main draw - everything keyed off `flow`
     ==================================================================== */
  function draw() {
    if (!W || !H) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const f = flow;

    /* windows along the pipeline */
    const polWin = 1 - smooth(0.62, 1.0, f);
    const dotsWin = smooth(0.4, 0.92, f) * (1 - smooth(1.35, 1.85, f));
    const gaussWin = smooth(1.15, 1.95, f);
    const propsWin = smooth(1.4, 1.9, f) * (1 - smooth(2.05, 2.5, f));
    const splatWin = smooth(2.1, 2.7, f) * (1 - smooth(3.05, 3.5, f));
    const compareWin = smooth(3.05, 3.55, f) * (1 - smooth(4.15, 4.6, f));
    const optimizeWin = smooth(4.05, 4.6, f) * (1 - smooth(5.05, 5.45, f));
    const resultWin = smooth(5.05, 5.85, f);
    const refWin = Math.max(compareWin, optimizeWin);

    // gaussian count: a handful at first, densified up to MAXG during optimize->result
    let count = lerp(SPARSE_N, MAXG, smooth(4.2, 5.7, f));
    count = Math.round(count);
    const dotsCount = SPARSE_N;

    // camera: hold still through splat/compare/optimize; gentle life elsewhere;
    // slow free spin at the result.
    const still = smooth(2.1, 2.7, f) * (1 - resultWin);
    const motion = 1 - 0.9 * still;
    // Blend base angle toward r_56 reference view during compare/optimize steps
    const refBlend = clamp01(refWin + resultWin);
    const baseYaw = lerp(-0.5, -0.617, refBlend);
    const basePitch = lerp(0.08, -0.253, refBlend);
    const yaw =
      baseYaw +
      Math.sin(wallT * 0.16) * 0.4 * motion +
      resultWin * Math.sin(wallT * 0.22) * 0.5;
    const pitch =
      basePitch + Math.sin(wallT * 0.26) * 0.04 * motion + resultWin * 0.04;
    const dist = 13 - resultWin * 0.6;
    // Shift right from compare step, return to center smoothly on final result
    const shiftT = clamp01(smooth(3.05, 3.55, f)) * (1 - smooth(5.05, 5.85, f));
    const vpx = W * 0.5 + shiftT * W * 0.18;
    const vpy = H * 0.5;
    const focal =
      Math.min(W, H) * (lerp(0.95, 0.84, refWin) - optimizeWin * 0.05);
    const cam = makeCam(yaw, pitch, dist, vpx, vpy, focal);

    /* step 0->1: polaroids collapse, each into its own cloud point */
    if (polWin > 0.01) drawPolaroids(polWin, f, cam);

    /* sparse cloud */
    if (dotsWin > 0.01) drawDots(cam, dotsCount, dotsWin);

    /* gaussians: sprite-based until the final result, then switch to fast dot renderer */
    if (gaussWin > 0.01) {
      const jitter = optimizeWin * 0.05;
      const sizeMul = gaussWin * lerp(1.7, 0.66, smooth(4.2, 5.7, f));
      const gaussOnly = 1 - resultWin;
      if (gaussOnly > 0.01)
        drawGaussians(
          cam,
          Math.min(count, 5200),
          sizeMul,
          gaussWin * gaussOnly,
          jitter,
        );
      // GIF overlay — positioned via CSS so the browser animates it natively
      if (resultWin > 0.01 && chairGif.complete && chairGif.naturalWidth) {
        const gifAlpha = clamp01(gaussWin * resultWin);
        const gifSize = Math.min(W * 0.42, H * 0.68);
        chairGif.style.width = gifSize + "px";
        chairGif.style.height = gifSize + "px";
        chairGif.style.left = W / 2 - gifSize / 2 + "px";
        chairGif.style.top = H / 2 - gifSize / 2 + "px";
        chairGif.style.opacity = gifAlpha;
      } else {
        chairGif.style.opacity = 0;
      }
    }

    /* step 2: properties row */
    if (propsWin > 0.01) drawPropsRow(propsWin);

    /* step 3: splatting — lines from Gaussians to fixed camera + photo upper-left */
    if (splatWin > 0.01) {
      const camX = W * 0.85;
      const camY = H * 0.28;
      // Lens is on the left side of the camera body — same offset as drawCameraIcon
      const lensX = camX - 10;
      const lensY = camY + 5;
      drawCameraIcon(camX, camY, splatWin);
      ctx.globalAlpha = splatWin * 0.3;
      ctx.strokeStyle = "rgba(60,70,90,0.5)";
      ctx.lineWidth = 1;
      for (let i = 0; i < splats.length; i += Math.max(1, (count / 20) | 0)) {
        const s = splats[i];
        if (s.rank >= count) continue;
        const pg = proj(cam, s.x, s.y, s.z);
        ctx.beginPath();
        ctx.moveTo(pg.x, pg.y);
        ctx.lineTo(lensX, lensY);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* reference photo — polaroid corner (step 3 burst on click), center-left (step 4+) */
    const refBurstT = clamp01(smooth(3.0, 3.9, f));
    if (splatWin > 0.01 || (refBurstT > 0.01 && refBurstT < 0.99)) {
      drawCornerPolaroid(splatWin, refBurstT);
    }
    const centerPhotoAlpha =
      clamp01(compareWin + optimizeWin) * smooth(0.62, 1.0, refBurstT);
    if (centerPhotoAlpha > 0.01) {
      drawComparePhoto(centerPhotoAlpha);
    }

    /* step 4: error dots */
    if (compareWin > 0.01) drawDiff(cam, count, compareWin * 0.9);

    /* step 5: backprop arrow + loss function + densify */
    if (optimizeWin > 0.01) {
      const a = optimizeWin;
      const phase = (wallT * 90) % 20;

      // Photo sits at ~(W*0.28, H*0.53). Gaussians are centered at vpx=W*0.5.
      // Arrow: photo right-edge → gaussian cloud left-edge, representing ∇L flowing back.
      const arrowX0 = W * 0.42;
      const arrowY0 = H * 0.51;
      const arrowX1 = W * 0.6;
      const arrowY1 = H * 0.51;
      curveArrow(arrowX0, arrowY0, arrowX1, arrowY1, 36, CYAN, 2.2, phase);

      // Loss function label above the arrow
      ctx.save();
      ctx.globalAlpha = a;
      const midX = (arrowX0 + arrowX1) / 2;
      const midY = arrowY0 - 52;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = "ltr";

      // Label
      ctx.font = `500 13px Heebo, sans-serif`;
      ctx.fillStyle = INK_SOFT;
      ctx.fillText("Loss function:", midX, midY - 30);

      // Typeset formula: Loss = (1/N) Σ |I^i_rendered − I^i_real|
      const fy = midY + 4;
      const fSz = 15, subSz = 10, sigSz = 22;
      ctx.fillStyle = CYAN;
      ctx.textAlign = "left";

      ctx.font = `italic 600 ${fSz}px Georgia, serif`;
      const wLoss   = ctx.measureText("Loss = ").width;
      const wPipeI  = ctx.measureText(" |I").width;
      const wMinus  = ctx.measureText(" − I").width;
      const wPipe   = ctx.measureText("|").width;
      ctx.font = `italic ${subSz}px Georgia, serif`;
      const wRend   = ctx.measureText("rendered").width;
      const wReal   = ctx.measureText("real").width;
      const wSup    = ctx.measureText("i").width;
      ctx.font = `600 ${sigSz}px Georgia, serif`;
      const wSig    = ctx.measureText("Σ").width;

      const fracW   = 22;
      const sigBlk  = wSig + 14;
      const totalW  = wLoss + fracW + 8 + sigBlk + wPipeI + wSup + wRend + 6 + wMinus + wSup + wReal + 6 + wPipe;
      let px = midX - totalW / 2;

      // "Loss = "
      ctx.font = `italic 600 ${fSz}px Georgia, serif`;
      ctx.textBaseline = "middle";
      ctx.fillText("Loss = ", px, fy);
      px += wLoss;

      // 1/N fraction
      const fcx = px + fracW / 2;
      ctx.font = `600 ${fSz - 2}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.fillText("1", fcx, fy - fSz * 0.55);
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - 1, fy - 1);
      ctx.lineTo(px + fracW + 1, fy - 1);
      ctx.stroke();
      ctx.fillText("N", fcx, fy + fSz * 0.55);
      px += fracW + 8;
      ctx.textAlign = "left";

      // Σ with N above and i=1 below
      ctx.font = `600 ${sigSz}px Georgia, serif`;
      ctx.fillText("Σ", px, fy);
      ctx.font = `${subSz}px Georgia, serif`;
      ctx.textAlign = "center";
      const scx = px + wSig / 2;
      ctx.fillText("N",   scx, fy - fSz * 1.05);
      ctx.fillText("i=1", scx, fy + fSz * 0.9);
      px += sigBlk;
      ctx.textAlign = "left";

      // |I  with superscript i and subscript "rendered"
      ctx.font = `italic 600 ${fSz}px Georgia, serif`;
      ctx.fillText(" |I", px, fy);
      px += wPipeI;
      ctx.font = `italic ${subSz}px Georgia, serif`;
      ctx.fillText("i",        px, fy - fSz * 0.58);
      ctx.fillText("rendered", px, fy + fSz * 0.62);
      px += wRend + 6;

      // − I  with superscript i and subscript "real"
      ctx.font = `italic 600 ${fSz}px Georgia, serif`;
      ctx.fillText(" − I", px, fy);
      px += wMinus;
      ctx.font = `italic ${subSz}px Georgia, serif`;
      ctx.fillText("i",    px, fy - fSz * 0.58);
      ctx.fillText("real", px, fy + fSz * 0.62);
      px += wReal + 6;

      // closing |
      ctx.font = `italic 600 ${fSz}px Georgia, serif`;
      ctx.fillText("|", px, fy);

      // gradient label
      ctx.font = `500 12px Heebo, sans-serif`;
      ctx.fillStyle = INK_SOFT;
      ctx.textAlign = "center";
      ctx.direction = "rtl";
      ctx.fillText("∇L → עדכון פרמטרי Gaussian", midX, midY + 48);
      ctx.direction = "ltr";
      ctx.restore();

      drawDensify(optimizeWin, wallT);
    }

    updateCaption();
  }

  /* ---------- interaction: click advances one step ---------- */
  slide.addEventListener("click", () => {
    if (target < LAST) target += 1;
    updateCaption();
  });

  return {
    enter() {
      resize();
      flow = 0;
      target = 0;
      wallT = 0;
      lastCaption = "";
      chairGif.style.opacity = 0;
      updateCaption();
    },
    tick(visible, dtScale) {
      if (!visible) {
        if (captionEl) captionEl.classList.remove("visible");
        chairGif.style.opacity = 0;
        return;
      }
      if (!W || !H) resize();
      if (!W || !H) return;
      step(dtScale || 1);
      draw();
    },
    // deterministic frame for headless verification (pass a flow value 0..LAST)
    __drawAt(flowVal, wall) {
      flow = flowVal;
      target = Math.round(flowVal);
      wallT = wall == null ? flowVal : wall;
      draw();
    },
  };
}
