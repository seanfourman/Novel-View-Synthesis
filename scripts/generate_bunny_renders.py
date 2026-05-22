#!/usr/bin/env python3
"""
Render the Stanford Bunny from multiple angles:
  - 9 polaroid thumbnails (for the SfM panel polaroid photos)
  - 36-frame sprite sheet of a full rotation (for the center 3D animation)

Output: assets/generated/bunny_renders/
"""
from __future__ import annotations
import os, math
from pathlib import Path

import numpy as np
import trimesh
import pyrender
from PIL import Image

OUT = Path("assets/generated/bunny_renders")
OUT.mkdir(parents=True, exist_ok=True)

MESH_PATH = "assets/generated/bunny.obj"
RENDER_W, RENDER_H = 300, 300   # per-frame size
SPRITE_COLS = 6                 # sprite sheet layout


# ── Load and normalise mesh ──────────────────────────────────────────────────
raw = trimesh.load(MESH_PATH, force="mesh")
# Centre at origin, scale to fit [-1,1]
raw.apply_translation(-raw.centroid)
scale = 1.0 / raw.extents.max()
raw.apply_scale(scale * 1.6)
# Stand it upright: bunny is already Y-up, just fine-tune
raw.apply_translation([0, -raw.centroid[1], 0])

mesh = pyrender.Mesh.from_trimesh(raw, smooth=True)


# ── Build a reusable scene ───────────────────────────────────────────────────
def make_scene(mesh, transparent=False):
    bg = [0.0, 0.0, 0.0, 0.0] if transparent else [0.96, 0.95, 0.94, 1.0]
    scene = pyrender.Scene(bg_color=bg, ambient_light=[0.35, 0.35, 0.35])
    scene.add(mesh)

    # Key light (warm, from upper-left)
    key = pyrender.DirectionalLight(color=[1.0, 0.95, 0.88], intensity=3.5)
    kp = np.eye(4)
    kp[:3, 3] = [-1.2, 2.0, 2.0]
    kp[:3, :3] = look_at([0,0,0], kp[:3,3])
    scene.add(key, pose=kp)

    # Fill light (cool, opposite side)
    fill = pyrender.DirectionalLight(color=[0.78, 0.85, 1.0], intensity=1.4)
    fp = np.eye(4)
    fp[:3, 3] = [1.5, 0.5, -1.5]
    fp[:3, :3] = look_at([0,0,0], fp[:3,3])
    scene.add(fill, pose=fp)

    return scene


def look_at(target, eye):
    """Return rotation matrix so +Z of the light faces target from eye."""
    t = np.array(target, float)
    e = np.array(eye, float)
    fwd = t - e;  fwd /= np.linalg.norm(fwd)
    right = np.cross([0,1,0], fwd)
    if np.linalg.norm(right) < 1e-6:
        right = np.cross([1,0,0], fwd)
    right /= np.linalg.norm(right)
    up = np.cross(fwd, right)
    R = np.stack([right, up, -fwd], axis=1)
    return R


def camera_pose(azimuth_deg: float, elevation_deg: float = 18.0, distance: float = 3.2):
    """
    Return a 4×4 camera pose matrix.
    azimuth  : horizontal rotation around Y axis (degrees)
    elevation: tilt above horizontal (degrees)
    """
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    # Camera position in world space
    x = distance * math.cos(el) * math.sin(az)
    y = distance * math.sin(el)
    z = distance * math.cos(el) * math.cos(az)
    eye = np.array([x, y, z])
    # Build look-at matrix (camera looks at origin)
    fwd = -eye / np.linalg.norm(eye)  # into scene
    world_up = np.array([0.0, 1.0, 0.0])
    right = np.cross(fwd, world_up)
    if np.linalg.norm(right) < 1e-6:
        right = np.cross(fwd, [1.0, 0.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    R = np.stack([right, up, -fwd], axis=1)
    T = np.eye(4)
    T[:3, :3] = R
    T[:3, 3] = eye
    return T


def render_frame(renderer, scene, cam_node, az, el=18.0, dist=3.2):
    scene.set_pose(cam_node, camera_pose(az, el, dist))
    color, _ = renderer.render(scene, flags=pyrender.RenderFlags.RGBA)
    return Image.fromarray(color, "RGBA").convert("RGBA")


# ── Renderer ─────────────────────────────────────────────────────────────────
renderer = pyrender.OffscreenRenderer(RENDER_W, RENDER_H)
camera   = pyrender.PerspectiveCamera(yfov=0.65, aspectRatio=1.0)

# ── 1. Nine polaroid thumbnails - opaque background, closer crop ─────────────
scene_pol = make_scene(mesh, transparent=False)
cam_pol   = scene_pol.add(camera, pose=camera_pose(0))

POLAROID_ANGLES = [i * 40 for i in range(9)]   # 0, 40, 80 … 320
for i, az in enumerate(POLAROID_ANGLES):
    img = render_frame(renderer, scene_pol, cam_pol, az, el=15.0, dist=2.6)
    img = img.resize((220, 220), Image.LANCZOS)
    # White polaroid frame
    frame = Image.new("RGBA", (260, 290), (255, 255, 255, 255))
    frame.paste(img, (20, 18), img)
    frame.save(OUT / f"polaroid_{i:02d}.png")
    print(f"  polaroid {i:02d}  az={az}°")


# ── 2. 36-frame sprite sheet - transparent background ────────────────────────
scene_spr = make_scene(mesh, transparent=True)
cam_spr   = scene_spr.add(camera, pose=camera_pose(0))

N_FRAMES     = 36
frame_images = []
for i in range(N_FRAMES):
    az = i * (360 / N_FRAMES)
    img = render_frame(renderer, scene_spr, cam_spr, az, el=18.0, dist=3.2)
    frame_images.append(img)
    print(f"  rotation frame {i:02d}  az={az:.0f}°")

cols  = SPRITE_COLS
rows  = math.ceil(N_FRAMES / cols)
sheet = Image.new("RGBA", (cols * RENDER_W, rows * RENDER_H), (0, 0, 0, 0))
for i, fr in enumerate(frame_images):
    c, r = i % cols, i // cols
    sheet.paste(fr, (c * RENDER_W, r * RENDER_H), fr)   # use alpha mask
sheet.save(OUT / "sprite_sheet.png")
print(f"Sprite sheet saved: {cols}×{rows} grid, {RENDER_W}×{RENDER_H}px per frame")

renderer.delete()
print("Done →", OUT)
