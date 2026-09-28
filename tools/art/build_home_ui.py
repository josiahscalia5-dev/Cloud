"""Cut the home-screen UI pieces out of the 4x-upscaled panel 1 so they can be laid out as
separate, tappable elements. Each piece is matted with GrabCut seeded from its detected
shape (inner region = foreground, a ring outside it = unknown, beyond = background).

Usage: python build_home_ui.py <p1_x4.png> <title_rgba_source_dir> <out_dir>
Writes <name>.webp (RGBA) and layout.json with each piece's box in 1x panel pixels.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

S = 4


def grabcut_ring(img, inner, ring, iters=5):
    """inner: bool mask of certain foreground. Returns soft alpha (float 0..1)."""
    m = np.full(img.shape[:2], cv2.GC_BGD, np.uint8)
    outer = ndi.binary_dilation(inner, iterations=ring)
    m[outer] = cv2.GC_PR_BGD
    m[ndi.binary_dilation(inner, iterations=max(2, ring // 3))] = cv2.GC_PR_FGD
    m[inner] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), m, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    fg = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    fg = ndi.binary_fill_holes(ndi.binary_opening(fg, iterations=2))
    lab, n = ndi.label(fg)
    if n > 1:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = lab == (np.argmax(sizes) + 1)
    a = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 1.2)
    return np.clip((a - 0.5) * 2.2 + 0.5, 0, 1)


def rrect(shape, box, r):
    m = np.zeros(shape, np.uint8)
    x0, y0, x1, y1 = [int(v) for v in box]
    cv2.rectangle(m, (x0 + r, y0), (x1 - r, y1), 1, -1)
    cv2.rectangle(m, (x0, y0 + r), (x1, y1 - r), 1, -1)
    for cx, cy in [(x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)]:
        cv2.circle(m, (cx, cy), r, 1, -1)
    return m.astype(bool)


def ellipse(shape, box):
    m = np.zeros(shape, np.uint8)
    x0, y0, x1, y1 = box
    cv2.ellipse(m, ((x0 + x1) // 2, (y0 + y1) // 2), ((x1 - x0) // 2, (y1 - y0) // 2), 0, 0, 360, 1, -1)
    return m.astype(bool)


def cut(p1, name, crop, inner_fn, ring, out_dir, layout):
    x0, y0, x1, y1 = crop
    img = p1[y0:y1, x0:x1].copy()
    inner = inner_fn(img.shape[:2])
    a = grabcut_ring(img, inner, ring)
    ys, xs = np.where(a > 0.02)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([img, (a * 255).astype(np.uint8)])[by0:by1, bx0:bx1]
    Image.fromarray(rgba).save(os.path.join(out_dir, f"{name}.webp"), quality=92, method=6)
    layout[name] = [round((x0 + bx0) / S, 2), round((y0 + by0) / S, 2), round((x0 + bx1) / S, 2), round((y0 + by1) / S, 2)]
    return rgba


def shape_cut(p1, name, crop, shape, out_dir, layout):
    """Cut with an analytic shape (anti-aliased by supersampled blur)."""
    x0, y0, x1, y1 = crop
    img = p1[y0:y1, x0:x1].copy()
    a = cv2.GaussianBlur(shape.astype(np.float32), (0, 0), 1.1)
    ys, xs = np.where(a > 0.02)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([img, (a * 255).astype(np.uint8)])[by0:by1, bx0:bx1]
    Image.fromarray(rgba).save(os.path.join(out_dir, f"{name}.webp"), quality=92, method=6)
    layout[name] = [round((x0 + bx0) / S, 2), round((y0 + by0) / S, 2), round((x0 + bx1) / S, 2), round((y0 + by1) / S, 2)]


def main(p1_path, title_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    p1 = np.asarray(Image.open(p1_path).convert("RGB"))
    layout = {}

    # --- side menu buttons (dark interiors detected at 4x) ----------------------------------
    menu = {
        "btn_missions": (1250, 531, 1459, 755), "btn_map": (1244, 773, 1451, 989),
        "btn_shop": (1246, 1011, 1458, 1229), "btn_daily": (1250, 1249, 1451, 1458),
        "btn_rewards": (1250, 1487, 1451, 1705),
    }
    for name, (ix0, iy0, ix1, iy1) in menu.items():
        pad = 40
        crop = (ix0 - pad, iy0 - pad, min(ix1 + pad, p1.shape[1]), iy1 + pad)
        cut(p1, name, crop, lambda s, b=(pad + 6, pad + 6, pad + (ix1 - ix0) - 6, pad + (iy1 - iy0) - 6): rrect(s, b, 26),
            16, out_dir, layout)

    # --- PLAY: pill measured from edge profiles at 4x (outline included) ----------------------
    px0, py0, px1, py1 = 360, 1704, 1128, 1936
    crop = (px0 - 12, py0 - 12, px1 + 12, py1 + 12)
    shape_cut(p1, "btn_play", crop, rrect((crop[3] - crop[1], crop[2] - crop[0]),
              (12, 12, 12 + px1 - px0, 12 + py1 - py0), (py1 - py0) // 2), out_dir, layout)

    # --- bottom navigation bar: frame measured from edge profiles at 4x -------------------
    nx0, ny0, nx1, ny1 = 42, 1946, 1452, 2204
    crop = (nx0 - 12, ny0 - 70, nx1 + 12, ny1 + 12)
    shp = (crop[3] - crop[1], crop[2] - crop[0])
    body = rrect(shp, (12, 70, 12 + nx1 - nx0, 70 + ny1 - ny0), 38)
    shape_cut(p1, "nav", crop, body, out_dir, layout)

    # --- top bar pieces ---------------------------------------------------------------------
    cut(p1, "avatar", (20, 0, 240, 205), lambda s: ellipse(s, (40, 22, 180, 178)), 18, out_dir, layout)
    cut(p1, "btn_gear", (1290, 0, 1476, 190), lambda s: ellipse(s, (40, 40, 150, 150)), 18, out_dir, layout)
    # coin: gold disc + dark rim measured at 4x (centre 639,83; radius 53)
    shape_cut(p1, "icon_coin", (576, 20, 704, 148), ellipse((128, 128), (10, 10, 116, 116)), out_dir, layout)
    # gem: keep its glow; soft ellipse that fades into the (matching) dark pill behind it
    crop = (972, 26, 1102, 152)
    yy, xx = np.mgrid[0:crop[3] - crop[1], 0:crop[2] - crop[0]].astype(np.float32)
    r = np.sqrt(((xx - 65) / 64) ** 2 + ((yy - 62) / 62) ** 2)
    soft = np.clip((1.0 - r) / 0.35, 0, 1)
    img = p1[crop[1]:crop[3], crop[0]:crop[2]]
    Image.fromarray(np.dstack([img, (soft * 255).astype(np.uint8)])).save(os.path.join(out_dir, "icon_gem.webp"), quality=92, method=6)
    layout["icon_gem"] = [crop[0] / S, crop[1] / S, crop[2] / S, crop[3] / S]

    # --- title logo (matte computed by logo_matte.py) -------------------------------------
    t = np.asarray(Image.open(os.path.join(title_dir, "title_cut.png")).convert("RGB"))
    fg = np.load(os.path.join(title_dir, "title_gc.npy"))
    h, w = fg.shape
    # stray castle bits picked up at the lower corners of the crop
    castle = np.zeros((h, w), np.uint8)
    cv2.fillPoly(castle, [np.array([(0, 140), (58, 140), (66, 215), (84, 285), (130, 300), (200, 312),
                                    (262, 338), (300, h), (0, h)], np.int32)], 1)
    fg[castle.astype(bool)] = False
    fg[int(h * 0.78):, int(w * 0.47):int(w * 0.54)] = False
    fg[int(h * 0.62):, int(w * 0.955):] = False
    lab, n = ndi.label(fg)
    sizes = ndi.sum(fg, lab, range(1, n + 1))
    fg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.05 * sizes.max()])
    a = cv2.GaussianBlur(ndi.binary_erosion(fg, iterations=1).astype(np.float32), (0, 0), 1.3)
    ys, xs = np.where(a > 0.02)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([t, (a * 255).astype(np.uint8)])[by0:by1, bx0:bx1]
    Image.fromarray(rgba).save(os.path.join(out_dir, "title.webp"), quality=92, method=6)
    tx0, ty0 = 26 * S, 38 * S   # where title_cut.png was cropped from (1x panel 26,38)
    layout["title"] = [round((tx0 + bx0) / S, 2), round((ty0 + by0) / S, 2), round((tx0 + bx1) / S, 2), round((ty0 + by1) / S, 2)]

    with open(os.path.join(out_dir, "layout.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout))


if __name__ == "__main__":
    main(*sys.argv[1:4])
