#!/usr/bin/env python3
"""
Densify chair_splats.json from 5200 → ~40000 points by sub-sampling within each Gaussian.
Each original splat is exploded into K sub-splats placed randomly within its tangent footprint.
Run from the project root:  python3 scripts/densify_chair_splats.py
"""
import json, os
import numpy as np

INPUT  = os.path.join(os.path.dirname(__file__), '../assets/generated/chair_splats.json')
OUTPUT = INPUT
TARGET = 40000

with open(INPUT) as f:
    d = json.load(f)

n   = d['count']
pos = np.array(d['pos'], dtype=np.float32).reshape(n, 3)
col = np.array(d['col'], dtype=np.float32).reshape(n, 3)
nrm = np.array(d['nrm'], dtype=np.float32).reshape(n, 3)
spc = np.array(d['spc'], dtype=np.float32)

k         = TARGET // n          # sub-splats per original (≈7)
remainder = TARGET - k * n       # first `remainder` originals get k+1

rng = np.random.default_rng(42)

new_pos, new_col, new_nrm, new_spc = [], [], [], []

for i in range(n):
    p   = pos[i]
    c   = col[i]
    nm  = nrm[i]
    s   = spc[i]
    cnt = k + (1 if i < remainder else 0)

    # Build tangent basis from normal
    nm_n = nm / (np.linalg.norm(nm) + 1e-8)
    ref  = np.array([1., 0., 0.]) if abs(nm_n[0]) < 0.9 else np.array([0., 1., 0.])
    t1   = np.cross(nm_n, ref);  t1 /= np.linalg.norm(t1) + 1e-8
    t2   = np.cross(nm_n, t1)

    # cnt random offsets in the tangent plane + tiny normal jitter
    offs_t1 = rng.normal(0, s * 0.45, cnt)
    offs_t2 = rng.normal(0, s * 0.45, cnt)
    offs_n  = rng.normal(0, s * 0.12, cnt)
    offsets = np.outer(offs_t1, t1) + np.outer(offs_t2, t2) + np.outer(offs_n, nm_n)

    sub_pos = p + offsets                                         # (cnt, 3)
    jitter  = rng.normal(0, 3.5, (cnt, 3))
    sub_col = np.clip(c + jitter, 0, 255)
    sub_spc = np.full(cnt, s * (k ** (-1/3)))

    new_pos.append(sub_pos)
    new_col.append(sub_col)
    new_nrm.extend([nm.tolist()] * cnt)
    new_spc.extend(sub_spc.tolist())

new_pos = np.vstack(new_pos)
new_col = np.vstack(new_col).astype(np.uint8)
total   = len(new_spc)

out = {
    'count': total,
    'pos':   new_pos.flatten().tolist(),
    'col':   new_col.flatten().tolist(),
    'nrm':   [x for v in new_nrm for x in v],
    'spc':   new_spc,
}
with open(OUTPUT, 'w') as f:
    json.dump(out, f)

print(f"Done: {n} → {total} splats saved to {OUTPUT}")
