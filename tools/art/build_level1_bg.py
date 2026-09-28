"""Level 1 gameplay backdrop from the Level 1 direction image.

Input: backdrop_clean.png (direction image with HUD, platforms, boy, pickups and the gate removed
by LaMa), the cloud stamp from the reference. Adds a sea of clouds where the platforms were,
then extends the 9:16 art to a 9:21 canvas (sky on top, foliage below) so tall phones are covered.

Usage: python build_level1_bg.py <work_l1_dir> <cloud_png> <out.webp>
"""
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from inpaint import inpaint  # noqa: E402

EXT_T, EXT_B = 400, 120          # added rows above / below (direction-image pixels)


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
    # clouds under the path (where the platforms were), smaller toward the horizon, far first
    for w, cx, cy, fl, al in [(230, 620, 480, False, 0.95), (260, 330, 600, True, 0.9), (300, 560, 700, False, 1.0),
                              (320, 330, 880, True, 1.0), (360, 640, 990, False, 1.05), (400, 420, 1180, True, 1.1),
                              (440, 560, 1400, False, 1.15)]:
        stamp(bd, cloud, w, cx, cy, fl, al, white)

    H, W = bd.shape[:2]
    Ht = EXT_T + H + EXT_B
    canvas = np.zeros((Ht, W, 3), np.float32)
    canvas[EXT_T:EXT_T + H] = bd
    # sky above: gradient that meets the art's own top rows
    top = bd[:12].mean(axis=0)
    t = np.linspace(0, 1, EXT_T, dtype=np.float32)[:, None, None]
    deep = np.array([12, 78, 205], np.float32)
    canvas[:EXT_T] = deep * (1 - t) + top[None] * t
    # below: the foliage strip along the bottom of the art, mirrored (it sits behind the banner)
    band = bd[H - EXT_B:H][::-1]
    shade = np.linspace(1.0, 0.8, EXT_B, dtype=np.float32)[:, None, None]
    canvas[EXT_T + H:] = band * shade
    for w, cx, cy, fl in [(300, 140, 330, False), (320, 780, 300, True), (240, 470, 170, False)]:
        stamp(canvas, cloud, w, cx, cy, fl, 1.0, white)
    out = np.clip(canvas, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(out_path, quality=90, method=6)
    print("saved", out_path, out.shape)


if __name__ == "__main__":
    main(*sys.argv[1:4])
