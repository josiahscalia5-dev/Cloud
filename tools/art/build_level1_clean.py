"""Level 1 backdrop without the things the game draws live.

    python build_level1_clean.py <work_l1_dir> <models_dir>

Reads direction.png (941x1672) and direction_x4.png, removes the HUD, the platforms, the boy,
the pickups and the Rainbow Gate with LaMa (at 1x, where LaMa works best), and writes
backdrop_clean.png (1x) plus backdrop_mask.png (255 = filled) for build_level1_bg.py.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inpaint import inpaint  # noqa: E402
from l1_masks import HUD, PICKUPS, PLATFORMS, draw  # noqa: E402
from segment import get_mask_birefnet  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
S = 4
BOY = (170, 725, 510, 1215)
# Rainbow Gate outline (1x, same trace as build_level1_art.py, offset to the image)
GATE_BOX = (615, 235)
GATE_POLY = [(22, 330), (22, 110), (35, 75), (50, 45), (62, 75), (72, 110), (88, 80), (100, 60), (115, 75),
             (130, 45), (150, 20), (162, 5), (175, 20), (192, 45), (208, 70), (222, 58), (236, 78),
             (250, 108), (262, 72), (276, 40), (290, 72), (304, 110), (308, 330), (308, 380), (22, 380)]


def main(work, models):
    im = np.asarray(Image.open(os.path.join(work, "direction.png")).convert("RGB"))
    big = np.asarray(Image.open(os.path.join(work, "direction_x4.png")).convert("RGB"))
    H, W = im.shape[:2]
    m = draw((H, W), HUD + PLATFORMS + PICKUPS)

    # the boy: BiRefNet matte at 4x, brought back to 1x
    x0, y0, x1, y1 = BOY
    a = get_mask_birefnet(big[y0 * S:y1 * S, x0 * S:x1 * S], os.path.join(models, "birefnet.onnx"))
    a = cv2.resize(a, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], (a > 0.08).astype(np.uint8) * 255)

    g = np.zeros_like(m)
    cv2.fillPoly(g, [np.array([(x + GATE_BOX[0], y + GATE_BOX[1]) for x, y in GATE_POLY], np.int32)], 255)
    m = np.maximum(m, g)
    m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=5)

    out = inpaint(im, m, os.path.join(models, "big-lama.pt"))
    Image.fromarray(out).save(os.path.join(work, "backdrop_clean.png"))
    Image.fromarray(m).save(os.path.join(work, "backdrop_mask.png"))
    print("saved backdrop_clean.png", out.shape, "filled", round((m > 0).mean() * 100, 1), "%")


if __name__ == "__main__":
    main(*sys.argv[1:3])
