"""Level 1 gameplay backdrop from the Level 1 direction image.

Input: backdrop_clean.png (direction image with HUD, platforms, boy, pickups and the gate removed
by LaMa, see build_level1_clean.py) and the cloud stamp from the reference. Adds a sea of clouds
where the platforms were, then extends the 9:16 art to a 9:21 canvas (sky on top, foliage below)
so tall phones are covered. The result is at the direction image's scale; pipeline_level1.py
upscales it.

Usage: python build_level1_bg.py <work_l1_dir> <cloud_png> <out.png>
"""
import sys

import cv2
import numpy as np
from PIL import Image

EXT_T, EXT_B = 400, 120          # added rows above / below (direction-image pixels)
FADE = 90                        # rows over which the added sky blends into the art

# Cloud stamps (width, centre x, centre y, mirrored, alpha) in direction-image pixels,
# far first. Alpha above 1 makes the core opaque (used where the fill underneath is mushy).
PATH_CLOUDS = [
    (170, 740, 640, True, 0.8), (210, 600, 610, False, 0.8), (230, 350, 640, True, 0.8),
    (260, 560, 720, False, 1.1), (240, 760, 760, True, 0.9), (300, 330, 820, False, 1.1),
    (330, 610, 880, True, 1.3), (300, 180, 950, False, 0.8), (360, 440, 1010, False, 1.4),
    (380, 700, 1090, True, 1.1), (420, 260, 1160, True, 1.4), (420, 560, 1230, False, 1.6),
    (460, 160, 1350, False, 1.5), (480, 520, 1420, True, 1.7), (380, 820, 1480, False, 0.9),
]
SKY_CLOUDS = [(300, 140, 250, False, 1.0), (320, 800, 220, True, 1.0), (240, 470, 110, False, 0.9)]


def stamp(canvas, cloud, width, cx, cy, flip=False, alpha=1.0, tint=None):
    im = cloud[:, ::-1] if flip else cloud
    sc = width / im.shape[1]
    nw, nh = int(im.shape[1] * sc), int(im.shape[0] * sc)
    im = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA).astype(np.float32)
    yy, xx = np.mgrid[0:nh, 0:nw].astype(np.float32)
    r = np.sqrt(((xx - nw / 2) / (nw / 2)) ** 2 + ((yy - nh / 2) / (nh / 2)) ** 2)
    a = np.clip(im[..., 3] / 255 * np.clip((1.0 - r) / 0.4, 0, 1) ** 0.7 * alpha, 0, 1)
    rgb = im[..., :3]
    if tint is not None:
        rgb = rgb * (1 - tint[1]) + np.array(tint[0], np.float32) * tint[1]
    x0, y0 = int(cx - nw / 2), int(cy - nh / 2)
    H, W = canvas.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(nw, W - x0), min(nh, H - y0)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    reg = canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    aa = a[sy0:sy1, sx0:sx1, None]
    canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = reg * (1 - aa) + rgb[sy0:sy1, sx0:sx1] * aa


def main(work, cloud_path, out_path):
    bd = np.asarray(Image.open(f"{work}/backdrop_clean.png").convert("RGB")).astype(np.float32)
    cloud = np.asarray(Image.open(cloud_path).convert("RGBA"))
    white = (np.array([250, 248, 255]), 0.35)
    for w, cx, cy, fl, al in PATH_CLOUDS:
        stamp(bd, cloud, w, cx, cy, fl, al, white)

    H, W = bd.shape[:2]
    Ht = EXT_T + H + EXT_B
    canvas = np.zeros((Ht, W, 3), np.float32)
    canvas[EXT_T:EXT_T + H] = bd
    # sky above: a vertical gradient from deep blue to the art's own top colour, which is
    # smoothed across the columns so no streaks run up from the art's edge
    top = cv2.GaussianBlur(bd[20:60].mean(axis=0)[None], (0, 0), 60)[0]
    t = np.linspace(0, 1, EXT_T + FADE, dtype=np.float32)[:, None, None]
    deep = np.array([12, 78, 205], np.float32)
    sky = deep * (1 - t) + top[None] * t
    canvas[:EXT_T] = sky[:EXT_T]
    w = (np.linspace(0, 1, FADE, dtype=np.float32) ** 1.3)[:, None, None]
    canvas[EXT_T:EXT_T + FADE] = sky[EXT_T:] * (1 - w) + bd[:FADE] * w
    # below: the foliage strip along the bottom of the art, mirrored (it sits behind the banner)
    band = bd[H - EXT_B:H][::-1]
    shade = np.linspace(1.0, 0.8, EXT_B, dtype=np.float32)[:, None, None]
    canvas[EXT_T + H:] = band * shade
    for w_, cx, cy, fl, al in SKY_CLOUDS:
        stamp(canvas, cloud, w_, cx, cy, fl, al, white)
    out = np.clip(canvas, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(out_path)
    print("saved", out_path, out.shape)


if __name__ == "__main__":
    main(*sys.argv[1:4])
