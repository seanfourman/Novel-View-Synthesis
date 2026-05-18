// depth.js - load the depth-anything-v2-small ONNX model and run it on an image.
//
// Memory-conscious config: WASM device (avoids WebGPU memory pressure) and q8
// quantization (~15MB vs ~50MB FP32, the version that crashed the tab earlier).

const MODEL_ID = "onnx-community/depth-anything-v2-small";

let pipePromise = null;
let modelLoaded = false;

/** Kick off the model download in the background. Safe to call many times. */
export function preloadModel(progressCallback) {
  return loadDepthPipeline(progressCallback).catch((err) => {
    console.warn("depth preload failed (will retry on demand):", err);
    pipePromise = null; // allow another attempt later
  });
}

export function isModelLoaded() {
  return modelLoaded;
}

export function loadDepthPipeline(progressCallback) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const mod = await import("@huggingface/transformers");
    const { pipeline, env } = mod;
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    progressCallback?.({
      status: "init",
      text: "מאתחל מודל...",
      progress: 0.02,
    });

    // Use WASM + q8 quantization for memory safety. If q8 unavailable, fall through.
    const attempts = [
      { device: "wasm", dtype: "q8" },
      { device: "wasm", dtype: "fp16" },
      { device: "wasm", dtype: "fp32" },
    ];

    let lastErr;
    for (const opts of attempts) {
      try {
        const p = await pipeline("depth-estimation", MODEL_ID, {
          ...opts,
          progress_callback: (info) => {
            if (info?.status === "progress" && info?.file) {
              const pct = info.progress || 0;
              progressCallback?.({
                status: "download",
                text: `מוריד מודל... ${pct.toFixed(0)}%`,
                progress: 0.05 + (pct / 100) * 0.7,
              });
            } else if (info?.status === "ready") {
              progressCallback?.({
                status: "ready",
                text: "מודל טעון",
                progress: 0.85,
              });
            }
          },
        });
        modelLoaded = true;
        progressCallback?.({
          status: "loaded",
          text: "מודל מוכן",
          progress: 0.9,
        });
        return p;
      } catch (err) {
        console.warn(
          `depth pipeline failed with ${JSON.stringify(opts)}:`,
          err,
        );
        lastErr = err;
      }
    }
    throw lastErr || new Error("depth model failed to load");
  })();
  return pipePromise;
}

/** Run inference on an HTMLCanvasElement. Returns a depth HTMLCanvasElement
 *  upscaled to the image's pixel dimensions. */
export async function estimateDepth(imageCanvas, progressCallback) {
  const pipe = await loadDepthPipeline(progressCallback);
  progressCallback?.({
    status: "infer",
    text: "מעריך עומק...",
    progress: 0.92,
  });

  // Pass image as data URL; transformers.js will decode it via its image utils.
  const dataUrl = imageCanvas.toDataURL("image/png");
  const result = await pipe(dataUrl);

  progressCallback?.({ status: "post", text: "מעבד עומק...", progress: 0.98 });
  return rawImageToCanvas(result.depth, imageCanvas.width, imageCanvas.height);
}

/** Convert a transformers.js RawImage (grayscale) to an HTMLCanvasElement
 *  upscaled to (targetW, targetH). Also normalizes contrast so the depth
 *  fills the 0..255 range nicely. */
function rawImageToCanvas(rawImg, targetW, targetH) {
  const { width: rw, height: rh } = rawImg;
  const ch = rawImg.channels || (rawImg.data.length / (rw * rh)) | 0 || 1;

  // First pass: find min/max for contrast stretch
  let minV = 255,
    maxV = 0;
  const src = rawImg.data;
  for (let i = 0; i < rw * rh; i++) {
    const v = ch === 1 ? src[i] : src[i * ch];
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const span = Math.max(1, maxV - minV);

  // Build canvas at native size
  const native = document.createElement("canvas");
  native.width = rw;
  native.height = rh;
  const ctx = native.getContext("2d");
  const img = ctx.createImageData(rw, rh);
  for (let i = 0; i < rw * rh; i++) {
    const raw = ch === 1 ? src[i] : src[i * ch];
    const v = Math.round(((raw - minV) / span) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Upscale to target size with smoothing
  const out = document.createElement("canvas");
  out.width = targetW || rw;
  out.height = targetH || rh;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(native, 0, 0, out.width, out.height);

  // Light blur to smooth out artifacts
  const blurred = document.createElement("canvas");
  blurred.width = out.width;
  blurred.height = out.height;
  const bctx = blurred.getContext("2d");
  bctx.filter = "blur(1.5px)";
  bctx.drawImage(out, 0, 0);
  bctx.filter = "none";
  return blurred;
}
