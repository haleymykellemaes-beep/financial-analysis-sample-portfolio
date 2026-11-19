#!/usr/bin/env node
/*
 * Acceptance checks for the homepage hero and its candlestick backdrop.
 *
 * Usage (with a static server running at the repository root):
 *   python3 -m http.server 8765
 *   node dev/checks/acceptance.js [pageUrl] [outputDir] [--themes=classic,flow]
 *
 * Defaults: http://localhost:8765/, dev/checks/output/ (git-ignored) and all
 * six themes. Requires Playwright with Chromium. Exits non-zero if any check fails.
 *
 * For each theme, at 1440x900 and 390x844 (2x pixel density, reduced motion
 * so the hero holds still for pixel comparisons) it:
 *   1. checks every request succeeds, every image decodes, the portrait and
 *      chart never shift while the page loads, and the total layout shift
 *      (web fonts swapping in) stays under 0.01;
 *   2. saves a screenshot of the hero at rest, then compares it with 10 seconds
 *      later (must be pixel-identical);
 *   3. checks for horizontal overflow;
 *   4. measures how much the chart changes the pixels of the headline, tagline,
 *      description, buttons, shortcuts and face (chart shown vs hidden); the
 *      face box comes from the portrait's data-face attribute, and any
 *      data-beside boxes must show the chart (minimum change);
 *   5. checks the chart is crisp: every grid line is exactly one CSS pixel
 *      (DPR device pixels) wide on the canvas, and on screen it covers exactly
 *      those device pixels, with no bleed into its neighbours;
 *   6. checks the hero buttons receive clicks, the chart is out of the tab
 *      order, and every link on the page resolves (in-page anchors exist and
 *      same-site files load; external links are listed, not fetched);
 *   7. applies three test updates to the newest candle and checks that only
 *      its column (candle + volume bar) changed and that the price scale held,
 *      then repeats with an update far outside the locked range (clipping);
 *   8. checks the "Live overlay" toggle: nothing is fetched from TradingView
 *      until it is pressed; pressing it either shows the live chart (candles
 *      dimmed, history layer untouched) or, offline, falls back with a
 *      message; the controls row keeps its size; pressing again restores
 *      the illustrative chart and caption (first theme only, as are links);
 *   9. measures text contrast (WCAG 2.x) of the nav, headline, tagline,
 *      description, buttons, shortcut labels and caption against the pixels
 *      actually behind them, and checks the chart drew in the theme's colours.
 * Then, once, the theme system: new visitors get Haley's Choice; the picker
 * works by keyboard and pointer; the choice survives a reload, reaches a
 * project page and another tab; with motion allowed the decor animates
 * using only transform and opacity, the newest candle ticks while the
 * history layer stays untouched, and there are no long main-thread tasks;
 * with reduced motion nothing animates.
 *
 * The page must expose the chart as window.heroChart (js/home-hero.js does).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ARGS = process.argv.slice(2);
const POS = ARGS.filter((a) => !a.startsWith("--"));
const OPT = Object.fromEntries(ARGS.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const URL = POS[0] || "http://localhost:8765/";
const OUT = path.resolve(POS[1] || path.join(__dirname, "output"));
const ALL_THEMES = ["haleys-choice", "classic", "mile-high", "liquidity", "flow", "surge"];
const THEMES = OPT.themes ? OPT.themes.split(",") : ALL_THEMES;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const DPR = 2;

// Region limits: mean absolute RGB change (0-255) the chart may add.
// visible: minimum mean change where a page asks for the chart to show (data-beside).
// layoutShift: maximum total layout shift score while the page loads.
// contrast / contrastLarge: WCAG 2.x minimums for normal and large text.
const LIMITS = { text: 3, face: 0.5, visible: 2, layoutShift: 0.01, contrast: 4.5, contrastLarge: 3 };
// Known, deliberate departures from WCAG AA (reported as WARN, not failures).
// Each is a choice to match the theme's reference screenshot (or, for Classic,
// the approved design that predates the themes); see dev/README.md, "Contrast".
const CONTRAST_EXCEPTIONS = {
  "haleys-choice": {
    "nav links": "white nav text on pastel blue, as in the Haley's Choice reference",
    "primary button": "white on bright pink, as in the reference",
  },
  "mile-high": { "primary button": "white on bright orange, as in the reference" },
  "surge": { "primary button": "white on the orange-to-fuchsia gradient, as in the reference" },
  "classic": { "chart caption": "small caption over the photo band on phones, unchanged from the approved Classic design" },
};

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const record = (viewport, check, pass, detail) => {
  results.push({ viewport, check, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${viewport}] ${check}${detail ? ` - ${detail}` : ""}`);
};

// Image maths runs in a blank page so large pixel buffers never cross into Node.
async function makeLab(browser) {
  const lab = await browser.newPage();
  await lab.setContent("<canvas></canvas>");
  await lab.evaluate(() => {
    const load = (b64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = reject;
      img.src = "data:image/png;base64," + b64;
    });

    // Stack viewport tiles into one image: rows [from, to) of each tile go to top + from.
    window.stitch = async (parts, w, h) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      for (const p of parts) {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + p.b64; });
        ctx.drawImage(img, 0, p.from, w, p.to - p.from, 0, p.top + p.from, w, p.to - p.from);
      }
      return c.toDataURL("image/png").split(",")[1];
    };

    // Pixels that differ between a and b, with their bounding box.
    window.diff = async (a, b) => {
      const A = await load(a), B = await load(b);
      if (A.width !== B.width || A.height !== B.height) return { sizeMismatch: true };
      let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let i = 0; i < A.data.length; i += 4) {
        if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) {
          const p = i / 4, x = p % A.width, y = (p / A.width) | 0;
          n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      return { changed: n, bbox: n ? { x0, y0, x1, y1 } : null, width: A.width, height: A.height };
    };

    // Changed pixels inside / outside given device-pixel rects.
    window.diffIn = async (a, b, rects) => {
      const A = await load(a), B = await load(b);
      const inside = rects.map(() => 0);
      let outside = 0;
      const samples = [];
      for (let i = 0; i < A.data.length; i += 4) {
        if (A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2]) continue;
        const p = i / 4, x = p % A.width, y = (p / A.width) | 0;
        let hit = false;
        rects.forEach((r, k) => { if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) { inside[k]++; hit = true; } });
        if (!hit) { outside++; if (samples.length < 12) samples.push([x, y]); }
      }
      return { inside, outside, samples };
    };

    // Mean absolute RGB difference within rects.
    window.regionDelta = async (a, b, rects) => {
      const A = await load(a), B = await load(b);
      return rects.map((r) => {
        let sum = 0, max = 0, n = 0;
        for (let y = Math.max(0, r.y0); y < Math.min(A.height, r.y1); y++) {
          for (let x = Math.max(0, r.x0); x < Math.min(A.width, r.x1); x++) {
            const i = (y * A.width + x) * 4;
            const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
            sum += d; max = Math.max(max, d); n++;
          }
        }
        return { mean: n ? sum / n : 0, max };
      });
    };

    // Grid-line crispness. canvases: [base, latest] PNGs of the chart layers;
    // origin: where the canvas's top-left falls in the screenshots (device px).
    // Finds full-width grid rows and full-height grid columns on the base layer,
    // then checks that on screen (a = chart shown, b = hidden) each line changes
    // exactly its own device pixels: where both neighbours are empty on the
    // canvas, they must be unchanged in the screenshot. Any resampling of the
    // canvas (a blurry chart) shows up as changed neighbours. Samples inside
    // `skip` rects (device px) are ignored: page content layered above the
    // chart (the hero copy) can itself render a level differently when the
    // chart is hidden, which says nothing about the chart's sharpness.
    window.crisp = async (a, b, canvases, origin, skip) => {
      const A = await load(a), B = await load(b);
      const [C, Lt] = await Promise.all(canvases.map(load));
      const W = C.width, H = C.height;
      const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
        (C.data[(y * W + x) * 4 + 3] > 0 || Lt.data[(y * W + x) * 4 + 3] > 0);
      const runs = (flags) => {
        const out = []; let s = -1;
        flags.forEach((f, i) => { if (f && s < 0) s = i; if (!f && s >= 0) { out.push([s, i - 1]); s = -1; } });
        if (s >= 0) out.push([s, flags.length - 1]);
        return out;
      };
      const rowFlags = [], colFlags = [];
      for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (C.data[(y * W + x) * 4 + 3]) n++; rowFlags.push(n > 0.9 * W); }
      const ya = Math.floor(H * 0.15), yb = Math.floor(H * 0.85);
      for (let x = 0; x < W; x++) { let n = 0; for (let y = ya; y < yb; y++) if (C.data[(y * W + x) * 4 + 3]) n++; colFlags.push(n > 0.9 * (yb - ya)); }
      const rows = runs(rowFlags), cols = runs(colFlags);
      const changed = (x, y) => {
        if (x < 0 || y < 0 || x >= A.width || y >= A.height) return null;
        const i = (y * A.width + x) * 4;
        return A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2];
      };
      const measure = (dx, dy) => {
        let samples = 0, bleed = 0;
        const where = [];
        const probe = (line, before, after) => {
          const sx = before[0] + dx, sy = before[1] + dy;
          if (skip.some((r) => sx >= r.x0 && sx < r.x1 && sy >= r.y0 && sy < r.y1)) return;
          if (!line.every((p) => changed(p[0] + dx, p[1] + dy) === true)) return; // masked out or under the photo
          const u = changed(before[0] + dx, before[1] + dy), d = changed(after[0] + dx, after[1] + dy);
          if (u === null || d === null) return;
          samples++;
          if (u || d) { bleed++; if (where.length < 8) where.push({ line: line.map((q) => [q[0] + dx, q[1] + dy]), before: [before[0] + dx, before[1] + dy, u], after: [after[0] + dx, after[1] + dy, d] }); }
        };
        for (const [s, e] of rows) for (let x = 0; x < W; x++) {
          if (filled(x, s - 1) || filled(x, e + 1)) continue;
          const line = []; for (let y = s; y <= e; y++) line.push([x, y]);
          probe(line, [x, s - 1], [x, e + 1]);
        }
        for (const [s, e] of cols) for (let y = 0; y < H; y++) {
          if (filled(s - 1, y) || filled(e + 1, y)) continue;
          const line = []; for (let x = s; x <= e; x++) line.push([x, y]);
          probe(line, [s - 1, y], [e + 1, y]);
        }
        return { samples, bleed, where };
      };
      let best = null;
      for (let dy = Math.floor(origin.y) - 1; dy <= Math.ceil(origin.y) + 1; dy++) {
        for (let dx = Math.floor(origin.x) - 1; dx <= Math.ceil(origin.x) + 1; dx++) {
          const m = measure(dx, dy);
          if (!best || m.samples > best.samples || (m.samples === best.samples && m.bleed < best.bleed)) best = { ...m, dx, dy };
        }
      }
      return { rows: rows.map(([s, e]) => e - s + 1), cols: cols.map(([s, e]) => e - s + 1), ...best };
    };

    // WCAG contrast of each text colour against the background pixels inside
    // each rect (text hidden): returns the 5th-percentile (worst-case) ratio.
    window.contrast = async (bg, items) => {
      const B = await load(bg);
      const lum = (r, g, b) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      return items.map(({ rect, colors }) => {
        const ratios = [];
        for (let y = Math.max(0, rect.y0); y < Math.min(B.height, rect.y1); y += 2) {
          for (let x = Math.max(0, rect.x0); x < Math.min(B.width, rect.x1); x += 2) {
            const i = (y * B.width + x) * 4;
            const lb = lum(B.data[i], B.data[i + 1], B.data[i + 2]);
            let worst = Infinity;
            for (const c of colors) {
              const lf = lum(c[0], c[1], c[2]);
              worst = Math.min(worst, (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05));
            }
            ratios.push(worst);
          }
        }
        ratios.sort((a, b) => a - b);
        return ratios.length ? ratios[Math.floor(ratios.length * 0.05)] : null;
      });
    };

    // Before | after | changed-pixel map, cropped around a rect and enlarged.
    window.triptych = async (a, b, rect, scale) => {
      const A = await load(a), B = await load(b);
      const r = { // keep the crop inside the image so rows never wrap
        x0: Math.max(0, rect.x0), y0: Math.max(0, rect.y0),
        x1: Math.min(A.width, rect.x1), y1: Math.min(A.height, rect.y1),
      };
      const w = r.x1 - r.x0, h = r.y1 - r.y0, gap = 12;
      const c = document.createElement("canvas");
      c.width = (w * 3 + gap * 2) * scale; c.height = h * scale;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
      const t = tmp.getContext("2d");
      const crop = (img) => { const d = t.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const si = ((y + r.y0) * img.width + (x + r.x0)) * 4, di = (y * w + x) * 4;
          d.data[di] = img.data[si]; d.data[di + 1] = img.data[si + 1]; d.data[di + 2] = img.data[si + 2]; d.data[di + 3] = 255;
        } return d; };
      const ca = crop(A), cb = crop(B);
      const map = t.createImageData(w, h);
      for (let i = 0; i < map.data.length; i += 4) {
        const changed = ca.data[i] !== cb.data[i] || ca.data[i + 1] !== cb.data[i + 1] || ca.data[i + 2] !== cb.data[i + 2];
        const g = (ca.data[i] + ca.data[i + 1] + ca.data[i + 2]) / 3 * 0.35 + 150;
        map.data[i] = changed ? 230 : g; map.data[i + 1] = changed ? 30 : g; map.data[i + 2] = changed ? 140 : g; map.data[i + 3] = 255;
      }
      [ca, cb, map].forEach((d, k) => { t.putImageData(d, 0, 0); ctx.drawImage(tmp, k * (w + gap) * scale, 0, w * scale, h * scale); });
      return c.toDataURL("image/png").split(",")[1];
    };
  });
  return lab;
}

async function run() {
  const browser = await chromium.launch();
  const lab = await makeLab(browser);

  for (const theme of THEMES) for (const vp of VIEWPORTS) {
    const first = theme === THEMES[0];
    const tag = `${theme}/${vp.name}`;
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: DPR, reducedMotion: "reduce" });
    await context.addInitScript((id) => { try { localStorage.setItem("hm-theme", id); } catch (e) {} }, theme);
    const page = await context.newPage();
    const errors = [];
    const badRequests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => badRequests.push(`${r.url()} (${r.failure() ? r.failure().errorText : "failed"})`));
    page.on("response", (r) => { if (r.status() >= 400) badRequests.push(`${r.url()} (HTTP ${r.status()})`); });
    const requested = [];
    page.on("request", (r) => requested.push(r.url()));
    // Layout shifts during load, recorded from the first paint.
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          const nodes = (e.sources || []).map((s) => s.node).filter(Boolean);
          const el = (n) => (n.nodeType === 1 ? n : n.parentElement);
          window.__shifts.push({
            value: e.value,
            sources: nodes.map((n) => n.id || n.className || n.nodeName),
            hero: nodes.some((n) => el(n) && el(n).closest(".hero-visual")),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const load = await page.evaluate(() => ({
      images: [...document.images].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })),
      shifts: window.__shifts,
      chart: !!window.heroChart && !!document.querySelector("#hero-candles canvas"),
    }));
    // 1. Assets, images and layout shift while loading.
    record(tag, "Chart mounted", load.chart, load.chart ? "window.heroChart and its canvases present" : "chart did not mount");
    record(tag, "All requests succeed", badRequests.length === 0, badRequests.length ? badRequests.join("; ") : "no failed requests or HTTP errors");
    const broken = load.images.filter((i) => !i.ok);
    record(tag, "All images decode", broken.length === 0, broken.length ? broken.map((i) => i.src).join(", ") : `${load.images.length} images`);
    // The portrait and chart must never shift. Elsewhere, web fonts swapping
    // in can nudge text slightly (the nav, the chart controls row); the total
    // must stay tiny (a tenth of the 0.1 that counts as "good" for Core Web Vitals).
    const cls = load.shifts.reduce((s, e) => s + e.value, 0);
    const heroShifts = load.shifts.filter((e) => e.hero);
    record(tag, "No layout shift from the portrait or chart; total under 0.01",
      heroShifts.length === 0 && cls < LIMITS.layoutShift,
      `layout shift score ${cls.toFixed(4)}, ${heroShifts.length} shifts in the hero visual` +
      (load.shifts.length ? `; sources ${JSON.stringify(load.shifts.map((e) => [+e.value.toFixed(4), e.sources.join("|")]))}` : ""));

    const geo = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height }; };
      const q = (s) => document.querySelector(s);
      return {
        hero: r(q(".home-scene")),
        chart: r(q("#hero-candles")),
        portrait: r(q(".hero-portrait")),
        // Optional boxes on the portrait, as fractions of its box: "x y w h".
        faceBox: q(".hero-portrait").dataset.face || "0.3 0.18 0.4 0.5",
        beside: JSON.parse(q(".hero-portrait").dataset.beside || "{}"),
        regions: {
          headline: r(q("#hero-title")),
          tagline: r(q(".hero-tagline")),
          description: r(q(".hero-description")),
          "button 1": r(q(".hero-actions a:nth-child(1)")),
          "button 2": r(q(".hero-actions a:nth-child(2)")),
          shortcuts: r(q(".hero-shortcuts")),
        },
        column: window.heroChart.getLatestColumn(),
      };
    });
    const heroClip = { x: 0, y: geo.hero.y }; // the hero starts at the top of the page
    // Capture the hero as viewport-sized tiles (scrolling between them) and
    // stitch them. A fullPage capture would temporarily resize the viewport,
    // which re-lays out the page and resizes (and so refits) the chart.
    const shoot = async (file) => {
      const heroH = Math.ceil(geo.hero.h);
      const tops = [];
      for (let t = 0; t < heroH; t += vp.height) tops.push(Math.min(t, Math.max(0, heroH - vp.height)));
      const parts = [];
      let covered = 0;
      for (const top of [...new Set(tops)]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
        await page.waitForTimeout(60);
        const buf = await page.screenshot();
        const to = Math.min(vp.height, heroH - top);
        parts.push({ b64: buf.toString("base64"), top: top * DPR, from: (covered - top) * DPR, to: to * DPR });
        covered = top + to;
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const b64 = await lab.evaluate(([p, w, h]) => window.stitch(p, w, h), [parts, vp.width * DPR, heroH * DPR]);
      if (file) fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, "base64"));
      return b64;
    };
    const dev = (r) => ({ // page rect -> device px rect relative to the hero clip
      x0: Math.floor(r.x * DPR), y0: Math.floor((r.y - heroClip.y) * DPR),
      x1: Math.ceil((r.x + r.w) * DPR), y1: Math.ceil((r.y + r.h - heroClip.y) * DPR),
    });

    // 2. Screenshot at rest (viewport view for review, plus the whole hero for checks).
    await page.screenshot({ path: path.join(OUT, `${theme}-${vp.name}-${vp.width}x${vp.height}.png`) });
    const rest = await shoot(`${theme}-${vp.name}-hero-rest.png`);
    record(tag, "No page errors", errors.length === 0, errors.join("; "));

    // 2b. Still after 10 seconds, measured from the at-rest frame before any interaction.
    const t0 = rest;
    const box0 = await page.evaluate(() => JSON.stringify(document.getElementById("hero-candles").getBoundingClientRect()));
    await page.waitForTimeout(10000);
    const t10 = await shoot(`${theme}-${vp.name}-hero-after-10s.png`);
    const box10 = await page.evaluate(() => JSON.stringify(document.getElementById("hero-candles").getBoundingClientRect()));
    const still = await lab.evaluate(([a, b]) => window.diff(a, b), [t0, t10]);
    record(tag, "Hero identical at rest and 10 s later", still.changed === 0 && box0 === box10,
      `${still.changed} changed pixels, chart box ${box0 === box10 ? "unchanged" : "moved"}`);


    // 3. Horizontal overflow.
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
    record(tag, "No horizontal overflow", overflow.doc <= 0 && overflow.body <= 0, `scrollWidth - clientWidth = ${overflow.doc}px`);

    // 4. Chart contribution over text and face (chart shown vs hidden).
    await page.addStyleTag({ content: "#hero-candles{visibility:hidden!important}" });
    await page.waitForTimeout(100);
    const noChart = await shoot(`${theme}-${vp.name}-hero-no-chart.png`);
    await page.evaluate(() => document.querySelectorAll("style").forEach((s) => s.textContent.includes("#hero-candles{visibility") && s.remove()));
    await page.waitForTimeout(100);
    const p = geo.portrait;
    const onPortrait = ([fx, fy, fw, fh]) => ({ x: p.x + p.w * fx, y: p.y + p.h * fy, w: p.w * fw, h: p.h * fh });
    const face = onPortrait(geo.faceBox.split(/\s+/).map(Number));
    const names = [...Object.keys(geo.regions), "face"];
    const rects = [...Object.values(geo.regions), face].map(dev);
    const deltas = await lab.evaluate(([a, b, r]) => window.regionDelta(a, b, r), [rest, noChart, rects]);
    deltas.forEach((d, i) => {
      const limit = names[i] === "face" ? LIMITS.face : LIMITS.text;
      record(tag, `Chart stays subdued over ${names[i]}`, d.mean <= limit,
        `mean change ${d.mean.toFixed(2)} / 255 (limit ${limit}), max ${d.max.toFixed(0)}`);
    });
    // Where the page asks for it, the chart must be visible beside the silhouette.
    const besideNames = Object.keys(geo.beside);
    if (besideNames.length) {
      const bRects = besideNames.map((n) => dev(onPortrait(geo.beside[n])));
      const bDeltas = await lab.evaluate(([a, b, r]) => window.regionDelta(a, b, r), [rest, noChart, bRects]);
      bDeltas.forEach((d, i) => record(tag, `Chart visible ${besideNames[i]}`, d.mean >= LIMITS.visible,
        `mean change ${d.mean.toFixed(2)} / 255 (minimum ${LIMITS.visible}), max ${d.max.toFixed(0)}`));
    }

    // 5. Crisp chart: grid lines map 1:1 onto device pixels.
    const layers = await page.evaluate(() => [...document.querySelectorAll("#hero-candles canvas")].map((c) => c.toDataURL().split(",")[1]));
    const origin = { x: geo.chart.x * DPR, y: (geo.chart.y - heroClip.y) * DPR };
    const above = await page.evaluate(() => [".hero-copy", ".hero-shortcuts", ".hero-chart-controls"].map((s) => {
      const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height };
    }));
    const sharp = await lab.evaluate(([a, b, c, o, k]) => window.crisp(a, b, c, o, k), [rest, noChart, layers, origin, above.map(dev)]);
    const widths = [...sharp.rows, ...sharp.cols];
    record(tag, "Chart is crisp (grid lines 1 CSS px, no resampling)",
      widths.length > 0 && widths.every((w) => w === DPR) && sharp.samples >= 300 && sharp.bleed === 0,
      `${sharp.rows.length} horizontal and ${sharp.cols.length} vertical grid lines, widths ${[...new Set(widths)].join("/")} device px; ` +
      `${sharp.samples} on-screen samples, ${sharp.bleed} with bleed into neighbouring pixels` +
      (sharp.bleed ? `; at (device px in hero) ${JSON.stringify(sharp.where)}` : ""));

    // 9. Text contrast against the pixels behind it, and the chart's colours.
    const applied = await page.evaluate(() => document.documentElement.dataset.theme);
    record(tag, "Theme applied", applied === theme, `data-theme="${applied}"`);
    const texts = await page.evaluate(() => {
      const list = [
        ["nav links", ".home .nav-links a:not([aria-current])", false],
        ["overline", ".hero-overline", false],
        ["headline", "#hero-title", true],
        ["tagline", ".hero-tagline em", true],
        ["description", ".hero-description", false],
        ["primary button", ".hero-actions a:nth-child(1)", false],
        ["secondary button", ".hero-actions a:nth-child(2)", false],
        ["shortcut labels", ".hero-shortcuts a span", false],
        ["chart caption", ".hero-chart-note", false],
      ];
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      return list.map(([name, sel, large]) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        // Measure only where the glyphs are: the boxes of the element's text.
        const range = document.createRange();
        range.selectNodeContents(el);
        const boxes = [...range.getClientRects()].filter((b) => b.width > 1 && b.height > 1);
        if (!boxes.length) return null;
        const r = { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)),
          right: Math.max(...boxes.map((b) => b.right)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
        r.width = r.right - r.x; r.height = r.bottom - r.y;
        const cs = getComputedStyle(el);
        let colors = [cs.color];
        if (/,\s*0\)$/.test(cs.color) && cs.backgroundImage.includes("gradient")) colors = cs.backgroundImage.match(/rgba?\([^)]+\)/g) || [];
        const size = parseFloat(cs.fontSize);
        return { name, rect: { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }, colors: colors.map(rgb),
          large: large || size >= 24 || (parseInt(cs.fontWeight, 10) >= 700 && size >= 18.66) };
      }).filter(Boolean);
    });
    await page.addStyleTag({ content: ".home .nav-links a, .hero-overline, #hero-title, .hero-tagline, .hero-description, .hero-actions a, .hero-shortcuts span, .hero-chart-note { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } .hero-tagline em { background: none !important; }" });
    await page.waitForTimeout(100);
    const noText = await shoot(`${theme}-${vp.name}-hero-no-text.png`);
    await page.evaluate(() => document.querySelectorAll("style").forEach((s) => s.textContent.includes("-webkit-text-fill-color: transparent") && s.remove()));
    await page.waitForTimeout(100);
    const ratios = await lab.evaluate(([b, items]) => window.contrast(b, items), [noText, texts.map((t) => ({ rect: dev(t.rect), colors: t.colors }))]);
    const low = [], warned = [];
    const detail = texts.map((t, i) => {
      const need = t.large ? LIMITS.contrastLarge : LIMITS.contrast;
      const known = (CONTRAST_EXCEPTIONS[theme] || {})[t.name];
      if (ratios[i] < need) (known ? warned : low).push(known ? `${t.name}: ${known}` : t.name);
      return `${t.name} ${ratios[i].toFixed(1)}:1${ratios[i] < need ? ` (needs ${need}${known ? ", known exception" : ""})` : ""}`;
    }).join(", ");
    record(tag, "Text contrast (WCAG AA) against what is behind it", low.length === 0, detail);
    warned.forEach((w) => console.log(`WARN  [${tag}] contrast below AA by design - ${w}`));
    const chartColours = await page.evaluate(() => {
      const c = document.querySelector(".candle-backdrop__layer--base"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3] === 255) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      const want = ["--theme-chart-up", "--theme-chart-down"].map((v) => {
        const probe = document.createElement("i"); probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(v);
        document.body.append(probe); const col = getComputedStyle(probe).color.match(/\d+/g).slice(0, 3).join(","); probe.remove(); return col;
      });
      // Nearest drawn colour to each wanted one (gradient themes blend along x).
      const near = (w) => { const a = w.split(",").map(Number); let best = 999;
        seen.forEach((k) => { const b = k.split(",").map(Number); best = Math.min(best, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }); return Math.round(best); };
      return { want, dist: want.map(near) };
    });
    record(tag, "Chart drawn in the theme's candle colours", chartColours.dist.every((d) => d <= 24),
      `up rgb(${chartColours.want[0]}) nearest drawn colour ${chartColours.dist[0]} away, down rgb(${chartColours.want[1]}) ${chartColours.dist[1]} away (limit 24)`);

    // 6. Buttons stay clickable; chart is outside the tab order.
    const hits = await page.evaluate(() => [...document.querySelectorAll(".hero-actions a")].map((a) => {
      a.scrollIntoView({ block: "center" });
      const b = a.getBoundingClientRect();
      const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return el === a || a.contains(el);
    }));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    record(tag, "Hero buttons receive clicks", hits.every(Boolean), `${hits.filter(Boolean).length}/${hits.length}`);
    const a11y = await page.evaluate(() => {
      const c = document.getElementById("hero-candles");
      const focusable = c.querySelectorAll("a,button,input,select,textarea,[tabindex],canvas[tabindex]").length;
      return { inert: c.inert, hidden: c.getAttribute("aria-hidden"), pointer: getComputedStyle(c).pointerEvents, focusable };
    });
    const tabbed = [];
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      tabbed.push(await page.evaluate(() => !!document.activeElement.closest(".hero-chart")));
    }
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.waitForTimeout(300);
    record(tag, "Chart is decorative and out of the tab order",
      a11y.inert && a11y.hidden === "true" && a11y.pointer === "none" && a11y.focusable === 0 && !tabbed.some(Boolean),
      `inert=${a11y.inert}, aria-hidden=${a11y.hidden}, pointer-events=${a11y.pointer}, focus never entered chart over 25 Tabs`);

    if (first) {
    // Links: in-page anchors exist; same-site files load; external links listed.
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.getAttribute("href"), url: a.href })));
    const origin0 = new globalThis.URL(URL).origin;
    const linkProblems = [];
    let internal = 0, anchors = 0, external = 0;
    for (const l of links) {
      if (l.href.startsWith("#")) {
        anchors++;
        const ok = await page.evaluate((id) => !!document.getElementById(id), l.href.slice(1));
        if (!ok) linkProblems.push(`${l.href} (no such id)`);
      } else if (new globalThis.URL(l.url).origin === origin0) {
        internal++;
        const res = await page.request.get(l.url);
        if (res.status() !== 200) linkProblems.push(`${l.href} (HTTP ${res.status()})`);
        const hash = new globalThis.URL(l.url).hash;
        if (hash && res.status() === 200 && !(await res.text()).includes(`id="${hash.slice(1)}"`)) linkProblems.push(`${l.href} (no such id)`);
      } else {
        external++;
      }
    }
    record(tag, "Page links resolve", linkProblems.length === 0,
      `${anchors} in-page anchors, ${internal} same-site links, ${external} external links (not fetched)` +
      (linkProblems.length ? `; problems: ${linkProblems.join(", ")}` : ""));

    }

    // 7. Test updates change only the newest candle's column.
    const col = geo.column;
    const colPage = { x: geo.chart.x + col.left, y: geo.chart.y + col.priceTop, w: col.right - col.left, h: col.volumeBottom - col.priceTop };
    const pricePage = { x: colPage.x, y: geo.chart.y + col.priceTop, w: colPage.w, h: col.priceBottom - col.priceTop };
    const volPage = { x: colPage.x, y: geo.chart.y + col.volumeTop, w: colPage.w, h: col.volumeBottom - col.volumeTop };
    // Three fixed revisions of the newest candle: up, down, then up again.
    const original = await page.evaluate(() => window.heroChart.getLatest());
    const testUpdates = [
      { c: +(original.c * 1.018).toFixed(2), h: +(original.h * 1.022).toFixed(2), v: Math.round(original.v * 1.3) },
      { c: +(original.o * 0.988).toFixed(2), l: +(original.o * 0.982).toFixed(2), v: Math.round(original.v * 1.45) },
      { c: +(original.c * 1.006).toFixed(2), v: Math.round(original.v * 1.6) },
    ];
    let before = await shoot();
    const scale0 = await page.evaluate(() => JSON.stringify(window.heroChart.getScale()));
    const base0 = await page.evaluate(() => document.querySelector(".candle-backdrop__layer--base").toDataURL());
    for (let step = 1; step <= 3; step++) {
      const latest0 = await page.evaluate(() => window.heroChart.getLatest());
      await page.evaluate((u) => window.heroChart.updateLatest(u), testUpdates[step - 1]); // no scrolling
      await page.waitForTimeout(150);
      const latest1 = await page.evaluate(() => window.heroChart.getLatest());
      const after = await shoot(step === 1 ? `${theme}-${vp.name}-hero-after-update.png` : undefined);
      const split = await lab.evaluate(([a, b, r]) => window.diffIn(a, b, r), [before, after, [dev(pricePage), dev(volPage)]]);
      const scale1 = await page.evaluate(() => JSON.stringify(window.heroChart.getScale()));
      const base1 = await page.evaluate(() => document.querySelector(".candle-backdrop__layer--base").toDataURL());
      const ok = split.outside === 0 && split.inside[0] > 0 && split.inside[1] > 0 && scale0 === scale1 && base0 === base1;
      record(tag, `Test update ${step} changes only the newest candle and its volume bar`, ok,
        `candle ${split.inside[0]} px, volume ${split.inside[1]} px, elsewhere ${split.outside} px; ` +
        `scale ${scale0 === scale1 ? "held" : "changed"}; history layer ${base0 === base1 ? "untouched" : "redrawn"}; ` +
        `c ${latest0.c} -> ${latest1.c}, v ${latest0.v} -> ${latest1.v}` +
        (split.outside ? `; outside samples (device px in hero) ${JSON.stringify(split.samples)}, column ${JSON.stringify([dev(pricePage), dev(volPage)])}` : ""));
      if (step === 1) {
        const pad = 90;
        const crop = dev({ x: colPage.x - pad, y: colPage.y - 10, w: colPage.w + pad * 2, h: colPage.h + 20 });
        const img = await lab.evaluate(([a, b, r]) => window.triptych(a, b, r, 2), [before, after, crop]);
        fs.writeFileSync(path.join(OUT, `${theme}-${vp.name}-update-before-after-diff.png`), Buffer.from(img, "base64"));
      }
      before = after;
    }

    // An update far outside the locked range is clipped inside the newest column.
    const extreme = await page.evaluate(() => {
      const s = window.heroChart.getScale();
      return window.heroChart.updateLatest({ h: s.max * 1.5, l: s.min * 0.5, v: s.volumeMax * 3 });
    });
    await page.waitForTimeout(150);
    const clipped = await shoot();
    const cSplit = await lab.evaluate(([a, b, r]) => window.diffIn(a, b, r), [before, clipped, [dev(pricePage), dev(volPage)]]);
    const scaleX = await page.evaluate(() => JSON.stringify(window.heroChart.getScale()));
    record(tag, "Out-of-range update is clipped to the newest column", extreme && cSplit.outside === 0 && scaleX === scale0,
      `elsewhere ${cSplit.outside} px; scale ${scaleX === scale0 ? "held" : "changed"}`);

    await page.evaluate((o) => window.heroChart.updateLatest(o), original);

    // 8. Live overlay toggle (TradingView). Works online or offline.
    if (first) {
    const tvBefore = requested.filter((u) => u.includes("tradingview")).length;
    record(tag, "Nothing loads from TradingView until the overlay is turned on", tvBefore === 0,
      `${tvBefore} TradingView requests before the toggle was pressed`);
    const overlay0 = await page.evaluate(() => {
      const t = document.querySelector(".hero-chart-toggle");
      t.scrollIntoView({ block: "center", behavior: "instant" });
      const b = t.getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === t;
      t.focus();
      return {
        hit, focused: document.activeElement === t, pressed: t.getAttribute("aria-pressed"),
        candles: getComputedStyle(document.getElementById("hero-candles")).opacity,
        row: document.querySelector(".hero-chart-controls").getBoundingClientRect().height,
        note: document.querySelector(".hero-chart-note").textContent,
      };
    });
    const baseBefore = await page.evaluate(() => document.querySelector(".candle-backdrop__layer--base").toDataURL());
    await page.keyboard.press("Enter"); // keyboard activation
    let ov = null;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      ov = await page.evaluate(() => ({
        live: document.querySelector(".hero-chart").classList.contains("is-live"),
        pressed: document.querySelector(".hero-chart-toggle").getAttribute("aria-pressed"),
        status: document.querySelector(".hero-chart-status").textContent,
      }));
      if (ov.live || (ov.status && !ov.status.startsWith("Connecting"))) break;
    }
    const overlay1 = await page.evaluate(() => ({
      candles: getComputedStyle(document.getElementById("hero-candles")).opacity,
      overlay: getComputedStyle(document.getElementById("hero-chart-live")).opacity,
      iframeInert: !!document.querySelector("#hero-chart-live iframe") && document.querySelector("#hero-chart-live iframe").closest("[inert]") !== null,
      row: document.querySelector(".hero-chart-controls").getBoundingClientRect().height,
      note: document.querySelector(".hero-chart-note").textContent,
    }));
    const baseLive = await page.evaluate(() => document.querySelector(".candle-backdrop__layer--base").toDataURL());
    const onOk = ov.live
      ? ov.pressed === "true" && +overlay1.candles < +overlay1.overlay && overlay1.iframeInert && overlay1.row === overlay0.row && baseLive === baseBefore
      : ov.pressed === "false" && ov.status.includes("unavailable");
    record(tag, "Live overlay turns on (or falls back offline)", overlay0.hit && overlay0.focused && overlay0.pressed === "false" && onOk,
      `toggle clickable=${overlay0.hit}, focusable=${overlay0.focused}; ` + (ov.live
        ? `live: aria-pressed=${ov.pressed}, candles opacity ${overlay1.candles} under overlay ${overlay1.overlay}, widget inside the inert chart=${overlay1.iframeInert}, ` +
          `controls row ${overlay0.row}px -> ${overlay1.row}px, history layer ${baseLive === baseBefore ? "untouched" : "redrawn"}, caption "${overlay1.note}"`
        : `offline fallback: "${ov.status}", aria-pressed=${ov.pressed}`));
    if (ov.live) {
      await page.evaluate(() => document.querySelector(".hero-chart-toggle").click());
      await page.waitForTimeout(300);
      const off = await page.evaluate(() => ({
        live: document.querySelector(".hero-chart").classList.contains("is-live"),
        pressed: document.querySelector(".hero-chart-toggle").getAttribute("aria-pressed"),
        hidden: document.getElementById("hero-chart-live").hidden,
        candles: getComputedStyle(document.getElementById("hero-candles")).opacity,
        note: document.querySelector(".hero-chart-note").textContent,
      }));
      record(tag, "Live overlay turns off again", !off.live && off.pressed === "false" && off.hidden && off.note === overlay0.note && off.candles === overlay0.candles,
        `aria-pressed=${off.pressed}, overlay hidden=${off.hidden}, candles opacity back to ${off.candles}, caption "${off.note}"`);
    }
    }
    await context.close();
  }

  // 10. The theme system, once.
  {
    const tag = "theme system";
    let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(URL, { waitUntil: "networkidle" });
    const def = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("hm-theme"),
      meta: document.querySelector('meta[name="theme-color"]').getAttribute("content") }));
    record(tag, "New visitors get Haley's Choice", def.theme === "haleys-choice" && def.stored === null,
      `data-theme="${def.theme}", nothing saved yet, theme-color ${def.meta}`);

    await p.focus(".theme-picker__button");
    await p.keyboard.press("Enter");
    const opened = await p.evaluate(() => ({
      expanded: document.querySelector(".theme-picker__button").getAttribute("aria-expanded"),
      focus: document.activeElement.getAttribute("data-value"),
      names: [...document.querySelectorAll(".theme-picker__option")].map((o) => o.textContent.trim()),
      swatches: [...document.querySelectorAll(".theme-picker__option .theme-swatch i")].length,
    }));
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(700);
    const chosen = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("hm-theme"),
      back: document.activeElement.classList.contains("theme-picker__button"), expanded: document.querySelector(".theme-picker__button").getAttribute("aria-expanded") }));
    const names = ["Classic", "Haley\u2019s Choice", "Mile High", "Liquidity", "Flow", "Surge"];
    record(tag, "Picker lists the six themes with palette previews and works by keyboard",
      opened.expanded === "true" && JSON.stringify(opened.names) === JSON.stringify(names) && opened.swatches === 24 && opened.focus === "haleys-choice" &&
      chosen.theme === "mile-high" && chosen.stored === "mile-high" && chosen.back && chosen.expanded === "false",
      `${opened.names.join(", ")}; Enter opened it on the current theme, ArrowDown + Enter chose ${chosen.theme} and returned focus to the button`);

    await p.click(".theme-picker__button");
    await p.click('.theme-picker__option[data-value="surge"]');
    await p.waitForTimeout(700);
    const clicked = await p.evaluate(() => document.documentElement.dataset.theme);
    await p.click(".theme-picker__button");
    await p.mouse.click(20, 600);
    const closed = await p.evaluate(() => document.querySelector(".theme-picker__button").getAttribute("aria-expanded"));
    record(tag, "Picker works by pointer and closes on an outside click", clicked === "surge" && closed === "false", `clicked Surge -> ${clicked}; outside click -> aria-expanded=${closed}`);

    await p.reload({ waitUntil: "networkidle" });
    const reloaded = await p.evaluate(() => document.documentElement.dataset.theme);
    const p2 = await ctx.newPage();
    await p2.goto(new globalThis.URL("projects/working-capital/index.html", URL).href, { waitUntil: "networkidle" });
    const sub = await p2.evaluate(() => ({ theme: document.documentElement.dataset.theme, picker: !!document.querySelector(".nav .theme-picker__button") }));
    await p.evaluate(() => window.HMTheme.set("flow"));
    await p2.waitForTimeout(500);
    const synced = await p2.evaluate(() => document.documentElement.dataset.theme);
    record(tag, "The choice persists across reloads, project pages and open tabs",
      reloaded === "surge" && sub.theme === "surge" && sub.picker && synced === "flow",
      `reload -> ${reloaded}; project page -> ${sub.theme} (picker in its nav: ${sub.picker}); changed to Flow in one tab -> other tab ${synced}`);
    await p2.close();

    await p.evaluate(() => window.HMTheme.set("liquidity"));
    await p.waitForTimeout(900);
    const motion = await p.evaluate(() => {
      const anims = document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".scene-decor"));
      const props = new Set();
      anims.forEach((a) => a.effect.getKeyframes().forEach((k) => Object.keys(k).forEach((q) => { if (!["offset", "easing", "composite", "computedOffset"].includes(q)) props.add(q); })));
      return { count: anims.length, props: [...props] };
    });
    record(tag, "Decor animates with transform and opacity only", motion.count > 0 && motion.props.every((q) => ["transform", "opacity", "translate", "scale", "rotate"].includes(q)),
      `${motion.count} running decor animations (Liquidity), animating ${motion.props.join(", ")}`);
    await p.evaluate(() => {
      window.__long = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask" });
      window.__base = document.querySelector(".candle-backdrop__layer--base").toDataURL();
      window.__c0 = JSON.stringify(window.heroChart.getLatest());
    });
    await p.waitForTimeout(6000);
    const tick = await p.evaluate(() => ({ ticked: JSON.stringify(window.heroChart.getLatest()) !== window.__c0,
      baseSame: document.querySelector(".candle-backdrop__layer--base").toDataURL() === window.__base, long: window.__long }));
    record(tag, "Newest candle ticks while the history layer stays untouched", tick.ticked && tick.baseSame,
      `newest candle ${tick.ticked ? "changed" : "unchanged"} over 6 s; history layer ${tick.baseSame ? "byte-identical" : "redrawn"}`);
    record(tag, "No long main-thread tasks while the hero animates", tick.long.length === 0,
      tick.long.length ? `long tasks (ms): ${tick.long.join(", ")}` : "none over 6 s");
    record(tag, "No page errors while switching themes", errs.length === 0, errs.join("; "));
    await ctx.close();

    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await ctx.addInitScript(() => localStorage.setItem("hm-theme", "liquidity"));
    p = await ctx.newPage();
    await p.goto(URL, { waitUntil: "networkidle" });
    await p.waitForTimeout(1000);
    const rm = await p.evaluate(async () => {
      const running = document.getAnimations().filter((a) => a.playState === "running").length;
      const c0 = JSON.stringify(window.heroChart.getLatest());
      await new Promise((r) => setTimeout(r, 5200));
      return { running, ticked: JSON.stringify(window.heroChart.getLatest()) !== c0 };
    });
    record(tag, "Reduced motion: nothing animates and the candle holds still", rm.running === 0 && !rm.ticked,
      `${rm.running} running animations; newest candle ${rm.ticked ? "changed" : "unchanged"} over 5 s`);
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Output: ${OUT}`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
