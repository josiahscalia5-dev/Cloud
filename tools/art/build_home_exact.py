"""Home screen background for the exact layout: reference panel 1 as painted, 4x.

    python tools/art/build_home_exact.py <work_dir>

Upscales panel 1 (Real-ESRGAN anime, as upscale.py) and keeps the reference screen inside the
mockup frame, with nothing removed or added: the UI pieces the game makes tappable or live
(game/public/assets/home/) sit exactly over their painted twins.
The level, coin and gem numbers are live: three small patches of the painted top bar with just
the digits removed (LaMa) go over them, and the game writes the numbers on the patches.
Needs <work_dir>/models/ (RealESRGAN_x4plus_anime_6B.pth, big-lama.pt).
Writes game/public/assets/home/bg_home.webp and num_*.webp.
"""
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
REF = os.path.join(ROOT, "art-source/rainbow_cascades_reference.png")
PANEL1 = (5, 5, 374, 562)
SCREEN = (14, 8, 1456, 2216)      # inside the mockup frame, 4x px (panel px 3.5, 2 .. 364, 554)
# painted numbers the game makes live: patch box (4x px) around the digits
NUMBERS = {"num_lvl": (318, 38, 396, 92), "num_coins": (704, 44, 928, 126), "num_gems": (1108, 44, 1244, 126)}


def main(work):
    src, x4 = os.path.join(work, "p1.png"), os.path.join(work, "p1_x4.png")
    if not os.path.exists(x4):
        Image.open(REF).convert("RGB").crop(PANEL1).save(src)
        subprocess.run([sys.executable, os.path.join(HERE, "upscale.py"),
                        os.path.join(work, "models/RealESRGAN_x4plus_anime_6B.pth"), src, x4], check=True)
    out = os.path.join(ROOT, "game/public/assets/home/bg_home.webp")
    Image.open(x4).convert("RGB").crop(SCREEN).save(out, quality=90, method=6)
    print("saved", out)

    sys.path.insert(0, HERE)
    from inpaint import inpaint
    im = np.asarray(Image.open(x4).convert("RGB"))
    m = 48                                                   # context around each patch for LaMa
    for name, (x0, y0, x1, y1) in NUMBERS.items():
        cx0, cy0, cx1, cy1 = max(0, x0 - m), max(0, y0 - m), x1 + m, y1 + m
        crop = im[cy0:cy1, cx0:cx1]
        hole = np.zeros(crop.shape[:2], np.uint8)
        region = crop[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]
        hole[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0] = (region.min(axis=2) > 165).astype(np.uint8) * 255
        hole = cv2.dilate(hole, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
        clean = inpaint(crop, hole, os.path.join(work, "models/big-lama.pt"))
        Image.fromarray(clean[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]).save(
            os.path.join(ROOT, f"game/public/assets/home/{name}.webp"), quality=92, method=6)
        print(name, "box (panel px):", [v / 4 for v in (x0, y0, x1, y1)])


if __name__ == "__main__":
    main(sys.argv[1])
