"""Level 1 preview sheets.

    python tools/art/compose_level1_sheet.py <shots_dir> <out_dir>

shots_dir holds the screenshots from game/scripts/level1_preview.mjs (1080 x 2400 phone). Writes
- compare_level1_vs_direction.png: the Level 1 direction image next to the start of the level
- compare_level1_stages_vs_reference.png: each panel of the reference sheet above the same moment
  in the game, from the colour sequence to Level Complete
Fonts come from game/node_modules/@fontsource/fira-sans-condensed (npm install in game/).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
FONTS = os.path.join(ROOT, "game/node_modules/@fontsource/fira-sans-condensed/files")
BG = (9, 18, 48)
GOLD, CYAN, TEXT = (255, 214, 102), (120, 220, 255), (220, 228, 245)
# reference sheet panels (1536 x 1024), as in pipeline.py
PANELS = {2: (388, 5, 723, 562), 3: (733, 5, 1020, 562), 4: (1030, 5, 1277, 562), 5: (1291, 5, 1531, 562),
          6: (5, 573, 301, 1018), 7: (312, 573, 607, 1018), 8: (617, 573, 930, 1018), 9: (940, 573, 1234, 1018),
          10: (1244, 573, 1531, 1018)}
# (reference panel, game screenshot, caption) in the order the level plays
STAGES = [
    (2, "level1_jump.png", "1  Color sequence"),
    (3, "level1_stage2_play.png", "2  Platforms rotate"),
    (6, "level1_secret.png", "Secret rainbow route"),
    (7, "level1_stage3_play.png", "3  Moving platforms"),
    (5, "level1_stage4_play.png", "4  Fake platforms"),
    (4, "level1_stage5_play.png", "5  Dodge the cloud"),
    (8, "level1_stage6_fork.png", "6  Choose your path"),
    (9, "level1_stage7_play.png", "7  Rainbow Gate"),
    (10, "level1_complete.png", "Level Complete"),
]


def font(size, weight=700):
    return ImageFont.truetype(os.path.join(FONTS, f"fira-sans-condensed-latin-{weight}-normal.woff"), size)


def framed(img, h, r=24, w=None):
    img = img.convert("RGB")
    if w:                                   # fit inside w x h, keeping the aspect ratio
        s = min(w / img.width, h / img.height)
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    else:
        img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def direction_sheet(shots, out):
    H = 1100
    cols = [
        ("YOUR IMAGE", "Level 1 direction", Image.open(os.path.join(ROOT, "art-source/level1_direction.png")), GOLD),
        ("IN THE GAME", "first jump", Image.open(os.path.join(shots, "level1_jump.png")), CYAN),
        ("IN THE GAME", "start: next block glows", Image.open(os.path.join(shots, "level1_start.png")), CYAN),
        ("IN THE GAME", "wrong colour", Image.open(os.path.join(shots, "level1_wrong.png")), CYAN),
    ]
    tiles = [framed(c[2], H) for c in cols]
    gap, pad, top = 36, 60, 230
    W = pad * 2 + sum(t.width for t in tiles) + gap * (len(tiles) - 1)
    sheet = Image.new("RGBA", (W, top + H + 90), BG + (255,))
    d = ImageDraw.Draw(sheet)
    d.text((W // 2, 70), "Level 1 - the opening stage vs. your direction image", font=font(60), fill=(255, 255, 255), anchor="mm")
    d.text((W // 2, 132), "Phone preview at 1080 x 2400. Your image is 9:16, phones are about 9:20, so the game shows more sky.",
           font=font(32, 600), fill=(190, 205, 235), anchor="mm")
    x = pad
    for (a, b, _, col), t in zip(cols, tiles):
        d.text((x + t.width // 2, top - 44), a, font=font(36), fill=col, anchor="mm")
        d.text((x + t.width // 2, top + H + 40), b, font=font(34, 600), fill=TEXT, anchor="mm")
        sheet.alpha_composite(t, (x, top + (H - t.height) // 2))
        x += t.width + gap
    sheet.convert("RGB").save(out, optimize=True)
    print("saved", out, sheet.size)


def stages_sheet(shots, out):
    ref = Image.open(os.path.join(ROOT, "art-source/rainbow_cascades_reference.png"))
    cw, rh, gh = 330, 560, 734                 # column width, reference row height, game row height
    gap, pad, top = 28, 50, 190
    W = pad * 2 + len(STAGES) * cw + (len(STAGES) - 1) * gap
    H = top + 60 + rh + 70 + gh + 110
    sheet = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(sheet)
    d.text((W // 2, 64), "Level 1 from start to finish: your reference panels vs. the playable level", font=font(60), fill=(255, 255, 255), anchor="mm")
    d.text((W // 2, 124), "One continuous level: 7 stages plus a secret route, played in this order from left to right, ending at the Rainbow Gate.",
           font=font(32, 600), fill=(190, 205, 235), anchor="mm")
    d.text((pad, top + 20), "YOUR REFERENCE", font=font(34), fill=GOLD, anchor="lm")
    y_game = top + 60 + rh + 70
    d.text((pad, y_game - 34), "IN THE GAME (1080 x 2400 phone)", font=font(34), fill=CYAN, anchor="lm")
    x = pad
    for panel, shot, cap in STAGES:
        rp = framed(ref.crop(PANELS[panel]).resize((ref.crop(PANELS[panel]).width * 3, ref.crop(PANELS[panel]).height * 3), Image.LANCZOS), rh, 20, cw)
        sheet.alpha_composite(rp, (x + (cw - rp.width) // 2, top + 60 + (rh - rp.height) // 2))
        gm = framed(Image.open(os.path.join(shots, shot)), gh, 20, cw)
        sheet.alpha_composite(gm, (x + (cw - gm.width) // 2, y_game))
        d.text((x + cw // 2, y_game + gh + 44), cap, font=font(32), fill=TEXT, anchor="mm")
        if panel != 10:
            d.text((x + cw + gap // 2, y_game + gh // 2), ">", font=font(40), fill=(120, 150, 210), anchor="mm")
        x += cw + gap
    sheet.convert("RGB").save(out, optimize=True)
    print("saved", out, sheet.size)


def main(shots, out_dir):
    direction_sheet(shots, os.path.join(out_dir, "compare_level1_vs_direction.png"))
    stages_sheet(shots, os.path.join(out_dir, "compare_level1_stages_vs_reference.png"))


if __name__ == "__main__":
    main(*sys.argv[1:3])
