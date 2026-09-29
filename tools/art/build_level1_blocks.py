"""Jelly-block face textures for Level 1 (the coloured platforms the boy jumps on).

    python build_level1_blocks.py <out_dir>

The platforms in the direction image are painted at angles that cannot be unwarped cleanly, so
the faces are generated here in the same style (colours sampled from the painted blocks): a
glossy top with a bright rim, an inset panel and the colour's white symbol; a deeper front and
side with an inner panel line, sparkles and glowing light drips that fade out below the block.
Each colour has its own symbol so the colours can be told apart without relying on hue.
The later stages add dark stone blocks (with a cracked fake twin), gold and ice path blocks
with an arrow, and rainbow road tiles; flipping blocks also get a bottom face.

Texture scale is 640 px per world unit. Blocks are 0.8 wide and 0.62 deep; the colour and stone
blocks are chunky cubes 0.44 tall, the road and path pieces (rainbow, gold, ice) slabs 0.26 tall.
The front/side textures carry another 0.21 of glow below the block (see js/level1.js).
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

PX = 640
TW, TH = 512, 397          # top: 0.8 x 0.62
FW = 512                   # front: 0.8 wide; height = block + 0.21 of glow
SW = 397                   # side: 0.62 deep
CUBE, SLAB = 282, 166      # rows of the front/side texture that are the block itself (0.44 / 0.26)
GLOW = 134                 # rows of light drips below it (0.21)
SLABS = {"rainbow", "gold", "goldfake", "ice"}

# (top colour, front colour) sampled from the direction image; pink follows the HUD's pink orb
COLOURS = {
    "red": ((246, 42, 62), (205, 12, 48)),
    "yellow": ((254, 212, 16), (248, 132, 16)),
    "blue": ((12, 160, 253), (6, 86, 240)),
    "green": ((52, 222, 64), (16, 150, 48)),
    "purple": ((164, 72, 246), (110, 26, 214)),
    "pink": ((255, 92, 212), (226, 30, 162)),
}
SYMBOL = {"red": "flower", "yellow": "circle", "blue": "triangle", "green": "club", "purple": "star", "pink": "heart"}
# later stages: name -> (top, front, symbol, rim colour, symbol colour, cracked)
STYLES = {
    "stone": ((74, 40, 112), (46, 20, 74), "star", (255, 196, 112), (255, 150, 232), False),
    "stonefake": ((74, 40, 112), (46, 20, 74), "star", (255, 196, 112), (255, 150, 232), True),
    "gold": ((255, 198, 52), (236, 128, 18), "arrow", (255, 255, 255), (255, 253, 245), False),
    "goldfake": ((255, 198, 52), (236, 128, 18), "arrow", (255, 255, 255), (255, 253, 245), True),
    "ice": ((112, 200, 255), (38, 118, 236), "arrow", (255, 255, 255), (255, 253, 245), False),
}
RAINBOW = [(255, 64, 88), (255, 150, 40), (255, 222, 40), (70, 220, 90), (40, 160, 255), (170, 90, 255)]


def rrect_sdf(w, h, x0, y0, x1, y1, r):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
    qx, qy = np.abs(xx - cx) - hx, np.abs(yy - cy) - hy
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def line(d, at, width, soft=1.0):
    return np.clip(1 - (np.abs(d - at) - width / 2) / soft, 0, 1)


def blur(a, s):
    return cv2.GaussianBlur(a, (0, 0), s)


def noise(h, w, s, seed):
    n = np.random.default_rng(seed).standard_normal((h, w)).astype(np.float32)
    n = blur(n, s)
    return n / (np.abs(n).max() + 1e-6)


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + np.asarray(b, np.float32) * t


def symbol_mask(kind, w, h, size):
    """White symbol, drawn 4x and downsampled. `size` is its width in px."""
    S = 4
    im = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(im)
    cx, cy, s = w * S / 2, h * S / 2, size * S / 2
    if kind == "circle":
        d.ellipse([cx - s, cy - s, cx + s, cy + s], 255)
    elif kind == "triangle":
        d.polygon([(cx, cy - s * 0.95), (cx + s * 1.08, cy + s * 0.8), (cx - s * 1.08, cy + s * 0.8)], 255)
    elif kind == "flower":
        r = s * 0.5
        for ax, ay in [(0, -1), (1, 0), (0, 1), (-1, 0)]:
            d.ellipse([cx + ax * s * 0.5 - r, cy + ay * s * 0.5 - r, cx + ax * s * 0.5 + r, cy + ay * s * 0.5 + r], 255)
        d.ellipse([cx - r * 0.8, cy - r * 0.8, cx + r * 0.8, cy + r * 0.8], 255)
    elif kind == "club":
        r = s * 0.42
        for ax, ay in [(0, -0.55), (0.55, 0.12), (-0.55, 0.12)]:
            d.ellipse([cx + ax * s - r, cy + ay * s - r, cx + ax * s + r, cy + ay * s + r], 255)
        d.polygon([(cx - s * 0.12, cy), (cx + s * 0.12, cy), (cx + s * 0.3, cy + s * 0.95), (cx - s * 0.3, cy + s * 0.95)], 255)
    elif kind == "star":
        pts = []
        for i in range(10):
            a = -np.pi / 2 + i * np.pi / 5
            rr = s * (1.08 if i % 2 == 0 else 0.46)
            pts.append((cx + rr * np.cos(a), cy + 0.08 * s + rr * np.sin(a)))
        d.polygon(pts, 255)
    elif kind == "arrow":
        d.polygon([(cx, cy - s), (cx + s * 0.85, cy - s * 0.05), (cx + s * 0.34, cy - s * 0.05), (cx + s * 0.34, cy + s),
                   (cx - s * 0.34, cy + s), (cx - s * 0.34, cy - s * 0.05), (cx - s * 0.85, cy - s * 0.05)], 255)
    elif kind == "heart":
        r = s * 0.5
        d.ellipse([cx - s, cy - s * 0.75, cx, cy - s * 0.75 + 2 * r], 255)
        d.ellipse([cx, cy - s * 0.75, cx + s, cy - s * 0.75 + 2 * r], 255)
        d.polygon([(cx - s * 0.97, cy - s * 0.2), (cx, cy - s * 0.45), (cx + s * 0.97, cy - s * 0.2), (cx, cy + s * 0.95)], 255)
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def sparkle(img, x, y, r, a=1.0):
    """4-point glint."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = np.abs(xx - x), np.abs(yy - y)
    g = np.clip(1 - (dx * dy) / (r * 0.9) - np.hypot(dx, dy) / (r * 2.2), 0, 1) ** 1.5
    return mix(img, (255, 255, 255), g * a)


def top_texture(name, top, seed, sym=None, rim_c=(255, 255, 255), sym_c=(255, 253, 245), cracks=False, stripes=False):
    top = np.array(top, np.float32)
    rim_c = np.array(rim_c, np.float32)
    lite = mix(top, (255, 255, 255), 0.32) if not stripes else None
    d = rrect_sdf(TW, TH, 2, 2, TW - 2, TH - 2, 46)
    yy = np.mgrid[0:TH, 0:TW][0].astype(np.float32) / TH
    img = np.zeros((TH, TW, 3), np.float32) + top
    if stripes:                                                            # rainbow road: bands along the path
        xx = np.mgrid[0:TH, 0:TW][1].astype(np.float32) / TW * len(RAINBOW)
        idx = np.clip(xx.astype(int), 0, len(RAINBOW) - 1)
        img = np.array(RAINBOW, np.float32)[idx]
        f = xx - np.floor(xx)
        img = mix(img, (255, 255, 255), np.clip(1 - np.minimum(f, 1 - f) / 0.06, 0, 1) * 0.45)
    img = mix(img, (255, 255, 255), (0.16 * (1 - yy)))                     # far edge catches more sky
    img = img * (1 + 0.07 * noise(TH, TW, 16, seed)[..., None])            # jelly mottling
    rim = np.clip(1 - (-d) / 30, 0, 1)                                     # lighter bevel along the edge
    img = mix(img, mix(img, (255, 255, 255), 0.32) if stripes else lite, rim ** 1.5 * 0.9)
    inner = rrect_sdf(TW, TH, 44, 40, TW - 44, TH - 40, 30)
    if not stripes:
        img = mix(img, mix(top, (255, 255, 255), 0.14), np.clip(-inner / 6, 0, 1) * 0.55)  # inset panel
    img = mix(img, top * 0.82, line(inner, 3, 3, 2) * 0.5)                 # panel edge shadow
    img = mix(img, (255, 255, 255), line(inner, -1, 2.2, 1.2) * 0.7)       # panel edge highlight
    img = mix(img, rim_c, blur(line(d, -9, 4, 1.5), 3) * 0.8)             # glowing rim line
    img = mix(img, rim_c, line(d, -9, 3, 1.2) * 0.95)
    # soft diagonal gloss
    yx = np.mgrid[0:TH, 0:TW].astype(np.float32)
    band = np.exp(-(((yx[1] / TW) * 0.8 + (yx[0] / TH) - 0.55) / 0.12) ** 2) * 0.13
    img = mix(img, (255, 255, 255), band * np.clip(-d / 20, 0, 1))
    # symbol with a soft glow
    if sym:
        sm = symbol_mask(sym, TW, TH, 150)
        img = mix(img, sym_c, blur(sm, 7) * 0.35)
        img = mix(img, mix(top, sym_c, 0.5), blur(sm, 1.5) * 0.6)
        img = mix(img, sym_c, sm)
    if cracks:                                                             # the fake twin: hairline cracks
        cm = Image.new("L", (TW, TH), 0)
        cd = ImageDraw.Draw(cm)
        rng = np.random.default_rng(99)
        for x0, y0 in [(90, 60), (380, 90), (140, 300), (420, 320), (260, 200)]:
            pts = [(x0, y0)]
            for _ in range(5):
                pts.append((pts[-1][0] + rng.uniform(-40, 40), pts[-1][1] + rng.uniform(-36, 36)))
            cd.line(pts, fill=255, width=4)
        c = blur(np.asarray(cm).astype(np.float32) / 255, 1.2)
        img = mix(img, (255, 225, 255), c * 0.85)
    for x, y, r in [(30, 26, 16), (TW - 60, 22, 11), (TW - 24, TH - 40, 13)]:
        img = sparkle(img, x, y, r, 0.9)
    a = np.clip(0.5 - d, 0, 1)
    return np.dstack([np.clip(img, 0, 255), a * 255]).astype(np.uint8)


def front_texture(front, w, seed, dark=1.0, stripes=False, face=CUBE):
    front = np.array(front, np.float32) * dark
    FACE = face
    h = FACE + GLOW
    d = rrect_sdf(w, h, 1, -30, w - 1, FACE, 26)                           # square top (the box edge), round bottom
    y = np.mgrid[0:h, 0:w][0].astype(np.float32)
    t = np.clip(y / FACE, 0, 1)
    img = np.zeros((h, w, 3), np.float32) + front
    if stripes:
        xx = np.mgrid[0:h, 0:w][1].astype(np.float32) / w * len(RAINBOW)
        img = np.array(RAINBOW, np.float32)[np.clip(xx.astype(int), 0, len(RAINBOW) - 1)] * 0.85 * dark
    img = mix(img, mix(front, (255, 255, 255), 0.22), np.clip(1 - t * 3, 0, 1) * 0.8)   # lit under the top edge
    img = mix(img, mix(front, (255, 255, 255), 0.35), np.clip((t - 0.7) / 0.3, 0, 1) * 0.55)  # light through the jelly
    img = img * (1 + 0.08 * noise(h, w, 10, seed + 7)[..., None])
    inner = rrect_sdf(w, h, 20, 18, w - 20, FACE - 16, 18)
    img = mix(img, front * 0.8, np.clip(-inner / 10, 0, 1) * 0.35)         # recessed panel
    img = mix(img, (255, 255, 255), line(inner, 0, 2.2, 1.2) * 0.45)
    img = mix(img, (255, 255, 255), blur(line(d, -3, 3, 1.5), 2.5) * 0.9)  # rim glow
    img = mix(img, (255, 255, 255), np.clip(1 - y / 7, 0, 1) * 0.9)        # top edge highlight
    rng = np.random.default_rng(seed)
    for _ in range(9):
        img = sparkle(img, rng.uniform(20, w - 20), rng.uniform(20, FACE - 20), rng.uniform(3, 6), 0.8)
    body = np.clip(0.5 - d, 0, 1)
    # light drips: icicles of light hanging from the bottom edge, fading into the clouds
    drip = np.zeros((h, w), np.float32)
    xs = np.linspace(0.08, 0.92, 7) * w + rng.uniform(-18, 18, 7)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for x in xs:
        L = rng.uniform(55, 125)
        wd = rng.uniform(8, 16)
        s = np.clip((yy - (FACE - 40)) / 40, 0, 1) * np.clip(1 - (yy - FACE) / L, 0, 1)
        drip = np.maximum(drip, np.clip(1 - np.abs(xx - x) / (wd * np.clip(1 - (yy - FACE) / L, 0.15, 1)), 0, 1) * s)
    drip = blur(drip, 2)
    halo = blur(drip, 9) * 0.8 + np.clip(1 - np.abs(yy - FACE) / 22, 0, 1) * (np.abs(xx - w / 2) < w / 2 - 10) * 0.45
    glow_c = mix(front, (255, 255, 255), 0.6)
    img = mix(img, (255, 255, 255), np.clip(drip * 1.1, 0, 1) * body)
    a = np.clip(body + (1 - body) * np.clip(np.maximum(drip, halo), 0, 1), 0, 1)
    under = (1 - body)[..., None]
    col = img * (1 - under) + (glow_c * (1 - drip[..., None]) + np.array([255, 255, 255], np.float32) * drip[..., None]) * under
    return np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)


def glow_texture():
    """White halo around the top face, used to highlight a block."""
    pad = 60
    d = rrect_sdf(TW + 2 * pad, TH + 2 * pad, pad, pad, TW + pad, TH + pad, 46)
    a = np.clip(1 - np.abs(d + 6) / 52, 0, 1) ** 1.3 + np.clip(-d / 120, 0, 0.35)
    rgb = np.zeros(d.shape + (3,), np.float32) + 255
    return np.dstack([rgb, np.clip(a, 0, 1) * 255]).astype(np.uint8)


def bottom_texture(front):
    """Underside, seen while a block flips."""
    d = rrect_sdf(TW, TH, 2, 2, TW - 2, TH - 2, 46)
    img = np.zeros((TH, TW, 3), np.float32) + np.array(front, np.float32) * 0.62
    img = mix(img, (255, 255, 255), line(d, -8, 3, 1.5) * 0.5)
    return np.dstack([img, np.clip(0.5 - d, 0, 1) * 255]).astype(np.uint8)


def save(img, out, name):
    Image.fromarray(img).save(os.path.join(out, name + ".webp"), quality=90, method=6)


def main(out):
    os.makedirs(out, exist_ok=True)
    for i, (name, (top, front)) in enumerate(COLOURS.items()):
        save(top_texture(name, top, i, SYMBOL[name]), out, f"top_{name}")
        save(front_texture(front, FW, i), out, f"front_{name}")
        save(front_texture(front, SW, i + 20, 0.78), out, f"side_{name}")
        save(bottom_texture(front), out, f"bottom_{name}")
    for i, (name, (top, front, sym, rim, sym_c, cracks)) in enumerate(STYLES.items()):
        face = SLAB if name in SLABS else CUBE
        save(top_texture(name, top, 10 + i, sym, rim, sym_c, cracks), out, f"top_{name}")
        save(front_texture(front, FW, 10 + i, face=face), out, f"front_{name}")
        save(front_texture(front, SW, 30 + i, 0.78, face=face), out, f"side_{name}")
    save(top_texture("rainbow", (255, 255, 255), 40, stripes=True), out, "top_rainbow")
    save(front_texture((200, 120, 255), FW, 41, stripes=True, face=SLAB), out, "front_rainbow")
    save(front_texture((200, 120, 255), SW, 42, 0.78, stripes=True, face=SLAB), out, "side_rainbow")
    Image.fromarray(glow_texture()).save(os.path.join(out, "top_glow.webp"), quality=90, method=6)
    print("block textures written to", out)


if __name__ == "__main__":
    main(sys.argv[1])
