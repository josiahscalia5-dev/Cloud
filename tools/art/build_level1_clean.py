"""Level 1 backdrop without the things the game draws live.

    python build_level1_clean.py <work_l1_dir> <models_dir>

Reads work_l1_dir/direction.png (941x1672) and removes, with LaMa, the HUD, the platforms,
the pickups, the boy (BiRefNet matte, grown) and the Rainbow Gate (the outline traced in
build_level1_art.py). Writes work_l1_dir/backdrop_clean.png at the same size.
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

BOY = (170, 725, 510, 1215)
GATE_ORIGIN = (615, 235)
# Rainbow Gate outline, relative to GATE_ORIGIN (same trace as build_level1_art.py).
GATE_POLY = [(22, 330), (22, 110), (35, 75), (50, 45), (62, 75), (72, 110), (88, 80), (100, 60), (115, 75),
             (130, 45), (150, 20), (162, 5), (175, 20), (192, 45), (208, 70), (222, 58), (236, 78),
             (250, 108), (262, 72), (276, 40), (290, 72), (304, 110), (308, 330), (308, 380), (22, 380)]


def main(work, models):
    img = np.asarray(Image.open(os.path.join(work, "direction.png")).convert("RGB"))
    m = draw(img.shape[:2], HUD + PLATFORMS + PICKUPS, grow=3)

    x0, y0, x1, y1 = BOY
    a = get_mask_birefnet(img[y0:y1, x0:x1], os.path.join(models, "birefnet.onnx"))
    boy = (a > 0.08).astype(np.uint8) * 255
    boy = cv2.dilate(boy, np.ones((3, 3), np.uint8), iterations=6)
    m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], boy)

    poly = (np.array(GATE_POLY) + np.array(GATE_ORIGIN)).astype(np.int32)
    g = np.zeros_like(m)
    cv2.fillPoly(g, [poly], 255)
    m = np.maximum(m, cv2.dilate(g, np.ones((3, 3), np.uint8), iterations=5))

    Image.fromarray(m).save(os.path.join(work, "backdrop_mask.png"))
    # LaMa at half size: the holes are large, and at this scale it continues the islands and
    # clouds instead of smearing them. The fill is scaled back up; untouched pixels are kept.
    h, w = m.shape
    fill = inpaint(cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA),
                   cv2.resize(m, (w // 2, h // 2), interpolation=cv2.INTER_NEAREST),
                   os.path.join(models, "big-lama.pt"))
    fill = cv2.resize(fill, (w, h), interpolation=cv2.INTER_CUBIC)
    clean = img.copy()
    clean[m > 0] = fill[m > 0]
    Image.fromarray(clean).save(os.path.join(work, "backdrop_clean.png"))
    print("saved", os.path.join(work, "backdrop_clean.png"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
