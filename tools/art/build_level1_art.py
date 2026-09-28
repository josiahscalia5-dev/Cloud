"""Cut the Level 1 sprites and HUD pieces out of the Level 1 direction image.

    python build_level1_art.py <work_l1_dir> <models_dir> <out_dir>

work_l1_dir must hold direction.png (941x1672) and direction_x4.png (Real-ESRGAN 4x).
Sprites are saved at 1.5x the direction image's scale (enough for a 1440 px wide phone), the
gate at 3x (it grows as the boy nears it), HUD pieces at 2x. layout.json records each piece's box in direction-image pixels.
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
S = 4  # scale of direction_x4.png


def save_rgba(rgb, alpha, path, scale):
    """rgb/alpha at 4x -> trim to alpha bbox -> resize to `scale` x of the 1x image -> webp."""
    ys, xs = np.where(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb[y0:y1, x0:x1], (np.clip(alpha[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8)])
    im = Image.fromarray(rgba)
    k = scale / S
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im.save(path, quality=92, method=6)
    return x0, y0, x1, y1


def main(work, models, out):
    os.makedirs(out, exist_ok=True)
    big = np.asarray(Image.open(os.path.join(work, "direction_x4.png")).convert("RGB"))
    bir = os.path.join(models, "birefnet.onnx")
    layout = {}

    def box4(b):
        return big[b[1] * S:b[3] * S, b[0] * S:b[2] * S]

    def record(name, b, bb):
        layout[name] = [b[0] + bb[0] / S, b[1] + bb[1] / S, b[0] + bb[2] / S, b[1] + bb[3] / S]

    # --- world sprites (BiRefNet mattes at 4x) -----------------------------------------------
    for name, b, thr in [("boy_jump", (170, 725, 510, 1215), 0.12), ("coin", (568, 562, 648, 668), 0.2),
                         ("gem_purple", (460, 630, 560, 770), 0.2), ("gem_blue", (80, 1010, 200, 1185), 0.2)]:
        rgb = box4(b)
        a = get_mask_birefnet(rgb, bir)
        a = np.clip((a - thr) / (1 - 2 * thr), 0, 1)
        record(name, b, save_rgba(rgb, a, os.path.join(out, f"{name}.webp"), 1.5))

    # --- Rainbow Gate: traced outline (it stands on an island, so no natural matte edge) --
    from inpaint import inpaint
    from scipy import ndimage as ndi
    gb = (615, 235, 941, 660)
    rgb = box4(gb).copy()
    cm = np.zeros(rgb.shape[:2], np.uint8)
    for cx, cy, r in [(605, 615, 44), (715, 590, 27), (748, 575, 20), (765, 565, 15)]:   # coins in front
        cv2.circle(cm, (int((cx - gb[0]) * S), int((cy - gb[1]) * S)), int(r * S), 255, -1)
    small = cv2.resize(rgb, (rgb.shape[1] // 2, rgb.shape[0] // 2), interpolation=cv2.INTER_AREA)
    fill = inpaint(small, cv2.resize(cm, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST),
                   os.path.join(models, "big-lama.pt"))
    fill = cv2.resize(fill, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
    rgb[cm > 0] = fill[cm > 0]
    poly = np.array([(22, 330), (22, 110), (35, 75), (50, 45), (62, 75), (72, 110), (88, 80), (100, 60), (115, 75),
                     (130, 45), (150, 20), (162, 5), (175, 20), (192, 45), (208, 70), (222, 58), (236, 78),
                     (250, 108), (262, 72), (276, 40), (290, 72), (304, 110), (308, 330), (308, 380),
                     (22, 380)], np.float32) * S
    m = np.zeros(rgb.shape[:2], np.float32)
    cv2.fillPoly(m, [poly.astype(np.int32)], 1.0)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    Hh, Sa, V = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    sky = ((Hh > 185) & (Hh < 250) & (Sa < 0.62) & (V > 0.78)) | ((Sa < 0.2) & (V > 0.82))
    sky[int(200 * S):] = False                      # only above the arch
    lab, n = ndi.label(sky)
    edge = set(np.unique(lab[0])) | set(np.unique(lab[:, 0])) | set(np.unique(lab[:, -1]))
    outside = m < 0.5
    edge |= set(np.unique(lab[outside & sky]))       # sky regions touching the polygon's outside
    edge.discard(0)
    m[np.isin(lab, list(edge))] = 0
    m = ndi.binary_opening(m > 0.5, iterations=3).astype(np.float32)
    yy = np.arange(rgb.shape[0])[:, None] / S
    m = m * np.clip((372 - yy) / 60, 0, 1)          # base fades into the light at the threshold
    xx = np.arange(rgb.shape[1])[None, :] / S
    m = m * np.clip((xx - 22) / 26, 0, 1) * np.clip((308 - xx) / 26, 0, 1)   # side towers fade, no hard cut
    m = cv2.GaussianBlur(m, (0, 0), 2.4)
    record("gate", gb, save_rgba(rgb, m, os.path.join(out, "gate.webp"), 3))   # 3x: it grows as the boy nears it

    # --- HUD pieces ----------------------------------------------------------------------
    def disc(shape, cx, cy, r, soft=1.5):
        yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        return np.clip((r - d) / soft + 0.5, 0, 1)

    # stopwatch: BiRefNet on a padded crop
    sb = (246, 6, 326, 100)
    rgb = box4(sb)
    shape = np.maximum(disc(rgb.shape, (285 - sb[0]) * S, (56 - sb[1]) * S, 30.5 * S, 3),
                       np.maximum(disc(rgb.shape, (286 - sb[0]) * S, (19 - sb[1]) * S, 9 * S, 3),
                                  np.maximum(disc(rgb.shape, (262 - sb[0]) * S, (27 - sb[1]) * S, 7 * S, 3),
                                             disc(rgb.shape, (308 - sb[0]) * S, (27 - sb[1]) * S, 7 * S, 3))))
    a = np.minimum(shape, np.clip((get_mask_birefnet(rgb, bir) - 0.2) / 0.6, 0, 1))
    record("hud_stopwatch", sb, save_rgba(rgb, a, os.path.join(out, "hud_stopwatch.webp"), 2))
    # star coin in the HUD
    cb = (486, 18, 556, 90)
    rgb = box4(cb)
    record("hud_coin", cb, save_rgba(rgb, disc(rgb.shape, 34.5 * S, 35.5 * S, 30.5 * S, 2.5), os.path.join(out, "hud_coin.webp"), 2))
    # gem in the HUD (soft oval: its glow sits on the dark pill)
    gb2 = (678, 14, 748, 94)
    rgb = box4(gb2)
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]].astype(np.float32)
    r = np.sqrt(((xx - 35 * S) / (34 * S)) ** 2 + ((yy - 40 * S) / (39 * S)) ** 2)
    record("hud_gem", gb2, save_rgba(rgb, np.clip((1 - r) / 0.3, 0, 1), os.path.join(out, "hud_gem.webp"), 2))
    # player avatar (round badge)
    ab = (2, 6, 96, 100)
    rgb = box4(ab)
    record("hud_avatar", ab, save_rgba(rgb, disc(rgb.shape, 46 * S, 46 * S, 43 * S, 2.5), os.path.join(out, "hud_avatar.webp"), 2))
    # pause button (rounded square, measured)
    pb = (848, 10, 936, 98)
    rgb = box4(pb)
    m = np.zeros(rgb.shape[:2], np.uint8)
    x0, y0, x1, y1, rr = 5 * S, 5 * S, 83 * S, 83 * S, 17 * S
    cv2.rectangle(m, (x0 + rr, y0), (x1 - rr, y1), 1, -1)
    cv2.rectangle(m, (x0, y0 + rr), (x1, y1 - rr), 1, -1)
    for cx, cy in [(x0 + rr, y0 + rr), (x1 - rr, y0 + rr), (x0 + rr, y1 - rr), (x1 - rr, y1 - rr)]:
        cv2.circle(m, (cx, cy), rr, 1, -1)
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2)
    record("hud_pause", pb, save_rgba(rgb, a, os.path.join(out, "hud_pause.webp"), 2))

    # colour-sequence orbs (glossy spheres with glowing rings)
    for name, cx in [("orb_red", 205), ("orb_yellow", 301), ("orb_blue", 394), ("orb_green", 487.5),
                     ("orb_purple", 580), ("orb_pink", 672.5)]:
        ob = (int(cx - 36), 175, int(cx + 36), 247)
        rgb = box4(ob)
        c = (cx - ob[0]) * S
        record(name, ob, save_rgba(rgb, disc(rgb.shape, c, 36 * S, 33.5 * S, 3), os.path.join(out, f"{name}.webp"), 2))

    # --- foreground bush: soft corner of out-of-focus foliage, drawn in front of the platforms
    fb = (0, 1330, 300, 1672)
    clean = np.asarray(Image.open(os.path.join(work, "backdrop_clean.png")).convert("RGB"))
    rgb = cv2.resize(clean[fb[1]:fb[3], fb[0]:fb[2]], ((fb[2] - fb[0]) * S, (fb[3] - fb[1]) * S), interpolation=cv2.INTER_CUBIC)
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]].astype(np.float32) / S
    r = np.sqrt((xx / 235) ** 2 + ((342 - yy) / 300) ** 2)
    a = np.clip((1.0 - r) / 0.45, 0, 1) ** 1.3
    record("fg_bush", fb, save_rgba(rgb, a, os.path.join(out, "fg_bush.webp"), 1.5))

    with open(os.path.join(out, "layout.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout))


if __name__ == "__main__":
    main(*sys.argv[1:4])
