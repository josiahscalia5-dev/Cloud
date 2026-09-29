"""Pieces for the later stages of Level 1, cut from the reference sheet (ref_x4.png, 4x).

    python build_level1_extras.py <ref_x4.png> <direction_x4.png> <models_dir> <out_dir>

- the cloud monster (Dodge the Cloud), the laser orb (fake-platform zone), a golden ring
- floating islands that drift past along the path
- the round banner icons of each stage (rotate, warning, red X, up arrow, left / right arrows)
- the boy seen from behind, split at the waist (torso over legs) for his running animation
- scenery: a rainbow waterfall and the rainbow tower

Boxes are in reference pixels (1536 x 1024) or direction-image pixels (941 x 1672).
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

# floating islands for the scenery: (source, box, BiRefNet threshold)
ISLANDS = [
    ("ref", (741, 13, 848, 135), 0.25),       # panel 3, castle island
    ("ref", (944, 603, 1025, 701), 0.25),     # panel 9, left
    ("ref", (637, 578, 722, 678), 0.25),      # panel 8, left
    ("dir", (200, 280, 430, 520), 0.25),      # direction image, castle island
    ("dir", (452, 248, 590, 392), 0.25),      # direction image, small castle
]
ICONS = {  # round (or triangular) badges from the stage banners
    "icon_rotate": (770, 484, 832, 540),
    "icon_warning": (1052, 466, 1112, 520),
    "icon_fake": (1300, 476, 1350, 528),
    "icon_up": (338, 936, 406, 1002),
    "icon_left": (636, 940, 690, 994),
    "icon_right": (858, 940, 914, 994),
}


def save_rgba(rgb, alpha, path, scale):
    ys, xs = np.where(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    im = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], (np.clip(alpha[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8)]))
    k = scale / S
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im.save(path, quality=90, method=6)
    return [int(x0), int(y0), int(x1), int(y1)]


def disc(shape, cx, cy, r, soft=2.0):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    return np.clip((r - np.hypot(xx - cx, yy - cy)) / soft + 0.5, 0, 1)


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    if n < 2:
        return mask
    return lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))


def main(ref_path, dir_path, models, out):
    os.makedirs(out, exist_ok=True)
    ref = np.asarray(Image.open(ref_path).convert("RGB"))
    dire = np.asarray(Image.open(dir_path).convert("RGB"))
    bir = os.path.join(models, "birefnet.onnx")
    info = {}

    def crop(src, b):
        return (ref if src == "ref" else dire)[b[1] * S:b[3] * S, b[0] * S:b[2] * S]

    # floating islands
    for i, (src, b, thr) in enumerate(ISLANDS):
        rgb = crop(src, b)
        a = get_mask_birefnet(rgb, bir)
        a = np.clip((a - thr) / (1 - 2 * thr), 0, 1)
        a = a * largest(a > 0.5).astype(np.float32) if a.max() > 0.5 else a
        a = cv2.GaussianBlur(a, (0, 0), 1.2)
        info[f"island_{i + 1}"] = save_rgba(rgb, a, os.path.join(out, f"island_{i + 1}.webp"), 1.5)

    # cloud monster (panel 4): its face and puffs, without the wind it breathes
    rgb = crop("ref", (1086, 58, 1252, 212))
    a = get_mask_birefnet(rgb, bir)
    a = np.clip((a - 0.2) / 0.6, 0, 1)
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]].astype(np.float32) / S
    oval = np.clip(1 - np.hypot((xx - 83) / 84, (yy - 74) / 78), 0, 1)       # soft oval: puffs fade out
    a = a * np.clip(oval / 0.18, 0, 1)
    info["cloud_monster"] = save_rgba(rgb, cv2.GaussianBlur(a, (0, 0), 2), os.path.join(out, "cloud_monster.webp"), 2)

    # laser orb (panel 5)
    rgb = crop("ref", (1420, 68, 1516, 164))
    info["laser_orb"] = save_rgba(rgb, disc(rgb.shape, 48 * S, 48 * S, 45 * S, 3 * S), os.path.join(out, "laser_orb.webp"), 2)

    # golden ring (panel 7): keyed by its gold colour, hole kept open
    rgb = crop("ref", (424, 740, 464, 786))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    k = ((hsv[..., 0] > 8) & (hsv[..., 0] < 38) & (hsv[..., 1] > 90) & (hsv[..., 2] > 120)).astype(np.uint8)
    k = cv2.morphologyEx(k, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    k = largest(k).astype(np.float32)
    info["ring"] = save_rgba(rgb, cv2.GaussianBlur(k, (0, 0), 1.5), os.path.join(out, "ring.webp"), 3)

    # stage banner icons
    for name, b in ICONS.items():
        rgb = crop("ref", b)
        h, w = rgb.shape[:2]
        if name == "icon_warning":
            a = np.clip((get_mask_birefnet(rgb, bir) - 0.25) / 0.5, 0, 1)
        else:
            a = disc(rgb.shape, w / 2, h / 2, min(w, h) / 2 - 1.5 * S, 2 * S)
        info[name] = save_rgba(rgb, a, os.path.join(out, f"{name}.webp"), 3)

    # the boy from behind (panel 9), split at the waist so the game can animate his stride:
    # boy_torso (head, backpack, arms) over boy_legs (shorts, legs, shoes), same canvas
    rgb = crop("ref", (1022, 786, 1134, 926))
    a = np.clip((get_mask_birefnet(rgb, bir) - 0.2) / 0.6, 0, 1)
    a = a * largest(a > 0.5).astype(np.float32)
    ys, xs = np.where(a > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, a = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
    yy = np.arange(a.shape[0], dtype=np.float32)[:, None] + y0
    belt = 355                                   # waistband, in 4x crop pixels
    for part, m in [("boy_torso", np.clip((belt + 16 - yy) / 10 + 0.5, 0, 1)), ("boy_legs", np.clip((yy - belt + 18) / 10 + 0.5, 0, 1))]:
        Image.fromarray(np.dstack([rgb, (a * m * 255).astype(np.uint8)])).save(os.path.join(out, part + ".webp"), quality=92, method=6)
    hips = np.where(a[belt + 10 - y0] > 0.5)[0]
    info["boy_rig"] = {"size": [int(x1 - x0), int(y1 - y0)], "hip_x": round(float((hips.min() + hips.max()) / 2 / (x1 - x0)), 3),
                       "belt_y": round(float((belt - y0) / (y1 - y0)), 3)}

    # scenery: a rainbow waterfall (direction image) and the rainbow tower (panel 3)
    rgb = crop("dir", (0, 555, 300, 880))
    a = np.clip((get_mask_birefnet(rgb, bir) - 0.25) / 0.5, 0, 1)
    yy = np.arange(a.shape[0], dtype=np.float32)[:, None] / a.shape[0]
    a = a * np.clip((0.97 - yy) / 0.3, 0, 1)                  # the falls fade into the clouds below
    info["waterfall"] = save_rgba(rgb, a, os.path.join(out, "waterfall.webp"), 1.5)
    rgb = crop("ref", (840, 38, 1002, 248))
    a = np.clip((get_mask_birefnet(rgb, bir) - 0.25) / 0.5, 0, 1)
    yt = np.arange(a.shape[0], dtype=np.float32)[:, None] / a.shape[0]
    a = a * np.clip((0.96 - yt) / 0.12, 0, 1)                 # its base fades out
    info["tower"] = save_rgba(rgb, a, os.path.join(out, "tower.webp"), 2)

    with open(os.path.join(out, "extras.json"), "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main(*sys.argv[1:5])
