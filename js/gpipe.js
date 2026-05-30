// gpipe.js - Slide 17: how 3D Gaussian Splatting works, step by step.
//
// Plain-language, low-math walkthrough on a white stage. Click to advance:
//   1. a few photos of an object
//   2. -> a sparse cloud of points in 3D
//   3. -> each point becomes a soft coloured 3D "blob" (a gaussian)
//   4. -> render the blobs and compare to the real photo
//   5. -> fix the blobs and add more where it's lacking
//   6. -> a full 3D model you can look at from any angle
//
// Object is the Stanford Bunny (not the tractor). No formulas, no boxes.
// Self-contained (no THREE). Bunny mesh + render photos come from assets.

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
  const INK = "#1f2533";
  const INK_SOFT = "#7b8494";

  /* ---------- math ---------- */
  let _seed = 0x51b07d3;
  const rand = () =>
    ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = (k) =>
    k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const smooth = (a, b, x) => {
    const k = clamp01((x - a) / (b - a || 1));
    return k * k * (3 - 2 * k);
  };
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

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

  /* ---------- bunny cloud (Stanford bunny .obj -> gaussians) ---------- */
  const OBJ_SIZE = 3.3;
  const MAXG = 1800;
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
    let ymin = Infinity;
    let ymax = -Infinity;
    const norm = pts.map((p) => {
      const v = { x: (p.x - cx) * sc, y: (p.y - cy) * sc, z: (p.z - cz) * sc };
      if (v.y < ymin) ymin = v.y;
      if (v.y > ymax) ymax = v.y;
      return v;
    });
    for (const v of norm) {
      const hk = clamp01((v.y - ymin) / (ymax - ymin || 1));
      // warm rose -> gold gradient by height (sweeps the short way through red)
      const hue = 344 + 58 * hk + (rand() - 0.5) * 26;
      const [r, g, b] = hslToRgb(hue, 0.62, 0.56 + 0.05 * (rand() - 0.5));
      const sz = OBJ_SIZE * (0.03 + rand() * 0.022);
      // ellipsoid axes (mild anisotropy, random orientation)
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
        x: v.x,
        y: v.y,
        z: v.z,
        ax: ax * la,
        ay: ay * la,
        az: az * la,
        bx: bx * lb,
        by: by * lb,
        bz: bz * lb,
        sprite: spriteFor(r, g, b),
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
    for (let i = 0; i < 1500; i++) {
      const k = i + 0.5;
      const phi = Math.acos(1 - (2 * k) / 1500);
      const th = Math.PI * (1 + Math.sqrt(5)) * k;
      pts.push({
        x: Math.sin(phi) * Math.cos(th),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(th),
      });
    }
    buildFromPoints(pts);
  }

  // rotate so the bunny sits upright facing a pleasing 3/4 angle
  function rotY(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: c * p.x + s * p.z, y: p.y, z: -s * p.x + c * p.z };
  }
  fetch(new URL("../assets/generated/bunny.obj", import.meta.url).href)
    .then((r) => r.text())
    .then((txt) => {
      const verts = [];
      const lines = txt.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.charCodeAt(0) === 118 && l.charCodeAt(1) === 32) {
          const p = l.split(/\s+/);
          verts.push({ x: +p[1], y: +p[2], z: +p[3] });
        }
      }
      if (!verts.length) {
        fallbackCloud();
        return;
      }
      const step = Math.max(1, Math.floor(verts.length / MAXG));
      const pts = [];
      for (let i = 0; i < verts.length && pts.length < MAXG; i += step) {
        pts.push(rotY(verts[i], -0.5));
      }
      buildFromPoints(pts);
    })
    .catch(fallbackCloud);

  /* ---------- the "real photos" (rendered bunny polaroids) ---------- */
  const photos = [];
  for (let i = 0; i < 5; i++) {
    const im = new Image();
    im.decoding = "async";
    im.src = new URL(
      `../assets/generated/bunny_renders/polaroid_0${i}.png`,
      import.meta.url,
    ).href;
    photos.push(im);
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

  // a friendly tilted polaroid of one rendered photo
  function drawPhoto(img, cx, cy, w, angle, alpha) {
    if (!img.complete || !img.naturalWidth) return;
    const pad = w * 0.07;
    const iw = w - pad * 2;
    const ih = iw; // square-ish image area
    const fh = ih + pad + w * 0.16; // extra bottom border (polaroid)
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = "rgba(20,25,40,0.22)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 7;
    rr(-w / 2, -fh / 2, w, fh, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    // cover-fit the image into the photo window
    ctx.save();
    rr(-w / 2 + pad, -fh / 2 + pad, iw, ih, 4);
    ctx.clip();
    const ir = img.naturalWidth / img.naturalHeight;
    let dw = iw;
    let dh = iw / ir;
    if (dh < ih) {
      dh = ih;
      dw = ih * ir;
    }
    ctx.drawImage(img, -dw / 2, -fh / 2 + pad + (ih - dh) / 2, dw, dh);
    ctx.restore();
    ctx.restore();
  }

  // soft contact shadow under the object
  function groundShadow(cam, alpha) {
    const p = proj(cam, 0, -OBJ_SIZE * 0.95, 0);
    const rw = OBJ_SIZE * 0.95 * p.scale;
    ctx.save();
    ctx.globalAlpha = alpha * 0.16;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rw);
    g.addColorStop(0, "rgba(30,37,51,1)");
    g.addColorStop(1, "rgba(30,37,51,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rw, rw * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // sparse points (first `count` gaussians) as small dots
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

  // the splats (depth-sorted, anisotropic, soft)
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

  // little "difference" sparkles scattered over the object (compare step)
  function drawDiff(cam, count, alpha, t0) {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < gaussians.length; i += 7) {
      const g = gaussians[i];
      if (g.rank >= count) continue;
      const tw = 0.5 + 0.5 * Math.sin(wallT * 6 + g.ph);
      if (tw < 0.55) continue;
      const p = proj(cam, g.x, g.y, g.z);
      ctx.fillStyle = i % 2 ? "rgba(255,90,42,0.9)" : "rgba(40,150,90,0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    void t0;
  }

  /* ====================================================================
     steps / playback (click to advance, pause at each step end)
     ==================================================================== */
  const T = {
    photos: 0.0,
    points: 3.5,
    splats: 7.0,
    compare: 11.0,
    improve: 15.0,
    result: 19.5,
    end: 24.5,
  };
  const chapters = [
    { start: T.photos, end: T.points, title: "מתחילים מכמה תמונות של אותו אובייקט" },
    { start: T.points, end: T.splats, title: "מהתמונות מחלצים ענן נקודות דליל במרחב" },
    { start: T.splats, end: T.compare, title: "כל נקודה הופכת לכתם תלת-ממדי רך וצבעוני" },
    { start: T.compare, end: T.improve, title: "מרנדרים את הכתמים ומשווים לתמונה האמיתית" },
    { start: T.improve, end: T.result, title: "מתקנים את הכתמים ומוסיפים עוד איפה שחסר" },
    { start: T.result, end: T.end, title: "וכך מתקבל מודל תלת-ממדי שאפשר להסתכל עליו מכל זווית" },
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

    /* phase progress (from t) */
    const photosWin = clamp01(1 - smooth(T.points - 0.3, T.points + 0.8, t));
    const dotsWin = smooth(T.points, T.points + 0.9, t) * (1 - smooth(T.splats + 0.6, T.splats + 1.6, t));
    const splatGrow = smooth(T.splats + 0.2, T.splats + 1.8, t);
    const compareWin = smooth(T.compare, T.compare + 0.7, t) * (1 - smooth(T.improve, T.improve + 0.6, t));
    const improveWin = smooth(T.improve, T.improve + 0.6, t) * (1 - smooth(T.result, T.result + 0.5, t));
    const objShown = smooth(T.splats + 0.1, T.splats + 1.0, t);

    // sparse during steps 2-4, then densifies during "improve", full at result
    let count = 360;
    count = lerp(count, MAXG, smooth(T.improve + 0.3, T.result, t));
    count = Math.round(count);

    // camera: gentle orbit; settles to a slow spin
    const yaw = -0.5 + Math.sin(wallT * 0.18) * 0.5 + wallT * 0.04;
    const pitch = 0.12 + Math.sin(wallT * 0.27) * 0.05;
    const zoom = 1 + 0.04 * Math.sin(wallT * 0.4);
    const focal = Math.min(W, H) * 0.76;
    const cam = makeCam(yaw, pitch, zoom, W * 0.5, H * 0.48, focal);

    // ground shadow once the object exists
    if (objShown > 0.01 && splatGrow > 0.01) groundShadow(cam, objShown * splatGrow);

    /* step 1: photos */
    if (photosWin > 0.01) {
      const cx = W * 0.5;
      const cy = H * 0.44;
      const pw = Math.min(W * 0.2, 240);
      const spread = pw * 0.92;
      const angs = [-0.16, 0.02, 0.18];
      const offs = [-1, 0, 1];
      for (let i = 0; i < 3; i++) {
        const a = easeInOut(clamp01(photosWin * 1.2 - i * 0.12));
        drawPhoto(
          photos[i],
          cx + offs[i] * spread * a,
          cy - Math.abs(offs[i]) * pw * 0.06 * a,
          pw,
          angs[i],
          photosWin,
        );
      }
    }

    /* steps 2-6: the cloud */
    if (dotsWin > 0.01) drawDots(cam, 360, dotsWin);
    if (splatGrow > 0.01) {
      const jitter = improveWin * 0.05;
      const sizeMul = splatGrow * lerp(1.0, 0.82, smooth(T.improve, T.result, t));
      drawGaussians(cam, count, sizeMul, 1, jitter);
    }

    /* step 4: compare to a real photo */
    if (compareWin > 0.01) {
      drawPhoto(photos[0], W * 0.83, H * 0.32, Math.min(W * 0.19, 230), 0.06, compareWin);
      text("התמונה האמיתית", W * 0.83, H * 0.49, 15, INK_SOFT, "center", 600);
      drawDiff(cam, count, compareWin * 0.9, t);
    }

    /* step 5: improve / densify hint */
    if (improveWin > 0.01) {
      text("מוסיפים ומכווננים כתמים", W * 0.5, H * 0.13, 16, ACCENT, "center", 700);
    }

    /* step 6: orbit hint */
    if (smooth(T.result + 0.2, T.result + 1.2, t) > 0.01) {
      const a = smooth(T.result + 0.2, T.result + 1.2, t);
      text("אפשר לטוס סביב הסצנה ולראות מכל זווית", W * 0.5, H * 0.13, 16, "rgba(40,150,90,0.95)", "center", 700);
      void a;
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
      t = time;
      wallT = time;
      draw();
    },
  };
}
