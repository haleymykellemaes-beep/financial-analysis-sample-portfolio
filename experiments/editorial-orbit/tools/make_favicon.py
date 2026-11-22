"""Rebuild assets/favicon.svg: "HM" in Libre Caslon Display, as outlines.

    python3 make_favicon.py <LibreCaslonDisplay-Regular.(ttf|woff2)> <out.svg>

Browser tabs can't load web fonts, so the two letters are converted to paths.
The letters are ink on a paper tile, and switch to paper on ink in dark mode.
Needs: fonttools (and brotli for .woff2).
"""
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


def main(font_path, out):
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    names = [cmap[ord(c)] for c in "HM"]
    tracking = 20  # font units between the letters

    # Lay the letters out on one baseline and measure the ink.
    x, placed = 0, []
    for name in names:
        placed.append((name, x))
        x += glyphs[name].width + tracking
    bounds = BoundsPen(glyphs)
    for name, dx in placed:
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, 1, dx, 0)))
    x0, y0, x1, y1 = bounds.bounds

    # Fit the ink into a 64 x 64 tile with even margins (y flipped for SVG).
    size, margin = 64, 7
    scale = (size - 2 * margin) / max(x1 - x0, y1 - y0)
    ox = (size - (x1 - x0) * scale) / 2 - x0 * scale
    oy = (size + (y1 - y0) * scale) / 2 + y0 * scale
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    for name, dx in placed:
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, ox + dx * scale, oy)))

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
  <style>
    .tile {{ fill: #F7F3EF; }}
    .ink {{ fill: #151213; }}
    @media (prefers-color-scheme: dark) {{ .tile {{ fill: #151213; }} .ink {{ fill: #F7F3EF; }} }}
  </style>
  <rect class="tile" width="{size}" height="{size}" rx="14"/>
  <path class="ink" d="{pen.getCommands()}"/>
</svg>
"""
    with open(out, "w") as f:
        f.write(svg)
    print("saved", out)


if __name__ == "__main__":
    main(*sys.argv[1:3])
