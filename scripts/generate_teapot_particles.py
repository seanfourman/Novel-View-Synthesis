#!/usr/bin/env python3
"""
Generate a Utah Teapot point cloud using parametric surfaces (body of revolution
+ Bézier tubes for handle and spout).  No external downloads required.
Output: assets/generated/teapot_particles.json  ← loaded by initLimits in slides.js
"""
import numpy as np
import json
from pathlib import Path
from scipy.interpolate import CubicSpline

OUT = Path("assets/generated/teapot_particles.json")
OUT.parent.mkdir(parents=True, exist_ok=True)


# ── Body profile (r, z) — approximate Newell teapot silhouette ───────────────
BODY_PROFILE = [
    (0.00, 0.00),   # bottom centre
    (0.38, 0.00),   # bottom flat
    (0.85, 0.10),   # lower flare
    (1.00, 0.38),   # lower belly
    (1.10, 0.78),   # widest belly
    (1.04, 1.18),   # upper belly
    (0.82, 1.52),   # shoulder
    (0.60, 1.82),   # upper shoulder
    (0.44, 2.02),   # neck base
    (0.50, 2.22),   # neck
    (0.54, 2.42),   # rim
]

# ── Lid profile ───────────────────────────────────────────────────────────────
LID_PROFILE = [
    (0.52, 2.42),
    (0.58, 2.52),
    (0.42, 2.62),
    (0.34, 2.68),
    (0.14, 2.72),
    (0.10, 2.82),   # knob base
    (0.08, 2.90),   # knob tip
]

# ── Handle control points (Bézier tube, on +x side) ─────────────────────────
HANDLE_CTRL = np.array([
    [ 0.91, 0.0, 1.38],   # bottom: matches body surface at z=1.38  (r≈0.91)
    [ 1.68, 0.0, 1.20],   # outer bottom control
    [ 1.52, 0.0, 2.15],   # outer top control
    [ 0.54, 0.0, 2.42],   # top: matches neck at z=2.42            (r≈0.54)
], dtype=float)

# ── Spout control points (Bézier tube, on −x side) ───────────────────────────
# S-curve: sweeps out+down first, then reverses up — like a gooseneck spout
SPOUT_CTRL = np.array([
    [-0.90, 0.0, 0.88],   # body attachment (lower belly)
    [-2.20, 0.0, 0.15],   # out and DOWN → lower belly of S
    [-0.60, 0.0, 2.00],   # reversal: in and UP → middle of S
    [-1.65, 0.0, 2.55],   # tip: out and up → pour point
], dtype=float)


def cubic_bezier(p0, p1, p2, p3, ts):
    ts = np.asarray(ts, dtype=float)
    mt = 1 - ts
    return (mt**3)[:, None]*p0 + (3*mt**2*ts)[:, None]*p1 \
         + (3*mt*ts**2)[:, None]*p2 + (ts**3)[:, None]*p3


def sample_revolution(profile, n_theta=36, n_t=22):
    """Revolve a (r, z) profile around the Z axis."""
    ts = np.linspace(0, 1, len(profile))
    ts_fine = np.linspace(0, 1, n_t)
    cs_r = CubicSpline(ts, [p[0] for p in profile])
    cs_z = CubicSpline(ts, [p[1] for p in profile])
    rs = np.clip(cs_r(ts_fine), 0, None)
    zs = cs_z(ts_fine)
    thetas = np.linspace(0, 2*np.pi, n_theta, endpoint=False)
    pts = []
    for r, z in zip(rs, zs):
        for th in thetas:
            pts.append([r * np.cos(th), r * np.sin(th), z])
    return np.array(pts)


def bezier_tube(ctrl, n_t=28, n_theta=10, radius=0.10):
    """Generate a circular tube along a cubic Bézier curve."""
    ts    = np.linspace(0, 1, n_t)
    curve = cubic_bezier(*ctrl, ts)          # (n_t, 3)
    pts   = []
    for i, center in enumerate(curve):
        # Tangent
        tang = curve[min(i+1, n_t-1)] - curve[max(i-1, 0)]
        norm = np.linalg.norm(tang)
        if norm < 1e-9:
            continue
        tang /= norm
        # Build local frame
        world_up = np.array([0, 0, 1.0])
        if abs(tang @ world_up) > 0.95:
            world_up = np.array([1, 0, 0.0])
        right = np.cross(tang, world_up)
        right /= np.linalg.norm(right)
        up    = np.cross(right, tang)
        for th in np.linspace(0, 2*np.pi, n_theta, endpoint=False):
            pts.append(center + radius * (np.cos(th)*right + np.sin(th)*up))
    return np.array(pts)


def disk_pts(z, r_outer, rings=3, n_min=8):
    """Flat disk cap."""
    pts = []
    for ri in np.linspace(0, r_outer, rings + 1):
        n = max(n_min, int(n_min * ri / r_outer + 1)) if ri > 0 else 1
        for th in np.linspace(0, 2*np.pi, n, endpoint=False):
            pts.append([ri * np.cos(th), ri * np.sin(th), z])
    return np.array(pts)


# ── Assemble all parts ────────────────────────────────────────────────────────
parts = [
    sample_revolution(BODY_PROFILE, n_theta=38, n_t=24),
    sample_revolution(LID_PROFILE,  n_theta=28, n_t=12),
    bezier_tube(HANDLE_CTRL, n_t=30, n_theta=12, radius=0.10),
    bezier_tube(SPOUT_CTRL,  n_t=24, n_theta=10, radius=0.09),
    disk_pts(0.0, 0.38, rings=3, n_min=10),   # bottom
]
all_pts = np.vstack(parts)

# ── Normalise to [-1, 1]³ ─────────────────────────────────────────────────────
lo, hi  = all_pts.min(axis=0), all_pts.max(axis=0)
centre  = (lo + hi) / 2
scale   = (hi - lo).max() / 2
all_pts = (all_pts - centre) / scale

# ── Remove near-duplicates and save ──────────────────────────────────────────
rounded = np.round(all_pts, 3)
unique  = np.unique(rounded, axis=0)

result = [[float(x), float(y), float(z)] for x, y, z in unique]
OUT.write_text(json.dumps(result, separators=(",", ":")))
print(f"{len(result)} teapot points → {OUT}  ({OUT.stat().st_size // 1024} KB)")
