"""Rebuild every home-screen asset from art-source/rainbow_cascades_reference.png.

    python tools/art/pipeline.py <work_dir>

Downloads the models on first run (Real-ESRGAN anime 4x, LaMa, ISNet, BiRefNet), then:
4x upscale -> cut the tappable UI pieces (build_home_ui.py) -> background as painted with live
number patches (build_home_exact.py), and copies the results into game/public/assets/home/.
Needs: pip install torch (CPU) onnxruntime opencv-python-headless pillow numpy scipy
"""
import os
import shutil
import subprocess
import sys
import urllib.request

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
    "birefnet.onnx": "https://huggingface.co/onnx-community/BiRefNet-ONNX/resolve/main/onnx/model.onnx",
}
# Panel boxes in the 1536x1024 reference (x0, y0, x1, y1).
PANELS = {1: (5, 5, 374, 562), 2: (388, 5, 723, 562), 3: (733, 5, 1020, 562), 4: (1030, 5, 1277, 562),
          5: (1291, 5, 1531, 562), 6: (5, 573, 301, 1018), 7: (312, 573, 607, 1018), 8: (617, 573, 930, 1018),
          9: (940, 573, 1234, 1018), 10: (1244, 573, 1531, 1018)}


def run(cmd):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main(work):
    os.makedirs(os.path.join(work, "models"), exist_ok=True)
    for d in ("crops", "ui_out"):
        os.makedirs(os.path.join(work, d), exist_ok=True)
    for name, url in MODELS.items():
        dst = os.path.join(work, "models", name)
        if not os.path.exists(dst):
            print("downloading", name, flush=True)
            urllib.request.urlretrieve(url, dst)

    ref = Image.open(REF).convert("RGB")
    ref.crop(PANELS[1]).save(os.path.join(work, "crops/p1.png"))
    x4 = os.path.join(work, "ref_x4.png")
    if not os.path.exists(x4):
        run([sys.executable, os.path.join(HERE, "upscale.py"), os.path.join(work, "models/RealESRGAN_x4plus_anime_6B.pth"), REF, x4])
    Image.MAX_IMAGE_PIXELS = None
    big = Image.open(x4).convert("RGB")
    for k in (1,):
        big.crop(tuple(v * 4 for v in PANELS[k])).save(os.path.join(work, f"p{k}_x4.png"))
    del big

    # title logo matte (colour-seeded GrabCut)
    from logo_matte import logo_mask
    t = np.asarray(Image.open(os.path.join(work, "p1_x4.png")).crop((26 * 4, 38 * 4, 348 * 4, 130 * 4)))
    Image.fromarray(t).save(os.path.join(work, "crops/title_cut.png"))
    np.save(os.path.join(work, "crops/title_gc.npy"), logo_mask(t))

    run([sys.executable, os.path.join(HERE, "build_home_ui.py"), os.path.join(work, "p1_x4.png"), os.path.join(work, "crops"), os.path.join(work, "ui_out")])

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(os.path.join(work, "ui_out")):
        if f.endswith(".webp"):
            shutil.copy(os.path.join(work, "ui_out", f), OUT)
    run([sys.executable, os.path.join(HERE, "build_home_exact.py"), work])     # bg + number patches
    print("assets written to", OUT)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
