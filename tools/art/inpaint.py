"""Object removal / outpainting with LaMa (big-lama TorchScript, Apache-2.0).

inpaint(img_rgb_uint8, mask_uint8) -> rgb uint8. Mask: 255 = fill.
"""
import numpy as np
import torch

_model = {}


def _load(path):
    if path not in _model:
        m = torch.jit.load(path, map_location="cpu")
        m.eval()
        _model[path] = m
    return _model[path]


def inpaint(img, mask, model_path):
    model = _load(model_path)
    h, w = img.shape[:2]
    ph, pw = (8 - h % 8) % 8, (8 - w % 8) % 8
    im = np.pad(img, ((0, ph), (0, pw), (0, 0)), mode="reflect").astype(np.float32) / 255.0
    mk = np.pad(mask, ((0, ph), (0, pw)), mode="reflect").astype(np.float32) / 255.0
    mk = (mk > 0.5).astype(np.float32)
    t_img = torch.from_numpy(im).permute(2, 0, 1)[None]
    t_mask = torch.from_numpy(mk)[None, None]
    with torch.no_grad():
        out = model(t_img, t_mask)[0].permute(1, 2, 0).numpy()
    out = np.clip(out * 255, 0, 255).astype(np.uint8)[:h, :w]
    # keep original pixels outside the mask exactly
    m = (mask > 127)[..., None]
    return np.where(m, out, img)
