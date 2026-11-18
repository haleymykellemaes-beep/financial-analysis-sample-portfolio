/*
 * Hero chart prototype: a self-hosted, decorative market chart for the homepage hero.
 *
 * - Draws seeded, illustrative OHLC candles, a 20-period moving average,
 *   a ±2σ volatility band, volume, and a last-price marker on a <canvas>.
 * - "Ticks" the latest candle and rolls in a new one on a slow cadence.
 * - No third-party requests. Pauses when off-screen or the tab is hidden.
 * - Honors prefers-reduced-motion by drawing a single still frame.
 *
 * Mount: any element with [data-hero-chart] containing a <canvas>.
 * Options (data attributes on the mount):
 *   data-style="candles" | "line"   (default candles)
 *   data-seed="<int>"               (default 20261118)
 */
(function () {
  const mount = document.querySelector("[data-hero-chart]");
  if (!mount) return;
  const canvas = mount.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const readout = document.querySelector("[data-hero-chart-readout]");

  const COLORS = {
    up: "#ecd0ad",
    down: "#c08a76",
    wick: "rgba(236, 208, 173, 0.55)",
    ma: "#f6caa2",
    band: "rgba(231, 200, 172, 0.07)",
    bandEdge: "rgba(231, 200, 172, 0.22)",
    grid: "rgba(231, 200, 172, 0.08)",
    volUp: "rgba(236, 208, 173, 0.16)",
    volDown: "rgba(192, 138, 118, 0.14)",
    last: "#ffd9b3",
    area: ["rgba(246, 202, 162, 0.22)", "rgba(246, 202, 162, 0)"],
  };

  const SPACING = 13;          // CSS px per candle
  const TICK_MS = 900;         // price update cadence
  const TICKS_PER_CANDLE = 7;  // ticks before a candle closes
  const ROLL_MS = 700;         // slide-in duration for a new candle
  const MA_LEN = 20;
  const HISTORY = 260;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- seeded data ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rand = mulberry32(Number(mount.dataset.seed) || 20261118);
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Regime-switching drift so the path has trends and pullbacks, with a net upward bias.
  let regime = 0;
  let regimeLeft = 0;
  function nextDrift() {
    if (regimeLeft-- <= 0) {
      regime = [0.0022, 0.0011, -0.0016, 0.0004][Math.floor(rand() * 4)];
      regimeLeft = 18 + Math.floor(rand() * 34);
    }
    return regime;
  }

  function makeCandle(open) {
    const drift = nextDrift();
    const vol = 0.011 + rand() * 0.008;
    const close = open * Math.exp(drift + vol * gauss());
    const hi = Math.max(open, close) * (1 + Math.abs(gauss()) * vol * 0.45);
    const lo = Math.min(open, close) * (1 - Math.abs(gauss()) * vol * 0.45);
    const volume = 0.35 + Math.abs(close - open) / open * 40 + rand() * 0.4;
    return { o: open, h: hi, l: lo, c: close, v: volume };
  }

  const candles = [];
  let price = 100;
  for (let i = 0; i < HISTORY; i++) {
    const c = makeCandle(price);
    candles.push(c);
    price = c.c;
  }
  const sessionOpen = candles[candles.length - 1].c;

  // The forming candle: starts flat at the last close and is driven by ticks.
  let live = { o: price, h: price, l: price, c: price, v: 0.2 };
  let liveTarget = price;   // close the tick is easing toward
  let liveShown = price;    // close currently drawn
  let tickCount = 0;
  let liveDrift = nextDrift();

  function tick() {
    tickCount++;
    const step = liveTarget * (liveDrift / TICKS_PER_CANDLE + 0.0045 * gauss());
    liveTarget = Math.max(1, liveTarget + step);
    live.h = Math.max(live.h, liveTarget);
    live.l = Math.min(live.l, liveTarget);
    live.v += 0.08 + rand() * 0.12;

    if (tickCount >= TICKS_PER_CANDLE) {
      live.c = liveTarget;
      candles.push(live);
      if (candles.length > HISTORY) candles.shift();
      live = { o: liveTarget, h: liveTarget, l: liveTarget, c: liveTarget, v: 0.2 };
      liveShown = liveTarget;
      tickCount = 0;
      liveDrift = nextDrift();
      rollStart = performance.now();
    }
    updateReadout();
  }

  // ---------- layout ----------
  let width = 0, height = 0, dpr = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scaleLo = scaleHi = null;
    draw(performance.now());
  }

  let scaleLo = null, scaleHi = null;
  let rollStart = -Infinity;

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function series() {
    const all = candles.slice();
    all.push({ o: live.o, h: Math.max(live.h, liveShown), l: Math.min(live.l, liveShown), c: liveShown, v: live.v });
    return all;
  }

  function movingStats(data, end, len) {
    let sum = 0, sq = 0, n = 0;
    for (let i = Math.max(0, end - len + 1); i <= end; i++) {
      sum += data[i].c; sq += data[i].c * data[i].c; n++;
    }
    const mean = sum / n;
    return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  }

  // ---------- drawing ----------
  function draw(now) {
    if (!width || !height) return;
    const style = mount.dataset.style === "line" ? "line" : "candles";
    const data = series();

    const roll = 1 - easeOut(Math.min(1, (now - rollStart) / ROLL_MS));
    const rightPad = width * (width < 600 ? 0.1 : 0.055); // keeps the live marker clear of the portrait
    const plotRight = width - rightPad;
    const count = Math.ceil(plotRight / SPACING) + 2;
    const first = Math.max(0, data.length - count);
    const visible = data.slice(first);
    const xOf = (i) => plotRight - (visible.length - 1 - i) * SPACING + roll * SPACING;

    // Smoothed vertical scale fitted to the visible window.
    let lo = Infinity, hi = -Infinity;
    visible.forEach((d) => { lo = Math.min(lo, d.l); hi = Math.max(hi, d.h); });
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    if (scaleLo === null) { scaleLo = lo; scaleHi = hi; }
    scaleLo += (lo - scaleLo) * 0.06;
    scaleHi += (hi - scaleHi) * 0.06;

    const priceTop = height * 0.08;
    const priceBottom = height * 0.78;
    const volBottom = height * 0.97;
    const volTop = height * 0.84;
    const yOf = (p) => priceBottom - (p - scaleLo) / (scaleHi - scaleLo) * (priceBottom - priceTop);

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 1; g < 6; g++) {
      const y = Math.round(priceTop + (priceBottom - priceTop) * g / 6) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    const gridStep = SPACING * 10;
    const gridShift = ((data.length % 10) * SPACING - roll * SPACING) % gridStep;
    for (let x = plotRight - gridShift; x > 0; x -= gridStep) {
      const gx = Math.round(x) + 0.5;
      ctx.moveTo(gx, priceTop * 0.5); ctx.lineTo(gx, volBottom);
    }
    ctx.stroke();

    // Volatility band + moving average
    const maPts = [], upPts = [], dnPts = [];
    visible.forEach((d, i) => {
      const { mean, sd } = movingStats(data, first + i, MA_LEN);
      const x = xOf(i);
      maPts.push([x, yOf(mean)]);
      upPts.push([x, yOf(mean + 2 * sd)]);
      dnPts.push([x, yOf(mean - 2 * sd)]);
    });

    ctx.beginPath();
    upPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = dnPts.length - 1; i >= 0; i--) ctx.lineTo(dnPts[i][0], dnPts[i][1]);
    ctx.closePath();
    ctx.fillStyle = COLORS.band;
    ctx.fill();

    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = COLORS.bandEdge;
    [upPts, dnPts].forEach((pts) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Volume
    const vMax = Math.max(...visible.map((d) => d.v));
    visible.forEach((d, i) => {
      const x = xOf(i);
      const h = (d.v / vMax) * (volBottom - volTop);
      ctx.fillStyle = d.c >= d.o ? COLORS.volUp : COLORS.volDown;
      ctx.fillRect(Math.round(x - SPACING * 0.3), volBottom - h, Math.round(SPACING * 0.6), h);
    });

    if (style === "candles") {
      const body = Math.max(3, Math.round(SPACING * 0.56));
      visible.forEach((d, i) => {
        const x = Math.round(xOf(i)) + 0.5;
        const up = d.c >= d.o;
        ctx.strokeStyle = COLORS.wick;
        ctx.beginPath();
        ctx.moveTo(x, yOf(d.h)); ctx.lineTo(x, yOf(d.l));
        ctx.stroke();
        const yTop = yOf(Math.max(d.o, d.c));
        const yBot = yOf(Math.min(d.o, d.c));
        const h = Math.max(1, yBot - yTop);
        if (up) {
          ctx.fillStyle = COLORS.up;
          ctx.globalAlpha = 0.82;
          ctx.fillRect(x - body / 2, yTop, body, h);
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = COLORS.down;
          ctx.strokeRect(x - body / 2 + 0.5, yTop + 0.5, body - 1, Math.max(0, h - 1));
        }
      });
    } else {
      const closePts = visible.map((d, i) => [xOf(i), yOf(d.c)]);
      const grad = ctx.createLinearGradient(0, priceTop, 0, priceBottom);
      grad.addColorStop(0, COLORS.area[0]);
      grad.addColorStop(1, COLORS.area[1]);
      ctx.beginPath();
      closePts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(closePts[closePts.length - 1][0], priceBottom);
      ctx.lineTo(closePts[0][0], priceBottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      closePts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = COLORS.up;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Moving average with a soft glow
    ctx.save();
    ctx.shadowColor = "rgba(246, 202, 162, 0.55)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = COLORS.ma;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.beginPath();
    maPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();

    // Last-price marker
    const lastX = xOf(visible.length - 1);
    const lastY = yOf(liveShown);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(255, 217, 179, 0.4)";
    ctx.beginPath();
    ctx.moveTo(lastX + 6, Math.round(lastY) + 0.5);
    ctx.lineTo(width, Math.round(lastY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    const pulse = reduceMotion.matches ? 0.5 : (Math.sin(now / 520) + 1) / 2;
    ctx.fillStyle = `rgba(255, 217, 179, ${0.12 + pulse * 0.16})`;
    ctx.beginPath(); ctx.arc(lastX, lastY, 7 + pulse * 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.last;
    ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- readout ----------
  function updateReadout() {
    if (!readout) return;
    const p = liveTarget;
    const chg = (p - sessionOpen) / sessionOpen * 100;
    readout.querySelector("[data-price]").textContent = p.toFixed(2);
    const chgEl = readout.querySelector("[data-change]");
    chgEl.textContent = `${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)}%`;
    chgEl.dataset.dir = chg >= 0 ? "up" : "down";
  }

  // ---------- loop ----------
  let raf = 0, timer = 0, onScreen = true;
  const running = () => !reduceMotion.matches && onScreen && !document.hidden && mount.dataset.paused !== "true";

  function frame(now) {
    liveShown += (liveTarget - liveShown) * 0.12;
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    raf = 0; timer = 0;
    if (running()) {
      timer = setInterval(tick, TICK_MS);
      raf = requestAnimationFrame(frame);
    } else {
      liveShown = liveTarget;
      rollStart = -Infinity;
      draw(performance.now());
    }
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    sync();
  }).observe(mount);
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener("change", sync);
  new MutationObserver(sync).observe(mount, { attributes: true, attributeFilter: ["data-paused", "data-style"] });

  updateReadout();
  resize();
  sync();
})();
