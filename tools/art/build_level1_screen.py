"""Level 1 gameplay screen ("Jump on the matching colors") from panel 2 of the reference sheet.

    python tools/art/build_level1_screen.py <work_dir>

Needs in <work_dir>: models/ (RealESRGAN_x4plus_anime_6B.pth, big-lama.pt, birefnet.onnx, as in
pipeline.py). Steps, each cached in <work_dir>/l1s/:

1. upscale: crop panel 2 (plus panels 3 and 9 for islands, 4 for a cloud) and upscale 4x.
2. cut: the boy and two gems as sprites (BiRefNet / outlines), the pause button and the six
   colour orbs as HUD sprites.
3. clean: remove all of that, the HUD and the mockup frame from the scenery with LaMa. The jelly
   blocks stay painted in the scenery.
4. hud: the timer, coin, colour-sequence and instruction panels with their painted text removed
   (the game writes live text over them).
5. islands, extend: the panel is 3:5; phones are ~9:20. Extend the scenery upward with sky,
   clouds, confetti and floating islands cut from the other gameplay panels, so a tall phone
   shows more sky rather than a blank band.

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

PANELS = {2: (388, 5, 723, 562), 3: (733, 5, 1020, 562), 4: (1030, 5, 1277, 562),
          9: (940, 573, 1234, 1018)}
# Floating islands for the taller sky: panel, 1x box in that panel.
ISLANDS = {"iA": (9, (4, 36, 76, 130)), "iB": (9, (212, 26, 294, 124)), "iC": (3, (10, 26, 114, 150))}

# Boxes in panel-2 pixels at 4x (x0, y0, x1, y1).
HUD = {
    "pause": (30, 22, 194, 186),
    "timer": (409, 27, 841, 146),
    "coins": (944, 27, 1311, 146),
    "seq": (99, 177, 1246, 478),
    "tip": (56, 1989, 1276, 2188),
}
# HUD panels cut as sprites with their painted text removed: box, corner radius
HUD_PANELS = {"timer": ((414, 33, 835, 140), 53), "coins": ((948, 33, 1304, 140), 53),
              "seq": ((104, 185, 1240, 479), 40), "tip": ((63, 1996, 1270, 2183), 40)}
ORB_Y, ORB_X, ORB_D = 383, (245, 384, 523, 662, 801, 941), 116
PAUSE = (34, 26, 190, 182)
# gem outlines (diamonds): top, right, bottom, left
GEMS = {"gem_l": [(551, 856), (604, 940), (560, 1006), (510, 930)],
        "gem_r": [(1067, 1049), (1133, 1147), (1062, 1246), (992, 1147)]}
BOY_BOX = (440, 850, 960, 1560)
EXT_TOP = 240 * 4          # rows of sky added above the panel (4x px)
EXT_BOT = 24 * 4           # rows added below (under the gesture bar)
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
    frame[:] = 255 - rrect_mask(im.shape, (12, 8, W - 14, H - 16), 70)
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


def step_hud(work):
    """HUD panels without their painted text (the game writes live text over them)."""
    from inpaint import inpaint
    d = os.path.join(work, "l1s")
    im = np.asarray(Image.open(os.path.join(d, "p2_x4.png")).convert("RGB"))
    lama = os.path.join(work, "models/big-lama.pt")
    for name, ((x0, y0, x1, y1), r) in HUD_PANELS.items():
        crop = im[y0:y1, x0:x1].copy()
        h, w = crop.shape[:2]
        inner = rrect_mask(crop.shape, (0, 0, w - 1, h - 1), r, pad=-14)
        text = (crop.min(axis=2) > 150).astype(np.uint8) * 255
        if name == "coins":
            inner[:, :112] = 0                          # keep the painted coin
        if name == "seq":
            for cx in ORB_X:                            # orbs are separate sprites
                cv2.circle(text, (cx - x0, ORB_Y - y0), ORB_D // 2 + 8, 255, -1)
        text = cv2.dilate(text, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) & inner
        clean = inpaint(crop, text, lama)
        a = rrect_mask(crop.shape, (0, 0, w - 1, h - 1), r).astype(np.float32) / 255
        a = cv2.GaussianBlur(a, (0, 0), 1.2)
        Image.fromarray(np.dstack([clean, (a * 255).astype(np.uint8)])).save(
            os.path.join(OUT, f"hud_{name}.webp"), quality=92, method=6)
        print("hud", name, (x0, y0, x1, y1))


def paste(canvas, im, a, x0, y0):
    """Alpha-blend im (float rgb) with alpha a into canvas at (x0, y0), clipped to the canvas."""
    H, W = canvas.shape[:2]
    h, w = a.shape
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(w, W - x0), min(h, H - y0)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    reg = canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    aa = a[sy0:sy1, sx0:sx1, None]
    canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = reg * (1 - aa) + im[sy0:sy1, sx0:sx1] * aa


def step_islands(work):
    """Islands (BiRefNet) and a cloud (keyed off the blue sky) from the other panels."""
    from segment import get_mask_birefnet
    d = os.path.join(work, "l1s")
    for key, (p, b) in ISLANDS.items():
        im = np.asarray(Image.open(os.path.join(d, f"p{p}_x4.png")).convert("RGB"))
        im = im[b[1] * 4:b[3] * 4, b[0] * 4:b[2] * 4]
        m = get_mask_birefnet(im, os.path.join(work, "models/birefnet.onnx"))
        if key == "iC":
            m[:18 * 4, :38 * 4] = 0                     # the pause button above the castle
        n, lab, stats, _ = cv2.connectedComponentsWithStats((m > 0.5).astype(np.uint8))
        keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        m = m * cv2.dilate((lab == keep).astype(np.uint8), np.ones((9, 9), np.uint8))
        Image.fromarray(np.dstack([im, (m * 255).astype(np.uint8)])).save(os.path.join(d, f"{key}.png"))
    # cloud: panel 4, left edge, keyed off the blue sky by its red channel (as for the home screen)
    im = np.asarray(Image.open(os.path.join(d, "p4_x4.png")).convert("RGB"))[80 * 4:165 * 4, 7 * 4:80 * 4]
    lo, hi = np.percentile(im[..., 0], 8), np.percentile(im[..., 0], 92)
    lo = lo + (hi - lo) * 0.25
    a = cv2.GaussianBlur(np.clip((im[..., 0].astype(np.float32) - lo) / (hi - lo), 0, 1), (0, 0), 1.0) * 255
    for (x0, y0, x1, y1) in [(185, 0, 245, 40), (40, 195, 80, 235), (15, 260, 75, 320), (140, 0, 292, 20)]:
        a[y0:y1, x0:x1] = 0
    a[:, 262:] = 0
    rgb = im.copy()
    blur = cv2.GaussianBlur(im, (0, 0), 8)
    rgb[a < 1] = blur[a < 1]
    Image.fromarray(np.dstack([rgb, cv2.GaussianBlur(a, (0, 0), 2).astype(np.uint8)])).save(os.path.join(d, "cloud.png"))


def confetti(canvas, et, y0_p, y1_p, count, seed):
    """Small floating specks (pink, gold, cyan, violet) like the ones all over the reference sky."""
    rng = np.random.default_rng(seed)
    cols = np.array([[255, 92, 205], [255, 214, 90], [110, 225, 255], [190, 110, 255], [255, 140, 120]], np.float32)
    W = canvas.shape[1]
    for _ in range(count):
        r = rng.uniform(1.2, 3.0) * 4
        cx, cy = rng.uniform(0, W), et + rng.uniform(y0_p, y1_p) * 4
        n = int(r * 2 + 6)
        yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) - n / 2
        ang = rng.uniform(0, np.pi)
        u = xx * np.cos(ang) + yy * np.sin(ang)
        v = -xx * np.sin(ang) + yy * np.cos(ang)
        a = np.clip(1.5 - (np.abs(u) / r + np.abs(v) / (r * 0.6)) * 1.5, 0, 1)   # little diamond
        c = cols[rng.integers(len(cols))]
        rgb = c[None, None] * (0.75 + 0.25 * np.clip(-v / r, 0, 1))[..., None] + 60 * np.clip(-u / r, 0, 1)[..., None]
        paste(canvas, np.clip(rgb, 0, 255), a * 0.95, int(cx - n / 2), int(cy - n / 2))


def step_extend(work):
    """Scenery for tall phones: the cleaned panel with sky, clouds and islands added above."""
    d = os.path.join(work, "l1s")
    art = np.asarray(Image.open(os.path.join(d, "p2_clean.png")).convert("RGB")).astype(np.float32)
    ah, aw = art.shape[:2]
    et, eb = EXT_TOP, EXT_BOT
    H = et + ah + eb
    canvas = np.zeros((H, aw, 3), np.float32)

    top_c = np.array([10, 86, 214], np.float32)
    mid_c = np.array([36, 128, 244], np.float32)
    band = cv2.GaussianBlur(art[4 * 4:24 * 4].mean(axis=0)[None], (0, 0), 50)[0]
    t = np.linspace(0, 1, et, dtype=np.float32)[:, None, None]
    sky = np.where(t < 0.6, top_c + (mid_c - top_c) * (t / 0.6), mid_c + (band[None] - mid_c) * ((t - 0.6) / 0.4))
    rng = np.random.default_rng(7)
    n = cv2.resize(rng.random((et // 90 + 2, aw // 90 + 2)).astype(np.float32), (aw, et), interpolation=cv2.INTER_CUBIC)
    canvas[:et] = sky + (n[..., None] - 0.5) * 12
    canvas[et:et + ah] = art
    fade = 16 * 4
    w = (np.linspace(0, 1, fade, dtype=np.float32) ** 1.3)[:, None, None]
    canvas[et:et + fade] = sky[-1:] * (1 - w) + art[:fade] * w
    canvas[et + ah:] = art[-1:-eb - 1:-1]                 # under the gesture bar: mirrored

    cl = np.asarray(Image.open(os.path.join(d, "cloud.png")).convert("RGBA")).astype(np.float32)

    def cloud(width_p, cx_p, cy_p, flip=False, alpha=1.0):
        im = cl[:, ::-1] if flip else cl
        sc = width_p * 4 / im.shape[1]
        nw, nh = int(im.shape[1] * sc), int(im.shape[0] * sc)
        im = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)
        yy, xx = np.mgrid[0:nh, 0:nw].astype(np.float32)
        r = np.sqrt(((xx - nw / 2) / (nw / 2)) ** 2 + ((yy - nh / 2) / (nh / 2)) ** 2)
        a = np.clip(im[..., 3] / 255 * np.clip((1.0 - r) / 0.4, 0, 1) ** 0.7 * alpha, 0, 1)
        paste(canvas, im[..., :3], a, int(cx_p * 4 - nw / 2), et + int(cy_p * 4 - nh / 2))

    def island(key, width_p, cx_p, bottom_p, flip=False, haze=0.0):
        rgba = np.asarray(Image.open(os.path.join(d, f"{key}.png")).convert("RGBA")).astype(np.float32)
        if flip:
            rgba = rgba[:, ::-1]
        sc = width_p * 4 / rgba.shape[1]
        nw, nh = int(rgba.shape[1] * sc), int(rgba.shape[0] * sc)
        rgba = cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_AREA)
        rgb = rgba[..., :3] * (1 - haze) + np.array([170, 190, 250], np.float32) * haze   # distance haze
        a = np.clip((rgba[..., 3] / 255 - 0.1) / 0.8, 0, 1)
        paste(canvas, rgb, a, int(cx_p * 4 - nw / 2), et + int(bottom_p * 4) - nh)

    # Far layer first. y in panel pixels (0 = top of the panel, negative = added sky). The sky
    # between the HUD and the island row is visible on a phone (it is under the HUD in the
    # reference), so it gets sharp castle islands over the spots LaMa had to invent, clouds only
    # at the edges as in the reference, and the floating confetti the reference sky is full of.
    for args in [(150, 60, -196, False, 0.85), (150, 290, -214, True, 0.85), (130, 175, -130, True, 0.6),
                 (130, 10, 70, False, 0.9), (130, 330, 76, True, 0.9)]:
        cloud(*args)
    for key, wp, cx, by, fl, hz in [("iB", 56, 176, -150, True, 0.28), ("iA", 64, 40, -120, False, 0.14),
                                    ("iC", 80, 296, -92, True, 0.12), ("iB", 40, 34, 8, False, 0.3),
                                    ("iA", 44, 318, -6, True, 0.3), ("iB", 46, 172, 62, True, 0.22),
                                    ("iA", 62, 282, 112, True, 0.04), ("iC", 76, 64, 110, False, 0.0)]:
        island(key, wp, cx, by, fl, hz)
    confetti(canvas, et, -70, 112, 70, seed=11)

    out = np.clip(canvas, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(d, "bg_level1.png"))
    Image.fromarray(out).save(os.path.join(OUT, "bg_level1.webp"), quality=88, method=6)
    print("bg", out.shape, "panel top at row", et, "(4x px)")


if __name__ == "__main__":
    work = sys.argv[1]
    steps = sys.argv[2:] or ["upscale", "cut", "clean", "hud", "islands", "extend"]
    for s in steps:
        globals()["step_" + s](work)
