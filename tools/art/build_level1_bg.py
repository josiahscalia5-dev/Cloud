"""Level 1 gameplay backdrop from the Level 1 direction image.

Input: backdrop_clean.png + backdrop_mask.png (direction image with HUD, platforms, boy, pickups
and the gate removed by LaMa, see build_level1_clean.py), direction_x4.png, and panel 4 of the
reference (p4_x4.png) for the cloud stamp. Covers the removed path with a sea of clouds, then
extends the 9:16 art to a 9:21 canvas (sky on top, foliage below) so tall phones are covered.
The result is saved at `scale` x the direction image (unmasked areas come from the 4x upscale).

Usage: python build_level1_bg.py <work_l1_dir> <p4_x4.png> <models_dir> <out.webp> [scale]
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inpaint import inpaint  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
EXT_T, EXT_B = 400, 120          # added rows above / below (direction-image pixels)


def cloud_stamp(p4_path, lama):
    """Cloud from panel 4 (4x). Small debris inside the cloud is painted over with LaMa before
    the cloud is keyed off the blue sky by its red channel."""
    im = np.asarray(Image.open(p4_path).convert("RGB").crop((7 * 4, 80 * 4, 80 * 4, 165 * 4))).copy()
    debris = np.zeros(im.shape[:2], np.uint8)
    for (x0, y0, x1, y1) in [(40, 195, 80, 235), (15, 260, 75, 320), (100, 330, 140, 340)]:
        debris[y0:y1, x0:x1] = 255
    im = inpaint(im, debris, lama)
    lo, hi = np.percentile(im[..., 0], 8), np.percentile(im[..., 0], 92)
    lo = lo + (hi - lo) * 0.25
    a = cv2.GaussianBlur(np.clip((im[..., 0].astype(np.float32) - lo) / (hi - lo), 0, 1), (0, 0), 1.0)
    for (x0, y0, x1, y1) in [(185, 0, 245, 40), (140, 0, 292, 20)]:   # sky debris above the cloud
        a[y0:y1, x0:x1] = 0
    a[:, 262:] = 0
    a = cv2.GaussianBlur(a, (0, 0), 2)
    a = a * a * (3 - 2 * a)            # smoothstep: no faint sky-coloured box around the cloud
    return np.dstack([im, (a * 255).astype(np.uint8)])


def stamp(canvas, cloud, width, cx, cy, flip=False, alpha=1.0, tint=None):
    im = cloud[:, ::-1] if flip else cloud
    sc = width / im.shape[1]
    nw, nh = int(im.shape[1] * sc), int(im.shape[0] * sc)
    im = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA).astype(np.float32)
    yy, xx = np.mgrid[0:nh, 0:nw].astype(np.float32)
    r = np.sqrt(((xx - nw / 2) / (nw / 2)) ** 2 + ((yy - nh / 2) / (nh / 2)) ** 2)
    edge = np.minimum(np.minimum(xx, nw - 1 - xx) / nw, np.minimum(yy, nh - 1 - yy) / nh)   # crop borders fade out
    a = np.clip(im[..., 3] / 255 * np.clip((1.0 - r) / 0.4, 0, 1) ** 0.7 * np.clip(edge / 0.14, 0, 1) * alpha, 0, 1)
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


def main(work, p4_path, models, out_path, scale="1.25"):
    K = float(scale)
    lama = os.path.join(models, "big-lama.pt")
    cloud = cloud_stamp(p4_path, lama)
    clean = np.asarray(Image.open(f"{work}/backdrop_clean.png").convert("RGB"))
    H1, W1 = clean.shape[:2]
    W, H = round(W1 * K), round(H1 * K)
    sharp = np.asarray(Image.open(f"{work}/direction_x4.png").convert("RGB").resize((W, H), Image.LANCZOS)).astype(np.float32)
    filled = cv2.resize(clean, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    m = cv2.imread(f"{work}/backdrop_mask.png", cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    m = cv2.GaussianBlur(cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 2 * K)[..., None]
    bd = sharp * (1 - m) + filled * m

    white = (np.array([250, 248, 255]), 0.35)
    # sea of clouds under the path (where the platforms were), far/small first, near/large last
    for w, cx, cy, fl, al in [(200, 700, 560, True, 0.9), (230, 620, 480, False, 0.95), (220, 820, 640, False, 0.95),
                              (260, 330, 600, True, 0.9), (240, 760, 780, True, 1.0), (300, 560, 700, False, 1.0),
                              (260, 820, 900, False, 1.0), (320, 330, 880, True, 1.0), (300, 700, 1000, True, 1.0),
                              (360, 640, 990, False, 1.05), (400, 420, 1180, True, 1.1), (440, 560, 1400, False, 1.15),
                              (380, 200, 1330, True, 1.1)]:
        stamp(bd, cloud, w * K, cx * K, cy * K, fl, al, white)

    et, eb = round(EXT_T * K), round(EXT_B * K)
    canvas = np.zeros((et + H + eb, W, 3), np.float32)
    canvas[et:et + H] = bd
    # sky above: a smooth gradient that meets the art's own top rows (blurred sideways so no
    # single column is stretched into a streak), cross-faded over the art's first rows
    top = cv2.GaussianBlur(bd[:round(16 * K)].mean(axis=0, keepdims=True), (0, 0), 60 * K)[0]
    t = np.linspace(0, 1, et, dtype=np.float32)[:, None, None]
    deep = np.array([12, 78, 205], np.float32)
    canvas[:et] = deep * (1 - t) + top[None] * t
    fade = round(40 * K)
    k = np.linspace(0, 1, fade, dtype=np.float32)[:, None, None]
    canvas[et:et + fade] = top[None] * (1 - k) + bd[:fade] * k
    # below: the foliage strip along the bottom of the art, mirrored (it sits behind the banner)
    band = bd[H - eb:H][::-1]
    shade = np.linspace(1.0, 0.8, eb, dtype=np.float32)[:, None, None]
    canvas[et + H:] = band * shade
    for w, cx, cy, fl in [(300, 130, 330, False), (340, 800, 280, True), (220, 480, 150, False)]:
        stamp(canvas, cloud, w * K, cx * K, cy * K, fl, 1.0, white)
    out = np.clip(canvas, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(out_path, quality=86, method=6)
    print("saved", out_path, out.shape)


if __name__ == "__main__":
    main(*sys.argv[1:6])
