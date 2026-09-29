"""Scenery billboards for the 3D Level 1, cut from the reference art at full 4x resolution.

    python build_level1_3d_art.py <ref_x4.png> <direction_x4.png> <models_dir> <out_dir> [preview.png]

The 3D level draws the platforms, the boy, pickups and roads itself; the painted pieces here are
the far scenery that surrounds the course (floating castle islands, rainbow waterfall cliffs, the
rainbow tower) and the cloud monster. Each piece is matted with BiRefNet and saved as a
transparent WebP; layout.json records each piece's size and where its "anchor" (the point that
sits on the world position) is.

Boxes are in source pixels: ref = rainbow_cascades_reference.png (1536 x 1024),
dir = level1_direction.png (941 x 1672).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segment import get_mask_birefnet  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
S = 4

# name: (source, box, threshold, max long side in px, cleanup)
PIECES = {
    # floating islands from the Level 1 direction image (the most detailed art)
    "isl_castle_falls": ("dir", (0, 128, 196, 446), 0.3, 900, "largest"),
    "isl_castles": ("dir", (204, 248, 426, 506), 0.3, 900, "largest"),
    "isl_small_castle": ("dir", (476, 246, 588, 386), 0.3, 640, "largest"),
    "isl_trees": ("dir", (110, 384, 236, 548), 0.3, 640, "largest"),
    "isl_center": ("dir", (466, 440, 588, 606), 0.3, 640, "largest"),
    "isl_top_right": ("dir", (810, 92, 908, 238), 0.3, 560, "largest"),
    "isl_falls_cliff": ("dir", (0, 556, 300, 846), 0.3, 1000, "falls"),
    # from the reference sheet panels
    "isl_p3_castle": ("ref", (740, 12, 850, 142), 0.28, 560, "largest"),
    "isl_p9_left": ("ref", (943, 600, 1027, 704), 0.28, 480, "largest"),
    "isl_p8_left": ("ref", (636, 576, 724, 680), 0.28, 480, "largest"),
    "isl_p6_right": ("ref", (200, 640, 301, 800), 0.28, 560, "largest"),
    "tower": ("ref", (826, 36, 1004, 264), 0.28, 900, "tower"),
    "cloud_monster": ("ref", (1080, 58, 1268, 214), 0.2, 760, "monster"),
}


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    if n < 2:
        return mask.astype(bool)
    return lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))


def feather_edges(a, px):
    """Fade the matte out within px of the crop border so no straight cut shows."""
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
    return a * np.clip(d / px, 0, 1)


def save(rgb, a, path, max_side):
    ys, xs = np.where(a > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    im = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], (np.clip(a[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8)]))
    k = min(1.0, max_side / max(im.width, im.height))
    if k < 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(path, quality=88, method=6)
    return im.width, im.height


def main(ref_path, dir_path, models, out, preview=None):
    os.makedirs(out, exist_ok=True)
    src = {"ref": np.asarray(Image.open(ref_path).convert("RGB")), "dir": np.asarray(Image.open(dir_path).convert("RGB"))}
    bir = os.path.join(models, "birefnet.onnx")
    layout = {}
    for name, (s, b, thr, max_side, how) in PIECES.items():
        rgb = src[s][b[1] * S:b[3] * S, b[0] * S:b[2] * S].copy()
        a = get_mask_birefnet(rgb, bir)
        a = np.clip((a - thr) / (1 - 2 * thr), 0, 1)
        h, w = a.shape
        yy = np.arange(h, dtype=np.float32)[:, None] / h
        if how in ("largest", "falls", "tower"):
            a = a * largest(a > 0.5)
        if how == "falls":
            a = a * np.clip((0.985 - yy) / 0.25, 0, 1)        # the falls dissolve into the clouds
        if how == "tower":
            a = a * np.clip((0.985 - yy) / 0.1, 0, 1)
        if how == "monster":
            xx = np.arange(w, dtype=np.float32)[None, :] / w
            oval = 1 - np.hypot((xx - 0.5) / 0.52, (yy - 0.47) / 0.53)
            a = a * np.clip(oval / 0.16, 0, 1)
            # no breath: fade out the jet under the mouth
            jet = np.exp(-(((xx - 0.47) / 0.1) ** 2)) * np.clip((yy - 0.78) / 0.12, 0, 1)
            a = a * (1 - jet)
        a = cv2.GaussianBlur(feather_edges(a, 6 * S), (0, 0), 1.1)
        size = save(rgb, a, os.path.join(out, name + ".webp"), max_side)
        layout[name] = {"w": size[0], "h": size[1]}
        print(name, size, flush=True)
    with open(os.path.join(out, "layout.json"), "w") as f:
        json.dump(layout, f, indent=1)
    if preview:
        tiles = [Image.open(os.path.join(out, n + ".webp")) for n in PIECES]
        th = 300
        tiles = [t.resize((max(1, round(t.width * th / t.height)), th)) for t in tiles]
        W = sum(t.width for t in tiles) + 10 * len(tiles)
        sheet = Image.new("RGBA", (W, th + 20), (40, 40, 60, 255))
        chk = Image.new("RGBA", sheet.size)
        for y in range(0, sheet.height, 20):
            for x in range(0, sheet.width, 20):
                if (x // 20 + y // 20) % 2:
                    chk.paste((70, 70, 90, 255), (x, y, x + 20, y + 20))
        sheet = Image.alpha_composite(sheet, chk)
        x = 5
        for t in tiles:
            sheet.alpha_composite(t, (x, 10))
            x += t.width + 10
        sheet.convert("RGB").save(preview)


if __name__ == "__main__":
    main(*sys.argv[1:6])
