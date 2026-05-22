#!/usr/bin/env python3
"""
Generate a round-brilliant diamond point cloud for the limits canvas.
Thematically perfect - a diamond is the poster child for view-dependent
appearance (caustics, reflections, transparency) that classical NVS fails on.
Pure numpy, no downloads needed.
Output: assets/generated/limits_model.json  [[x, y, z], ...]  z-up, normalised to [-1, 1]
"""
import numpy as np
import json
from pathlib import Path

rng = np.random.default_rng(42)
OUT = Path("assets/generated/limits_model.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

# ── Round brilliant diamond proportions ──────────────────────────────────────
N     = 16          # main symmetry divisions
R     = 1.00        # girdle radius
r_t   = 0.58        # table (flat top) radius - wider table
h_c   = 0.35        # crown height (shorter = wider/thinner profile)
h_p   = 0.80        # pavilion depth (shallower than before)

main_a = np.linspace(0, 2 * np.pi, N, endpoint=False)
mid_a  = main_a + np.pi / N      # half-step between mains

tv   = np.column_stack([r_t * np.cos(main_a), r_t * np.sin(main_a), np.full(N, h_c)])
gm   = np.column_stack([R * np.cos(main_a),   R * np.sin(main_a),   np.zeros(N)])
gmid = np.column_stack([R * np.cos(mid_a),    R * np.sin(mid_a),    np.zeros(N)])
culet = np.array([0.0, 0.0, -h_p])


def tri(A, B, C, n):
    """Sample n random points uniformly inside triangle ABC."""
    u = rng.random((n, 1))
    v = rng.random((n, 1))
    flip = (u + v) > 1
    u[flip] = 1 - u[flip]
    v[flip] = 1 - v[flip]
    return A + u * (B - A) + v * (C - A)


def fan(centre, verts, n_total):
    k      = len(verts)
    n_each = max(1, n_total // k)
    return np.vstack([tri(centre, verts[i], verts[(i + 1) % k], n_each)
                      for i in range(k)])


parts = []

# ── TABLE  (flat polygon at top) ─────────────────────────────────────────────
parts.append(fan(np.array([0.0, 0.0, h_c]), tv, 260))

# ── CROWN FACETS ─────────────────────────────────────────────────────────────
# Each sector i spans angle [main_a[i], main_a[i+1]].
# The crown in this sector is a pentagon: tv[i], tv[i+1], gm[i+1], gmid[i], gm[i]
# Triangulated exactly (no overlaps, no gaps) into 3 triangles:
#   T1 (star):       tv[i],   tv[ip1], gmid[i]   - upper, near table edge
#   T2 (left kite):  tv[i],   gmid[i], gm[i]     - left side down to girdle
#   T3 (right kite): tv[ip1], gm[ip1], gmid[i]   - right side down to girdle
for i in range(N):
    ip1 = (i + 1) % N
    parts.append(tri(tv[i],   tv[ip1], gmid[i],  55))
    parts.append(tri(tv[i],   gmid[i], gm[i],    50))
    parts.append(tri(tv[ip1], gm[ip1], gmid[i],  50))

# ── GIRDLE  (thin band at widest point) ──────────────────────────────────────
n_g   = 500
theta = rng.uniform(0, 2 * np.pi, n_g)
zg    = rng.uniform(-0.025, 0.025, n_g)
parts.append(np.column_stack([R * np.cos(theta), R * np.sin(theta), zg]))

# ── PAVILION FACETS ──────────────────────────────────────────────────────────
# 2N triangles converging to the culet point.
for i in range(N):
    ip1 = (i + 1) % N
    parts.append(tri(gm[i],   gmid[i], culet, 70))
    parts.append(tri(gmid[i], gm[ip1], culet, 70))

# ── CULET  (tiny flat tip) ───────────────────────────────────────────────────
tip_r = 0.03
theta_tip = rng.uniform(0, 2 * np.pi, 30)
r_tip = np.sqrt(rng.uniform(0, tip_r**2, 30))
parts.append(np.column_stack([r_tip * np.cos(theta_tip),
                               r_tip * np.sin(theta_tip),
                               np.full(30, -h_p)]))

# ── ASSEMBLE & NORMALISE ──────────────────────────────────────────────────────
all_pts = np.vstack(parts)
all_pts += rng.uniform(-0.003, 0.003, all_pts.shape)

lo, hi  = all_pts.min(0), all_pts.max(0)
centre  = (lo + hi) / 2
half    = (hi - lo).max() / 2
all_pts = (all_pts - centre) / half

result = [[round(float(x), 4), round(float(y), 4), round(float(z), 4)]
          for x, y, z in all_pts]
OUT.write_text(json.dumps(result, separators=(",", ":")))
print(f"{len(result)} diamond points → {OUT}  ({OUT.stat().st_size // 1024} KB)")
