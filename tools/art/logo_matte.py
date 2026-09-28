"""Matte for the painted title logo (letters + dark-blue backing plate) over sky.

Colour-seeded GrabCut: the backing plate is saturated mid-blue, letters are saturated
non-sky colours; the sky is very bright. White letter outlines are resolved by GrabCut's
smoothness term because they always sit between plate/letter colours.
"""
import cv2
import numpy as np
from scipy import ndimage as ndi


def logo_mask(a, iters=6):
    hsv = cv2.cvtColor(a, cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    plate = (H > 195) & (H < 245) & (S > 0.8) & (V < 0.93)
    dark = V < 0.45
    letters = (S > 0.55) & ((H < 185) | (H > 250)) | ((H >= 170) & (H <= 200) & (S > 0.85))
    sure_fg = plate | dark | letters
    sure_fg = ndi.binary_opening(sure_fg, iterations=2)
    sky = (V > 0.93) & ((S < 0.7) & (H > 190) & (H < 250) | (S < 0.12))
    near_fg = ndi.binary_dilation(sure_fg, iterations=28)
    m = np.full(a.shape[:2], cv2.GC_PR_FGD, np.uint8)
    m[sky] = cv2.GC_PR_BGD
    m[sky & ~near_fg] = cv2.GC_BGD
    m[sure_fg] = cv2.GC_FGD
    m[:4, :] = m[-4:, :] = cv2.GC_BGD
    m[:, :4] = m[:, -4:] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(a, cv2.COLOR_RGB2BGR), m, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    fg = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    fg = ndi.binary_fill_holes(ndi.binary_closing(fg, iterations=3))
    lab, n = ndi.label(fg)
    if n > 1:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.02 * sizes.max()])
    return fg
