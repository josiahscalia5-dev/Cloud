"""Jelly platforms for Level 1, recoloured from the green block of the Level 1 direction image.

    python build_level1_platforms.py <work_l1_dir> <models_dir> <out_dir>

The green block is the one platform in the direction image nothing overlaps. It is cut out of
direction_x4.png, its clover is removed with LaMa, and it is recoloured once per sequence
colour (the hue runs from the top face to the front face as on the painted blocks). Each colour
gets its own white symbol so colours can also be told apart by shape. platforms.json records
the top face (where the boy lands) in sprite pixels.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inpaint import inpaint  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
S = 4                                  # scale of direction_x4.png
OUT_SCALE = 2.5                        # sprites are saved at 2.5x the direction image
BOX = (505, 715, 768, 868)             # crop around the green block (direction pixels)
# silhouette of the block and its top face (direction pixels)
SILHOUETTE = [(588, 731), (744, 737), (755, 744), (753, 815), (727, 859), (532, 851), (521, 841), (520, 781)]
TOP_FACE = {"fl": (522, 781), "fr": (720, 792), "br": (748, 738), "bl": (586, 730)}
CLOVER = ((640, 757), (50, 22))         # centre, radii of the area holding the painted clover

# name: (hue on top, hue on the front face, saturation gain, lift, symbol)
# hue in degrees; lift < 1 brightens the dark front face (the green one is much darker).
COLOURS = {
    "red": (350, 356, 1.0, 0.35, "clover"),
    "yellow": (50, 36, 0.95, 0.22, "circle"),
    "blue": (204, 220, 1.0, 0.45, "triangle"),
    "green": (142, 154, 1.0, 1.0, "diamond"),
    "purple": (282, 272, 0.95, 0.55, "star"),
    "pink": (314, 306, 0.9, 0.35, "heart"),
}


def shape_mask(kind, n=512):
    """White symbol on a unit square face, n x n, supersampled."""
    k = 4
    im = Image.new("L", (n * k, n * k), 0)
    d = ImageDraw.Draw(im)
    c = n * k / 2

    def P(x, y):                      # face coords in [-1, 1], y = +1 toward the back
        return (c + x * c, c - y * c)

    if kind == "circle":
        r = 0.62 * c
        d.ellipse([c - r, c - r, c + r, c + r], fill=255)
    elif kind == "clover":
        for dx, dy in [(0.36, 0), (-0.36, 0), (0, 0.36), (0, -0.36)]:
            x, y = P(dx, dy)
            r = 0.36 * c
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
        d.rectangle([c - 0.2 * c, c - 0.2 * c, c + 0.2 * c, c + 0.2 * c], fill=255)
    elif kind == "triangle":
        d.polygon([P(0, 0.72), P(0.74, -0.58), P(-0.74, -0.58)], fill=255)
    elif kind == "diamond":
        d.polygon([P(0, 0.8), P(0.62, 0), P(0, -0.8), P(-0.62, 0)], fill=255)
    elif kind == "star":
        pts = []
        for i in range(10):
            a = np.pi / 2 + i * np.pi / 5
            r = 0.78 if i % 2 == 0 else 0.34
            pts.append(P(r * np.cos(a), r * np.sin(a)))
        d.polygon(pts, fill=255)
    elif kind == "heart":
        r = 0.34
        for sx in (-1, 1):
            x, y = P(sx * 0.3, 0.22)
            d.ellipse([x - r * c, y - r * c, x + r * c, y + r * c], fill=255)
        d.polygon([P(-0.63, 0.12), P(0.63, 0.12), P(0, -0.72)], fill=255)
    im = im.resize((n, n), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def face_warp(mask, shape, scale, size=(0.6, 0.86)):
    """Map the unit symbol onto the top face (affine: front edge = u axis, left edge = v axis)."""
    n = mask.shape[0]
    fl, fr, bl = (np.array(TOP_FACE[k], np.float32) for k in ("fl", "fr", "bl"))
    br = np.array(TOP_FACE["br"], np.float32)
    centre = (fl + fr + bl + br) / 4
    u = (fr - fl + br - bl) / 4        # half extent along the face width
    v = (bl - fl + br - fr) / 4        # half extent toward the back
    o = (centre - np.array(BOX[:2], np.float32)) * scale
    u, v = u * scale * size[0], v * scale * size[1]
    # unit square pixel (px, py) -> face coords (x = px/n*2-1, y = 1-py/n*2)
    src = np.float32([[0, 0], [n, 0], [0, n]])
    dst = np.float32([o - u + v, o + u + v, o - u - v])
    M = cv2.getAffineTransform(src, dst)
    return cv2.warpAffine(mask, M, (shape[1], shape[0]), flags=cv2.INTER_LINEAR)


def recolour(rgb, top_h, front_h, sat_k, lift):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
    green = np.clip((s - 0.12) / 0.2, 0, 1) * np.clip(1 - np.maximum(0, np.abs(h - 128) - 45) / 12, 0, 1)
    t = np.clip((h - 142) / 12, -0.6, 1.5)
    nh = (top_h + t * (front_h - top_h)) % 360
    ns = np.clip(s * sat_k, 0, 1)
    nv = 1 - (1 - v) * lift
    out = np.dstack([nh * 256 / 360, ns * 255, nv * 255]).astype(np.float32)
    out = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB_FULL).astype(np.float32)
    w = green[..., None]
    return out * w + rgb.astype(np.float32) * (1 - w)


def main(work, models, out):
    os.makedirs(out, exist_ok=True)
    big = Image.open(os.path.join(work, "direction_x4.png")).convert("RGB")
    x0, y0, x1, y1 = BOX
    rgb = np.asarray(big.crop((x0 * S, y0 * S, x1 * S, y1 * S))).copy()
    H, W = rgb.shape[:2]

    # remove the painted clover (white, inside the ellipse on the top face)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    (cx, cy), (rx, ry) = CLOVER
    ell = np.zeros((H, W), np.uint8)
    cv2.ellipse(ell, (int((cx - x0) * S), int((cy - y0) * S)), (int(rx * S), int(ry * S)), 0, 0, 360, 255, -1)
    white = ((hsv[..., 1] < 110) & (hsv[..., 2] > 170)).astype(np.uint8) * 255
    hole = cv2.dilate(white & ell, np.ones((3, 3), np.uint8), iterations=8)
    half = (W // 2, H // 2)
    fill = inpaint(cv2.resize(rgb, half, interpolation=cv2.INTER_AREA),
                   cv2.resize(hole, half, interpolation=cv2.INTER_NEAREST), os.path.join(models, "big-lama.pt"))
    fill = cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC)
    soft = cv2.GaussianBlur(hole.astype(np.float32) / 255, (0, 0), 3)[..., None]
    rgb = (fill * soft + rgb * (1 - soft)).astype(np.uint8)

    # silhouette matte with rounded corners, feathered
    poly = ((np.array(SILHOUETTE, np.float32) - np.array(BOX[:2], np.float32)) * S).astype(np.int32)
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [poly], 255)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
    m = cv2.morphologyEx(cv2.erode(m, k), cv2.MORPH_CLOSE, k)
    m = cv2.dilate(m, k)
    alpha = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 3.5)
    # faint glow around the block, as on the painted ones
    glow = np.clip(cv2.GaussianBlur(alpha, (0, 0), 18) * 0.55, 0, 1)

    def save(name, img, glow_rgb):
        a = np.maximum(alpha, glow)
        col = img * alpha[..., None] + np.array(glow_rgb, np.float32) * (glow * (1 - alpha))[..., None]
        col = col / np.maximum(a[..., None], 1e-4)
        im = Image.fromarray(np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8))
        k = OUT_SCALE / S
        im = im.resize((round(W * k), round(H * k)), Image.LANCZOS)
        im.save(os.path.join(out, f"plat_{name}.webp"), quality=90, method=6)

    for name, (th, fh, sk, lift, sym) in COLOURS.items():
        img = recolour(rgb, th, fh, sk, lift)
        sm = face_warp(shape_mask(sym), (H, W), S)
        halo = cv2.GaussianBlur(sm, (0, 0), 6) * 0.35
        sm = np.clip(cv2.GaussianBlur(sm, (0, 0), 1.2) * 0.97 + halo, 0, 1)[..., None]
        img = img * (1 - sm) + np.array([255, 255, 250], np.float32) * sm
        hue = np.uint8([[[th / 2, 200, 255]]])
        save(name, img, cv2.cvtColor(hue, cv2.COLOR_HSV2RGB)[0, 0].astype(np.float32))

    # rainbow crystal (start and gate steps): the hue sweeps across the block, red to violet
    xx = np.linspace(0, 1, W, dtype=np.float32)[None, :].repeat(H, 0)
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None].repeat(W, 1)
    sweep = np.clip(xx * 1.2 - yy * 0.3 - 0.02, 0, 1) * 285
    rain = recolour(rgb, sweep, sweep + 10, 0.72, 0.3)
    sm = face_warp(shape_mask("star"), (H, W), S, (0.5, 0.75))
    sm = np.clip(cv2.GaussianBlur(sm, (0, 0), 1.2) + cv2.GaussianBlur(sm, (0, 0), 7) * 0.4, 0, 1)[..., None]
    save("rainbow", rain * (1 - sm) + 255 * sm, (230, 240, 255))

    # used-up / wrong platform: grey jelly
    grey = cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), cv2.COLOR_GRAY2RGB).astype(np.float32)
    save("grey", grey * 0.55 + 150 * 0.45, (200, 210, 230))

    k = OUT_SCALE
    fl, fr, br, bl = (np.array(TOP_FACE[n], np.float32) for n in ("fl", "fr", "br", "bl"))
    info = {
        "size": [round(W * k / S), round(H * k / S)],
        "face_centre": (((fl + fr + br + bl) / 4 - np.array(BOX[:2])) * k).round(1).tolist(),
        "face_width": round(float(np.linalg.norm(fr - fl)) * k, 1),
        "front_bottom": round((851 - BOX[1]) * k, 1),
        "top": round((730 - BOX[1]) * k, 1),
    }
    with open(os.path.join(out, "platforms.json"), "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main(*sys.argv[1:4])
