"""
Offline novel-view renderer for slide 2.

Goal: produce assets/images/redtoyota_novel_view.jpg - a clean RGB image of the
red Toyota viewed from a slightly rotated/shifted camera, used as the "refinement
result" frame in the depth-based NVS pipeline slide.

The warp parameters here MUST match js/slides.js::buildTargetWarp so the in-browser
"warp with holes" frame and this pre-rendered refined frame line up pixel-for-pixel.

Pipeline:
  1. Load assets/images/redtoyota.jpg (504x384), keep native size.
  2. Run Depth Anything V2 Small (same model family the browser uses) → raw depth.
  3. Min-max normalize depth to [0, 1] (matches browser's rawImageToCanvas stretch).
  4. Forward-warp every source pixel into the target camera with z-buffer.
     Target camera = source camera rotated by yaw=-0.42 rad, shifted by (-0.28, 0, +0.12).
  5. Inpaint the disocclusion holes with LaMa.
  6. Save assets/images/redtoyota_novel_view.jpg

Run locally:
    pip install -r scripts/requirements.txt
    python scripts/render_novel_view.py

Run in Colab:
    !pip install transformers torch pillow numpy simple-lama-inpainting
    # upload assets/images/redtoyota.jpg next to the script, then:
    !python render_novel_view.py
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = REPO_ROOT / "assets" / "images" / "redtoyota.jpg"
DEFAULT_OUT = REPO_ROOT / "assets" / "images" / "redtoyota_novel_view.jpg"
DEFAULT_WARP_DEBUG = REPO_ROOT / "assets" / "images" / "redtoyota_warp_debug.jpg"

# Must match js/slides.js - keep these in sync.
TARGET_YAW = -0.42
TARGET_SHIFT_X = -0.28
TARGET_SHIFT_Z = 0.12
FOCAL_FACTOR = 0.95          # focal = width * FOCAL_FACTOR
DEPTH_Z_NEAR = 0.85          # z = DEPTH_Z_NEAR + (1 - d) * DEPTH_Z_SPAN
DEPTH_Z_SPAN = 2.55
Z_CLIP = 0.2                 # match browser's `if (camZ <= 0.2) continue;`
MAX_SIDE = 640               # matches loadImageCanvas maxSide
HOLE_COLOR = (246, 247, 250) # background the browser paints into holes

DEPTH_MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"


def load_image(path: Path, max_side: int = MAX_SIDE) -> Image.Image:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        new_w = max(1, round(w * scale))
        new_h = max(1, round(h * scale))
        img = img.resize((new_w, new_h), Image.LANCZOS)
    return img


def estimate_depth(image: Image.Image) -> np.ndarray:
    """Run Depth Anything V2 Small and return a (H, W) float array in [0, 1].

    Normalization matches the browser: min-max stretch the raw model output to
    [0, 1] (the browser does the same stretch but on 0..255 ints). Higher values
    mean closer to the camera (inverse-depth / disparity-like).
    """
    from transformers import pipeline

    pipe = pipeline("depth-estimation", model=DEPTH_MODEL_ID)
    result = pipe(image)

    depth = np.array(result["predicted_depth"]) if "predicted_depth" in result else None
    if depth is None:
        depth = np.array(result["depth"], dtype=np.float32)
    else:
        depth = depth.astype(np.float32)

    if depth.ndim == 3:
        depth = depth[0]

    # Resize to source image resolution if needed.
    if depth.shape[::-1] != image.size:
        depth_img = Image.fromarray(depth)
        depth_img = depth_img.resize(image.size, Image.BILINEAR)
        depth = np.array(depth_img, dtype=np.float32)

    d_min = float(depth.min())
    d_max = float(depth.max())
    span = max(1e-6, d_max - d_min)
    return (depth - d_min) / span


def forward_warp(
    rgb: np.ndarray,
    depth_norm: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Forward-warp rgb into the target camera, returning (warped_rgb, hole_mask).

    Mirrors js/slides.js::buildTargetWarp exactly - same yaw, shifts, focal,
    z-lift formula, 2x2 splat, and z-buffer ordering.
    """
    height, width, _ = rgb.shape
    focal = width * FOCAL_FACTOR
    cx, cy = width / 2.0, height / 2.0
    cos_y, sin_y = np.cos(TARGET_YAW), np.sin(TARGET_YAW)

    out = np.full((height, width, 3), HOLE_COLOR, dtype=np.uint8)
    z_buffer = np.full((height, width), np.inf, dtype=np.float32)
    filled = np.zeros((height, width), dtype=bool)

    # Vectorize source-pixel coords -> camera-target coords.
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    d = depth_norm.astype(np.float32)
    z = DEPTH_Z_NEAR + (1.0 - d) * DEPTH_Z_SPAN          # (H, W)
    world_x = ((xs - cx) / focal) * z
    world_z = z
    cam_x = cos_y * world_x + sin_y * world_z + TARGET_SHIFT_X
    cam_z = -sin_y * world_x + cos_y * world_z + TARGET_SHIFT_Z
    cam_y = ((ys - cy) / focal) * z                       # world_y == cam_y here

    valid = cam_z > Z_CLIP
    u_f = (focal * cam_x) / np.where(valid, cam_z, 1.0) + cx
    v_f = (focal * cam_y) / np.where(valid, cam_z, 1.0) + cy
    u0 = np.floor(u_f).astype(np.int32)
    v0 = np.floor(v_f).astype(np.int32)

    # Splat 2x2 like the browser, scalar inner loop for the z-buffer ordering.
    src_pixels = rgb.reshape(-1, 3)
    cam_z_flat = cam_z.reshape(-1)
    u0_flat = u0.reshape(-1)
    v0_flat = v0.reshape(-1)
    valid_flat = valid.reshape(-1)

    for i in range(height * width):
        if not valid_flat[i]:
            continue
        cz = cam_z_flat[i]
        u_base = u0_flat[i]
        v_base = v0_flat[i]
        color = src_pixels[i]
        for dv in (0, 1):
            v = v_base + dv
            if v < 0 or v >= height:
                continue
            for du in (0, 1):
                u = u_base + du
                if u < 0 or u >= width:
                    continue
                if cz >= z_buffer[v, u]:
                    continue
                z_buffer[v, u] = cz
                out[v, u] = color
                filled[v, u] = True

    # Speckle-close: same 2-pass 5+neighbour average as the browser.
    for _ in range(2):
        next_filled = filled.copy()
        for y in range(1, height - 1):
            for x in range(1, width - 1):
                if filled[y, x]:
                    continue
                acc = np.zeros(3, dtype=np.int32)
                count = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        if filled[y + dy, x + dx]:
                            acc += out[y + dy, x + dx]
                            count += 1
                if count >= 5:
                    out[y, x] = (acc / count).astype(np.uint8)
                    next_filled[y, x] = True
        filled = next_filled

    hole_mask = (~filled).astype(np.uint8) * 255
    return out, hole_mask


def inpaint_lama(rgb: np.ndarray, hole_mask: np.ndarray) -> np.ndarray:
    """Fill holes with LaMa. Requires `pip install simple-lama-inpainting`."""
    try:
        from simple_lama_inpainting import SimpleLama
    except ImportError as e:
        raise SystemExit(
            "Missing dependency: pip install simple-lama-inpainting\n"
            f"(original error: {e})"
        )

    lama = SimpleLama()
    pil_img = Image.fromarray(rgb)
    pil_mask = Image.fromarray(hole_mask, mode="L")

    # LaMa benefits from a dilated mask so the network has a few pixels of slop
    # on the hole boundary. Match browser behaviour: holes are thin slivers and
    # one tall column on the right; dilating by ~3px is plenty.
    mask_np = np.array(pil_mask)
    from scipy.ndimage import binary_dilation
    dilated = binary_dilation(mask_np > 0, iterations=3).astype(np.uint8) * 255
    pil_mask = Image.fromarray(dilated, mode="L")

    result = lama(pil_img, pil_mask)
    return np.array(result.convert("RGB"))


def main() -> int:
    p = argparse.ArgumentParser(description="Render a real novel view for slide 2.")
    p.add_argument("--src", type=Path, default=DEFAULT_SRC, help="source RGB image")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output refined image")
    p.add_argument(
        "--save-warp",
        type=Path,
        default=DEFAULT_WARP_DEBUG,
        help="optional path for the warped image with visible holes (debug)",
    )
    p.add_argument(
        "--skip-inpaint",
        action="store_true",
        help="stop after the warp + save warp debug only (no LaMa run)",
    )
    args = p.parse_args()

    if not args.src.exists():
        print(f"source image not found: {args.src}", file=sys.stderr)
        return 1

    print(f"[1/4] loading {args.src.name}")
    image = load_image(args.src)
    print(f"      working at {image.size[0]}x{image.size[1]}")

    print(f"[2/4] estimating depth with {DEPTH_MODEL_ID}")
    depth_norm = estimate_depth(image)

    print("[3/4] forward-warping with browser-matching params "
          f"(yaw={TARGET_YAW}, shift=({TARGET_SHIFT_X}, 0, {TARGET_SHIFT_Z}))")
    rgb = np.array(image)
    warped, hole_mask = forward_warp(rgb, depth_norm)

    if args.save_warp:
        args.save_warp.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(warped).save(args.save_warp, quality=92)
        print(f"      saved warp debug -> {args.save_warp.relative_to(REPO_ROOT)}")

    if args.skip_inpaint:
        print("[4/4] --skip-inpaint set, exiting before LaMa.")
        return 0

    print("[4/4] inpainting holes with LaMa")
    refined = inpaint_lama(warped, hole_mask)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(refined).save(args.out, quality=92)
    print(f"done -> {args.out.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
