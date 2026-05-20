#!/usr/bin/env python3
"""Sample the bunny RGB + depth images into a particle cloud for the LF canvas animation."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

BASE   = Path("assets/generated/bunny_pipeline")
OUT    = BASE / "particles.json"
STRIDE = 7   # sample every 7px — ~5400 particles for a 512² image

rgb   = np.array(Image.open(BASE / "01_input_rgb.png").convert("RGB"))
depth = np.array(Image.open(BASE / "02_depth_gray.png").convert("L"))

# Align sizes
if depth.shape[:2] != rgb.shape[:2]:
    d = Image.fromarray(depth).resize((rgb.shape[1], rgb.shape[0]), Image.LANCZOS)
    depth = np.array(d)

h, w = depth.shape
pts = []

for y in range(0, h, STRIDE):
    for x in range(0, w, STRIDE):
        r, g, b = int(rgb[y, x, 0]), int(rgb[y, x, 1]), int(rgb[y, x, 2])
        d = int(depth[y, x])
        nx = round((x / w) - 0.5, 3)
        ny = round((y / h) - 0.5, 3)
        nz = round(d / 255.0, 3)
        pts.append([nx, ny, nz, r, g, b])

# Sort far-to-near so near pixels paint on top
pts.sort(key=lambda p: p[2])

OUT.write_text(json.dumps(pts, separators=(",", ":")))
print(f"{len(pts)} particles → {OUT}  ({OUT.stat().st_size // 1024} KB)")
