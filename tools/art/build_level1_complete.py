"""Level Complete card, cut from panel 10 of the reference.

    python build_level1_complete.py <p10_x4.png> <models_dir> <out_dir>

The three stars and the Next Level button are cut out as separate pieces (stars pop in one by
one, the button is tappable), and removed from the card with LaMa together with the reward rows,
which the game rebuilds as live text. Boxes are in panel pixels (287 x 445); output is 2x.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inpaint import inpaint  # noqa: E402

S = 4
OUT_SCALE = 2
STARS = [(34, 44, 104, 126), (106, 38, 182, 116), (184, 56, 254, 128)]
BUTTON = (36, 370, 252, 434, 30)          # x0, y0, x1, y1, corner radius
ROWS = (12, 212, 276, 376)


def save(rgb, alpha, path):
    im = Image.fromarray(np.dstack([rgb, (np.clip(alpha, 0, 1) * 255).astype(np.uint8)]))
    im = im.resize((im.width * OUT_SCALE // S, im.height * OUT_SCALE // S), Image.LANCZOS)
    im.save(path, quality=90, method=6)


def rrect(shape, x0, y0, x1, y1, r):
    m = np.zeros(shape, np.uint8)
    cv2.rectangle(m, (x0 + r, y0), (x1 - r, y1), 255, -1)
    cv2.rectangle(m, (x0, y0 + r), (x1, y1 - r), 255, -1)
    for cx, cy in [(x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)]:
        cv2.circle(m, (cx, cy), r, 255, -1)
    return m


def main(p10, models, out):
    os.makedirs(out, exist_ok=True)
    im = np.asarray(Image.open(p10).convert("RGB"))
    H, W = im.shape[:2]
    hole = np.zeros((H, W), np.uint8)

    # stars: bright gold on the dark sky, keyed by brightness + saturation, largest blob kept
    for i, (x0, y0, x1, y1) in enumerate(STARS):
        c = im[y0 * S:y1 * S, x0 * S:x1 * S]
        hsv = cv2.cvtColor(c, cv2.COLOR_RGB2HSV).astype(np.float32)
        key = ((hsv[..., 2] > 150) & (hsv[..., 0] < 40) & (hsv[..., 1] > 60)).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(key)
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        m = (lab == k).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        m = cv2.dilate(m, np.ones((5, 5), np.uint8), iterations=2)       # keep the orange outline + glow edge
        a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.5)
        save(c, a, os.path.join(out, f"star_{i + 1}.webp"))
        hole[y0 * S:y1 * S, x0 * S:x1 * S] = np.maximum(hole[y0 * S:y1 * S, x0 * S:x1 * S], cv2.dilate(m, np.ones((9, 9), np.uint8), iterations=3) * 255)

    # Next Level button
    x0, y0, x1, y1, r = BUTTON
    bm = rrect((H, W), x0 * S, y0 * S, x1 * S, y1 * S, r * S)
    a = cv2.GaussianBlur(bm.astype(np.float32) / 255, (0, 0), 2)
    b = (slice(y0 * S, y1 * S), slice(x0 * S, x1 * S))
    save(im[b], a[b], os.path.join(out, "btn_next.webp"))
    hole = np.maximum(hole, cv2.dilate(bm, np.ones((5, 5), np.uint8), iterations=3))

    # reward rows (rebuilt live by the game)
    x0, y0, x1, y1 = ROWS
    hole[y0 * S:y1 * S, x0 * S:x1 * S] = 255

    small = cv2.resize(im, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    fill = inpaint(small, cv2.resize(hole, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST), os.path.join(models, "big-lama.pt"))
    fill = cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC)
    card = np.where(hole[..., None] > 0, fill, im)
    save(card, np.ones((H, W), np.float32), os.path.join(out, "complete_card.webp"))
    print("level complete card written to", out)


if __name__ == "__main__":
    main(*sys.argv[1:4])
