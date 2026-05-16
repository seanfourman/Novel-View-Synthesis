// upload.js — slide 2.
// User uploads a photo. We compute its depth map via the AI pipeline and
// publish both into the global userImage state, which the rest of the deck
// subscribes to. No "fast mode" — real model only, with robust error UI.

import { estimateDepth, loadDepthPipeline } from './depth.js';
import {
  snapshot, subscribe, setLoading, setImage, setProgress, setDepth, setError, reset,
} from './userImage.js';

const MAX_INPUT_SIDE = 512;   // cap input to keep memory bounded
const EXAMPLE_VIDEOS = {
  fern: 'assets/videos/fern_200k_rgb.mp4',
  trex: 'assets/videos/trex.mp4',
  toy:  'assets/videos/redtoyota.mp4',
};

export function initUpload() {
  const zone        = document.getElementById('upload-zone');
  const fileInput   = document.getElementById('file-input');
  const camInput    = document.getElementById('camera-input');
  const photoCanvas = document.getElementById('photo-canvas');
  const depthCanvas = document.getElementById('depth-canvas');
  const statusBox   = document.getElementById('upload-status');
  const statusText  = document.getElementById('status-text');
  const statusFill  = document.getElementById('status-fill');
  const errorBox    = document.getElementById('upload-error');
  const errorText   = document.getElementById('error-text');
  const retryBtn    = document.getElementById('error-retry');
  const loadedBox   = document.getElementById('upload-loaded');
  const resetBtn    = document.getElementById('upload-reset');
  const readyHint   = document.getElementById('upload-ready');
  const exBtns      = Array.from(document.querySelectorAll('.ex-btn'));

  // --- subscribe to state changes -> update UI ---
  subscribe((s) => {
    // hide everything, show the right panel
    zone.hidden = (s.status !== 'idle');
    statusBox.hidden = !(s.status === 'loading' || s.status === 'computing');
    errorBox.hidden = (s.status !== 'error');
    loadedBox.hidden = !(s.image && (s.status === 'computing' || s.status === 'ready'));
    resetBtn.hidden  = !(s.status === 'ready' || s.status === 'error');
    readyHint.hidden = !(s.status === 'ready');

    if (s.image) drawCenterFit(photoCanvas, s.image);
    if (s.depth) drawCenterFit(depthCanvas, s.depth);
    if (!s.depth && s.image) {
      // placeholder: clear depth canvas
      const ctx = depthCanvas.getContext('2d');
      depthCanvas.width = depthCanvas.clientWidth * (window.devicePixelRatio || 1);
      depthCanvas.height = depthCanvas.clientHeight * (window.devicePixelRatio || 1);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, depthCanvas.width, depthCanvas.height);
      ctx.fillStyle = '#aaa';
      ctx.font = '14px Heebo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('מחשב עומק...', depthCanvas.width / 2, depthCanvas.height / 2);
    }
    statusText.textContent = s.statusText || '';
    statusFill.style.width = `${Math.round((s.progress || 0) * 100)}%`;
    if (s.errorMsg) errorText.textContent = s.errorMsg;
  });

  // --- input pickers ---
  fileInput?.addEventListener('change', e => handleFile(e.target.files?.[0]));
  camInput?.addEventListener('change', e => handleFile(e.target.files?.[0]));

  // --- drag drop ---
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone?.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  // --- example buttons ---
  exBtns.forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.example;
    const src = EXAMPLE_VIDEOS[key];
    if (!src) return;
    captureVideoFrame(src).then(process).catch(err => {
      console.error(err);
      setError('שגיאה בטעינת הדוגמה');
    });
  }));

  resetBtn?.addEventListener('click', () => reset());
  retryBtn?.addEventListener('click', () => reset());

  async function handleFile(file) {
    if (!file) return;
    setLoading('טוען תמונה...', 0.05);
    try {
      const c = await fileToCanvas(file, MAX_INPUT_SIDE);
      await process(c);
    } catch (err) {
      console.error(err);
      setError('לא ניתן לקרוא את הקובץ');
    }
  }

  async function process(imageCanvas) {
    setImage(imageCanvas);
    try {
      // bridge depth.js progress to userImage state
      const depth = await estimateDepth(imageCanvas, (info) => {
        setProgress(info.text, info.progress);
      });
      setDepth(depth);
    } catch (err) {
      console.error('depth failed:', err);
      const msg = err?.message ? String(err.message).slice(0, 240) : String(err).slice(0, 240);
      setError('המודל נכשל: ' + msg);
    }
  }

  // Trigger background preload as soon as the slide is shown (or even sooner
  // from app.js). Idempotent.
  return {
    enter() {
      // Kick off model download on first slide visit, hands-free.
      loadDepthPipeline((info) => {
        // only update UI if user hasn't started an upload yet
        const s = snapshot();
        if (s.status === 'idle' && info?.status === 'download') {
          // show a faint hint that the model is downloading
          setProgress(info.text, info.progress);
        }
      }).catch(() => {});
    },
    tick() {},
  };
}

/* ---------- helpers ---------- */

function fileToCanvas(file, maxSide) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width  * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function captureVideoFrame(src, maxSide = 512) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
    v.addEventListener('loadeddata', () => {
      try { v.currentTime = Math.min(0.5, v.duration / 3); } catch {}
    });
    v.addEventListener('seeked', () => {
      const W = v.videoWidth, H = v.videoHeight;
      const scale = Math.min(1, maxSide / Math.max(W, H));
      const w = Math.round(W * scale), h = Math.round(H * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(v, 0, 0, w, h);
      resolve(c);
    }, { once: true });
    v.addEventListener('error', reject);
  });
}

/** Draw src canvas into dst with contain-fit, sized to dst's CSS box. */
function drawCenterFit(dst, src) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, (dst.clientWidth | 0) * dpr);
  const h = Math.max(1, (dst.clientHeight | 0) * dpr);
  if (dst.width !== w) dst.width = w;
  if (dst.height !== h) dst.height = h;
  const ctx = dst.getContext('2d');
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, w, h);
  const sr = src.width / src.height;
  const tr = w / h;
  let dw, dh, dx, dy;
  if (sr > tr) { dw = w; dh = w / sr; dx = 0; dy = (h - dh) / 2; }
  else         { dh = h; dw = h * sr; dy = 0; dx = (w - dw) / 2; }
  ctx.drawImage(src, dx, dy, dw, dh);
}
