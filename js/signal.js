/*
 * Follow the Signal: the hero's background chart and its project points.
 *
 * The trend and forecast are decorative curves. Each point on the lower
 * signal line links to a project card and lights up on pointer proximity or focus.
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

  const signalProfile = [0.2, 0.7, 0.1, -0.5, 0.1, -0.3, 0.2, 0.5, -0.25, 0.1, -0.5, -0.2];
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

  function measure() {
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    const copy = content.querySelector(".hero-copy");
    const actions = content.querySelector(".hero-actions");
    const desk = hero.querySelector(".hero-env__desk");
    const actionsBottom = content.offsetTop + copy.offsetTop + actions.offsetTop + actions.offsetHeight;
    const deskTop = desk.offsetTop;
    const figLeft = figure.offsetLeft;
    return { W, H, copyLeft: content.offsetLeft + copy.offsetLeft, actionsBottom, deskTop, figLeft, figWidth: figure.offsetWidth };
  }

  function lineY(x) {
    const { W, baseY, amp, rise } = geo;
    const t = clamp(x / W, 0, 1);
    const cycle = sample(signalProfile, t);
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

    const x = m.W * (phone ? 0.02 : 0.24);
    const y = phone ? m.deskTop - m.H * 0.35 : m.H * 0.20;
    const width = m.W * (phone ? 0.98 : 0.76);
    const height = geo.baseY - y;
    const svg = el("svg", { viewBox: `0 0 ${m.W} ${m.H}`, width: m.W, height: m.H, focusable: "false" });
    const backdrop = el("svg", {
      class: "sig-backdrop",
      x: fx(x), y: fx(y), width: fx(width), height: fx(height),
      viewBox: "0 0 1000 400", preserveAspectRatio: "none"
    }, svg);
    const defs = el("defs", {}, backdrop);
    const fade = el("radialGradient", { id: "signal-fade", cx: ".60", cy: ".50", r: ".68" }, defs);
    el("stop", { offset: ".36", "stop-color": "#fff" }, fade);
    el("stop", { offset: "1", "stop-color": "#000" }, fade);
    const mask = el("mask", { id: "signal-field-mask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 1000, height: 400 }, defs);
    el("rect", { width: 1000, height: 400, fill: "url(#signal-fade)" }, mask);
    const field = el("g", { mask: "url(#signal-field-mask)" }, backdrop);

    el("path", {
      class: "sig-grid",
      d: "M0 80H1000 M0 160H1000 M0 240H1000 M0 320H1000 M150 0V400 M350 0V400 M550 0V400 M750 0V400 M950 0V400",
      fill: "none", stroke: "var(--signal-grid)", "vector-effect": "non-scaling-stroke"
    }, field);

    el("path", {
      class: "sig-forecast-band",
      d: "M680 199C770 140 850 156 1000 28L1000 131C861 193 765 211 680 199Z",
      fill: "var(--signal-forecast-band)"
    }, field);

    el("path", {
      class: "sig-trend",
      d: "M0 342C75 322 120 267 188 277S290 312 369 250S463 187 528 206S618 239 680 199",
      fill: "none", stroke: "var(--signal-trend)", "stroke-width": "1.65",
      "stroke-linecap": "round", "vector-effect": "non-scaling-stroke"
    }, field);

    el("path", {
      class: "sig-forecast",
      d: "M680 199C769 165 855 178 1000 76",
      fill: "none", stroke: "var(--signal-forecast)", "stroke-width": "1.65",
      "stroke-linecap": "round", "stroke-dasharray": "3 7", "vector-effect": "non-scaling-stroke"
    }, field);

    const lineG = el("g", { class: "sig-line" }, svg);
    const d = linePath();
    const halo = el("path", { d, fill: "none", stroke: "var(--signal-halo)", "stroke-width": 4, "stroke-linecap": "round", pathLength: 1 }, lineG);
    const line = el("path", { d, fill: "none", stroke: "var(--signal-line)", "stroke-width": 1.4, "stroke-linecap": "round", pathLength: 1 }, lineG);

    host.replaceChildren(svg);
    parts = { backdrop, line, halo };
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

  render();
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(hero);
  else window.addEventListener("resize", schedule);
  stacked.addEventListener("change", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  const ready = Promise.resolve({ get parts() { return parts; }, points, nav });

  window.HMSignal = { ready, render: schedule };
})();
