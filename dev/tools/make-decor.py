#!/usr/bin/env python3
"""Generate the homepage hero's decorative layer for the six themes.

    python3 dev/tools/make-decor.py            # rewrites the block in index.html

Writes inline SVG between <!-- decor:start --> and <!-- decor:end --> in
index.html. Every shape is a real vector element: ribbons are bands around
cubic Bezier centre lines (with satin shading across their width), mountains
and hills are paths, clouds are shaded puffs. Colours come from CSS custom
properties set per theme in css/themes.css; css/home.css positions and
animates each slot, and css/themes.css chooses which slots and .dz-<theme>
groups each theme shows.

Slots (each its own <svg>, positioned in % of the hero by css/home.css):
  top      top-right sweep, behind the hair      viewBox 1000 x 470
  side     right edge, beside the shoulder        viewBox 300 x 400
  bottom   bottom-left and bottom-centre          viewBox 1000 x 370
  land     mountains (Mile High), hills (Flow)
  cloud-a/b/c, sparkles-a/b (Liquidity), sun (a CSS gradient)
"""
import math
import pathlib
import random
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
N = 10  # samples per edge; edges are smooth Catmull-Rom curves through them


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def bez(c, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = c
    u = 1 - t
    return (u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
            u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3)


def dbez(c, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = c
    u = 1 - t
    return (3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2),
            3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2))


def smooth(a, b, x):
    if b == a:
        return 1.0
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def W(w0, w1, tin=0.2, tout=0.0, twist=0.0, phase=0.0):
    """Width along a ribbon: w0 -> w1, tapered at the ends, optional twist pinches."""
    def w(t):
        base = w0 + (w1 - w0) * smooth(0, 1, t)
        k = smooth(0, tin, t) if tin else 1
        if tout:
            k *= smooth(1, 1 - tout, t)
        if twist:
            k *= 1 - twist * (1 - abs(math.cos(math.pi * (t * 1.6 + phase))))
        return max(0.6, base * k)
    return w


def pts_at(c, w, shift, n=N):
    out = []
    for i in range(n + 1):
        t = i / n
        x, y = bez(c, t)
        dx, dy = dbez(c, t)
        m = math.hypot(dx, dy) or 1
        o = shift * w(t)
        out.append((x - dy / m * o, y + dx / m * o))
    return out


def f(v):
    return f"{v:.0f}"


def catmull(p):
    out = []
    for i in range(len(p) - 1):
        p0, p1, p2, p3 = p[max(0, i - 1)], p[i], p[i + 1], p[min(len(p) - 1, i + 2)]
        out.append(f"C{f(p1[0] + (p2[0] - p0[0]) / 6)} {f(p1[1] + (p2[1] - p0[1]) / 6)} "
                   f"{f(p2[0] - (p3[0] - p1[0]) / 6)} {f(p2[1] - (p3[1] - p1[1]) / 6)} {f(p2[0])} {f(p2[1])}")
    return "".join(out)


def band(c, w, s0=-0.5, s1=0.5, n=N):
    """Closed region between two sideways offsets (fractions of the width)."""
    a = pts_at(c, w, s1, n)
    b = pts_at(c, w, s0, n)[::-1]
    return f"M{f(a[0][0])} {f(a[0][1])}{catmull(a)}L{f(b[0][0])} {f(b[0][1])}{catmull(b)}Z"


def line(c, w, shift, n=7):
    p = pts_at(c, w, shift, n)
    return f"M{f(p[0][0])} {f(p[0][1])}{catmull(p)}"


def grad(gid, stops, x1=0, y1=0, x2=1, y2=0, user=False):
    s = "".join(f'<stop offset="{o}" style="stop-color:{c}"/>' for o, c in stops)
    units = ' gradientUnits="userSpaceOnUse"' if user else ""
    return f'<linearGradient id="{gid}"{units} x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def blur(fid, sd):
    return (f'<filter id="{fid}" x="-20%" y="-20%" width="140%" height="140%">'
            f'<feGaussianBlur stdDeviation="{sd}"/></filter>')


def svg(cls, vb, body, defs, par="none"):
    return (f'<svg class="decor {cls}" viewBox="{vb}" preserveAspectRatio="{par}" focusable="false">'
            f"<defs>{''.join(defs)}</defs>{''.join(body)}</svg>")


class Slot:
    """Collects defs and per-theme groups for one <svg> slot."""

    def __init__(self, name):
        self.name, self.defs, self.groups, self.n = name, [], [], 0
        self.defs += [blur(f"{name}-b2", 2), blur(f"{name}-b6", 6), blur(f"{name}-b14", 14), blur(f"{name}-b28", 28)]

    def id(self, kind):
        self.n += 1
        return f"{self.name}-{kind}{self.n}"

    def group(self, theme, parts):
        self.groups.append(f'<g class="dz dz-{theme}">{"".join(parts)}</g>')

    # A satin ribbon: gradient along its length, soft shadow on one side,
    # a blurred highlight band, and a crisp sheen near one edge.
    def satin(self, c, w, stops, op=1.0, hi=.5, lo=.2, sheen=.7, glow=None, glow_op=.5):
        out = []
        pid, gid = self.id("p"), self.id("g")
        self.defs += [f'<path id="{pid}" d="{band(c, w)}"/>', grad(gid, stops)]
        if glow:
            out.append(f'<use href="#{pid}" fill="{glow}" filter="url(#{self.name}-b28)" opacity="{glow_op}"/>')
        out.append(f'<use href="#{pid}" fill="url(#{gid})" opacity="{op}"/>')
        if lo:
            out.append(f'<path d="{band(c, w, -0.5, -0.05)}" fill="#0a0628" opacity="{lo}" filter="url(#{self.name}-b6)"/>')
        if hi:
            out.append(f'<path d="{band(c, w, 0.08, 0.32)}" fill="#fff" opacity="{hi}" filter="url(#{self.name}-b6)"/>')
        if sheen:
            out.append(f'<path d="{line(c, w, 0.44)}" fill="none" stroke="#fff" stroke-width="1.6" opacity="{sheen}" stroke-linecap="round"/>')
        return out

    # A glassy, translucent ribbon with bright edges and inner reflections.
    def glass(self, c, w, stops, glow, hi="#fff"):
        out = []
        pid, gid = self.id("p"), self.id("g")
        self.defs += [f'<path id="{pid}" d="{band(c, w)}"/>', grad(gid, stops)]
        out.append(f'<use href="#{pid}" fill="{glow}" filter="url(#{self.name}-b14)" opacity=".75"/>')
        out.append(f'<use href="#{pid}" fill="url(#{gid})"/>')
        out.append(f'<path d="{band(c, w, 0.12, 0.36)}" fill="{hi}" opacity=".45" filter="url(#{self.name}-b6)"/>')
        out.append(f'<path d="{band(c, w, -0.42, -0.3)}" fill="{hi}" opacity=".35" filter="url(#{self.name}-b2)"/>')
        for shift, sw, o in ((0.47, 2.4, .95), (0.22, 1, .55), (-0.47, 1.6, .7)):
            out.append(f'<path d="{line(c, w, shift)}" fill="none" stroke="{hi}" stroke-width="{sw}" opacity="{o}" stroke-linecap="round"/>')
        return out

    # Fine strands of silk following a curve, grouped into three weights.
    def silk(self, c, w, count, color, base=0.9, spread=1.0):
        buckets = [[], [], []]
        for k in range(count):
            buckets[(k * 7) % 3].append(line(c, w, (k / (count - 1) - 0.5) * spread, 6))
        return [f'<path d="{"".join(b)}" fill="none" stroke="{color}" stroke-width="{base * m:.2f}" opacity="{o}" stroke-linecap="round"/>'
                for b, (m, o) in zip(buckets, [(0.7, .35), (1.0, .55), (1.6, .8)]) if b]

    def render(self, vb, par="none"):
        return svg(f"decor-{self.name}", vb, self.groups, self.defs, par)


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

BLUE = [(0, "rgba(140,185,255,0)"), (.26, "var(--decor-blue-glow)"), (.5, "var(--decor-blue-1)"), (1, "var(--decor-blue-2)")]
ORANGE = [(0, "rgba(255,200,150,0)"), (.26, "rgba(255,190,130,.75)"), (.5, "var(--decor-orange-1)"), (1, "var(--decor-orange-2)")]
SURGE = [(0, "rgba(46,81,244,0)"), (.24, "var(--decor-surge-1)"), (.5, "var(--decor-surge-2)"), (.76, "var(--decor-surge-3)"), (1, "var(--decor-surge-4)")]
SURGE_B = [(0, "rgba(123,63,228,0)"), (.26, "var(--decor-surge-2)"), (.58, "var(--decor-surge-3)"), (1, "var(--decor-surge-4)")]
WATER = [(0, "rgba(190,228,255,0)"), (.12, "var(--decor-water-3)"), (.35, "var(--decor-water-1)"), (.7, "var(--decor-water-2)"), (1, "var(--decor-water-1)")]
GLASS = [(0, "rgba(200,240,210,0)"), (.12, "var(--decor-glass-3)"), (.35, "var(--decor-glass-1)"), (.7, "var(--decor-glass-2)"), (1, "var(--decor-glass-1)")]


def slot_top():
    s = Slot("top")
    # Mile High: a royal-blue ribbon above a bright orange one.
    s.group("mile-high",
            s.satin(((150, 320), (430, 290), (700, 140), (1010, 20)), W(26, 112, .1, twist=.35, phase=.2), BLUE,
                    glow="var(--decor-blue-glow)", glow_op=.45)
            + s.satin(((90, 400), (390, 360), (650, 250), (1010, 180)), W(26, 124, .1, twist=.4, phase=.6), ORANGE,
                      glow="var(--decor-orange-glow)", glow_op=.5))
    # Surge: wide luminous bands sweeping to the corner.
    s.group("surge",
            s.satin(((230, 330), (420, 290), (580, 110), (840, -70)), W(50, 200, .1, twist=.35, phase=.1), SURGE,
                    glow="var(--decor-surge-glow)", glow_op=.65, hi=.55)
            + s.satin(((300, 470), (560, 400), (770, 230), (1010, 130)), W(36, 150, .1, twist=.45, phase=.5), SURGE_B,
                      glow="var(--decor-surge-glow)", glow_op=.45, hi=.5)
            + s.satin(((600, 210), (780, 130), (900, 20), (1010, -40)), W(20, 90, .1), SURGE_B, op=.85, lo=.1))
    # Liquidity: a glassy water ribbon rising past the sun.
    s.group("liquidity",
            s.glass(((-20, 330), (300, 380), (620, 120), (1010, -20)), W(36, 150, .1, twist=.3, phase=.3), WATER, "var(--decor-water-1)")
            + s.glass(((440, 310), (660, 260), (840, 120), (1010, 90)), W(16, 70, .1), WATER, "var(--decor-water-1)"))
    # Flow: an emerald glass ribbon.
    s.group("flow",
            s.glass(((180, 270), (460, 300), (700, 60), (1010, -20)), W(34, 140, .1, twist=.3, phase=.2), GLASS, "var(--decor-glass-1)")
            + s.glass(((560, 210), (760, 160), (880, 60), (1010, 20)), W(14, 60, .1), GLASS, "var(--decor-glass-1)"))
    # Haley's Choice: satin silk in blush and white, with fine strands.
    s.group("haleys-choice",
            s.satin(((520, 340), (720, 300), (850, 120), (1010, 20)), W(4, 110, .25, twist=.5, phase=.3),
                    [(0, "rgba(255,240,250,0)"), (.3, "var(--decor-wave-3)"), (1, "var(--decor-wave-2)")], op=.85, hi=.6, lo=.06, sheen=.9)
            + s.silk(((480, 380), (700, 320), (840, 140), (1010, 10)), W(6, 150, .2), 18, "var(--decor-silk)")
            + s.silk(((640, 420), (800, 380), (900, 260), (1010, 200)), W(4, 80, .2), 10, "var(--decor-silk)", base=.8))
    return s.render("0 0 1000 470")


def slot_side():
    s = Slot("side")
    s.group("mile-high",
            s.satin(((0, 300), (110, 220), (200, 120), (310, 90)), W(6, 64, .2, twist=.3), BLUE, glow="var(--decor-blue-glow)")
            + s.satin(((20, 360), (130, 300), (220, 220), (310, 200)), W(6, 70, .2, twist=.35, phase=.5), ORANGE))
    s.group("surge",
            s.satin(((0, 280), (100, 200), (200, 110), (310, 80)), W(6, 80, .2, twist=.3), SURGE, glow="var(--decor-surge-glow)")
            + s.satin(((10, 360), (130, 300), (220, 220), (310, 210)), W(6, 76, .2, twist=.4, phase=.5), SURGE_B))
    s.group("liquidity",
            s.glass(((0, 300), (110, 240), (200, 170), (310, 150)), W(10, 80, .2, twist=.3), WATER, "var(--decor-water-1)"))
    s.group("flow",
            s.glass(((0, 310), (110, 250), (200, 190), (310, 170)), W(10, 80, .2, twist=.3), GLASS, "var(--decor-glass-1)"))
    s.group("haleys-choice",
            [f'<path d="{band(((20, 420), (120, 300), (190, 120), (310, 40)), W(60, 120, 0))}" fill="var(--decor-wave-1)" filter="url(#side-b14)"/>']
            + s.satin(((0, 360), (120, 280), (210, 160), (310, 110)), W(10, 90, .2, twist=.4),
                      [(0, "var(--decor-wave-3)"), (1, "var(--decor-wave-1)")], op=.9, hi=.55, lo=.05)
            + s.silk(((0, 300), (110, 230), (200, 110), (310, 60)), W(30, 60, .1), 9, "var(--decor-silk)", base=.8))
    return s.render("0 0 300 400")


def slot_bottom():
    s = Slot("bottom")
    # Hero layout in this box (1440 x 870): buttons y 0-55, shortcut labels
    # x 150-740 / y 140-222, caption row x 150-620 / y 296-315 (it gets a
    # frosted chip). Ribbons keep clear of the labels.
    s.group("mile-high",
            s.satin(((-20, 215), (160, 235), (330, 320), (560, 395)), W(34, 22, 0, .15), BLUE[1:], hi=.4)
            + s.satin(((-20, 272), (90, 292), (200, 340), (330, 398)), W(40, 26, 0), ORANGE[1:])
            + s.satin(((540, 390), (700, 330), (850, 300), (1010, 278)), W(16, 74, .15, twist=.3), ORANGE, glow="var(--decor-orange-glow)")
            + s.satin(((620, 400), (780, 352), (900, 332), (1010, 322)), W(10, 46, .15), BLUE))
    s.group("surge",
            s.satin(((-20, 232), (150, 252), (320, 332), (560, 398)), W(64, 36, 0), SURGE[1:], glow="var(--decor-surge-glow)", hi=.5)
            + s.satin(((520, 400), (680, 330), (850, 296), (1010, 262)), W(20, 90, .15, twist=.35), SURGE, glow="var(--decor-surge-glow)")
            + s.satin(((600, 404), (760, 360), (890, 340), (1010, 322)), W(10, 56, .15), SURGE_B))
    s.group("liquidity",
            s.glass(((-20, 92), (300, 62), (620, 122), (1010, 92)), W(58, 46, 0, twist=.25), WATER[1:], "var(--decor-water-1)")
            + s.glass(((-20, 336), (280, 292), (640, 362), (1010, 312)), W(100, 80, 0, twist=.2), WATER[1:], "var(--decor-water-1)"))
    s.group("flow",
            s.glass(((-20, 44), (260, 14), (560, 122), (1010, 92)), W(64, 48, 0, twist=.3), GLASS[1:], "var(--decor-glass-1)")
            + s.glass(((-20, 336), (300, 292), (620, 372), (1010, 332)), W(80, 60, 0, twist=.25), GLASS[1:], "var(--decor-glass-1)"))
    s.group("haleys-choice",
            [f'<path d="{band(((360, 420), (560, 310), (800, 320), (1010, 250)), W(30, 150, .3))}" fill="var(--decor-wave-2)" filter="url(#bottom-b14)"/>']
            + s.satin(((-20, 232), (120, 262), (230, 332), (380, 404)), W(64, 40, 0, twist=.4),
                      [(0, "var(--decor-wave-1)"), (1, "var(--decor-wave-3)")], op=.8, hi=.6, lo=.05)
            + s.satin(((560, 400), (700, 334), (870, 330), (1010, 286)), W(14, 90, .15, twist=.4),
                      [(0, "var(--decor-wave-3)"), (1, "var(--decor-wave-1)")], op=.9, hi=.55, lo=.05)
            + s.silk(((-20, 150), (120, 196), (240, 300), (400, 392)), W(90, 50, 0), 16, "var(--decor-silk)"))
    return s.render("0 0 1000 370")


def mountains():
    """Snow-capped Colorado range (Mile High), viewBox 640 x 130."""
    defs = [grad("mt-far", [(0, "#ffffff"), (.3, "var(--decor-mountain-1)"), (1, "rgba(225,228,247,0)")], 0, 20, 0, 126, True),
            grad("mt-near", [(0, "#ffffff"), (.2, "#f3f4fc"), (.45, "var(--decor-mountain-2)"), (1, "rgba(205,210,238,0)")], 0, 30, 0, 130, True),
            grad("mt-fade", [(0, "#000"), (.12, "#fff"), (.88, "#fff"), (1, "#000")], 0, 0, 640, 0, True),
            '<mask id="mt-mask" maskUnits="userSpaceOnUse" x="-20" y="-10" width="680" height="160"><rect x="-20" y="-10" width="680" height="160" fill="url(#mt-fade)"/></mask>',
            blur("mt-haze", 1.4)]

    def ridge(seed, n, top, low):
        r = random.Random(seed)
        pts, x = [(-10, low)], -10.0
        while x < 650:
            x += 640 / n * (0.55 + r.random() * 0.7)
            peak = top + (low - top) * r.random() * 0.6
            pts.append((x, peak))
            x += 640 / n * (0.35 + r.random() * 0.45)
            pts.append((x, peak + (low - peak) * (0.4 + r.random() * 0.35)))
        return pts

    def poly(p):
        return "M-10 140L" + "L".join(f"{f(x)} {f(y)}" for x, y in p) + "L660 140Z"

    far, near = ridge(3, 7, 26, 100), ridge(11, 5, 34, 122)
    shade = []
    for (x0, y0), (x1, y1), (x2, y2) in zip(near, near[1:], near[2:]):
        if y1 < y0 and y1 < y2:  # a peak: shade the right-hand face
            shade.append(f"M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}L{f(x1 + (x2 - x1) * .3)} {f(y2 + 10)}Z")
    def smooth_poly(p):
        return f"M-10 140L{f(p[0][0])} {f(p[0][1])}{catmull(p)}L660 140Z"
    body = [f'<path d="{smooth_poly(far)}" fill="url(#mt-far)" opacity=".75" filter="url(#mt-haze)"/>',
            f'<path d="{poly(near)}" fill="url(#mt-near)"/>',
            f'<path d="{"".join(shade)}" fill="#8f98cf" opacity=".2" filter="url(#mt-haze)"/>']
    return svg("decor-land decor-land--mountains", "0 0 640 130", [f'<g class="dz dz-mile-high" mask="url(#mt-mask)">{"".join(body)}</g>'], defs, "xMidYMax slice")


def hills():
    """Sunlit rolling hills with mist between the layers (Flow), viewBox 1200 x 200."""
    defs = [grad("hl-far", [(0, "var(--decor-hill-far)"), (.7, "rgba(190,225,190,.5)"), (1, "rgba(215,238,222,0)")], 0, 30, 0, 160, True),
            grad("hl-mid", [(0, "#a6d98a"), (.3, "var(--decor-hill-mid)"), (.8, "rgba(150,205,140,.35)"), (1, "rgba(215,238,222,0)")], 0, 80, 0, 190, True),
            grad("hl-near", [(0, "#bfe796"), (.25, "var(--decor-hill-near)"), (.75, "rgba(110,180,110,.45)"), (1, "rgba(215,238,222,0)")], 0, 130, 0, 200, True),
            grad("hl-fade", [(0, "#000"), (.16, "#fff"), (.92, "#fff"), (1, "#000")], 0, 0, 1200, 0, True),
            '<mask id="hl-mask" maskUnits="userSpaceOnUse" x="-60" y="-20" width="1320" height="240"><rect x="-60" y="-20" width="1320" height="240" fill="url(#hl-fade)"/></mask>',
            blur("hl-mist", 6), blur("hl-soft", 1.5)]

    def domes(seed, n, base, hmin, hmax, wmin, wmax):
        """Ground line made of overlapping smooth domes (sum of Gaussians)."""
        r = random.Random(seed)
        hills = [(r.uniform(-100, 1300), r.uniform(hmin, hmax), r.uniform(wmin, wmax)) for _ in range(n)]
        pts = []
        for x in range(-60, 1261, 30):
            y = base - max(h * math.exp(-((x - c) / w) ** 2) for c, h, w in hills)
            pts.append((x, y))
        return f"M-60 260L{f(pts[0][0])} {f(pts[0][1])}{catmull(pts)}L1260 260Z"

    body = [f'<path d="{domes(5, 7, 120, 50, 90, 110, 200)}" fill="url(#hl-far)" opacity=".9" filter="url(#hl-soft)"/>',
            '<rect x="-60" y="100" width="1320" height="30" fill="#e8f4ea" opacity=".5" filter="url(#hl-mist)"/>',
            f'<path d="{domes(9, 6, 160, 40, 80, 120, 230)}" fill="url(#hl-mid)"/>',
            '<rect x="-60" y="146" width="1320" height="24" fill="#e8f4ea" opacity=".45" filter="url(#hl-mist)"/>',
            f'<path d="{domes(23, 5, 200, 30, 70, 140, 260)}" fill="url(#hl-near)"/>']
    return svg("decor-land decor-land--hills", "0 0 1200 200", [f'<g class="dz dz-flow" mask="url(#hl-mask)">{"".join(body)}</g>'], defs, "xMidYMax slice")


def cloud(seed, cls):
    """A fluffy cumulus: shaded puffs on a flat base, viewBox 400 x 140."""
    r = random.Random(seed)
    gid = f"{cls}-g"
    defs = [f'<radialGradient id="{gid}" cx=".42" cy=".34" r=".7"><stop offset="0" style="stop-color:#fff"/>'
            f'<stop offset=".62" style="stop-color:var(--decor-cloud)"/><stop offset="1" style="stop-color:var(--decor-cloud-shade)"/></radialGradient>',
            blur(f"{cls}-b", 2.6)]
    puffs, x = [], 46.0
    while x < 354:
        rad = 14 + r.random() * 26
        hump = math.sin((x - 36) / 318 * math.pi)
        puffs.append(f'<circle cx="{f(x)}" cy="{f(106 - rad * .55 - hump * 30 - r.random() * 8)}" r="{f(rad)}"/>')
        x += rad * (0.6 + r.random() * 0.4)
    puffs.append('<ellipse cx="200" cy="110" rx="170" ry="16"/>')
    body = [f'<g fill="url(#{gid})" filter="url(#{cls}-b)" opacity=".92">{"".join(puffs)}</g>']
    return svg(f"decor-cloud {cls}", "0 0 400 140", body, defs, "xMidYMid meet")


def sparkles(cls, seed, spots):
    r = random.Random(seed)
    star = "M0 -6L1 -1L6 0L1 1L0 6L-1 1L-6 0L-1 -1Z"
    items = []
    for cx, cy, rx, ry, n in spots:
        for _ in range(n):
            items.append(f'<use href="#{cls}-s" transform="translate({f(cx + (r.random() - .5) * rx)} {f(cy + (r.random() - .5) * ry)}) '
                         f'scale({0.45 + r.random() * 0.6:.1f})"/>')
    defs = [f'<path id="{cls}-s" d="{star}"/>',
            f'<filter id="{cls}-g" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.2" result="b"/>'
            f'<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>']
    body = [f'<g fill="var(--decor-sparkle)" filter="url(#{cls}-g)" opacity=".85">{"".join(items)}</g>']
    return svg(f"decor-sparkles {cls}", "0 0 1440 870", body, defs, "xMidYMid slice")


def build():
    # Sparkle clusters (hero coordinates at 1440 x 870): on the water ribbons.
    spots = [(760, 170, 220, 60, 4), (1180, 70, 200, 50, 3), (240, 600, 360, 40, 4), (520, 840, 600, 40, 5), (1420, 470, 40, 80, 2)]
    return "\n".join([
        '<div class="scene-decor" aria-hidden="true">',
        '<div class="decor-sun"></div>',
        cloud(4, "decor-cloud--a"), cloud(12, "decor-cloud--b"), cloud(27, "decor-cloud--c"),
        mountains(), hills(),
        slot_top(), slot_side(), slot_bottom(),
        sparkles("decor-sparkles--a", 1, spots), sparkles("decor-sparkles--b", 2, spots),
        "</div>",
    ])


def main():
    index = ROOT / "index.html"
    html = index.read_text()
    block = build()
    new, n = re.subn(r"(<!-- decor:start -->).*?([ \t]*<!-- decor:end -->)",
                     lambda m: m.group(1) + "\n" + block + "\n" + m.group(2), html, flags=re.S)
    if n != 1:
        raise SystemExit("decor markers not found in index.html")
    index.write_text(new)
    print(f"decor: {len(block) / 1024:.1f} KB written to index.html")


if __name__ == "__main__":
    main()
