"""Android launcher icon: the player avatar from the Level 1 HUD on a sky disc with a rainbow rim.

    python tools/art/build_app_icon.py <avatar.webp> <android_res_dir>

Writes mipmap-*/ic_launcher.png at the five launcher densities.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def icon(avatar_path, n=768):
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.hypot(xx - n / 2, yy - n / 2) / (n / 2)
    sky = np.zeros((n, n, 4), np.float32)
    t = np.clip(r, 0, 1)[..., None]
    sky[..., :3] = np.array([120, 200, 255]) * (1 - t) + np.array([10, 70, 200]) * t
    sky[..., 3] = np.clip((0.985 - r) * n / 3, 0, 1) * 255
    im = Image.fromarray(sky.astype(np.uint8))
    d = ImageDraw.Draw(im)
    cols = [(255, 58, 85), (255, 150, 30), (255, 214, 26), (62, 224, 79), (39, 168, 255), (176, 88, 255)]
    w = n * 0.035
    for i, c in enumerate(cols):
        m = n * 0.04 + i * w
        d.ellipse([m, m, n - m, n - m], outline=c + (255,), width=int(w + 1))
    av = Image.open(avatar_path).convert("RGBA")
    s = int(n * 0.66)
    av = av.resize((s, s), Image.LANCZOS)
    glow = Image.new("RGBA", (n, n), (0, 0, 0, 0))              # soft drop shadow under the badge
    glow.paste(av, ((n - s) // 2, (n - s) // 2 + int(n * 0.02)), av)
    glow = glow.filter(ImageFilter.GaussianBlur(n * 0.02))
    im.alpha_composite(Image.fromarray((np.asarray(glow).astype(np.float32) * [0, 0, 0, 0.5]).astype(np.uint8)))
    im.alpha_composite(av, ((n - s) // 2, (n - s) // 2))
    return im


def main(avatar, res):
    big = icon(avatar)
    for k, px in SIZES.items():
        d = os.path.join(res, f"mipmap-{k}")
        os.makedirs(d, exist_ok=True)
        big.resize((px, px), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"), optimize=True)
    print("icons written to", res)


if __name__ == "__main__":
    main(*sys.argv[1:3])
