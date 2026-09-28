"""Compose the Level 1 preview sheets from screenshots taken by game/scripts/level1_shots.mjs.

Usage: python compose_level1_previews.py <scratch_dir> <out_dir>
scratch_dir holds fira700.ttf / fira600.ttf and one folder of shots per phone:
l1_pixel (412x915 @2.625), l1_galaxy (360x780 @3), l1_tall (384x854 @2.8125), l1_169 (360x640 @3).
"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose_preview_sheets as cps  # noqa: E402
from compose_preview_sheets import BG, label, phone, rounded_mask  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
DIRECTION = os.path.join(ROOT, "art-source/level1_direction.png")


def main(sp, out):
    cps.FONT_DIR = sp
    shots = os.path.join(sp, "l1_pixel")
    pad, head = 60, 150

    # ---- 1. direction image vs the game ----------------------------------------------------
    col_w = 700
    ph = phone(os.path.join(shots, "02_jump.png"), col_w, 28, 2.625)
    ref = Image.open(DIRECTION).convert("RGB")
    ref = ref.resize((int(col_w * 1.035), int(ref.height * col_w * 1.035 / ref.width)), Image.LANCZOS)
    W = pad * 3 + ref.width + ph.width
    H = head + ph.height + pad + 40
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    label(d, (W // 2, 46), "Rainbow Cascades — Level 1: your direction image vs. the game", 38)
    rx, px = pad, pad * 2 + ref.width
    label(d, (rx + ref.width // 2, head - 38), "YOUR IMAGE (Level 1 direction)", 28, (255, 214, 90))
    label(d, (px + ph.width // 2, head - 38), "LEVEL 1 on an Android phone (1080 × 2400)", 28, (120, 230, 255))
    ry = head + ph.height - ref.height - int(ph.width * 0.035)     # bottom-align with the phone screen
    sheet.paste(ref, (rx, ry), rounded_mask(ref.size, 26))
    sheet.paste(ph, (px, head), ph)
    label(d, (rx + ref.width // 2, ry - 70), "The direction image is 9:16; phones are ~9:20,", 22, (200, 210, 235), bold=False)
    label(d, (rx + ref.width // 2, ry - 40), "so the game shows more sky above the path.", 22, (200, 210, 235), bold=False)
    sheet.save(os.path.join(out, "level1_vs_direction.png"))

    # ---- 2. one run, start to finish ---------------------------------------------------------
    frames = [("01_start.png", "1. Start: find Red"), ("03_landed_red.png", "2. Right color: hop on"),
              ("04_wrong_block.png", "3. Wrong color bounces back"), ("06_rainbow_steps.png", "4. Rainbow steps"),
              ("07_gate.png", "5. Into the Rainbow Gate"), ("08_complete.png", "6. Level Complete")]
    phones = [(phone(os.path.join(shots, f), 520, 28, 2.625), cap) for f, cap in frames]
    W = sum(p.width for p, _ in phones) + pad * (len(phones) + 1)
    H = head + max(p.height for p, _ in phones) + 90
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    label(d, (W // 2, 50), "Level 1: Follow the Color Sequence — one run, start to finish", 40)
    x = pad
    for p, cap in phones:
        sheet.paste(p, (x, head), p)
        label(d, (x + p.width // 2, head + p.height + 42), cap, 26, (200, 215, 240), bold=False)
        x += p.width + pad
    sheet.save(os.path.join(out, "level1_play_sequence.png"))

    # ---- 3. several phones -------------------------------------------------------------------
    devs = [("l1_pixel", 412, 915, 2.625, 28, "1080×2400 (20:9) — Pixel class"),
            ("l1_galaxy", 360, 780, 3, 28, "1080×2340 (19.5:9) — Galaxy S class"),
            ("l1_tall", 384, 854, 2.8125, 30, "1080×2400 (20:9) — narrow"),
            ("l1_169", 360, 640, 3, 24, "1080×1920 (16:9) — older phone")]
    target_h = 1500
    phones = []
    for f, w, h, dpr, safe, cap in devs:
        sw = int(target_h * w / h) if h / w > 1.9 else int(target_h * 0.8 * w / h)
        phones.append((phone(os.path.join(sp, f, "01_start.png"), sw, safe, dpr), cap))
    W = sum(p.width for p, _ in phones) + pad * (len(phones) + 1)
    H = head + max(p.height for p, _ in phones) + 90
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    label(d, (W // 2, 50), "Level 1 on different Android phone shapes (portrait, no black bars)", 36)
    x = pad
    top = max(q.height for q, _ in phones)
    for p, cap in phones:
        sheet.paste(p, (x, head + top - p.height), p)
        label(d, (x + p.width // 2, head + top + 40), cap, 22, (200, 215, 240), bold=False)
        x += p.width + pad
    sheet.save(os.path.join(out, "level1_on_phone_sizes.png"))
    print("done")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
