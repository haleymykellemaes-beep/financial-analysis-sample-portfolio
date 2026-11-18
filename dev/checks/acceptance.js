#!/usr/bin/env node
/*
 * Acceptance checks for the homepage hero and its candlestick backdrop.
 *
 * Usage (with a static server running at the repository root):
 *   python3 -m http.server 8765
 *   node dev/checks/acceptance.js [pageUrl] [outputDir]
 *
 * Defaults: http://localhost:8765/ and dev/checks/output/ (git-ignored).
 * Requires Playwright with Chromium. Exits non-zero if any check fails.
 *
 * At 1440x900 and 390x844 (2x pixel density) it:
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
 *      the illustrative chart and caption.
 *
 * The page must expose the chart as window.heroChart (js/home-hero.js does).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const URL = process.argv[2] || "http://localhost:8765/";
const OUT = path.resolve(process.argv[3] || path.join(__dirname, "output"));
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const DPR = 2;

// Region limits: mean absolute RGB change (0-255) the chart may add.
// visible: minimum mean change where a page asks for the chart to show (data-beside).
// layoutShift: maximum total layout shift score while the page loads.
const LIMITS = { text: 3, face: 0.5, visible: 2, layoutShift: 0.01 };

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

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: DPR });
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
    record(vp.name, "Chart mounted", load.chart, load.chart ? "window.heroChart and its canvases present" : "chart did not mount");
    record(vp.name, "All requests succeed", badRequests.length === 0, badRequests.length ? badRequests.join("; ") : "no failed requests or HTTP errors");
    const broken = load.images.filter((i) => !i.ok);
    record(vp.name, "All images decode", broken.length === 0, broken.length ? broken.map((i) => i.src).join(", ") : `${load.images.length} images`);
    // The portrait and chart must never shift. Elsewhere, web fonts swapping
    // in can nudge text slightly (the nav, the chart controls row); the total
    // must stay tiny (a tenth of the 0.1 that counts as "good" for Core Web Vitals).
    const cls = load.shifts.reduce((s, e) => s + e.value, 0);
    const heroShifts = load.shifts.filter((e) => e.hero);
    record(vp.name, "No layout shift from the portrait or chart; total under 0.01",
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
    await page.screenshot({ path: path.join(OUT, `${vp.name}-${vp.width}x${vp.height}.png`) });
    const rest = await shoot(`${vp.name}-hero-rest.png`);
    record(vp.name, "No page errors", errors.length === 0, errors.join("; "));

    // 2b. Still after 10 seconds, measured from the at-rest frame before any interaction.
    const t0 = rest;
    const box0 = await page.evaluate(() => JSON.stringify(document.getElementById("hero-candles").getBoundingClientRect()));
    await page.waitForTimeout(10000);
    const t10 = await shoot(`${vp.name}-hero-after-10s.png`);
    const box10 = await page.evaluate(() => JSON.stringify(document.getElementById("hero-candles").getBoundingClientRect()));
    const still = await lab.evaluate(([a, b]) => window.diff(a, b), [t0, t10]);
    record(vp.name, "Hero identical at rest and 10 s later", still.changed === 0 && box0 === box10,
      `${still.changed} changed pixels, chart box ${box0 === box10 ? "unchanged" : "moved"}`);


    // 3. Horizontal overflow.
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
    record(vp.name, "No horizontal overflow", overflow.doc <= 0 && overflow.body <= 0, `scrollWidth - clientWidth = ${overflow.doc}px`);

    // 4. Chart contribution over text and face (chart shown vs hidden).
    await page.addStyleTag({ content: "#hero-candles{visibility:hidden!important}" });
    await page.waitForTimeout(100);
    const noChart = await shoot(`${vp.name}-hero-no-chart.png`);
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
      record(vp.name, `Chart stays subdued over ${names[i]}`, d.mean <= limit,
        `mean change ${d.mean.toFixed(2)} / 255 (limit ${limit}), max ${d.max.toFixed(0)}`);
    });
    // Where the page asks for it, the chart must be visible beside the silhouette.
    const besideNames = Object.keys(geo.beside);
    if (besideNames.length) {
      const bRects = besideNames.map((n) => dev(onPortrait(geo.beside[n])));
      const bDeltas = await lab.evaluate(([a, b, r]) => window.regionDelta(a, b, r), [rest, noChart, bRects]);
      bDeltas.forEach((d, i) => record(vp.name, `Chart visible ${besideNames[i]}`, d.mean >= LIMITS.visible,
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
    record(vp.name, "Chart is crisp (grid lines 1 CSS px, no resampling)",
      widths.length > 0 && widths.every((w) => w === DPR) && sharp.samples >= 300 && sharp.bleed === 0,
      `${sharp.rows.length} horizontal and ${sharp.cols.length} vertical grid lines, widths ${[...new Set(widths)].join("/")} device px; ` +
      `${sharp.samples} on-screen samples, ${sharp.bleed} with bleed into neighbouring pixels` +
      (sharp.bleed ? `; at (device px in hero) ${JSON.stringify(sharp.where)}` : ""));

    // 6. Buttons stay clickable; chart is outside the tab order.
    const hits = await page.evaluate(() => [...document.querySelectorAll(".hero-actions a")].map((a) => {
      a.scrollIntoView({ block: "center" });
      const b = a.getBoundingClientRect();
      const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return el === a || a.contains(el);
    }));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    record(vp.name, "Hero buttons receive clicks", hits.every(Boolean), `${hits.filter(Boolean).length}/${hits.length}`);
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
    record(vp.name, "Chart is decorative and out of the tab order",
      a11y.inert && a11y.hidden === "true" && a11y.pointer === "none" && a11y.focusable === 0 && !tabbed.some(Boolean),
      `inert=${a11y.inert}, aria-hidden=${a11y.hidden}, pointer-events=${a11y.pointer}, focus never entered chart over 25 Tabs`);

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
    record(vp.name, "Page links resolve", linkProblems.length === 0,
      `${anchors} in-page anchors, ${internal} same-site links, ${external} external links (not fetched)` +
      (linkProblems.length ? `; problems: ${linkProblems.join(", ")}` : ""));

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
      const after = await shoot(step === 1 ? `${vp.name}-hero-after-update.png` : undefined);
      const split = await lab.evaluate(([a, b, r]) => window.diffIn(a, b, r), [before, after, [dev(pricePage), dev(volPage)]]);
      const scale1 = await page.evaluate(() => JSON.stringify(window.heroChart.getScale()));
      const base1 = await page.evaluate(() => document.querySelector(".candle-backdrop__layer--base").toDataURL());
      const ok = split.outside === 0 && split.inside[0] > 0 && split.inside[1] > 0 && scale0 === scale1 && base0 === base1;
      record(vp.name, `Test update ${step} changes only the newest candle and its volume bar`, ok,
        `candle ${split.inside[0]} px, volume ${split.inside[1]} px, elsewhere ${split.outside} px; ` +
        `scale ${scale0 === scale1 ? "held" : "changed"}; history layer ${base0 === base1 ? "untouched" : "redrawn"}; ` +
        `c ${latest0.c} -> ${latest1.c}, v ${latest0.v} -> ${latest1.v}` +
        (split.outside ? `; outside samples (device px in hero) ${JSON.stringify(split.samples)}, column ${JSON.stringify([dev(pricePage), dev(volPage)])}` : ""));
      if (step === 1) {
        const pad = 90;
        const crop = dev({ x: colPage.x - pad, y: colPage.y - 10, w: colPage.w + pad * 2, h: colPage.h + 20 });
        const img = await lab.evaluate(([a, b, r]) => window.triptych(a, b, r, 2), [before, after, crop]);
        fs.writeFileSync(path.join(OUT, `${vp.name}-update-before-after-diff.png`), Buffer.from(img, "base64"));
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
    record(vp.name, "Out-of-range update is clipped to the newest column", extreme && cSplit.outside === 0 && scaleX === scale0,
      `elsewhere ${cSplit.outside} px; scale ${scaleX === scale0 ? "held" : "changed"}`);

    await page.evaluate((o) => window.heroChart.updateLatest(o), original);

    // 8. Live overlay toggle (TradingView). Works online or offline.
    const tvBefore = requested.filter((u) => u.includes("tradingview")).length;
    record(vp.name, "Nothing loads from TradingView until the overlay is turned on", tvBefore === 0,
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
    record(vp.name, "Live overlay turns on (or falls back offline)", overlay0.hit && overlay0.focused && overlay0.pressed === "false" && onOk,
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
      record(vp.name, "Live overlay turns off again", !off.live && off.pressed === "false" && off.hidden && off.note === overlay0.note && off.candles === overlay0.candles,
        `aria-pressed=${off.pressed}, overlay hidden=${off.hidden}, candles opacity back to ${off.candles}, caption "${off.note}"`);
    }
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Output: ${OUT}`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
