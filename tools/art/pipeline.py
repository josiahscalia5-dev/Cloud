"""Rebuild every home-screen asset from art-source/rainbow_cascades_reference.png.

    python tools/art/pipeline.py <work_dir>

Downloads the models on first run (Real-ESRGAN anime 4x, LaMa, ISNet, BiRefNet), then:
crop panels -> 4x upscale -> cut islands / cloud / title / UI -> build the tall background,
and copies the results into game/public/assets/home/.
Needs: pip install torch (CPU) onnxruntime opencv-python-headless pillow numpy scipy
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
OUT = os.environ.get("RC_ASSET_OUT", os.path.join(ROOT, "game/public/assets/home"))
sys.path.insert(0, HERE)

MODELS = {
    "RealESRGAN_x4plus_anime_6B.pth": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
    "big-lama.pt": "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt",
    "birefnet.onnx": ["https://huggingface.co/onnx-community/BiRefNet-ONNX/resolve/main/onnx/model.onnx",
                      "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-epoch_244.onnx"],
}
# Panel boxes in the 1536x1024 reference (x0, y0, x1, y1).
PANELS = {1: (5, 5, 374, 562), 2: (388, 5, 723, 562), 3: (733, 5, 1020, 562), 4: (1030, 5, 1277, 562),
          5: (1291, 5, 1531, 562), 6: (5, 573, 301, 1018), 7: (312, 573, 607, 1018), 8: (617, 573, 930, 1018),
          9: (940, 573, 1234, 1018), 10: (1244, 573, 1531, 1018)}
# Floating islands reused to fill the taller phone sky: key -> (panel, 1x box in that panel).
ISLANDS = {"p3a": (3, (8, 8, 115, 130)), "p9a": (9, (4, 30, 85, 128)), "p8a": (8, (20, 5, 105, 105))}


def run(cmd):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def ensure_models(work):
    os.makedirs(os.path.join(work, "models"), exist_ok=True)
    for name, urls in MODELS.items():
        dst = os.path.join(work, "models", name)
        for url in ([urls] if isinstance(urls, str) else urls):
            if os.path.exists(dst):
                break
            print("downloading", name, "from", url, flush=True)
            try:
                urllib.request.urlretrieve(url, dst + ".part")
                os.replace(dst + ".part", dst)
            except OSError as e:          # host unreachable or blocked: try the next mirror
                print("  failed:", e, flush=True)
        if not os.path.exists(dst):
            sys.exit(f"could not download {name}")


def cloud_stamp(work):
    """Cloud stamp from panel 4 (keyed off the blue sky by its red channel, debris removed).
    Needs <work>/p4_x4.png; writes <work>/clouds/c4l_clean.png."""
    os.makedirs(os.path.join(work, "clouds"), exist_ok=True)
    im = np.asarray(Image.open(os.path.join(work, "p4_x4.png")).crop((7 * 4, 80 * 4, 80 * 4, 165 * 4)))
    lo, hi = np.percentile(im[..., 0], 8), np.percentile(im[..., 0], 92)
    lo = lo + (hi - lo) * 0.25
    a = cv2.GaussianBlur(np.clip((im[..., 0].astype(np.float32) - lo) / (hi - lo), 0, 1), (0, 0), 1.0) * 255
    for (x0, y0, x1, y1) in [(185, 0, 245, 40), (40, 195, 80, 235), (15, 260, 75, 320), (140, 0, 292, 20)]:
        a[y0:y1, x0:x1] = 0
    a[:, 262:] = 0
    rgb = im.copy()
    blur = cv2.GaussianBlur(im, (0, 0), 8)
    m = a < 1
    rgb[m] = blur[m]
    Image.fromarray(np.dstack([rgb, cv2.GaussianBlur(a, (0, 0), 2).astype(np.uint8)])).save(os.path.join(work, "clouds/c4l_clean.png"))


def main(work):
    for d in ("crops", "islands", "clouds", "ui_out"):
        os.makedirs(os.path.join(work, d), exist_ok=True)
    ensure_models(work)

    ref = Image.open(REF).convert("RGB")
    ref.crop(PANELS[1]).save(os.path.join(work, "crops/p1.png"))
    x4 = os.path.join(work, "ref_x4.png")
    if not os.path.exists(x4):
        run([sys.executable, os.path.join(HERE, "upscale.py"), os.path.join(work, "models/RealESRGAN_x4plus_anime_6B.pth"), REF, x4])
    Image.MAX_IMAGE_PIXELS = None
    big = Image.open(x4).convert("RGB")
    for k in (1, 3, 4, 8, 9):
        big.crop(tuple(v * 4 for v in PANELS[k])).save(os.path.join(work, f"p{k}_x4.png"))
    del big

    # islands (BiRefNet matte)
    from segment import get_mask_birefnet
    for key, (p, b) in ISLANDS.items():
        im = np.asarray(Image.open(os.path.join(work, f"p{p}_x4.png")).crop(tuple(v * 4 for v in b)))
        np.save(os.path.join(work, f"islands/{key}_bir.npy"), get_mask_birefnet(im, os.path.join(work, "models/birefnet.onnx")))
        Image.fromarray(im).save(os.path.join(work, f"islands/{key}.png"))

    cloud_stamp(work)

    # title logo matte (colour-seeded GrabCut)
    from logo_matte import logo_mask
    t = np.asarray(Image.open(os.path.join(work, "p1_x4.png")).crop((26 * 4, 38 * 4, 348 * 4, 130 * 4)))
    Image.fromarray(t).save(os.path.join(work, "crops/title_cut.png"))
    np.save(os.path.join(work, "crops/title_gc.npy"), logo_mask(t))

    run([sys.executable, os.path.join(HERE, "build_home_ui.py"), os.path.join(work, "p1_x4.png"), os.path.join(work, "crops"), os.path.join(work, "ui_out")])
    run([sys.executable, os.path.join(HERE, "build_home_bg.py"), work, os.path.join(work, "bg_home.webp")])

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(os.path.join(work, "ui_out")):
        if f.endswith(".webp"):
            shutil.copy(os.path.join(work, "ui_out", f), OUT)
    shutil.copy(os.path.join(work, "bg_home.webp"), OUT)
    print("assets written to", OUT)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
