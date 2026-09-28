"""Build the phone-height home-screen background from panel 1 of the reference image.

Panel 1 is wider than any modern phone (about 2:3), so the art is:
  1. cleaned: the painted UI (top bar, title, menu, PLAY, nav) is removed with LaMa so the
     UI can be rebuilt as live elements on top,
  2. upscaled 4x with Real-ESRGAN (anime model),
  3. extended upward with sky matched to the art's own colours, plus floating islands cut
     out of the other reference panels, so tall 19.5:9-21:9 screens are filled.

Usage: python build_home_bg.py <work_dir> <out.webp>
work_dir must contain: crops/p1.png (1x panel 1), models/*.pth|*.pt, islands/*.png + *_bir.npy
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from inpaint import inpaint  # noqa: E402
from p1_masks import mask as ui_mask  # noqa: E402

# Inner art rectangle of panel 1 (inside the white panel frame), 1x panel pixels.
IX0, IY0, IX1, IY1 = 7, 7, 362, 550
X_LEFT, X_RIGHT = 5, 365        # horizontal span of the output, 1x panel pixels
EXT_T, EXT_B = 320, 30          # extension above / below, 1x panel pixels
S = 4                           # working scale


def esrgan(img, work):
    import torch
    from upscale import RRDBNet, upscale
    net = RRDBNet()
    sd = torch.load(os.path.join(work, "models/RealESRGAN_x4plus_anime_6B.pth"), map_location="cpu")
    net.load_state_dict(sd.get("params_ema", sd))
    net.eval()
    return np.asarray(upscale(net, Image.fromarray(img)))


def smooth_noise(h, w, scale, seed):
    rng = np.random.default_rng(seed)
    n = rng.random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    return cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)


def cloud_layer(h, w, seed, puffs):
    """Soft painterly cumulus: overlapping shaded discs. Returns (rgb, alpha) float arrays."""
    rng = np.random.default_rng(seed)
    alpha = np.zeros((h, w), np.float32)
    shade = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for cx, cy, r in puffs:
        for _ in range(9):
            px = cx + rng.normal(0, r * 0.55)
            py = cy + rng.normal(0, r * 0.18)
            pr = r * rng.uniform(0.35, 0.7)
            d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2) / pr
            a = np.clip(1.25 - d, 0, 1) ** 0.8
            alpha = np.maximum(alpha, a)
            # lit from the top: lighter where (yy - py) is negative
            shade = np.maximum(shade, a * np.clip(0.55 - (yy - py) / (pr * 1.6), 0, 1))
    alpha = cv2.GaussianBlur(alpha, (0, 0), 3)
    shade = cv2.GaussianBlur(shade, (0, 0), 6)
    lav = np.array([214, 196, 240], np.float32)
    white = np.array([255, 252, 255], np.float32)
    rgb = lav[None, None] * (1 - shade[..., None]) + white[None, None] * shade[..., None]
    return rgb, alpha


def main(work, out_path):
    p1 = np.asarray(Image.open(os.path.join(work, "crops/p1.png")).convert("RGB"))
    m = np.asarray(ui_mask((p1.shape[1], p1.shape[0]), grow=2)).copy()
    for (x0, y0) in [(0, 0), (p1.shape[1] - 16, 0), (0, p1.shape[0] - 16), (p1.shape[1] - 16, p1.shape[0] - 16)]:
        m[y0:y0 + 16, x0:x0 + 16] = 255
    clean = inpaint(p1, m, os.path.join(work, "models/big-lama.pt"))[IY0:IY1, IX0:IX1]
    clean = cv2.copyMakeBorder(clean, 0, 0, IX0 - X_LEFT, X_RIGHT - IX1, cv2.BORDER_REFLECT)
    art = esrgan(clean, work).astype(np.float32)          # (543*4, 355*4)
    ah, aw = art.shape[:2]

    et, eb = EXT_T * S, EXT_B * S
    H = et + ah + eb
    canvas = np.zeros((H, aw, 3), np.float32)

    # --- sky gradient, matched per column to the top rows of the art -----------------------
    top_c = np.array([8, 88, 212], np.float32)
    mid_c = np.array([22, 128, 246], np.float32)
    band = art[10 * S:40 * S].mean(axis=0)                          # colour under the seam, per column
    band = cv2.GaussianBlur(band[None], (0, 0), 40)[0]
    t = np.linspace(0, 1, et, dtype=np.float32)[:, None, None]
    sky = np.where(t < 0.55, top_c + (mid_c - top_c) * (t / 0.55),
                   mid_c + (band[None] - mid_c) * ((t - 0.55) / 0.45))
    n = smooth_noise(et, aw, 90, 3)[..., None]
    sky = sky + (n - 0.5) * 14
    canvas[:et] = sky

    ca = np.zeros((et, aw), np.float32)
    crgb = np.zeros((et, aw, 3), np.float32)
    # --- art, cross-faded into the sky over its (cleaned) top rows ------------------------
    canvas[et:et + ah] = art
    fade = 34 * S
    w = np.linspace(0, 1, fade, dtype=np.float32)[:, None, None] ** 1.2
    canvas[et:et + fade] = sky_tail = canvas[et - 1:et].copy() * 0  # placeholder to keep shapes
    ext_last = np.concatenate([sky, np.repeat(sky[-1:], fade, axis=0)])[et:et + fade]
    ext_last = ext_last * (1 - ca[-1:, :, None] * 0.85) + crgb[-1:] * ca[-1:, :, None] * 0.85
    canvas[et:et + fade] = ext_last * (1 - w) + art[:fade] * w

    # --- below the nav: mirror the last rows (hidden behind nav / gesture area) -------------
    canvas[et + ah:] = art[-1:-eb - 1:-1] if eb <= ah else art[-1]

    # --- floating islands cut from other panels, straddling the seam -----------------------
    def place(key, width_p, cx_p, bottom_p):
        im = np.asarray(Image.open(os.path.join(work, f"islands/{key}.png")).convert("RGB")).astype(np.float32)
        a = np.load(os.path.join(work, f"islands/{key}_bir.npy")).astype(np.float32)
        a = np.clip((a - 0.1) / 0.8, 0, 1)
        sc = width_p * S / im.shape[1]
        nw, nh = int(im.shape[1] * sc), int(im.shape[0] * sc)
        im = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
        a = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_AREA)
        x0 = int(cx_p * S - nw / 2)
        y1 = et + int(bottom_p * S)
        y0 = y1 - nh
        sx0, sy0 = max(0, -x0), max(0, -y0)
        sx1, sy1 = min(nw, aw - x0), min(nh, H - y0)
        reg = canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
        aa = a[sy0:sy1, sx0:sx1, None]
        canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = reg * (1 - aa) + im[sy0:sy1, sx0:sx1] * aa

    # clouds cut from the reference (panel 4, keyed off the blue sky), stamped behind islands
    cl = np.asarray(Image.open(os.path.join(work, "clouds/c4l_clean.png")).convert("RGBA")).astype(np.float32)

    def stamp(width_p, cx_p, cy_p, flip=False, alpha=1.0):
        im = cl[:, ::-1] if flip else cl
        sc = width_p * S / im.shape[1]
        nw, nh = int(im.shape[1] * sc), int(im.shape[0] * sc)
        im = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
        yy, xx = np.mgrid[0:nh, 0:nw].astype(np.float32)
        r = np.sqrt(((xx - nw / 2) / (nw / 2)) ** 2 + ((yy - nh / 2) / (nh / 2)) ** 2)
        fall = np.clip((1.0 - r) / 0.4, 0, 1) ** 0.7
        a = np.clip(im[..., 3] / 255 * fall * alpha, 0, 1)
        x0, y0 = int(cx_p * S - nw / 2), et + int(cy_p * S - nh / 2)
        sx0, sy0 = max(0, -x0), max(0, -y0)
        sx1, sy1 = min(nw, aw - x0), min(nh, H - y0)
        reg = canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
        aa = a[sy0:sy1, sx0:sx1, None]
        canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = reg * (1 - aa) + im[sy0:sy1, sx0:sx1, :3] * aa

    # alpha > 1 makes a stamp fully opaque in its core, used where it has to hide the
    # repainted tops of castles that sat behind the title in the mockup
    for w_, cx, cy, fl, al in [(150, 40, -150, False, 0.9), (140, 330, -170, True, 0.9),
                               (170, 180, -40, False, 0.85), (175, 45, 48, True, 1.9), (160, 305, 50, False, 1.5),
                               (120, 185, 70, True, 0.75)]:
        stamp(w_, cx - X_LEFT, cy, fl, al)
    for key, wp, cx, by in [("p8a", 58, 200, -48), ("p3a", 104, 40, 4), ("p9a", 86, 320, -2)]:
        if os.path.exists(os.path.join(work, f"islands/{key}.png")):
            place(key, wp, cx - X_LEFT, by)

    out = np.clip(canvas, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(out_path.replace(".webp", "_4x.png"))
    tw = 1152
    Image.fromarray(out).resize((tw, int(H * tw / aw)), Image.LANCZOS).save(out_path, quality=88, method=6)
    print("saved", out_path, out.shape)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
