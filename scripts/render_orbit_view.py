"""
Object-centric novel view of the red Toyota for slide 2.

Replaces the depth-warp + LaMa approach (which had no 3D priors and just stretched
edge pixels into a hallucinated road/silver car) with Zero123++ - a multi-view
diffusion model trained on Objaverse. The model has learned what cars look like
from arbitrary angles, so it can actually render the same vehicle from a rotated
camera position.

Pipeline:
  1. Load assets/images/redtoyota.jpg
  2. Background-remove with rembg → car only on a white canvas
  3. Tight square-crop on the car so it dominates the input frame
  4. Run Zero123++ v1.2 → grid of 6 novel views around the object
  5. Crop the requested view (default: view 1, azimuth +30°, elevation +20°)
  6. Save → assets/images/redtoyota_orbit_view.jpg

Why view 1 by default:
  Zero123++ v1.2 returns a 640x960 grid of 6 fixed views at azimuths
  (30°, 90°, 150°, 210°, 270°, 330°) and alternating elevations (+20°, -10°).
  View 1 (+30°, +20°) is the smallest orbit step - "camera moved a bit to the
  right, looking slightly down" - which matches the slide's narrative best.

Run locally (CPU; expect ~5-15 min for 36 inference steps):
    pip install diffusers accelerate rembg onnxruntime
    python scripts/render_orbit_view.py

Run in Colab (GPU; ~30 sec):
    !pip install -q diffusers accelerate rembg onnxruntime
    !python scripts/render_orbit_view.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = REPO_ROOT / "assets" / "images" / "redtoyota.jpg"
DEFAULT_OUT = REPO_ROOT / "assets" / "images" / "redtoyota_orbit_view.jpg"
DEFAULT_GRID = REPO_ROOT / "assets" / "images" / "redtoyota_orbit_grid.jpg"

# Zero123++ v1.2 returns a 640x960 grid laid out as 2 cols x 3 rows of 320x320 cells.
# Order (per model card): row-major, alternating elevations.
ZERO123_VIEWS = {
    "view1": (0, 0),       # azimuth  +30°, elevation +20°  -- "slightly right, looking down"
    "view2": (320, 0),     # azimuth  +90°, elevation -10°  -- "right side, looking up a touch"
    "view3": (0, 320),     # azimuth +150°, elevation +20°
    "view4": (320, 320),   # azimuth +210°, elevation -10°
    "view5": (0, 640),     # azimuth +270°, elevation +20°
    "view6": (320, 640),   # azimuth +330°, elevation -10°  -- "slightly left, looking up a touch"
}


def square_crop_around_foreground(rgba: Image.Image, pad: float = 0.12) -> Image.Image:
    """Find the foreground bbox via the alpha channel and crop to a centered square."""
    alpha = np.array(rgba.split()[3])
    mask = alpha > 10
    if not mask.any():
        return rgba
    ys, xs = np.where(mask)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    half = int(max(x1 - x0, y1 - y0) * (1 + pad * 2) / 2)
    img_w, img_h = rgba.size

    # If the crop falls off the image, pad with transparent.
    left = cx - half
    top = cy - half
    right = cx + half
    bottom = cy + half
    if left < 0 or top < 0 or right > img_w or bottom > img_h:
        pad_l = max(0, -left)
        pad_t = max(0, -top)
        pad_r = max(0, right - img_w)
        pad_b = max(0, bottom - img_h)
        new_w = img_w + pad_l + pad_r
        new_h = img_h + pad_t + pad_b
        padded = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
        padded.paste(rgba, (pad_l, pad_t))
        rgba = padded
        left += pad_l
        top += pad_t
        right += pad_l
        bottom += pad_t
    return rgba.crop((left, top, right, bottom))


def prepare_zero123_input(src_image: Image.Image, size: int = 320) -> Image.Image:
    """rembg → tight square crop → resize → composite on white."""
    from rembg import remove

    cut = remove(src_image.convert("RGBA"))  # returns RGBA
    cropped = square_crop_around_foreground(cut, pad=0.12)
    cropped = cropped.resize((size, size), Image.LANCZOS)
    bg = Image.new("RGB", (size, size), (255, 255, 255))
    if cropped.mode == "RGBA":
        bg.paste(cropped, mask=cropped.split()[3])
    else:
        bg.paste(cropped)
    return bg


def run_zero123(image: Image.Image, num_inference_steps: int = 36) -> Image.Image:
    import torch
    from diffusers import DiffusionPipeline, EulerAncestralDiscreteScheduler

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    print(f"      device={device}, dtype={dtype}")
    pipe = DiffusionPipeline.from_pretrained(
        "sudo-ai/zero123plus-v1.2",
        custom_pipeline="sudo-ai/zero123plus-pipeline",
        torch_dtype=dtype,
        trust_remote_code=True,
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(
        pipe.scheduler.config, timestep_spacing="trailing"
    )
    pipe.to(device)
    result = pipe(image, num_inference_steps=num_inference_steps).images[0]
    return result


def whiten_grid_background(grid: Image.Image) -> Image.Image:
    """Replace Zero123++'s gray field with white and recenter each view cell."""
    arr = np.asarray(grid.convert("RGB")).astype(np.int16)
    out_img = Image.new("RGB", grid.size, "white")
    cell_w = 320
    cell_h = 320

    for y0 in range(0, arr.shape[0], cell_h):
        for x0 in range(0, arr.shape[1], cell_w):
            cell = arr[y0 : y0 + cell_h, x0 : x0 + cell_w]
            border = np.concatenate(
                [
                    cell[:18].reshape(-1, 3),
                    cell[-18:].reshape(-1, 3),
                    cell[:, :18].reshape(-1, 3),
                    cell[:, -18:].reshape(-1, 3),
                ],
                axis=0,
            )
            bg = np.median(border, axis=0)
            dist = np.linalg.norm(cell - bg, axis=2)
            saturation = cell.max(axis=2) - cell.min(axis=2)
            bg_mask = (dist < 42) & (saturation < 42)
            cleaned = cell.copy()
            cleaned[bg_mask] = 255

            content = np.any(cleaned < 242, axis=2)
            ys, xs = np.where(content)
            cell_img = Image.new("RGB", (cell_w, cell_h), "white")
            if len(xs) > 0:
                pad = 12
                left = max(0, int(xs.min()) - pad)
                right = min(cell_w, int(xs.max()) + pad + 1)
                top = max(0, int(ys.min()) - pad)
                bottom = min(cell_h, int(ys.max()) + pad + 1)
                crop = Image.fromarray(
                    np.clip(cleaned[top:bottom, left:right], 0, 255).astype(np.uint8)
                )
                scale = min(284 / crop.width, 238 / crop.height)
                crop = crop.resize(
                    (
                        max(1, round(crop.width * scale)),
                        max(1, round(crop.height * scale)),
                    ),
                    Image.LANCZOS,
                )
                cell_img.paste(
                    crop,
                    ((cell_w - crop.width) // 2, (cell_h - crop.height) // 2),
                )
            out_img.paste(cell_img, (x0, y0))

    return out_img


def extract_view(grid: Image.Image, view_key: str) -> Image.Image:
    x, y = ZERO123_VIEWS[view_key]
    return grid.crop((x, y, x + 320, y + 320))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--view",
        choices=list(ZERO123_VIEWS),
        default="view1",
        help="which of the 6 generated views to save (default: view1)",
    )
    parser.add_argument(
        "--save-grid",
        type=Path,
        default=DEFAULT_GRID,
        help="also save the full 2x3 grid for inspection",
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=36,
        help="diffusion sampling steps (75 is the model default; 36 is faster, fine quality)",
    )
    args = parser.parse_args()

    if not args.src.exists():
        print(f"source not found: {args.src}", file=sys.stderr)
        return 1

    print(f"[1/3] loading {args.src.name} + removing background")
    src = Image.open(args.src).convert("RGB")
    z_input = prepare_zero123_input(src)

    print(f"[2/3] running Zero123++ v1.2 ({args.steps} steps)")
    grid = run_zero123(z_input, num_inference_steps=args.steps)
    grid = whiten_grid_background(grid)

    if args.save_grid:
        args.save_grid.parent.mkdir(parents=True, exist_ok=True)
        grid.save(args.save_grid, quality=92)
        print(f"      saved grid -> {args.save_grid.relative_to(REPO_ROOT)}")

    print(f"[3/3] saving {args.view}")
    view = extract_view(grid, args.view)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    view.save(args.out, quality=92)
    print(f"done -> {args.out.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
