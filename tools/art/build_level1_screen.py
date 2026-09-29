"""Level 1 gameplay screen ("Jump on the matching colors") from panel 2 of the reference sheet.

    python tools/art/build_level1_screen.py <work_dir>

Needs in <work_dir>: models/ (RealESRGAN_x4plus_anime_6B.pth, big-lama.pt, birefnet.onnx, as in
pipeline.py). Steps, each cached in <work_dir>/l1s/:

1. upscale: crop panel 2 and upscale it 4x.
2. cut: the boy and two gems as sprites (BiRefNet / outlines), the pause button and the six
   colour orbs as HUD sprites.
3. clean: remove all of that, the HUD and the mockup frame from the scenery with LaMa. The jelly
   blocks stay painted in the scenery. The scenery is saved at the panel's own framing (3:5),
   nothing is added around it.
4. hud: the timer, coin, colour-sequence and instruction panels as painted. Only the text the game
   changes (timer, coins, "1/7") is removed, to be drawn live; "Follow the Color Sequence!" and
   the instruction stay as painted.

Writes game/public/assets/level1/.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
REF = os.path.join(ROOT, "art-source/rainbow_cascades_reference.png")
OUT = os.path.join(ROOT, "game/public/assets/level1")
sys.path.insert(0, HERE)

PANELS = {2: (388, 5, 723, 562)}

# Boxes in panel-2 pixels at 4x (x0, y0, x1, y1).
HUD = {
    "pause": (30, 22, 194, 186),
    "timer": (409, 27, 841, 146),
    "coins": (944, 27, 1311, 146),
    "seq": (99, 177, 1246, 478),
    "tip": (56, 1989, 1276, 2188),
}
# HUD panels cut as sprites: box, corner radius, region whose painted text is drawn live instead
HUD_PANELS = {"timer": ((414, 33, 835, 140), 53, (0, 0, 9999, 9999)),
              "coins": ((948, 33, 1304, 140), 53, (112, 0, 9999, 9999)),    # keeps the painted coin
              "seq": ((104, 185, 1240, 479), 40, (900, 120, 9999, 9999)),   # "1/7" only
              "tip": ((63, 1996, 1270, 2183), 40, None)}
ORB_Y, ORB_X, ORB_D = 383, (245, 384, 523, 662, 801, 941), 116
PAUSE = (34, 26, 190, 182)
# gem outlines (diamonds): top, right, bottom, left
GEMS = {"gem_l": [(551, 856), (604, 940), (560, 1006), (510, 930)],
        "gem_r": [(1067, 1049), (1133, 1147), (1062, 1246), (992, 1147)]}
BOY_BOX = (440, 850, 960, 1560)
SCREEN = (12, 8, 1326, 2212)   # the reference screen inside the mockup frame (4x px)
BOXES = {}                 # sprite -> box in panel pixels, for js/level1.js


def run(cmd):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def rrect_mask(shape, box, r, pad=0):
    m = np.zeros(shape[:2], np.uint8)
    x0, y0, x1, y1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    r = r + pad
    cv2.rectangle(m, (x0 + r, y0), (x1 - r, y1), 255, -1)
    cv2.rectangle(m, (x0, y0 + r), (x1, y1 - r), 255, -1)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        cv2.circle(m, (cx, cy), r, 255, -1)
    return m


def save_rgba(rgb, alpha, path, box=None):
    a = np.clip(alpha * 255, 0, 255).astype(np.uint8) if alpha.dtype != np.uint8 else alpha
    im = np.dstack([rgb, a])
    if box is None:
        ys, xs = np.where(a > 8)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        im = im[box[1]:box[3], box[0]:box[2]]
    Image.fromarray(im).save(path, quality=92, method=6)
    BOXES[os.path.basename(path).split(".")[0]] = [int(v) / 4 for v in box]
    return box


def step_upscale(work):
    d = os.path.join(work, "l1s")
    os.makedirs(d, exist_ok=True)
    ref = Image.open(REF).convert("RGB")
    for k, b in PANELS.items():
        src, dst = os.path.join(d, f"p{k}.png"), os.path.join(d, f"p{k}_x4.png")
        if not os.path.exists(dst):
            ref.crop(b).save(src)
            run([sys.executable, os.path.join(HERE, "upscale.py"),
                 os.path.join(work, "models/RealESRGAN_x4plus_anime_6B.pth"), src, dst])


def step_cut(work):
    """Masks for the boy and gems, sprites for everything the game draws live."""
    from segment import get_mask_birefnet
    d = os.path.join(work, "l1s")
    bir = os.path.join(work, "models/birefnet.onnx")
    im = np.asarray(Image.open(os.path.join(d, "p2_x4.png")).convert("RGB"))
    H, W = im.shape[:2]
    os.makedirs(OUT, exist_ok=True)
    masks = {}

    x0, y0, x1, y1 = BOY_BOX
    m = get_mask_birefnet(im[y0:y1, x0:x1], bir)
    full = np.zeros((H, W), np.float32)
    full[y0:y1, x0:x1] = m
    masks["boy"] = full
    box = save_rgba(im, full, os.path.join(OUT, "boy.webp"))
    print("boy box (4x px)", box)

    for name, poly in GEMS.items():
        full = np.zeros((H, W), np.uint8)
        cv2.fillPoly(full, [np.array(poly, np.int32)], 255, lineType=cv2.LINE_AA)
        full = cv2.dilate(full, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        full = cv2.GaussianBlur(full.astype(np.float32) / 255, (0, 0), 1.5)
        masks[name] = full
        box = save_rgba(im, full, os.path.join(OUT, f"{name}.webp"))
        print(name, "box (4x px)", box)

    # HUD artwork: pause button (rounded square), coin and colour orbs (circles)
    a = rrect_mask(im.shape, PAUSE, 34).astype(np.float32) / 255
    a = cv2.GaussianBlur(a, (0, 0), 1.2)
    save_rgba(im, a, os.path.join(OUT, "hud_pause.webp"))
    for i, cx in enumerate(ORB_X):
        a = np.zeros((H, W), np.float32)
        cv2.circle(a, (cx, ORB_Y), ORB_D // 2, 1.0, -1, lineType=cv2.LINE_AA)
        save_rgba(im, cv2.GaussianBlur(a, (0, 0), 1.0), os.path.join(OUT, f"orb{i}.webp"))
    np.savez_compressed(os.path.join(d, "masks.npz"), **masks)
    print("sprite boxes (panel px):", json.dumps(BOXES))


def step_clean(work):
    """Remove boy, gems, HUD and the mockup frame from the scenery (LaMa)."""
    from inpaint import inpaint
    d = os.path.join(work, "l1s")
    im = np.asarray(Image.open(os.path.join(d, "p2_x4.png")).convert("RGB"))
    H, W = im.shape[:2]
    masks = np.load(os.path.join(d, "masks.npz"))
    hole = np.zeros((H, W), np.uint8)
    for k in ("boy", "gem_l", "gem_r"):
        m = (masks[k] > 0.25).astype(np.uint8) * 255
        hole |= cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    for k, r in (("pause", 40), ("timer", 58), ("coins", 58), ("seq", 44), ("tip", 44)):
        hole |= rrect_mask(im.shape, HUD[k], r, pad=6)
    # mockup frame: outer border and its rounded corners
    frame = np.full((H, W), 255, np.uint8)
    frame[:] = 255 - rrect_mask(im.shape, SCREEN, 70)
    hole |= frame
    lama = os.path.join(work, "models/big-lama.pt")
    # big holes fill better at half size (LaMa's receptive field); keep full-res pixels elsewhere
    small = cv2.resize(im, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    hs = cv2.resize(hole, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
    fill = inpaint(small, hs, lama)
    fill = cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC)
    # small holes (boy, gems) again at full size for sharper texture
    body = np.zeros((H, W), np.uint8)
    for k in ("boy", "gem_l", "gem_r"):
        body |= cv2.dilate((masks[k] > 0.25).astype(np.uint8) * 255,
                           cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    base = np.where((hole > 127)[..., None] & ~(body > 127)[..., None], fill, im)
    sharp = inpaint(base, body, lama)
    out = np.where((body > 127)[..., None], sharp, base)
    soft = cv2.GaussianBlur((hole > 127).astype(np.float32), (0, 0), 2.0)[..., None]
    out = (im * (1 - soft) + out * soft).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(d, "p2_clean.png"))
    Image.fromarray(hole).save(os.path.join(d, "hole.png"))
    x0, y0, x1, y1 = SCREEN
    Image.fromarray(out[y0:y1, x0:x1]).save(os.path.join(OUT, "bg_level1.webp"), quality=90, method=6)
    print("bg_level1 box (panel px):", [x0 / 4, y0 / 4, x1 / 4, y1 / 4])


def step_hud(work):
    """HUD panels as painted, minus the text the game draws live (timer, coins, "1/7")."""
    from inpaint import inpaint
    d = os.path.join(work, "l1s")
    im = np.asarray(Image.open(os.path.join(d, "p2_x4.png")).convert("RGB"))
    lama = os.path.join(work, "models/big-lama.pt")
    for name, ((x0, y0, x1, y1), r, live) in HUD_PANELS.items():
        crop = im[y0:y1, x0:x1].copy()
        h, w = crop.shape[:2]
        hole = np.zeros((h, w), np.uint8)
        if live:
            inner = rrect_mask(crop.shape, (0, 0, w - 1, h - 1), r, pad=-14)
            keep = np.zeros_like(inner)
            keep[live[1]:live[3], live[0]:live[2]] = 255
            hole = (crop.min(axis=2) > 150).astype(np.uint8) * 255
            hole = cv2.dilate(hole, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) & inner & keep
        if name == "seq":
            for cx in ORB_X:                            # orbs are separate sprites
                cv2.circle(hole, (cx - x0, ORB_Y - y0), ORB_D // 2 + 8, 255, -1)
        clean = inpaint(crop, hole, lama) if hole.any() else crop
        a = rrect_mask(crop.shape, (0, 0, w - 1, h - 1), r).astype(np.float32) / 255
        a = cv2.GaussianBlur(a, (0, 0), 1.2)
        Image.fromarray(np.dstack([clean, (a * 255).astype(np.uint8)])).save(
            os.path.join(OUT, f"hud_{name}.webp"), quality=92, method=6)
        print("hud", name, (x0, y0, x1, y1))


if __name__ == "__main__":
    work = sys.argv[1]
    steps = sys.argv[2:] or ["upscale", "cut", "clean", "hud"]
    for s in steps:
        globals()["step_" + s](work)
