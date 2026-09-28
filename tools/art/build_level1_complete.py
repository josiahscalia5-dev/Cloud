"""Level Complete card from panel 10 of the reference image.

    python build_level1_complete.py <p10_x4.png> <models_dir> <out_dir>

p10_x4.png is panel 10 cut from the 4x Real-ESRGAN reference (1148 x 1780). The three stars, the
rewards table and the Next Level button are lifted off (LaMa fills the space behind them) so
the game can animate the stars, write the real rewards and make the button tappable. The card
keeps its painted title, the cheering boy and the white frame. complete.json has each piece's
box in card pixels (the card is saved at CARD_SCALE of the 4x panel).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inpaint import inpaint  # noqa: E402

CARD_SCALE = 0.75
FRAME_R = 46                                     # outer corner radius of the white frame
STARS = {"star_l": (150, 250, 398, 494), "star_m": (442, 192, 708, 454), "star_r": (752, 250, 1002, 498)}
TABLE = (56, 858, 1094, 1494, 34)                # rounded box: x0, y0, x1, y1, radius
BUTTON = (150, 1492, 1000, 1724)


def rrect(shape, x0, y0, x1, y1, r):
    m = np.zeros(shape, np.uint8)
    cv2.rectangle(m, (x0 + r, y0), (x1 - r, y1), 255, -1)
    cv2.rectangle(m, (x0, y0 + r), (x1, y1 - r), 255, -1)
    for cx, cy in [(x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)]:
        cv2.circle(m, (cx, cy), r, 255, -1)
    return m


def star_matte(rgb):
    """Bright yellow / orange star with its glow, keyed off the dark night sky."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    core = ((h > 15) & (h < 70) & (s > 0.3) & (v > 0.72)) | ((s < 0.35) & (v > 0.93))
    lab, n = ndi.label(core)
    if n:
        sizes = ndi.sum(core, lab, range(1, n + 1))
        core = lab == (1 + int(np.argmax(sizes)))
    core = ndi.binary_fill_holes(core)
    core = ndi.binary_opening(core, iterations=2)
    a = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 2.0)
    glow = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 10) * 0.6
    return np.clip(np.maximum(a, glow * (v > 0.35)), 0, 1)


def save_rgba(rgb, a, path, k):
    im = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]))
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(path, quality=90, method=6)


def main(p10, models, out):
    os.makedirs(out, exist_ok=True)
    card = np.asarray(Image.open(p10).convert("RGB")).copy()
    H, W = card.shape[:2]
    hole = np.zeros((H, W), np.uint8)
    info = {}

    for name, (x0, y0, x1, y1) in STARS.items():
        crop = card[y0:y1, x0:x1]
        a = star_matte(crop)
        save_rgba(crop, a, os.path.join(out, f"{name}.webp"), CARD_SCALE)
        hole[y0:y1, x0:x1] = np.maximum(hole[y0:y1, x0:x1], ((a > 0.08) * 255).astype(np.uint8))
        # a dim, empty star for stars the player did not earn
        grey = cv2.cvtColor(cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY), cv2.COLOR_GRAY2RGB).astype(np.float32)
        dim = np.clip(grey * np.array([0.42, 0.42, 0.62]) + np.array([18, 16, 40]), 0, 255).astype(np.uint8)
        save_rgba(dim, a * 0.9, os.path.join(out, f"{name}_empty.webp"), CARD_SCALE)
        info[name] = [round(v * CARD_SCALE, 1) for v in (x0, y0, x1, y1)]

    bx0, by0, bx1, by1 = BUTTON
    crop = card[by0:by1, bx0:bx1]
    hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV).astype(np.float32)
    btn = (((hsv[..., 0] * 2 > 60) & (hsv[..., 0] * 2 < 160) & (hsv[..., 1] > 90)) | (hsv[..., 2] > 225)
           | ((hsv[..., 0] * 2 > 60) & (hsv[..., 0] * 2 < 160) & (hsv[..., 2] > 60)))
    btn = ndi.binary_fill_holes(ndi.binary_closing(btn, iterations=4))
    lab, n = ndi.label(btn)
    btn = lab == (1 + int(np.argmax(ndi.sum(btn, lab, range(1, n + 1)))))
    a = cv2.GaussianBlur(ndi.binary_opening(btn, iterations=3).astype(np.float32), (0, 0), 1.6)
    save_rgba(crop, a, os.path.join(out, "btn_next.webp"), CARD_SCALE)
    hole[by0:by1, bx0:bx1] = np.maximum(hole[by0:by1, bx0:bx1], ((a > 0.05) * 255).astype(np.uint8))
    info["btn_next"] = [round(v * CARD_SCALE, 1) for v in BUTTON]

    tx0, ty0, tx1, ty1, tr = TABLE
    hole = np.maximum(hole, rrect((H, W), tx0, ty0, tx1, ty1, tr))
    info["table"] = [round(v * CARD_SCALE, 1) for v in TABLE]
    hole = cv2.dilate(hole, np.ones((3, 3), np.uint8), iterations=6)
    hole[:, :14] = 0
    hole[:, W - 14:] = 0
    hole[H - 14:] = 0

    half = (W // 2, H // 2)
    fill = inpaint(cv2.resize(card, half, interpolation=cv2.INTER_AREA),
                   cv2.resize(hole, half, interpolation=cv2.INTER_NEAREST), os.path.join(models, "big-lama.pt"))
    fill = cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC)
    soft = cv2.GaussianBlur(hole.astype(np.float32) / 255, (0, 0), 2)[..., None]
    card = (fill * soft + card * (1 - soft)).astype(np.uint8)

    frame = cv2.GaussianBlur(rrect((H, W), 1, 1, W - 2, H - 2, FRAME_R).astype(np.float32) / 255, (0, 0), 1.2)
    save_rgba(card, frame, os.path.join(out, "card.webp"), CARD_SCALE)
    info["card"] = [round(W * CARD_SCALE), round(H * CARD_SCALE)]
    with open(os.path.join(out, "complete.json"), "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main(*sys.argv[1:4])
