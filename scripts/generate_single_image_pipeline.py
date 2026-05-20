#!/usr/bin/env python3
"""Generate real single-image novel-view-synthesis pipeline artifacts.

This is intentionally not a toy CSS diagram. It runs a pretrained monocular
depth model, lifts the source image into a depth-aware proxy, renders small
camera shifts by forward splatting, creates hole masks, and fills missing pixels
with image inpainting. The hidden content is inferred, not recovered.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import pipeline


MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"


def ensure_rgb(path: Path, max_side: int) -> Image.Image:
    img = Image.open(path).convert("RGB")
    scale = min(1.0, max_side / max(img.size))
    if scale < 1.0:
        size = (round(img.width * scale), round(img.height * scale))
        img = img.resize(size, Image.Resampling.LANCZOS)
    return img


def normalize01(arr: np.ndarray) -> np.ndarray:
    arr = arr.astype(np.float32)
    lo, hi = np.percentile(arr, [2, 98])
    arr = np.clip((arr - lo) / max(hi - lo, 1e-6), 0, 1)
    return arr


def depth_to_gray(depth01: np.ndarray) -> np.ndarray:
    return (depth01 * 255).round().astype(np.uint8)


def depth_colormap(depth01: np.ndarray) -> np.ndarray:
    gray = depth_to_gray(depth01)
    return cv2.applyColorMap(gray, cv2.COLORMAP_TURBO)


def load_depth(img: Image.Image) -> np.ndarray:
    device = "mps" if torch.backends.mps.is_available() else -1
    depth_pipe = pipeline("depth-estimation", model=MODEL_ID, device=device)
    result = depth_pipe(img)
    pred = result.get("predicted_depth")
    if pred is not None:
        arr = pred.detach().cpu().numpy()
        if arr.ndim == 3:
            arr = arr.squeeze()
        arr = cv2.resize(arr.astype(np.float32), img.size, interpolation=cv2.INTER_CUBIC)
    else:
        depth_img = result["depth"].resize(img.size, Image.Resampling.BICUBIC)
        arr = np.asarray(depth_img).astype(np.float32)
    return normalize01(arr)


def save(path: Path, arr_rgb_or_bgr: np.ndarray | Image.Image, bgr: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(arr_rgb_or_bgr, Image.Image):
        arr_rgb_or_bgr.save(path)
        return
    arr = arr_rgb_or_bgr
    if bgr:
        cv2.imwrite(str(path), arr)
    else:
        Image.fromarray(arr.astype(np.uint8)).save(path)


def add_label(img: Image.Image, text: str) -> Image.Image:
    out = img.copy()
    draw = ImageDraw.Draw(out, "RGBA")
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    except OSError:
        font = ImageFont.load_default()
    pad = 12
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0] + pad * 2
    h = bbox[3] - bbox[1] + pad * 2
    draw.rounded_rectangle((12, 12, 12 + w, 12 + h), radius=10, fill=(255, 255, 255, 230))
    draw.text((12 + pad, 12 + pad), text, fill=(10, 10, 10, 255), font=font)
    return out


def render_depth_proxy(rgb: np.ndarray, depth01: np.ndarray) -> np.ndarray:
    h, w = depth01.shape
    canvas = np.full((h, w, 3), 245, np.uint8)
    yy, xx = np.mgrid[0:h:4, 0:w:4]
    d = depth01[yy, xx]
    x = ((xx / w) - 0.5) * 1.6
    y = ((yy / h) - 0.5) * 1.2
    z = d * 0.85

    # Simple oblique projection for a point-cloud/proxy visualization.
    sx = (x + 0.36 * z) * w / 1.9 + w / 2
    sy = (y - 0.22 * z) * h / 1.45 + h / 2
    order = np.argsort(z.ravel())
    colors = rgb[yy, xx].reshape(-1, 3)
    sx = sx.ravel()
    sy = sy.ravel()
    zf = z.ravel()

    for idx in order:
        cx, cy = int(round(sx[idx])), int(round(sy[idx]))
        if 1 <= cx < w - 1 and 1 <= cy < h - 1:
            radius = 1 + int(zf[idx] > 0.55)
            cv2.circle(canvas, (cx, cy), radius, tuple(int(c) for c in colors[idx]), -1, cv2.LINE_AA)

    for gx in range(0, w, 42):
        cv2.line(canvas, (gx, 0), (gx + 70, h), (224, 224, 224), 1)
    for gy in range(0, h, 42):
        cv2.line(canvas, (0, gy), (w, gy - 55), (224, 224, 224), 1)
    return canvas


def forward_splat(rgb: np.ndarray, depth01: np.ndarray, direction: int, max_shift: int) -> tuple[np.ndarray, np.ndarray]:
    h, w = depth01.shape
    out = np.zeros_like(rgb)
    zbuf = np.full((h, w), -np.inf, np.float32)
    hit = np.zeros((h, w), np.uint8)

    yy, xx = np.mgrid[0:h, 0:w]
    disp = np.power(depth01, 1.35)
    shift_x = direction * max_shift * disp
    shift_y = -0.12 * max_shift * (disp - 0.5)
    nx = np.rint(xx + shift_x).astype(np.int32)
    ny = np.rint(yy + shift_y).astype(np.int32)

    # Far-to-near z-buffer: high depth/disparity wins at collisions.
    order = np.argsort(depth01.ravel())
    flat_rgb = rgb.reshape(-1, 3)
    flat_depth = depth01.ravel()
    flat_nx = nx.ravel()
    flat_ny = ny.ravel()

    for idx in order:
        x = flat_nx[idx]
        y = flat_ny[idx]
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        z = flat_depth[idx]
        color = flat_rgb[idx]
        for oy in (-1, 0, 1):
            yy2 = y + oy
            if yy2 < 0 or yy2 >= h:
                continue
            for ox in (-1, 0, 1):
                xx2 = x + ox
                if xx2 < 0 or xx2 >= w:
                    continue
                if z >= zbuf[yy2, xx2]:
                    zbuf[yy2, xx2] = z
                    out[yy2, xx2] = color
                    hit[yy2, xx2] = 255

    hole_mask = (hit == 0).astype(np.uint8) * 255
    hole_mask = cv2.morphologyEx(hole_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return out, hole_mask


def inpaint(rgb_warped: np.ndarray, hole_mask: np.ndarray) -> np.ndarray:
    bgr = cv2.cvtColor(rgb_warped, cv2.COLOR_RGB2BGR)
    filled = cv2.inpaint(bgr, hole_mask, 3, cv2.INPAINT_TELEA)
    return cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)


def overlay_holes(rgb_warped: np.ndarray, hole_mask: np.ndarray) -> np.ndarray:
    overlay = rgb_warped.copy()
    red = np.zeros_like(overlay)
    red[..., 0] = 255
    alpha = (hole_mask.astype(np.float32) / 255.0) * 0.68
    overlay = (overlay * (1 - alpha[..., None]) + red * alpha[..., None]).astype(np.uint8)
    return overlay


def contact_sheet(paths: list[tuple[str, Path]], out_path: Path) -> None:
    thumbs = []
    for label, path in paths:
        img = Image.open(path).convert("RGB")
        img.thumbnail((320, 220), Image.Resampling.LANCZOS)
        thumb = Image.new("RGB", (340, 270), "white")
        x = (340 - img.width) // 2
        thumb.paste(img, (x, 38))
        thumb = add_label(thumb, label)
        thumbs.append(thumb)

    cols = 3
    rows = int(np.ceil(len(thumbs) / cols))
    sheet = Image.new("RGB", (cols * 340, rows * 270), (245, 245, 245))
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((i % cols) * 340, (i // cols) * 270))
    sheet.save(out_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="assets/images/redtoyota.jpg")
    parser.add_argument("--out", default="assets/generated/single_image_pipeline")
    parser.add_argument("--max-side", type=int, default=768)
    parser.add_argument("--shift", type=int, default=76)
    args = parser.parse_args()

    src_path = Path(args.input)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    src_img = ensure_rgb(src_path, args.max_side)
    rgb = np.asarray(src_img)
    save(out_dir / "01_input_rgb.png", src_img)

    depth01 = load_depth(src_img)
    save(out_dir / "02_depth_gray.png", depth_to_gray(depth01))
    save(out_dir / "03_depth_colormap.png", depth_colormap(depth01), bgr=True)

    proxy = render_depth_proxy(rgb, depth01)
    save(out_dir / "04_lifted_depth_proxy.png", proxy)

    left_warp, left_mask = forward_splat(rgb, depth01, direction=-1, max_shift=args.shift)
    save(out_dir / "05_left_view_warp_with_holes.png", left_warp)
    save(out_dir / "06_left_view_hole_mask.png", left_mask)
    save(out_dir / "07_left_view_holes_overlay.png", overlay_holes(left_warp, left_mask))
    left_filled = inpaint(left_warp, left_mask)
    save(out_dir / "08_left_view_inpainted.png", left_filled)

    right_warp, right_mask = forward_splat(rgb, depth01, direction=1, max_shift=args.shift)
    save(out_dir / "09_right_view_warp_with_holes.png", right_warp)
    save(out_dir / "10_right_view_hole_mask.png", right_mask)
    save(out_dir / "11_right_view_holes_overlay.png", overlay_holes(right_warp, right_mask))
    right_filled = inpaint(right_warp, right_mask)
    save(out_dir / "12_right_view_inpainted.png", right_filled)

    manifest = {
        "input": str(src_path),
        "model": MODEL_ID,
        "note": "Single-image NVS: depth and hidden regions are estimated, not recovered from evidence.",
        "artifacts": [
            "01_input_rgb.png",
            "02_depth_gray.png",
            "03_depth_colormap.png",
            "04_lifted_depth_proxy.png",
            "05_left_view_warp_with_holes.png",
            "06_left_view_hole_mask.png",
            "07_left_view_holes_overlay.png",
            "08_left_view_inpainted.png",
            "09_right_view_warp_with_holes.png",
            "10_right_view_hole_mask.png",
            "11_right_view_holes_overlay.png",
            "12_right_view_inpainted.png",
            "13_pipeline_contact_sheet.png",
        ],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    contact_sheet(
        [
            ("01 input", out_dir / "01_input_rgb.png"),
            ("02 depth", out_dir / "03_depth_colormap.png"),
            ("03 lifted proxy", out_dir / "04_lifted_depth_proxy.png"),
            ("04 shifted view", out_dir / "05_left_view_warp_with_holes.png"),
            ("05 hole mask", out_dir / "07_left_view_holes_overlay.png"),
            ("06 inpainted view", out_dir / "08_left_view_inpainted.png"),
        ],
        out_dir / "13_pipeline_contact_sheet.png",
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
