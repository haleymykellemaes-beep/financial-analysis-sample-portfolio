#!/usr/bin/env python3
"""Build the soft desk-photo cutout used by chart-prototype/desk.html.

    python3 make-cutout.py <photo.jpg> <person-matte.png> <out.webp>

Inputs
  photo.jpg         The original 1672x941 desk photo.
  person-matte.png  Grayscale matte of the person, same size. Made with the
                    BiRefNet general model (ONNX build published with the
                    rembg project), input 1024x1024, ImageNet normalisation,
                    sigmoid of the first output, resized back with bicubic.

What it does
  1. Person: the model matte (hair, face, hands, jacket). The wicker chair and
     the wall are background, so the chart can show beside the shoulders.
  2. Laptop: the back of the screen is traced as a polygon (anti-aliased),
     because the model drops it.
  3. Desk: everything below the wall/desk line is kept, fading out toward the
     left so it does not run under the hero copy.
  4. Edge clean-up: the beige wall is removed from semi-transparent hair and
     jacket edges (colour decontamination against a local background
     estimate), then the matte is feathered slightly. Pixels with full
     opacity, including the face, keep their original colours.
  5. Crops away the empty wall on the left and writes a WebP with alpha.
Requires numpy, scipy and Pillow.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

CROP_LEFT = 520                 # source x where the output starts
DESK_FADE = (650, 980)          # desk alpha ramps 0 -> 1 across these source x
LAPTOP = [                      # back of the laptop screen, source px
    (1378, 636), (1386, 630), (1672, 624), (1672, 941), (1318, 941),
    (1321, 927), (1330, 880), (1350, 800), (1370, 700),
]
FEATHER = 0.7                   # px, Gaussian sigma applied to the final matte


def desk_edge(rgb):
    """Row where the wall meets the desk, per column (smoothed)."""
    lum = rgb.mean(axis=2)
    band = lum[835:880]
    grad = band[2:] - band[:-2]                      # desk is lighter than the wall
    rows = grad.argmax(axis=0) + 836
    rows = ndimage.median_filter(rows.astype(float), size=61)
    return ndimage.uniform_filter1d(rows, size=101)


def polygon_alpha(size, points, ss=4):
    w, h = size
    big = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(big).polygon([(x * ss, y * ss) for x, y in points], fill=255)
    return np.asarray(big.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def main(photo, matte, out):
    img = Image.open(photo).convert("RGB")
    rgb = np.asarray(img, dtype=np.float32)
    h, w = rgb.shape[:2]
    person = np.asarray(Image.open(matte).convert("L").resize((w, h)), dtype=np.float32) / 255

    # Desk: below the wall/desk line, fading in from the left.
    edge = desk_edge(rgb)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    desk = np.clip(yy - edge[None, :] + 0.5, 0, 1)
    fade = np.clip((xx - DESK_FADE[0]) / (DESK_FADE[1] - DESK_FADE[0]), 0, 1)
    desk *= fade * fade * (3 - 2 * fade)             # smoothstep

    laptop = polygon_alpha((w, h), LAPTOP)
    alpha = np.maximum.reduce([person, laptop, desk])

    # Background estimate from clearly-background pixels (wall and chair), then
    # solve I = a*F + (1 - a)*B for F on the soft edges only.
    bg_w = (alpha < 0.03).astype(np.float32)
    B = np.empty_like(rgb)
    for c in range(3):
        num = ndimage.gaussian_filter(rgb[..., c] * bg_w, 8)
        den = ndimage.gaussian_filter(bg_w, 8)
        num2 = ndimage.gaussian_filter(rgb[..., c] * bg_w, 40)
        den2 = ndimage.gaussian_filter(bg_w, 40)
        B[..., c] = np.where(den > 0.02, num / np.maximum(den, 1e-6), num2 / np.maximum(den2, 1e-6))
    a = alpha[..., None]
    F = np.clip(B + (rgb - B) / np.maximum(a, 0.12), 0, 255)
    F = np.where(alpha[..., None] >= 0.985, rgb, F)

    # Where the matte is faint the solved colour is unreliable, and feathering
    # will reach pixels that were pure wall. Give those pixels the colour of the
    # nearby foreground instead, so no beige can leak back in.
    fg_w = (alpha > 0.6).astype(np.float32)
    den = ndimage.gaussian_filter(fg_w, 2.5)
    F_near = np.dstack([ndimage.gaussian_filter(F[..., c] * fg_w, 2.5) for c in range(3)]) / np.maximum(den, 1e-6)[..., None]
    t = np.clip((alpha - 0.1) / 0.3, 0, 1)[..., None]       # 0 below a=0.1, 1 above a=0.4
    use_near = (den > 1e-3)[..., None]
    out_rgb = np.where(use_near, t * F + (1 - t) * F_near, F)

    # Trim haze (chair texture between hair strands), then feather slightly.
    alpha = np.clip((alpha - 0.06) / 0.94, 0, 1)
    alpha = np.clip(ndimage.gaussian_filter(alpha, FEATHER), 0, 1)
    alpha[alpha < 0.01] = 0

    rgba = np.dstack([out_rgb, alpha * 255]).round().astype(np.uint8)
    cut = Image.fromarray(rgba, "RGBA").crop((CROP_LEFT, 0, w, h))
    cut.save(out, "WEBP", quality=90, alpha_quality=100, method=6)
    print(f"wrote {out}: {cut.size[0]}x{cut.size[1]}, desk edge rows {edge.min():.0f}-{edge.max():.0f}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
