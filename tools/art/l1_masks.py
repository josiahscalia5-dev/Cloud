"""Regions of the Level 1 direction image (941x1672) that hold gameplay objects or HUD.
They are removed from the backdrop because the game draws them live."""
import cv2
import numpy as np

HUD = [("rect", (0, 0, 941, 104)), ("rrect", (136, 102, 804, 264, 24)), ("rrect", (106, 1518, 835, 1622, 22))]
PLATFORMS = [
    ("poly", [(0, 1232), (280, 1162), (578, 1166), (614, 1290), (608, 1548), (0, 1562)]),   # red
    ("poly", [(418, 1276), (704, 1276), (704, 1566), (418, 1566)]),                         # light below yellow
    ("poly", [(328, 1018), (420, 1002), (738, 1006), (748, 1302), (336, 1302)]),            # yellow
    ("poly", [(418, 856), (738, 846), (744, 1028), (418, 1034)]),                           # blue
    ("poly", [(508, 716), (762, 712), (768, 852), (508, 852)]),                             # green
    ("poly", [(598, 636), (802, 636), (802, 748), (598, 748)]),                             # purple
    ("poly", [(708, 578), (834, 578), (838, 702), (708, 702)]),                             # far steps
]
PICKUPS = [("rect", b) for b in [(566, 560, 650, 670), (688, 546, 784, 630), (776, 700, 860, 810),
                                 (456, 626, 564, 774), (756, 846, 838, 960), (78, 1006, 202, 1188),
                                 (56, 450, 108, 520), (216, 490, 268, 568), (126, 790, 174, 850), (620, 500, 674, 580)]]


def draw(shape, items, grow=0):
    m = np.zeros(shape, np.uint8)
    for kind, v in items:
        if kind == "rect":
            x0, y0, x1, y1 = v
            cv2.rectangle(m, (x0 - grow, y0 - grow), (x1 + grow, y1 + grow), 255, -1)
        elif kind == "rrect":
            x0, y0, x1, y1, r = v
            cv2.rectangle(m, (x0 + r, y0), (x1 - r, y1), 255, -1)
            cv2.rectangle(m, (x0, y0 + r), (x1, y1 - r), 255, -1)
            for cx, cy in [(x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)]:
                cv2.circle(m, (cx, cy), r, 255, -1)
        else:
            cv2.fillPoly(m, [np.array(v, np.int32)], 255)
    if grow:
        m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=grow)
    return m
