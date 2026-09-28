"""Rebuild every Level 1 asset from art-source/level1_direction.png (and the reference sheet).

    python tools/art/pipeline_level1.py <work_dir>

Same models as pipeline.py (downloaded on first run). Steps:
  1. 4x Real-ESRGAN of the direction image and of the reference sheet
  2. backdrop without HUD / platforms / pickups / boy / gate (build_level1_clean.py)
  3. sprites, HUD pieces, gate, foreground bush (build_level1_art.py)
  4. jelly platforms in every sequence colour (build_level1_platforms.py)
  5. sea of clouds + taller canvas (build_level1_bg.py), then 4x Real-ESRGAN of the result
  6. Level Complete card from reference panel 10 (build_level1_complete.py)
and copies the results into game/public/assets/level1/.
"""
import os
import shutil
import subprocess
import sys
import urllib.request

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
REF = os.path.join(ROOT, "art-source/rainbow_cascades_reference.png")
DIRECTION = os.path.join(ROOT, "art-source/level1_direction.png")
OUT = os.environ.get("RC_ASSET_OUT", os.path.join(ROOT, "game/public/assets/level1"))
sys.path.insert(0, HERE)
from pipeline import MODELS, PANELS  # noqa: E402

# Mirrors used when a host in MODELS cannot be reached.
MIRRORS = {"birefnet.onnx": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-epoch_244.onnx"}
BG_WIDTH = 1152                  # same width as the home background


def run(*cmd):
    print("+", " ".join(cmd), flush=True)
    subprocess.run([sys.executable, *cmd], check=True)


def fetch_models(models):
    os.makedirs(models, exist_ok=True)
    for name, url in MODELS.items():
        dst = os.path.join(models, name)
        if os.path.exists(dst):
            continue
        for u in (url, MIRRORS.get(name)):
            if not u:
                continue
            try:
                print("downloading", name, "from", u, flush=True)
                urllib.request.urlretrieve(u, dst)
                break
            except OSError as e:
                print("  failed:", e, flush=True)
        else:
            sys.exit(f"could not download {name}")


def cloud_stamp(ref_x4, out_path):
    """The cloud from panel 4 (as in pipeline.py), with the holes left by its debris filled."""
    p4 = PANELS[4]
    im = np.asarray(Image.open(ref_x4).convert("RGB").crop(tuple(v * 4 for v in p4)).crop((28, 320, 320, 660)))
    lo, hi = np.percentile(im[..., 0], 8), np.percentile(im[..., 0], 92)
    lo = lo + (hi - lo) * 0.25
    a = cv2.GaussianBlur(np.clip((im[..., 0].astype(np.float32) - lo) / (hi - lo), 0, 1), (0, 0), 1.0) * 255
    debris = [(185, 0, 245, 40), (40, 195, 80, 235), (15, 260, 75, 320), (140, 0, 292, 20)]
    for (x0, y0, x1, y1) in debris:
        a[y0:y1, x0:x1] = 0
    a[:, 262:] = 0
    rgb = im.copy()
    blur = cv2.GaussianBlur(im, (0, 0), 8)
    rgb[a < 1] = blur[a < 1]
    a = cv2.GaussianBlur(a, (0, 0), 2).astype(np.uint8)
    holes = np.zeros(a.shape, np.uint8)
    for (x0, y0, x1, y1) in debris[1:3]:            # these two sit inside the cloud
        holes[y0 - 3:y1 + 3, x0 - 3:x1 + 3] = 255
    rgb = cv2.inpaint(np.ascontiguousarray(rgb), holes, 9, cv2.INPAINT_TELEA)
    a = cv2.inpaint(np.ascontiguousarray(a), holes, 9, cv2.INPAINT_TELEA).astype(np.float32)
    a *= np.clip((262 - np.arange(a.shape[1], dtype=np.float32)[None]) / 40, 0, 1)
    Image.fromarray(np.dstack([rgb, a.astype(np.uint8)])).save(out_path)


def main(work):
    models = os.path.join(work, "models")
    l1 = os.path.join(work, "l1")
    out = os.path.join(work, "l1_out")
    for d in (l1, out, os.path.join(work, "clouds")):
        os.makedirs(d, exist_ok=True)
    fetch_models(models)
    esrgan = os.path.join(models, "RealESRGAN_x4plus_anime_6B.pth")

    ref_x4 = os.path.join(work, "ref_x4.png")
    if not os.path.exists(ref_x4):
        run(os.path.join(HERE, "upscale.py"), esrgan, REF, ref_x4)
    shutil.copy(DIRECTION, os.path.join(l1, "direction.png"))
    if not os.path.exists(os.path.join(l1, "direction_x4.png")):
        run(os.path.join(HERE, "upscale.py"), esrgan, DIRECTION, os.path.join(l1, "direction_x4.png"))

    run(os.path.join(HERE, "build_level1_clean.py"), l1, models)
    run(os.path.join(HERE, "build_level1_art.py"), l1, models, out)
    run(os.path.join(HERE, "build_level1_platforms.py"), l1, models, out)

    stamp = os.path.join(work, "clouds/c4l_level1.png")
    cloud_stamp(ref_x4, stamp)
    bg1 = os.path.join(l1, "bg_level1_1x.png")
    run(os.path.join(HERE, "build_level1_bg.py"), l1, stamp, bg1)
    bg4 = os.path.join(l1, "bg_level1_x4.png")
    run(os.path.join(HERE, "upscale.py"), esrgan, bg1, bg4)
    Image.MAX_IMAGE_PIXELS = None
    big = Image.open(bg4)
    big.resize((BG_WIDTH, round(big.height * BG_WIDTH / big.width)), Image.LANCZOS).save(
        os.path.join(out, "bg_level1.webp"), quality=86, method=6)

    p10 = os.path.join(work, "p10_x4.png")
    Image.open(ref_x4).crop(tuple(v * 4 for v in PANELS[10])).save(p10)
    run(os.path.join(HERE, "build_level1_complete.py"), p10, models, out)

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".webp") or f in ("platforms.json", "complete.json"):
            shutil.copy(os.path.join(out, f), OUT)
    print("assets written to", OUT)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
