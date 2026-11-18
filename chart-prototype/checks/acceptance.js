#!/usr/bin/env node
/*
 * Acceptance checks for the hero candlestick prototype.
 *
 * Usage (with a static server running at the repository root):
 *   python3 -m http.server 8765
 *   node chart-prototype/checks/acceptance.js [previewUrl] [outputDir]
 *
 * Defaults: http://localhost:8765/chart-prototype/ and chart-prototype/checks/output/
 * Requires Playwright with Chromium. Exits non-zero if any check fails.
 *
 * At 1440x900 and 390x844 it:
 *   1. saves a screenshot of the hero at rest, then compares it with 10 seconds
 *      later (must be pixel-identical);
 *   2. checks for horizontal overflow;
 *   3. measures how much the chart changes the pixels of the headline, tagline,
 *      description, buttons, shortcuts and face (chart shown vs hidden);
 *   4. checks the hero buttons receive clicks and the chart is out of the tab order;
 *   5. applies each demo test update and checks that only the newest candle's
 *      column (candle + volume bar) changed and that the price scale held,
 *      then repeats with an update far outside the locked range (clipping).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const URL = process.argv[2] || "http://localhost:8765/chart-prototype/";
const OUT = path.resolve(process.argv[3] || path.join(__dirname, "output"));
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const DPR = 2;

// Region limits: mean absolute RGB change (0-255) the chart may add.
const LIMITS = { text: 3, face: 0.5 };

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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const geo = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height }; };
      const q = (s) => document.querySelector(s);
      return {
        hero: r(q(".home-scene")),
        chart: r(q("#hero-candles")),
        portrait: r(q(".hero-portrait")),
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
    const heroClip = { x: 0, y: geo.hero.y, width: vp.width, height: Math.ceil(geo.hero.h) };
    const shoot = async (file) => {
      const buf = await page.screenshot({ clip: heroClip, fullPage: true });
      if (file) fs.writeFileSync(path.join(OUT, file), buf);
      return buf.toString("base64");
    };
    const dev = (r) => ({ // page rect -> device px rect relative to the hero clip
      x0: Math.floor(r.x * DPR), y0: Math.floor((r.y - heroClip.y) * DPR),
      x1: Math.ceil((r.x + r.w) * DPR), y1: Math.ceil((r.y + r.h - heroClip.y) * DPR),
    });

    // 1. Screenshot at rest (viewport view for review, plus the whole hero for checks).
    await page.screenshot({ path: path.join(OUT, `${vp.name}-${vp.width}x${vp.height}.png`) });
    const rest = await shoot(`${vp.name}-hero-rest.png`);
    record(vp.name, "No page errors", errors.length === 0, errors.join("; "));

    // 1b. Still after 10 seconds, measured from the at-rest frame before any interaction.
    const t0 = rest;
    const box0 = await page.evaluate(() => JSON.stringify(document.getElementById("hero-candles").getBoundingClientRect()));
    await page.waitForTimeout(10000);
    const t10 = await shoot(`${vp.name}-hero-after-10s.png`);
    const box10 = await page.evaluate(() => JSON.stringify(document.getElementById("hero-candles").getBoundingClientRect()));
    const still = await lab.evaluate(([a, b]) => window.diff(a, b), [t0, t10]);
    record(vp.name, "Hero identical at rest and 10 s later", still.changed === 0 && box0 === box10,
      `${still.changed} changed pixels, chart box ${box0 === box10 ? "unchanged" : "moved"}`);


    // 2. Horizontal overflow.
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
    record(vp.name, "No horizontal overflow", overflow.doc <= 0 && overflow.body <= 0, `scrollWidth - clientWidth = ${overflow.doc}px`);

    // 3. Chart contribution over text and face (chart shown vs hidden).
    await page.addStyleTag({ content: "#hero-candles{visibility:hidden!important}" });
    await page.waitForTimeout(100);
    const noChart = await shoot(`${vp.name}-hero-no-chart.png`);
    await page.evaluate(() => document.querySelectorAll("style").forEach((s) => s.textContent.includes("#hero-candles{visibility") && s.remove()));
    await page.waitForTimeout(100);
    const p = geo.portrait;
    const face = { x: p.x + p.w * 0.3, y: p.y + p.h * 0.18, w: p.w * 0.4, h: p.h * 0.5 };
    const names = [...Object.keys(geo.regions), "face"];
    const rects = [...Object.values(geo.regions), face].map(dev);
    const deltas = await lab.evaluate(([a, b, r]) => window.regionDelta(a, b, r), [rest, noChart, rects]);
    deltas.forEach((d, i) => {
      const limit = names[i] === "face" ? LIMITS.face : LIMITS.text;
      record(vp.name, `Chart stays subdued over ${names[i]}`, d.mean <= limit,
        `mean change ${d.mean.toFixed(2)} / 255 (limit ${limit}), max ${d.max.toFixed(0)}`);
    });

    // 4. Buttons stay clickable; chart is outside the tab order.
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

    // 5. Test updates change only the newest candle's column.
    const col = geo.column;
    const colPage = { x: geo.chart.x + col.left, y: geo.chart.y + col.priceTop, w: col.right - col.left, h: col.volumeBottom - col.priceTop };
    const pricePage = { x: colPage.x, y: geo.chart.y + col.priceTop, w: colPage.w, h: col.priceBottom - col.priceTop };
    const volPage = { x: colPage.x, y: geo.chart.y + col.volumeTop, w: colPage.w, h: col.volumeBottom - col.volumeTop };
    let before = await shoot();
    const scale0 = await page.evaluate(() => JSON.stringify(window.heroChart.getScale()));
    const base0 = await page.evaluate(() => document.querySelector(".candle-backdrop__layer--base").toDataURL());
    for (let step = 1; step <= 3; step++) {
      const latest0 = await page.evaluate(() => window.heroChart.getLatest());
      await page.evaluate(() => document.getElementById("proto-update").click()); // no scrolling
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

    await page.evaluate(() => document.getElementById("proto-reset").click());
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Output: ${OUT}`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
