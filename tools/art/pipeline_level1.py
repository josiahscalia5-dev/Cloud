"""Rebuild every Level 1 asset from art-source/level1_direction.png (and the reference sheet).

    python tools/art/pipeline_level1.py <work_dir>

Uses the same models as pipeline.py (downloaded on first run), then:
4x upscale -> remove the live pieces from the backdrop (LaMa) -> cut sprites and HUD pieces ->
build the tall gameplay background -> generate the jelly-block textures -> cut the Level Complete
card from panel 10 of the reference, and copies the results into game/public/assets/level1/.
"""
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
sys.path.insert(0, HERE)
from pipeline import PANELS, REF, ensure_models, run  # noqa: E402

DIRECTION = os.path.join(ROOT, "art-source/level1_direction.png")
OUT = os.environ.get("RC_LEVEL1_OUT", os.path.join(ROOT, "game/public/assets/level1"))


def main(work):
    ensure_models(work)
    models = os.path.join(work, "models")
    l1 = os.path.join(work, "l1")
    os.makedirs(l1, exist_ok=True)
    Image.MAX_IMAGE_PIXELS = None

    shutil.copy(DIRECTION, os.path.join(l1, "direction.png"))
    up = os.path.join(HERE, "upscale.py")
    esr = os.path.join(models, "RealESRGAN_x4plus_anime_6B.pth")
    if not os.path.exists(os.path.join(l1, "direction_x4.png")):
        run([sys.executable, up, esr, os.path.join(l1, "direction.png"), os.path.join(l1, "direction_x4.png")])
    x4 = os.path.join(work, "ref_x4.png")
    if not os.path.exists(x4):
        run([sys.executable, up, esr, REF, x4])
    big = Image.open(x4).convert("RGB")
    for k in (4, 10):
        big.crop(tuple(v * 4 for v in PANELS[k])).save(os.path.join(work, f"p{k}_x4.png"))
    del big

    out = os.path.join(l1, "out")
    run([sys.executable, os.path.join(HERE, "build_level1_clean.py"), l1, models])
    run([sys.executable, os.path.join(HERE, "build_level1_art.py"), l1, models, out])
    run([sys.executable, os.path.join(HERE, "build_level1_bg.py"), l1, os.path.join(work, "p4_x4.png"), models,
         os.path.join(out, "bg_level1.webp"), "1.25"])
    run([sys.executable, os.path.join(HERE, "build_level1_blocks.py"), out])
    run([sys.executable, os.path.join(HERE, "build_level1_complete.py"), os.path.join(work, "p10_x4.png"), models, out])

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".webp"):
            shutil.copy(os.path.join(out, f), OUT)
    print("assets written to", OUT)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
