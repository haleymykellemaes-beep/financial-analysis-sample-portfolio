"""Rebuild assets/haley-headshot.webp: the headshot on a transparent background.

    python3 make_headshot_cutout.py <headshot.jpg|webp> <BiRefNet-portrait.onnx> <out.webp>

1. Matte: BiRefNet (portrait), run locally with ONNX Runtime at 1024 x 1024 and
   scaled back to the photo's size. Model: rembg's BiRefNet-portrait-epoch_150.onnx.
2. Edges: where the matte is partly transparent (hair), the colour is re-estimated
   without the beige wall behind it (pymatting). Fully opaque pixels, the whole
   face included, keep their original values; the script checks this.

Needs: numpy, pillow, onnxruntime, pymatting.
"""
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image
from pymatting import estimate_foreground_ml


def main(src, model, out):
    photo = Image.open(src).convert("RGB")
    w, h = photo.size
    x = np.asarray(photo.resize((1024, 1024), Image.BICUBIC), np.float32) / 255.0
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    y = ort.InferenceSession(model, providers=["CPUExecutionProvider"]).run(None, {"input_image": x})[0][0, 0]
    if y.min() < 0 or y.max() > 1:
        y = 1 / (1 + np.exp(-y))
    alpha = np.asarray(Image.fromarray((np.clip(y, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float64) / 255
    alpha[alpha < 0.02] = 0

    img = np.asarray(photo, np.float64) / 255
    fg = estimate_foreground_ml(img, alpha)
    edge = (alpha > 0) & (alpha < 0.98)
    res = img.copy()
    res[edge] = fg[edge]
    opaque = alpha >= 0.98
    assert np.array_equal(res[opaque], img[opaque]), "opaque pixels must keep their original values"

    rgba = np.dstack([np.clip(res, 0, 1) * 255, alpha * 255]).round().astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out, lossless=True, method=6, exact=True)
    print(f"saved {out} ({w} x {h}); {int(edge.sum())} edge pixels cleaned")


if __name__ == "__main__":
    main(*sys.argv[1:4])
