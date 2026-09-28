"""UI regions painted into panel 1 (home screen) of the reference, in 1x panel coordinates.
These are removed from the background so the UI can be rebuilt as live elements on top."""
from PIL import Image, ImageDraw

REGIONS = {
    "avatar": ("ellipse", (8, 1, 55, 47)),
    "level": ("rrect", (53, 6, 122, 38, 8)),
    "wallet": ("rrect", (136, 3, 328, 43, 19)),
    "gear": ("ellipse", (325, 2, 366, 45)),
    "title": ("rrect", (30, 42, 344, 114, 14)),
    "subtitle": ("rrect", (80, 88, 290, 126, 12)),
    "menu": ("rrect", (305, 127, 368, 429, 10)),
    "play": ("rrect", (86, 421, 286, 484, 30)),
    "nav": ("rrect", (4, 481, 366, 554, 12)),
}


def mask(size, names=None, grow=2):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for name, (kind, box) in REGIONS.items():
        if names and name not in names:
            continue
        if kind == "ellipse":
            x0, y0, x1, y1 = box
            d.ellipse((x0 - grow, y0 - grow, x1 + grow, y1 + grow), fill=255)
        else:
            x0, y0, x1, y1, r = box
            d.rounded_rectangle((x0 - grow, y0 - grow, x1 + grow, y1 + grow), radius=r + grow, fill=255)
    return m
