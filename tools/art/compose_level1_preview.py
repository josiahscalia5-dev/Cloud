"""Level 1 screen preview sheets: the reference panel next to the phone screen, and several phones.

    python tools/art/compose_level1_preview.py <shots_dir> <out_dir>

<shots_dir> holds screenshots made with game/scripts/screenshot.mjs (see README):
phone_pixel.png (412x915 @2.625, safe top 28), phone_galaxy.png (360x780 @3, 28),
phone_tall.png (412x960 @2.625, 28), phone_169.png (360x640 @3, 24).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
REF = os.path.join(ROOT, "art-source/rainbow_cascades_reference.png")
PANEL2 = (388, 5, 723, 562)
FONTS = os.path.join(ROOT, "game/node_modules/@fontsource/fira-sans-condensed/files")
BG = (9, 18, 48)


def font(size, bold=True):
    w = 700 if bold else 600
    return ImageFont.truetype(os.path.join(FONTS, f"fira-sans-condensed-latin-{w}-normal.woff"), size)


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def status_bar(img, safe_px, scale):
    """Android status bar (time, camera hole, signal/wifi/battery) over the edge-to-edge app."""
    d = ImageDraw.Draw(img)
    w = img.width
    cy = safe_px // 2 + 2
    d.text((int(22 * scale), cy), "9:41", font=font(int(15 * scale), bold=False), fill=(255, 255, 255), anchor="lm")
    r = int(6.5 * scale)
    d.ellipse((w // 2 - r, cy - r, w // 2 + r, cy + r), fill=(4, 4, 6))
    x = w - int(22 * scale)
    bw, bh = int(22 * scale), int(11 * scale)
    d.rounded_rectangle((x - bw, cy - bh // 2, x, cy + bh // 2), int(3 * scale), outline=(255, 255, 255), width=max(1, int(1.4 * scale)))
    d.rectangle((x - bw + int(2.5 * scale), cy - bh // 2 + int(2.5 * scale), x - int(6 * scale), cy + bh // 2 - int(2.5 * scale)), fill=(255, 255, 255))
    x -= bw + int(9 * scale)
    for i in range(4):
        hh = int((4 + i * 3) * scale)
        d.rectangle((x - int((16 - i * 4) * scale), cy + int(6 * scale) - hh, x - int((13.5 - i * 4) * scale), cy + int(6 * scale)), fill=(255, 255, 255))


def phone(shot_path, screen_w, safe_css, dpr):
    s = Image.open(shot_path).convert("RGB")
    k = screen_w / s.width
    s = s.resize((screen_w, int(s.height * k)), Image.LANCZOS)
    status_bar(s, int(safe_css * dpr * k), dpr * k)
    bez = int(screen_w * 0.035)
    rad = int(screen_w * 0.085)
    body = Image.new("RGBA", (s.width + 2 * bez, s.height + 2 * bez), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle((0, 0, body.width - 1, body.height - 1), rad + bez, fill=(20, 22, 30), outline=(92, 98, 118), width=max(2, bez // 6))
    body.paste(s, (bez, bez), rounded_mask(s.size, rad))
    return body


def label(draw, xy, text, size, fill=(255, 255, 255), anchor="mm", bold=True):
    draw.text(xy, text, font=font(size, bold), fill=fill, anchor=anchor)


def main(shots, out):
    pad, head = 60, 150
    # ---- 1. reference panel vs the phone ------------------------------------------------
    ref = Image.open(REF).convert("RGB").crop(PANEL2)
    col_w = 700
    ph = phone(os.path.join(shots, "phone_pixel.png"), col_w, 28, 2.625)
    ref_img = ref.resize((int(col_w * 1.035), int(ref.height * col_w * 1.035 / ref.width)), Image.LANCZOS)
    W = pad * 3 + ref_img.width + ph.width
    H = head + ph.height + pad
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    label(d, (W // 2, 46), "Level 1, “Jump on the matching colors”: your screen vs. the phone", 38)
    rx, px = pad, pad * 2 + ref_img.width
    label(d, (rx + ref_img.width // 2, head - 38), "YOUR SCREEN (Level 1 gameplay panel)", 28, (255, 214, 90))
    label(d, (px + ph.width // 2, head - 38), "THE GAME on an Android phone (1080 × 2400)", 28, (120, 230, 255))
    ry = head + ph.height - ref_img.height - int(ph.width * 0.035)
    sheet.paste(ref_img, (rx, ry), rounded_mask(ref_img.size, 26))
    sheet.paste(ph, (px, head), ph)
    for i, line in enumerate(["Your screen is 3:5; phones are about 9:20, so the phone",
                              "shows more sky between the colour panel and the islands.",
                              "The scene below it is your artwork, piece for piece."]):
        label(d, (rx + ref_img.width // 2, ry - 120 + i * 32), line, 23, (200, 210, 235), bold=False)
    sheet.save(os.path.join(out, "compare_level1_screen_vs_reference.png"))

    # ---- 2. several phone shapes ----------------------------------------------------------
    devs = [("phone_pixel.png", 412, 915, 2.625, 28, "1080×2400 (20:9), Pixel class"),
            ("phone_galaxy.png", 360, 780, 3, 28, "1080×2340 (19.5:9), Galaxy S class"),
            ("phone_tall.png", 412, 960, 2.625, 28, "1080×2520 (21:9), tall"),
            ("phone_169.png", 360, 640, 3, 24, "1080×1920 (16:9), older phone")]
    target_h = 1500
    phones = []
    for f, w, h, dpr, safe, cap in devs:
        sw = int(target_h * w / h) if h / w > 1.9 else int(target_h * 0.8 * w / h)
        phones.append((phone(os.path.join(shots, f), sw, safe, dpr), cap))
    mh = max(p.height for p, _ in phones)
    W = sum(p.width for p, _ in phones) + pad * (len(phones) + 1)
    H = head + mh + 90
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    label(d, (W // 2, 50), "The Level 1 screen on different Android phone shapes", 36)
    x = pad
    for p, cap in phones:
        sheet.paste(p, (x, head + mh - p.height), p)
        label(d, (x + p.width // 2, head + mh + 40), cap, 22, (200, 215, 240), bold=False)
        x += p.width + pad
    sheet.save(os.path.join(out, "level1_screen_on_phone_sizes.png"))

    Image.open(os.path.join(shots, "phone_pixel.png")).save(os.path.join(out, "level1_screen_1080x2400.png"))
    print("done")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
