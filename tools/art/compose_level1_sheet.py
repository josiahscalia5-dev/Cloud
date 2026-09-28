"""Level 1 preview sheet: the direction image next to the game at the same moments.

    python tools/art/compose_level1_sheet.py <shots_dir> <out.png>

shots_dir holds the screenshots from game/scripts/level1_preview.mjs (1080 x 2400 phone).
Fonts come from game/node_modules/@fontsource/fira-sans-condensed (npm install in game/).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
FONTS = os.path.join(ROOT, "game/node_modules/@fontsource/fira-sans-condensed/files")
BG = (9, 18, 48)


def font(size, weight=700):
    return ImageFont.truetype(os.path.join(FONTS, f"fira-sans-condensed-latin-{weight}-normal.woff"), size)


def framed(img, h, r=28):
    img = img.convert("RGB").resize((round(img.width * h / img.height), h), Image.LANCZOS)
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def main(shots, out):
    H = 1100
    cols = [
        ("YOUR IMAGE", "Level 1 direction", Image.open(os.path.join(ROOT, "art-source/level1_direction.png")), (255, 214, 102)),
        ("IN THE GAME", "first jump", Image.open(os.path.join(shots, "level1_jump.png")), (120, 220, 255)),
        ("IN THE GAME", "start: next block glows", Image.open(os.path.join(shots, "level1_start.png")), (120, 220, 255)),
        ("IN THE GAME", "wrong colour", Image.open(os.path.join(shots, "level1_wrong.png")), (120, 220, 255)),
        ("IN THE GAME", "last colour: the gate", Image.open(os.path.join(shots, "level1_gate.png")), (120, 220, 255)),
        ("IN THE GAME", "Level Complete", Image.open(os.path.join(shots, "level1_complete.png")), (120, 220, 255)),
    ]
    tiles = [framed(c[2], H) for c in cols]
    gap, pad, top = 36, 60, 230
    W = pad * 2 + sum(t.width for t in tiles) + gap * (len(tiles) - 1)
    sheet = Image.new("RGBA", (W, top + H + 90), BG + (255,))
    d = ImageDraw.Draw(sheet)
    d.text((W // 2, 70), "Rainbow Cascades - Level 1: your image vs. the playable level", font=font(64), fill=(255, 255, 255), anchor="mm")
    d.text((W // 2, 132), "Phone preview at 1080 x 2400. Your image is 9:16, phones are about 9:20, so the game shows more sky above.",
           font=font(34, 600), fill=(190, 205, 235), anchor="mm")
    x = pad
    for (a, b, _, col), t in zip(cols, tiles):
        d.text((x + t.width // 2, top - 44), a, font=font(36), fill=col, anchor="mm")
        d.text((x + t.width // 2, top + H + 40), b, font=font(34, 600), fill=(220, 228, 245), anchor="mm")
        sheet.alpha_composite(t, (x, top + (H - t.height) // 2))
        x += t.width + gap
    sheet.convert("RGB").save(out, optimize=True)
    print("saved", out, sheet.size)


if __name__ == "__main__":
    main(*sys.argv[1:3])
