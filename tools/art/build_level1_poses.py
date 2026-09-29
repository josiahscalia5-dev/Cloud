"""The boy's movement poses for the Level 1 screen, cut from the supplied reference drawings.

    python tools/art/build_level1_poses.py <work_dir>

Every pose is one of the supplied drawings of the boy, upscaled 4x (Real-ESRGAN anime) and cut out
(BiRefNet); nothing is redrawn. The pose at rest is the Level 1 panel's own boy (boy.webp, made by
build_level1_screen.py). Needs <work_dir>/models/ as in pipeline.py.

Writes game/public/assets/level1/pose_*.webp and prints each pose's size and foot point.
"""
import json
import os
import sys

import cv2
import numpy as np
import torch
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
OUT = os.path.join(ROOT, "game/public/assets/level1")
sys.path.insert(0, HERE)
from segment import get_mask_birefnet  # noqa: E402
from upscale import RRDBNet, upscale  # noqa: E402

GUIDE = os.path.join(ROOT, "art-source/level1_gameplay_guide.png")
SHEET = os.path.join(ROOT, "art-source/rainbow_cascades_reference.png")
# pose -> (source, 1x box, 1x boxes to blank before cutting: guide overlays next to the boy)
POSES = {
    # running left, the other leg forward from the panel's boy: guide, "correct" example 4
    "run_left_b": (GUIDE, (818, 783, 930, 928), [(872, 905, 930, 928)]),
    # the forward leap: the guide's own "Swipe Up" drawing (the green arrow's tip is blanked)
    "leap": (GUIDE, (253, 783, 377, 880), [(418, 862, 470, 880)]),
    # running straight ahead: the Rainbow Gate panel
    "run_ahead": (SHEET, (1035, 780, 1145, 910), []),
    # in the air, legs tucked: the Platforms Rotate panel
    "jump_air": (SHEET, (805, 280, 925, 420), []),
}


def foot_point(alpha):
    """Bottom-centre of the lowest foot: centre x of the opaque pixels in the bottom 4% rows."""
    ys, xs = np.where(alpha > 128)
    y1 = ys.max()
    band = ys >= y1 - max(2, int((y1 - ys.min()) * 0.04))
    return float(xs[band].mean()), float(y1 + 1)


def main(work):
    torch.set_num_threads(4)
    net = RRDBNet()
    sd = torch.load(os.path.join(work, "models/RealESRGAN_x4plus_anime_6B.pth"), map_location="cpu")
    net.load_state_dict(sd.get("params_ema", sd))
    net.eval()
    meta = {}
    for name, (src, box, blanks) in POSES.items():
        im = Image.open(src).convert("RGB")
        x4 = np.asarray(upscale(net, im.crop(box)))
        m = get_mask_birefnet(x4, os.path.join(work, "models/birefnet.onnx"))
        for bx0, by0, bx1, by1 in blanks:
            m[(by0 - box[1]) * 4:(by1 - box[1]) * 4, (bx0 - box[0]) * 4:(bx1 - box[0]) * 4] = 0
        n, lab, stats, _ = cv2.connectedComponentsWithStats((m > 0.5).astype(np.uint8))
        keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        m = m * cv2.dilate((lab == keep).astype(np.uint8), np.ones((7, 7), np.uint8))
        a = (np.clip(m, 0, 1) * 255).astype(np.uint8)
        ys, xs = np.where(a > 8)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        rgba = np.dstack([x4, a])[y0:y1, x0:x1]
        Image.fromarray(rgba).save(os.path.join(OUT, f"pose_{name}.webp"), quality=92, method=6)
        fx, fy = foot_point(rgba[..., 3])
        meta[name] = {"w": (x1 - x0) / 4, "h": (y1 - y0) / 4, "foot": [round(fx / 4, 2), round(fy / 4, 2)]}
        print(name, meta[name], flush=True)
    # the panel's own boy, for reference (not rewritten here)
    boy = np.asarray(Image.open(os.path.join(OUT, "boy.webp")).convert("RGBA"))
    fx, fy = foot_point(boy[..., 3])
    meta["rest"] = {"w": boy.shape[1] / 4, "h": boy.shape[0] / 4, "foot": [round(fx / 4, 2), round(fy / 4, 2)]}
    print("rest", meta["rest"])
    print(json.dumps(meta))


if __name__ == "__main__":
    main(sys.argv[1])
