"""4x upscale of the reference art with Real-ESRGAN (x4plus_anime_6B), CPU, tiled.

Usage: python upscale.py <weights.pth> <input.png> <output.png>
The anime model is used because the reference is a painted cartoon illustration.
"""
import sys
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image


class ResidualDenseBlock(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(nf, gc)
        self.rdb2 = ResidualDenseBlock(nf, gc)
        self.rdb3 = ResidualDenseBlock(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nb=6, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def upscale(model, img, tile=192, pad=16):
    arr = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    h, w, _ = arr.shape
    out = np.zeros((h * 4, w * 4, 3), np.float32)
    t = torch.from_numpy(arr).permute(2, 0, 1)[None]
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            y0, x0 = max(y - pad, 0), max(x - pad, 0)
            y1, x1 = min(y + tile + pad, h), min(x + tile + pad, w)
            with torch.no_grad():
                o = model(t[:, :, y0:y1, x0:x1]).clamp(0, 1)[0].permute(1, 2, 0).numpy()
            ty1, tx1 = min(y + tile, h), min(x + tile, w)
            out[y * 4:ty1 * 4, x * 4:tx1 * 4] = o[(y - y0) * 4:(ty1 - y0) * 4, (x - x0) * 4:(tx1 - x0) * 4]
        print(f"row {y}/{h}", flush=True)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


if __name__ == "__main__":
    torch.set_num_threads(4)
    net = RRDBNet()
    sd = torch.load(sys.argv[1], map_location="cpu")
    net.load_state_dict(sd.get("params_ema", sd), strict=True)
    net.eval()
    upscale(net, Image.open(sys.argv[2])).save(sys.argv[3])
