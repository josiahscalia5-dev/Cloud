"""Compose the preview deliverables: reference-vs-preview comparison and multi-device sheet.

Usage: python compose_preview_sheets.py <scratch_dir> <out_dir>
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SP, OUT = sys.argv[1], sys.argv[2]
BG = (9, 18, 48)
F7 = os.path.join(SP, "fira700.ttf")
F6 = os.path.join(SP, "fira600.ttf")


def font(size, bold=True):
    return ImageFont.truetype(F7 if bold else F6, size)


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def status_bar(img, safe_px, scale):
    """Android status bar (time, camera hole, signal/wifi/battery) drawn over the edge-to-edge app."""
    d = ImageDraw.Draw(img)
    w = img.width
    cy = safe_px // 2 + 2
    f = font(int(15 * scale), bold=False)
    d.text((int(22 * scale), cy), "9:41", font=f, fill=(255, 255, 255), anchor="lm")
    r = int(6.5 * scale)
    d.ellipse((w // 2 - r, cy - r, w // 2 + r, cy + r), fill=(4, 4, 6))
    x = w - int(22 * scale)
    bw, bh = int(22 * scale), int(11 * scale)       # battery
    d.rounded_rectangle((x - bw, cy - bh // 2, x, cy + bh // 2), int(3 * scale), outline=(255, 255, 255), width=max(1, int(1.4 * scale)))
    d.rectangle((x - bw + int(2.5 * scale), cy - bh // 2 + int(2.5 * scale), x - int(6 * scale), cy + bh // 2 - int(2.5 * scale)), fill=(255, 255, 255))
    d.rectangle((x + 1, cy - int(2.5 * scale), x + int(2.5 * scale), cy + int(2.5 * scale)), fill=(255, 255, 255))
    x -= bw + int(9 * scale)
    for i in range(4):                               # signal
        hh = int((4 + i * 3) * scale)
        d.rectangle((x - int((16 - i * 4) * scale), cy + int(6 * scale) - hh, x - int((13.5 - i * 4) * scale), cy + int(6 * scale)), fill=(255, 255, 255))
    x -= int(24 * scale)
    for i, rr in enumerate([10, 7, 4]):              # wifi
        rr = int(rr * scale)
        d.arc((x - rr, cy + int(5 * scale) - rr, x + rr, cy + int(5 * scale) + rr), 225, 315, fill=(255, 255, 255), width=max(1, int(2 * scale)))
    d.ellipse((x - int(1.6 * scale), cy + int(3.4 * scale), x + int(1.6 * scale), cy + int(6.6 * scale)), fill=(255, 255, 255))


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


# ---- 1. reference vs preview ---------------------------------------------------------------
ref = Image.open(os.path.join(SP, "crops/p1.png")).convert("RGB")
col_w = 700
ph = phone(os.path.join(SP, "phone_pixel.png"), col_w, 28, 2.625)
ref_img = ref.resize((int(col_w * 1.035), int(ref.height * col_w * 1.035 / ref.width)), Image.LANCZOS)
pad, head = 60, 150
W = pad * 3 + ref_img.width + ph.width
H = head + ph.height + pad + 40
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)
label(d, (W // 2, 46), "Rainbow Cascades — home screen: your image vs. the phone preview", 38)
rx, px = pad, pad * 2 + ref_img.width
label(d, (rx + ref_img.width // 2, head - 38), "YOUR IMAGE (home screen panel)", 28, (255, 214, 90))
label(d, (px + ph.width // 2, head - 38), "PREVIEW on an Android phone (1080 × 2400)", 28, (120, 230, 255))
ry = head + ph.height - ref_img.height - int(ph.width * 0.035)   # bottom-align with the phone screen
sheet.paste(ref_img, (rx, ry), rounded_mask(ref_img.size, 26))
sheet.paste(ph, (px, head), ph)
label(d, (rx + ref_img.width // 2, ry - 70), "The mockup screen is 2:3 — wider than any phone.", 22, (200, 210, 235), bold=False)
label(d, (rx + ref_img.width // 2, ry - 40), "Real phones are ~9:20, so the preview shows more sky.", 22, (200, 210, 235), bold=False)
sheet.save(os.path.join(OUT, "compare_home_vs_reference.png"))

# ---- 2. several phones ------------------------------------------------------------------
devs = [("phone_pixel.png", 412, 915, 2.625, 28, "1080×2400 (20:9) — Pixel class"),
        ("phone_galaxy.png", 360, 780, 3, 28, "1080×2340 (19.5:9) — Galaxy S class"),
        ("phone_tall.png", 384, 854, 2.8125, 30, "1080×2400 (20:9) — narrow"),
        ("phone_169.png", 360, 640, 3, 24, "1080×1920 (16:9) — older phone")]
target_h = 1500
phones = []
for f, w, h, dpr, safe, cap in devs:
    sw = int(target_h * w / h) if h / w > 1.9 else int(target_h * 0.8 * w / h)
    phones.append((phone(os.path.join(SP, f), sw, safe, dpr), cap))
W = sum(p.width for p, _ in phones) + pad * (len(phones) + 1)
H = head + max(p.height for p, _ in phones) + 90
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)
label(d, (W // 2, 50), "Same screen on different Android phone shapes (portrait, no black bars)", 36)
x = pad
for p, cap in phones:
    y = head + (max(q.height for q, _ in phones) - p.height)
    sheet.paste(p, (x, y), p)
    label(d, (x + p.width // 2, head + max(q.height for q, _ in phones) + 40), cap, 22, (200, 215, 240), bold=False)
    x += p.width + pad
sheet.save(os.path.join(OUT, "preview_on_phone_sizes.png"))

# ---- 3. the plain screen, as captured ---------------------------------------------------
Image.open(os.path.join(SP, "phone_pixel.png")).save(os.path.join(OUT, "home_screen_1080x2400.png"))
print("done")
