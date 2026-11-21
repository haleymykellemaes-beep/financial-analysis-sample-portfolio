/*
 * Follow the Signal: the hero's background chart and its project points.
 *
 * The candles, volume, and signal line are illustrative. They come from
 * the "hero" block of data/market.json, written by python/generate_market.py,
 * and are not market data. Each point on the line is a real link to a project
 * card. Points light up when the pointer comes near or a point takes focus.
 *
 * Exposes window.HMSignal = { ready } where ready resolves to the chart parts
 * js/home.js animates in the opening sequence.
 */
(() => {
  "use strict";

  const hero = document.querySelector("[data-hero]");
  const host = hero && hero.querySelector("[data-signal]");
  const nav = hero && hero.querySelector("[data-signal-nav]");
  if (!host || !nav) return;

  const CONFIG = {
    // Candle field, as shares of the hero. Its base sits just above the signal line.
    field: { left: 0.3, right: 0.8, top: 0.22 },
    fieldUnderCopy: 0.45,   // candle strength where they pass beneath the copy
    volumeHeight: 0.075,    // share of the hero height
    lineRise: 0.035,        // how much the line climbs from left to right, share of the hero height
    nearRadius: 84,         // px from a point at which it lights up
    lift: 7,                // px the line rises around an active point
    liftSpread: 70          // px, how far along the line the lift reaches
  };

  const NS = "http://www.w3.org/2000/svg";
  const points = Array.from(nav.querySelectorAll("[data-point]"));
  const figure = hero.querySelector("[data-figure]");
  const content = hero.querySelector("[data-hero-content]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stacked = window.matchMedia("(max-width: 900px), (max-aspect-ratio: 4/5)");

  let data = null;
  let svg = null;
  let parts = null;
  let geo = null;
  let active = null;
  let lift = 0;
  let liftTarget = 0;
  let liftX = 0;
  let raf = 0;

  const el = (tag, attrs, parent) => {
    const node = document.createElementNS(NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fx = (n) => Math.round(n * 10) / 10;

  // Smooth sample of a series at fractional position t in [0, 1].
  function sample(series, t) {
    const pos = clamp(t, 0, 1) * (series.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = series[Math.max(0, i - 1)], b = series[i], c = series[Math.min(series.length - 1, i + 1)], d = series[Math.min(series.length - 1, i + 2)];
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }

  function textRight(node, origin) {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().right - origin;
  }

  function measure() {
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    const box = hero.getBoundingClientRect();
    const copy = content.querySelector(".hero-copy");
    const actions = content.querySelector(".hero-actions");
    const desk = hero.querySelector(".hero-env__desk");
    let copyRight = 0;
    copy.querySelectorAll(".hero-eyebrow, .hero-name, .hero-sub, .hero-description, .hero-actions a").forEach((node) => {
      copyRight = Math.max(copyRight, textRight(node, box.left));
    });
    const copyTop = content.offsetTop + copy.offsetTop;
    const actionsBottom = content.offsetTop + copy.offsetTop + actions.offsetTop + actions.offsetHeight;
    const deskTop = desk.offsetTop;
    const figLeft = figure.offsetLeft;
    return { W, H, copyLeft: content.offsetLeft + copy.offsetLeft, copyRight, copyTop, actionsBottom, deskTop, figLeft, figWidth: figure.offsetWidth };
  }

  function lineY(x) {
    const { W, baseY, amp, rise } = geo;
    const t = clamp(x / W, 0, 1);
    const cycle = data.cycleNorm ? sample(data.cycleNorm, t) : 0;
    let y = baseY - rise * t + cycle * amp;
    if (lift > 0.01) y -= lift * Math.exp(-((x - liftX) ** 2) / (2 * CONFIG.liftSpread ** 2));
    return y;
  }

  function linePath() {
    const { W } = geo;
    let d = "";
    for (let x = -12; x <= W + 12; x += 6) d += (d ? " L" : "M") + fx(x) + " " + fx(lineY(x));
    return d;
  }

  function render() {
    if (!data) return;
    const m = measure();
    if (!m.W || !m.H) return;
    const phone = stacked.matches;
    const gap = Math.max(24, m.deskTop - m.actionsBottom);
    geo = {
      W: m.W,
      H: m.H,
      phone,
      baseY: phone ? m.deskTop - m.H * 0.03 : clamp(m.actionsBottom + gap * 0.5, m.actionsBottom + 26, m.deskTop - 16),
      amp: phone ? 6 : clamp(gap * 0.12, 4, 12),
      rise: m.H * CONFIG.lineRise
    };

    const candles = data.candles;
    const field = phone
      ? { left: m.W * 0.08, right: m.W * 0.96, top: m.deskTop - m.H * 0.34, bottom: geo.baseY - m.H * 0.06 }
      : { left: m.W * CONFIG.field.left, right: m.W * CONFIG.field.right, top: m.H * CONFIG.field.top, bottom: geo.baseY - m.H * (CONFIG.volumeHeight + 0.03) };
    const low = Math.min(...candles.map((c) => c.l));
    const high = Math.max(...candles.map((c) => c.h));
    const yOf = (v) => field.bottom - ((v - low) / (high - low)) * (field.bottom - field.top);
    const step = (field.right - field.left) / candles.length;
    const body = Math.max(2, step * 0.42);

    svg = el("svg", { viewBox: `0 0 ${m.W} ${m.H}`, width: m.W, height: m.H, focusable: "false" });
    const defs = el("defs", {}, svg);
    const fade = el("radialGradient", { id: "signal-fade", cx: "0.5", cy: "0.5", r: "0.6" }, defs);
    el("stop", { offset: "0.55", "stop-color": "#fff" }, fade);
    el("stop", { offset: "1", "stop-color": "#000" }, fade);
    const mask = el("mask", { id: "signal-field-mask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: m.W, height: m.H }, defs);
    el("rect", { x: field.left - step * 3, y: field.top - 40, width: field.right - field.left + step * 6, height: geo.baseY - field.top + 60, fill: "url(#signal-fade)" }, mask);

    const gridG = el("g", { class: "sig-grid", mask: "url(#signal-field-mask)" }, svg);
    let grid = "";
    const rows = 6;
    for (let r = 0; r <= rows; r++) {
      const y = field.top + ((geo.baseY - field.top) * r) / rows;
      grid += `M${fx(field.left - step * 3)} ${fx(y)}H${fx(field.right + step * 3)}`;
    }
    for (let c = 0; c <= 8; c++) {
      const x = field.left + ((field.right - field.left) * c) / 8;
      grid += `M${fx(x)} ${fx(field.top - 30)}V${fx(geo.baseY + 10)}`;
    }
    el("path", { d: grid, fill: "none", stroke: "var(--signal-grid)", "stroke-width": 1 }, gridG);

    const volG = el("g", { class: "sig-volume" }, svg);
    const volBase = geo.baseY - (phone ? 10 : 14);
    const volH = m.H * (phone ? 0.05 : CONFIG.volumeHeight);
    const candleG = el("g", { class: "sig-candles" }, svg);
    const candleNodes = [];
    const volumeNodes = [];
    candles.forEach((c, i) => {
      const x = field.left + step * (i + 0.5);
      const under = !phone && x < m.copyRight + 24 ? CONFIG.fieldUnderCopy : 1;
      const up = c.c >= c.o;
      const g = el("g", { class: "sig-candle", opacity: under }, candleG);
      el("path", { d: `M${fx(x)} ${fx(yOf(c.h))}V${fx(yOf(c.l))}`, stroke: "var(--signal-wick)", "stroke-width": 1 }, g);
      const top = yOf(Math.max(c.o, c.c));
      const h = Math.max(1.5, Math.abs(yOf(c.o) - yOf(c.c)));
      el("rect", { x: fx(x - body / 2), y: fx(top), width: fx(body), height: fx(h), rx: 0.6, fill: up ? "var(--signal-up)" : "var(--signal-down)" }, g);
      candleNodes.push(g);
      const vh = volH * data.volume[i];
      volumeNodes.push(el("rect", { x: fx(x - body / 2), y: fx(volBase - vh), width: fx(body), height: fx(vh), fill: "var(--signal-volume)", opacity: under, class: "sig-vol" }, volG));
    });

    const lineG = el("g", { class: "sig-line" }, svg);
    const d = linePath();
    const halo = el("path", { d, fill: "none", stroke: "var(--signal-halo)", "stroke-width": 4, "stroke-linecap": "round", pathLength: 1 }, lineG);
    const line = el("path", { d, fill: "none", stroke: "var(--signal-line)", "stroke-width": 1.4, "stroke-linecap": "round", pathLength: 1 }, lineG);

    host.replaceChildren(svg);
    parts = { svg, grid: gridG, candles: candleNodes, volume: volumeNodes, line, halo, lineG };
    placePoints(m);
  }

  // Points sit on the open stretch of the line: past the start of the copy, short of the portrait.
  function placePoints(m) {
    if (geo.phone) {
      points.forEach((p) => { p.style.removeProperty("--x"); p.style.removeProperty("--y"); });
      nav.classList.remove("is-placed");
      return;
    }
    const start = m.copyLeft + 48;
    const end = Math.min(m.figLeft + m.figWidth * 0.02, m.W * 0.62) - 40;
    const span = Math.max(120, end - start);
    points.forEach((p, i) => {
      const x = start + (span * (i + 0.5)) / points.length;
      p.dataset.x = x;
      p.style.setProperty("--x", fx(x) + "px");
      p.style.setProperty("--y", fx(lineY(x)) + "px");
      p.classList.toggle("tip-left", x > m.W * 0.5);
    });
    if (!document.documentElement.classList.contains("intro-pending")) nav.classList.add("is-placed");
  }

  function animateLift() {
    raf = 0;
    lift += (liftTarget - lift) * (reduce.matches ? 1 : 0.18);
    if (Math.abs(liftTarget - lift) < 0.05) lift = liftTarget;
    if (parts) {
      const d = linePath();
      parts.line.setAttribute("d", d);
      parts.halo.setAttribute("d", d);
      points.forEach((p) => p.style.setProperty("--y", fx(lineY(Number(p.dataset.x))) + "px"));
    }
    if (lift !== liftTarget) raf = requestAnimationFrame(animateLift);
  }

  function setActive(point) {
    if (active === point) return;
    if (active) active.classList.remove("is-active");
    active = point;
    if (point) {
      point.classList.add("is-active");
      liftX = Number(point.dataset.x) || 0;
      liftTarget = CONFIG.lift;
    } else {
      liftTarget = 0;
    }
    if (!raf && geo && !geo.phone) raf = requestAnimationFrame(animateLift);
  }

  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || !geo || geo.phone) return;
    const box = hero.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    let best = null;
    let bestDist = CONFIG.nearRadius;
    points.forEach((p) => {
      const px = Number(p.dataset.x);
      const dist = Math.hypot(px - x, lineY(px) - y);
      if (dist < bestDist) { best = p; bestDist = dist; }
    });
    if (best || (active && document.activeElement !== active)) setActive(best);
  });
  hero.addEventListener("pointerleave", () => { if (document.activeElement !== active) setActive(null); });
  points.forEach((p) => {
    p.addEventListener("focus", () => setActive(p));
    p.addEventListener("blur", () => { if (active === p) setActive(null); });
  });

  // Points jump to their project card and hand it focus once the scroll settles.
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    const card = document.querySelector(link.getAttribute("href"));
    if (!card) return;
    event.preventDefault();
    history.pushState(null, "", link.getAttribute("href"));
    card.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    const settle = () => {
      card.classList.remove("is-target");
      void card.offsetWidth;
      card.classList.add("is-target");
      const target = card.querySelector("a");
      if (target) target.focus({ preventScroll: true });
    };
    if ("onscrollend" in window && !reduce.matches) window.addEventListener("scrollend", settle, { once: true });
    else window.setTimeout(settle, reduce.matches ? 0 : 700);
  });

  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; render(); });
  };

  const ready = Promise.resolve(window.MarketData).then((payload) => {
    const series = payload && payload.hero;
    if (!series || !series.candles || !series.candles.length) return null;
    const cycle = series.cycle || [];
    const lo = Math.min(...cycle), hi = Math.max(...cycle);
    data = {
      candles: series.candles,
      volume: series.volume || series.candles.map(() => 0.5),
      cycleNorm: cycle.length > 3 && hi > lo ? cycle.map((v) => ((v - lo) / (hi - lo)) * 2 - 1) : null
    };
    render();
    if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(hero);
    else window.addEventListener("resize", schedule);
    stacked.addEventListener("change", schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    return { get parts() { return parts; }, points, nav };
  });

  window.HMSignal = { ready, render: schedule };
})();
