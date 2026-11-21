/*
 * Ribbon Signal Network: the hero's six project nodes, their pathways and
 * preview cards. Content comes from projects.js (window.RSN_PROJECTS).
 *
 * Layouts
 *   constellation  desktop and landscape tablets. Nodes are fitted into the
 *                  open space between the copy and the portrait: the anchors
 *                  in projects.js are mapped into that space, then nudged off
 *                  the text, the portrait silhouette and each other. If the
 *                  labels can't fit, the nodes drop to numbers only
 *                  ("compact") and the strip under the hero names them.
 *   sequence       stacked layouts (phones, upright tablets). CSS turns the
 *                  nodes into a structured grid under the portrait; tapping
 *                  a study without a page opens its card inline.
 *
 * Interaction
 *   hover / focus  highlights a node, its pathways and its neighbours, lifts
 *                  the connected curves (requestAnimationFrame, only while
 *                  they move) and shows the preview card.
 *   click / Enter  studies with a page scroll to their card; the others pin
 *                  their preview. On touch, the first tap on a linked node
 *                  previews it and the second follows the link.
 *   Escape         dismisses the card.
 *
 * The pathways are navigation themes for the portfolio, not measured
 * relationships between the projects.
 *
 * Exposes window.HMSignal = { ready, render, geometry } so it can stand in for
 * js/signal.js: ready resolves to { parts, points, nav } like the original,
 * where parts.backdrop / parts.line / parts.halo are the flow, edge and halo
 * groups (their paths use pathLength 1, so stroke-dash reveals work on them).
 */
(() => {
  "use strict";

  const PROJECTS = window.RSN_PROJECTS || [];
  const hero = document.querySelector("[data-hero]");
  const net = hero && hero.querySelector("[data-rsn]");
  const linesHost = hero && hero.querySelector("[data-rsn-lines]");
  if (!hero || !net || !linesHost || !PROJECTS.length) return;

  /* ----- Pathways: a few intentional threads, not every pair -----
     c: the two control points, each [t, n]: t along the chord from a to b,
     n across it (share of the chord length; positive is clockwise of a→b on
     screen). Every node carries its number above right and its label to the
     right, so the curves meet nodes from the left, from below or from above.
     ticks: small signal marks along the curve (0–1). */
  const LINKS = [
    { a: "01", b: "03", kind: "primary", c: [[0.15, 0.22], [0.7, 0.12]], glint: true, ticks: [0.5] },  // financial
    { a: "03", b: "05", kind: "primary", c: [[0.25, 0.3], [0.7, 0.12]], glint: true },                  // financial
    { a: "02", b: "06", kind: "risk", c: [[0.3, -0.2], [0.72, 0.07]], ticks: [0.32] },                   // risk
    { a: "04", b: "03", kind: "bridge", c: [[0.22, -0.42], [0.58, -0.07]] },                             // exploratory
    { a: "04", b: "06", kind: "bridge", c: [[0.1, 0.3], [0.62, 0.14]], ticks: [0.6] },
    { a: "02", b: "05", kind: "dotted", c: [[0.3, -0.1], [0.7, -0.1]] },
    { a: "05", b: "06", kind: "dotted", c: [[0.2, -0.25], [0.75, 0.3]] }
  ];

  /* Long decorative currents through the field, in field units (0–1 spans
     the node area; values beyond run past it). They echo the silk and fade
     out at both ends, so they never reach the copy or the portrait. */
  const FLOWS = [
    { d: [[-0.22, 1.12], [0.12, 0.52], [0.62, 0.82], [1.12, 0.04]], tone: "ink" },
    { d: [[-0.18, 0.66], [0.3, 0.06], [0.64, 0.58], [1.1, 0.36]], tone: "warm" },
    { d: [[0.02, 1.26], [0.5, 1.02], [0.62, 0.26], [1.06, -0.12]], tone: "ink" }
  ];

  const CONFIG = {
    textGap: 22,       // px kept clear beside the copy
    textGapY: 10,      // px kept clear above and below it
    figureGap: 30,     // px kept clear of the portrait silhouette
    nodeGap: 12,       // px between node footprints
    maxField: 0.4,     // widest the node field gets, share of the hero width
    minField: 180,     // px; narrower than this and the labels give way to numbers
    lift: 6,           // px the connected curves rise toward the active node
    liftTime: 70,      // ms smoothing constant for the lift
    hoverOut: 140      // ms grace before a hover preview closes
  };

  // Portrait geometry as fractions of assets/home/haley-desk-transparent.png.
  const PORTRAIT = {
    face: { x: 0.29, y: 0.08, w: 0.25, h: 0.36 },   // head, with the raised hand
    // Left edge of the silhouette: [y, x], top to bottom. Measured from the alpha matte.
    edge: [[0.03, 0.4], [0.053, 0.33], [0.107, 0.278], [0.16, 0.252], [0.214, 0.236], [0.267, 0.229], [0.32, 0.219],
      [0.374, 0.203], [0.428, 0.2], [0.481, 0.173], [0.535, 0.158], [0.6, 0.158], [0.7, 0.17], [0.8, 0.18], [0.89, 0.17], [0.9, 0.08], [1, 0.08]]
  };

  const NS = "http://www.w3.org/2000/svg";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stacked = window.matchMedia("(max-width: 900px), (max-aspect-ratio: 4/5)");
  const fx = (n) => Math.round(n * 10) / 10;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const k in attrs || {}) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    kids.flat(Infinity).forEach((kid) => kid != null && node.append(kid));
    return node;
  }
  function s(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  /* ----- Markup from the configuration ----- */

  const list = net.querySelector("[data-rsn-nodes]");
  const tips = net.querySelector("[data-rsn-tips]");
  const strip = hero.querySelector("[data-rsn-strip]");
  const total = String(PROJECTS.length).padStart(2, "0");

  // The accessible name keeps the visible label (WCAG 2.5.3) and adds the full title.
  const accessibleName = (p) => {
    const label = p.label.join(" ");
    return p.title.toLowerCase().includes(label.toLowerCase()) ? `${p.id} ${p.title}` : `${p.id} ${label}: ${p.title}`;
  };

  const nodes = PROJECTS.map((p, i) => {
    const tipId = `rsn-tip-${p.id}`;
    const linked = typeof p.href === "string" && p.href.length > 1;
    const ctl = h(linked ? "a" : "button", {
      class: "rsn-node__link",
      href: linked ? p.href : null,
      type: linked ? null : "button",
      "aria-label": accessibleName(p),
      "aria-describedby": tipId,
      "aria-expanded": linked ? null : "false",
      "aria-controls": linked ? null : tipId
    },
      h("span", { class: "rsn-node__num", "aria-hidden": "true" }, p.id),
      h("span", { class: "rsn-node__dot", "aria-hidden": "true" }),
      h("span", { class: "rsn-node__label", "aria-hidden": "true" }, p.label.map((line, k) => [k ? " " : null, h("span", {}, line)])),
      h("span", { class: "rsn-node__cat", "aria-hidden": "true" }, p.category),
      h("span", { class: "rsn-node__go", "aria-hidden": "true" }, linked ? "↗" : "+")
    );
    const li = h("li", { class: "rsn-node" + (p.hub ? " rsn-node--hub" : ""), "data-id": p.id, style: `--i:${i}` }, ctl);

    const tip = h("div", { class: "rsn-tip", id: tipId, role: "tooltip", "data-id": p.id },
      h("p", { class: "rsn-tip__top" },
        h("span", { class: "rsn-tip__cat" }, p.category, h("span", { class: "rsn-sr" }, ".")),
        h("span", { class: "rsn-tip__idx", "aria-hidden": "true" }, `${p.id} / ${total}`)),
      h("p", { class: "rsn-tip__title", "aria-hidden": "true" }, p.title),
      h("p", { class: "rsn-tip__desc" }, p.description),
      p.tools && p.tools.length
        ? h("p", { class: "rsn-tip__tools" }, h("span", { class: "rsn-tip__key" }, "Tools", h("span", { class: "rsn-sr" }, ":")), p.tools.map((t) => h("span", { class: "rsn-tip__tool" }, t)))
        : null,
      linked ? h("p", { class: "rsn-tip__go" }, "Explore project ", h("span", { "aria-hidden": "true" }, "↗")) : null
    );

    let stripItem = null;
    if (strip) {
      stripItem = h("li", { class: "rsn-strip__item" + (linked ? " is-linked" : ""), "data-id": p.id },
        h("span", { class: "rsn-strip__num" }, p.id), h("span", { class: "rsn-strip__title" }, p.title));
    }
    list.append(li);
    tips.append(tip);
    if (stripItem) strip.append(stripItem);
    return { p, i, linked, li, ctl, tip, stripItem, neighbors: new Set(), x: 0, y: 0, fp: null };
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.p.id, n]));

  /* ----- Pathway SVG (built once; layout only rewrites attributes) ----- */

  const svg = s("svg", { class: "rsn-lines", "aria-hidden": "true", focusable: "false" });
  const defs = s("defs", {}, svg);
  const flowG = s("g", { class: "rsn-flows" }, svg);
  const haloG = s("g", { class: "rsn-halos" }, svg);
  const edgeG = s("g", { class: "rsn-edges" }, svg);
  const glintG = s("g", { class: "rsn-glints" }, svg);
  const tickG = s("g", { class: "rsn-ticks" }, svg);

  // One fade per tone: currents appear past the copy and vanish before the portrait.
  const flowFades = { ink: "var(--rsn-midnight)", warm: "var(--rsn-champagne)" };
  const fadeEls = Object.entries(flowFades).map(([tone, color]) => {
    const g = s("linearGradient", { id: `rsn-flow-${tone}`, gradientUnits: "userSpaceOnUse" }, defs);
    [[0, 0], [0.22, 1], [0.76, 1], [1, 0]].forEach(([o, a]) => s("stop", { offset: o, "stop-color": color, "stop-opacity": a }, g));
    return g;
  });

  const flows = FLOWS.map((f) => ({ ...f, el: s("path", { class: `rsn-flow rsn-flow--${f.tone}`, stroke: `url(#rsn-flow-${f.tone})`, pathLength: 1 }, flowG) }));

  const edges = LINKS.filter((l) => byId[l.a] && byId[l.b]).map((l, k) => {
    const a = byId[l.a], b = byId[l.b];
    a.neighbors.add(l.b);
    b.neighbors.add(l.a);
    const grad = s("linearGradient", { id: `rsn-glint-${k}`, gradientUnits: "userSpaceOnUse" }, defs);
    [[0, 0], [0.3, 0.15], [0.5, 1], [0.7, 0.15], [1, 0]].forEach(([o, op]) => s("stop", { offset: o, "stop-color": "var(--rsn-champagne)", "stop-opacity": op }, grad));
    const cls = `rsn-edge--${l.kind}` + (l.glint ? " has-glint" : "");
    return {
      ...l, a, b, grad, lift: 0, target: 0,
      halo: s("path", { class: `rsn-halo ${cls}`, pathLength: 1 }, haloG),
      line: s("path", { class: `rsn-edge ${cls}`, pathLength: l.kind === "dotted" ? null : 1 }, edgeG),
      glintEl: s("path", { class: `rsn-glint ${cls}`, stroke: `url(#rsn-glint-${k})` }, glintG),
      tickEls: (l.ticks || []).map((t) => ({ t, el: s("circle", { class: "rsn-tick", r: 1.7 }, tickG) }))
    };
  });
  linesHost.appendChild(svg);

  /* ----- Measuring (layout boxes, so intro and scroll transforms don't skew the fit) ----- */

  function layoutBox(el) {
    let x = 0, y = 0, n = el;
    while (n && n !== hero) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight };
  }

  // Tight line boxes of the copy, shifted back by any transform on the element.
  function textRects() {
    const hb = hero.getBoundingClientRect();
    const rects = [];
    const copy = hero.querySelector(".hero-copy");
    if (!copy) return rects;
    const add = (el, kind) => {
      const box = el.getBoundingClientRect();
      const lay = layoutBox(el);
      const dx = box.left - hb.left - lay.left, dy = box.top - hb.top - lay.top;
      if (kind === "box") { rects.push({ left: lay.left, top: lay.top, right: lay.right, bottom: lay.bottom, kind }); return; }
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        rects.push({ left: r.left - hb.left - dx, top: r.top - hb.top - dy, right: r.right - hb.left - dx, bottom: r.bottom - hb.top - dy, kind });
      }
    };
    copy.querySelectorAll(".hero-eyebrow").forEach((el) => add(el, "text"));
    copy.querySelectorAll(".hero-name [data-reveal-line]").forEach((el) => add(el, "heading"));
    copy.querySelectorAll(".hero-sub [data-reveal-line]").forEach((el) => add(el, "heading"));
    copy.querySelectorAll(".hero-description").forEach((el) => add(el, "text"));
    copy.querySelectorAll(".hero-actions .btn").forEach((el) => add(el, "box"));
    return rects;
  }

  function portraitGeometry() {
    const fig = hero.querySelector("[data-figure]");
    if (!fig || !fig.offsetWidth) return null;
    const b = layoutBox(fig);
    const W = b.right - b.left, H = b.bottom - b.top;
    const face = PORTRAIT.face;
    const edgeAt = (y) => {
      const fy = (y - b.top) / H;
      const pts = PORTRAIT.edge;
      if (fy < pts[0][0]) return Infinity;
      for (let k = 1; k < pts.length; k++) {
        if (fy <= pts[k][0]) {
          const [y0, x0] = pts[k - 1], [y1, x1] = pts[k];
          return b.left + (x0 + (x1 - x0) * ((fy - y0) / (y1 - y0 || 1))) * W;
        }
      }
      return b.left + pts[pts.length - 1][1] * W;
    };
    return {
      box: b,
      face: { left: b.left + face.x * W, top: b.top + face.y * H, right: b.left + (face.x + face.w) * W, bottom: b.top + (face.y + face.h) * H },
      edgeAt,
      // The silhouette's left edge over a vertical span (sampled every 6px).
      edgeOver(top, bottom) { let m = Infinity; for (let y = top; y <= bottom; y += 6) m = Math.min(m, edgeAt(y)); return Math.min(m, edgeAt(bottom)); }
    };
  }

  const hit = (a, b, pad = 0, padY = pad) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + padY && a.bottom > b.top - padY;
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  /* ----- Constellation layout ----- */

  let geo = null;
  let geoTried = [];
  let mode = "";

  // Footprint of a node around its dot, from the rendered control.
  function footprint(n) {
    const c = n.ctl;
    const dot = c.querySelector(".rsn-node__dot");
    const cx = dot.offsetLeft + dot.offsetWidth / 2;
    const cy = dot.offsetTop + dot.offsetHeight / 2;
    return { l: -cx, t: -cy, r: c.offsetWidth - cx, b: c.offsetHeight - cy };
  }
  const fpAt = (n, x = n.x, y = n.y) => ({ left: x + n.fp.l, top: y + n.fp.t, right: x + n.fp.r, bottom: y + n.fp.b });

  function solve(m, compact) {
    net.classList.toggle("is-compact", compact);
    nodes.forEach((n) => { n.fp = footprint(n); });

    const fieldTop = Math.max(m.top + Math.max(...nodes.map((n) => -n.fp.t)) + 6, m.stageH * 0.24);
    const fieldBottom = Math.min(m.stageH * 0.8, m.stageH - Math.max(...nodes.map((n) => n.fp.b)) - 24);
    const xs = PROJECTS.map((p) => p.at[0]), ys = PROJECTS.map((p) => p.at[1]);
    const ax0 = Math.min(...xs), ax1 = Math.max(...xs), ay0 = Math.min(...ys), ay1 = Math.max(...ys);

    // Heights first: they don't depend on the width, so each node knows which
    // stretch of copy sits to its left and how far the silhouette reaches at its height.
    const textRightOver = (top, bottom) => m.text.reduce((r, t) =>
      (t.bottom > top - CONFIG.textGapY && t.top < bottom + CONFIG.textGapY ? Math.max(r, t.right) : r), 0);
    nodes.forEach((n) => {
      n.u = (n.p.at[0] - ax0) / (ax1 - ax0 || 1);
      n.v = (n.p.at[1] - ay0) / (ay1 - ay0 || 1);
      n.y = fieldTop + n.v * (fieldBottom - fieldTop);
      const top = n.y + n.fp.t, bottom = n.y + n.fp.b;
      n.minX = Math.max(textRightOver(top, bottom), 16) + CONFIG.textGap - n.fp.l;
      n.maxX = (m.portrait ? m.portrait.edgeOver(top, bottom) : m.W) - CONFIG.figureGap - n.fp.r;
    });

    // The widest field [L, R] that keeps every mapped node inside its own bounds:
    // a two-variable linear program, solved by checking each corner of the feasible region.
    const cons = [[-1, 1, 0]];   // a·L + b·R ≥ c
    nodes.forEach((n) => { cons.push([1 - n.u, n.u, n.minX], [n.u - 1, -n.u, -n.maxX]); });
    const ok = (l, r) => cons.every(([a, b, c]) => a * l + b * r >= c - 0.01);
    let L = NaN, R = NaN;
    for (let i = 0; i < cons.length; i++) {
      for (let j = i + 1; j < cons.length; j++) {
        const [a1, b1, c1] = cons[i], [a2, b2, c2] = cons[j];
        const det = a1 * b2 - a2 * b1;
        if (Math.abs(det) < 1e-9) continue;
        const l = (c1 * b2 - c2 * b1) / det, r = (a1 * c2 - a2 * c1) / det;
        if (ok(l, r) && !(r - l <= R - L)) { L = l; R = r; }
      }
    }
    if (!Number.isFinite(L)) {   // nothing fits exactly: start from the edges and let the nudging below sort it out
      L = Math.max(...nodes.filter((n) => n.u < 0.05).map((n) => n.minX));
      R = Math.min(...nodes.filter((n) => n.u > 0.95).map((n) => n.maxX));
    }
    const maxW = m.W * CONFIG.maxField;
    if (R - L > maxW) { const trim = (R - L - maxW) / 2; L += trim; R -= trim; }

    nodes.forEach((n) => { n.x = L + n.u * (R - L); });

    const texts = m.text;
    const bounds = { left: 8, top: m.top, right: m.W - 8, bottom: m.stageH - 8 };
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      nodes.forEach((n) => {
        let f = fpAt(n);
        texts.forEach((t) => {
          if (hit(f, t, CONFIG.textGap, CONFIG.textGapY)) { n.x += t.right + CONFIG.textGap - f.left + 0.5; f = fpAt(n); moved = true; }
        });
        if (m.portrait) {
          const limit = m.portrait.edgeOver(f.top, f.bottom) - CONFIG.figureGap;
          if (f.right > limit) { n.x -= f.right - limit; f = fpAt(n); moved = true; }
          if (hit(f, m.portrait.face, CONFIG.figureGap)) { n.x -= f.right - (m.portrait.face.left - CONFIG.figureGap); f = fpAt(n); moved = true; }
        }
        if (f.top < bounds.top) { n.y += bounds.top - f.top; moved = true; }
        if (f.bottom > bounds.bottom) { n.y -= f.bottom - bounds.bottom; moved = true; }
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const fa = fpAt(a), fb = fpAt(b);
          if (!hit(fa, fb, CONFIG.nodeGap)) continue;
          const ox = Math.min(fa.right, fb.right) - Math.max(fa.left, fb.left) + CONFIG.nodeGap;
          const oy = Math.min(fa.bottom, fb.bottom) - Math.max(fa.top, fb.top) + CONFIG.nodeGap;
          if (oy <= ox) { const [up, down] = a.y <= b.y ? [a, b] : [b, a]; up.y -= oy / 2; down.y += oy / 2; }
          else { const [lf, rt] = a.x <= b.x ? [a, b] : [b, a]; lf.x -= ox / 2; rt.x += ox / 2; }
          moved = true;
        }
      }
      if (!moved) break;
    }

    // Valid only if nothing touches the copy, the portrait, the edges of the stage or another node.
    const problems = [];
    nodes.forEach((n, i) => {
      const f = fpAt(n);
      if (texts.some((t) => hit(f, t, 6, 4))) problems.push(`${n.p.id}: text`);
      if (m.portrait && (f.right > m.portrait.edgeOver(f.top, f.bottom) - 8 || hit(f, m.portrait.face, 8))) problems.push(`${n.p.id}: portrait`);
      if (f.left < bounds.left || f.right > bounds.right || f.top < bounds.top - 1 || f.bottom > bounds.bottom + 1) problems.push(`${n.p.id}: bounds`);
      nodes.slice(i + 1).forEach((o) => { if (hit(f, fpAt(o), 2)) problems.push(`${n.p.id}/${o.p.id}: overlap`); });
    });
    if (R - L < CONFIG.minField) problems.push(`field ${Math.round(R - L)}px`);
    const bounds_ = nodes.map((n) => ({ id: n.p.id, u: +n.u.toFixed(2), y: Math.round(n.y), minX: Math.round(n.minX), maxX: Math.round(n.maxX), fp: n.fp }));
    return { L, R, fieldTop, fieldBottom, problems, bounds: bounds_ };
  }

  // Each card takes the clearest spot near its node: never over its own node,
  // the face or off the stage; preferably clear of the copy and of the nodes it
  // connects to (the others are dimmed while it shows, so covering them matters
  // less). A small grid search, run once per layout rather than on hover.
  function placeTips(m) {
    const boxes = nodes.map((n) => fpAt(n));
    const rectGap = (r, x, y) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    nodes.forEach((n, i) => {
      const tw = n.tip.offsetWidth, th = n.tip.offsetHeight;
      const own = boxes[i];
      let best = null;
      for (let x = own.left - tw - 60; x <= own.right + 60; x += 20) {
        for (let y = own.top - th - 60; y <= own.bottom + 140; y += 20) {
          const r = { left: x, top: y, right: x + tw, bottom: y + th };
          if (r.left < 8 || r.right > m.W - 8 || r.top < m.top + 4 || r.bottom > m.stageH - 10) continue;
          let score = area(r, own) * 1000 + Math.max(0, rectGap(r, n.x, n.y) - 16) * 40 + (r.left < n.x ? 300 : 0);
          if (m.portrait) score += area(r, m.portrait.face) * 1000 + Math.max(0, r.right - m.portrait.edgeOver(r.top, r.bottom)) * 20;
          m.text.forEach((t) => { score += area(r, t) * (t.kind === "heading" ? 60 : 20); });
          boxes.forEach((o, k) => { if (k !== i) score += area(r, o) * (n.neighbors.has(nodes[k].p.id) ? 12 : 1.5); });
          if (!best || score < best.score) best = { x, y, score };
        }
      }
      if (!best) best = { x: clamp(own.right + 14, 8, m.W - tw - 8), y: clamp(n.y - 30, m.top + 4, m.stageH - th - 10) };
      n.tip.style.setProperty("--tx", fx(best.x) + "px");
      n.tip.style.setProperty("--ty", fx(best.y) + "px");
    });
  }

  /* ----- Curves ----- */

  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };

  function edgeCurve(e) {
    const p0 = [e.a.x, e.a.y], p3 = [e.b.x, e.b.y];
    const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;           // clockwise of a→b on screen
    const up = ny <= 0 ? 1 : -1;                    // the normal that points up the screen
    const act = current === e.b ? 1 : 0;            // which end is active weights the lift
    const lift = CONFIG.lift * e.lift;
    const c1w = act ? 0.55 : 1, c2w = act ? 1 : 0.55;
    const [[t1, n1], [t2, n2]] = e.c;
    const p1 = [p0[0] + dx * t1 + nx * (n1 * len + up * lift * c1w), p0[1] + dy * t1 + ny * (n1 * len + up * lift * c1w)];
    const p2 = [p0[0] + dx * t2 + nx * (n2 * len + up * lift * c2w), p0[1] + dy * t2 + ny * (n2 * len + up * lift * c2w)];
    return [p0, p1, p2, p3];
  }

  function drawEdge(e) {
    const c = edgeCurve(e);
    const d = `M${fx(c[0][0])} ${fx(c[0][1])}C${fx(c[1][0])} ${fx(c[1][1])} ${fx(c[2][0])} ${fx(c[2][1])} ${fx(c[3][0])} ${fx(c[3][1])}`;
    e.halo.setAttribute("d", d);
    e.line.setAttribute("d", d);
    e.glintEl.setAttribute("d", d);
    e.tickEls.forEach((tk) => { const [x, y] = bez(...c, tk.t); tk.el.setAttribute("cx", fx(x)); tk.el.setAttribute("cy", fx(y)); });
  }

  function drawField(m, field) {
    svg.setAttribute("viewBox", `0 0 ${m.W} ${m.H}`);
    svg.setAttribute("width", m.W);
    svg.setAttribute("height", m.H);
    const fw = field.R - field.L, fh = field.fieldBottom - field.fieldTop;
    const map = ([u, v]) => [field.L + u * fw, field.fieldTop + v * fh];
    flows.forEach((f) => {
      const p = f.d.map(map);
      f.el.setAttribute("d", `M${fx(p[0][0])} ${fx(p[0][1])}C${p.slice(1).map((q) => fx(q[0]) + " " + fx(q[1])).join(" ")}`);
    });
    // Currents fade in past the copy and out before the portrait.
    const portraitEdge = m.portrait ? m.portrait.edgeOver(field.fieldTop, field.fieldBottom) : m.W;
    fadeEls.forEach((g) => {
      g.setAttribute("x1", fx(field.textRight + 10));
      g.setAttribute("x2", fx(Math.min(portraitEdge - 10, field.R + fw * 0.6)));
      g.setAttribute("y1", 0);
      g.setAttribute("y2", 0);
    });
    edges.forEach((e) => {
      e.grad.setAttribute("x1", fx(e.a.x)); e.grad.setAttribute("y1", fx(e.a.y));
      e.grad.setAttribute("x2", fx(e.b.x)); e.grad.setAttribute("y2", fx(e.b.y));
      drawEdge(e);
    });
  }

  /* ----- Render ----- */

  function render() {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    const nextMode = stacked.matches ? "sequence" : "constellation";
    if (nextMode !== mode) {
      mode = nextMode;
      net.classList.toggle("rsn--sequence", mode === "sequence");
      net.classList.toggle("rsn--constellation", mode === "constellation");
      hero.classList.toggle("rsn-hero--sequence", mode === "sequence");
      clearAll();
    }
    if (mode === "sequence") {
      nodes.forEach((n) => { n.li.style.removeProperty("--x"); n.li.style.removeProperty("--y"); });
      geo = { mode, W, H };
      return;
    }

    const stripEl = hero.querySelector(".rsn-strip");
    const navEl = document.querySelector(".nav");
    const stageH = stripEl && stripEl.offsetParent ? layoutBox(stripEl).top : H;
    const m = { W, H, stageH, top: (navEl ? navEl.offsetHeight : 76) + 10, text: textRects(), portrait: portraitGeometry() };

    let field = solve(m, false);
    let compact = false;
    if (field.problems.length) { compact = true; geoTried = { problems: field.problems, bounds: field.bounds }; field = solve(m, true); } else geoTried = [];
    field.textRight = m.text.reduce((r, t) => Math.max(r, t.right), 0);

    nodes.forEach((n) => {
      n.li.style.setProperty("--x", fx(n.x) + "px");
      n.li.style.setProperty("--y", fx(n.y) + "px");
    });
    drawField(m, field);
    placeTips(m);
    geo = { mode, compact, W, H, field, m, problems: field.problems };
    net.classList.add("is-placed");
  }

  /* ----- State ----- */

  const state = { hover: null, focus: null, pinned: null };
  let current = null;
  let hoverTimer = 0;
  let lastPointer = "mouse";

  function update() {
    const next = state.pinned || state.hover || state.focus;
    const shown = mode === "sequence" ? state.pinned : next;
    nodes.forEach((n) => {
      n.tip.classList.toggle("is-open", n === shown);
      if (!n.linked) n.ctl.setAttribute("aria-expanded", String(n === state.pinned));
    });
    if (next === current) return;
    current = next;
    net.classList.toggle("has-active", !!next);
    linesHost.classList.toggle("has-active", !!next);
    if (strip) strip.classList.toggle("has-active", !!next);
    nodes.forEach((n) => {
      n.li.classList.toggle("is-active", n === next);
      n.li.classList.toggle("is-near", !!next && next.neighbors.has(n.p.id));
      if (n.stripItem) n.stripItem.classList.toggle("is-active", n === next);
    });
    edges.forEach((e) => {
      const on = !!next && (e.a === next || e.b === next);
      e.target = on ? 1 : 0;
      [e.line, e.halo, e.glintEl].forEach((el) => el.classList.toggle("is-on", on));
      e.tickEls.forEach((tk) => tk.el.classList.toggle("is-on", on));
    });
    kick();
  }

  function clearAll() {
    state.hover = state.focus = state.pinned = null;
    update();
  }

  /* Lift: eases the connected curves toward the active node, then stops. */
  let raf = 0;
  let last = 0;
  function kick() {
    if (raf || mode !== "constellation") return;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
  function step(now) {
    raf = 0;
    const dt = Math.min(64, now - last);
    last = now;
    const k = reduce.matches ? 1 : 1 - Math.exp(-dt / CONFIG.liftTime);
    let moving = false;
    edges.forEach((e) => {
      const diff = e.target - e.lift;
      if (!diff) return;
      e.lift = Math.abs(diff) < 0.004 ? e.target : e.lift + diff * k;
      drawEdge(e);
      if (e.lift !== e.target) moving = true;
    });
    if (moving) raf = requestAnimationFrame(step);
  }

  /* ----- Navigation to a project card (as js/signal.js) ----- */

  function goTo(n, event) {
    const card = n.linked && document.querySelector(n.p.href);
    if (!card) return;
    if (event) event.preventDefault();
    clearAll();
    history.pushState(null, "", n.p.href);
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
  }

  function activate(n, event) {
    const touch = lastPointer === "touch" || lastPointer === "pen";
    if (n.linked) {
      // Touch can't hover, so the first tap on a constellation node previews it.
      if (mode === "constellation" && touch && current !== n) {
        if (event) event.preventDefault();
        state.pinned = n;
        update();
        return;
      }
      goTo(n, event);
      return;
    }
    if (event) event.preventDefault();
    state.pinned = state.pinned === n ? null : n;
    update();
  }

  const hoverIn = (n) => { window.clearTimeout(hoverTimer); state.hover = n; update(); };
  const hoverOut = (n) => {
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => { if (state.hover === n) { state.hover = null; update(); } }, CONFIG.hoverOut);
  };

  nodes.forEach((n) => {
    const c = n.ctl;
    c.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; });
    c.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hoverIn(n); });
    c.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hoverOut(n); });
    c.addEventListener("focus", () => {
      if (mode !== "constellation" || !c.matches(":focus-visible")) return;
      state.focus = n;
      update();
    });
    c.addEventListener("blur", () => { if (state.focus === n) { state.focus = null; update(); } });
    c.addEventListener("click", (e) => { if (e.detail === 0) lastPointer = "keyboard"; activate(n, e); });
    // The card stays open while the pointer moves onto it (WCAG 1.4.13).
    n.tip.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && current === n) hoverIn(n); });
    n.tip.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hoverOut(n); });
    if (n.stripItem) {
      n.stripItem.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hoverIn(n); });
      n.stripItem.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hoverOut(n); });
      n.stripItem.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; });
      n.stripItem.addEventListener("click", (e) => activate(n, e));
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!state.pinned || e.target.closest(".rsn-node, .rsn-tip, .rsn-strip__item")) return;
    state.pinned = null;
    update();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !current) return;
    clearAll();
  });

  /* ----- Lifecycle ----- */

  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; render(); });
  };

  render();
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(schedule);
    ro.observe(hero);
    const copy = hero.querySelector(".hero-copy");
    if (copy) ro.observe(copy);
  } else {
    window.addEventListener("resize", schedule);
  }
  stacked.addEventListener("change", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  const figImg = hero.querySelector(".hero-figure__img");
  if (figImg && !figImg.complete) figImg.addEventListener("load", schedule, { once: true });

  const parts = {
    backdrop: flowG,
    line: edgeG,
    halo: haloG,
    glints: glintG,
    ticks: tickG,
    flows: flows.map((f) => f.el),
    edges: edges.filter((e) => e.kind !== "dotted").map((e) => e.line),
    halos: edges.filter((e) => e.kind !== "dotted").map((e) => e.halo),
    dotted: edges.filter((e) => e.kind === "dotted").map((e) => e.line)
  };
  const ready = Promise.resolve({ parts, points: nodes.map((n) => n.ctl), nav: net, nodes: nodes.map((n) => n.li) });

  window.HMSignal = {
    ready,
    render: schedule,
    // Last layout, for checks: node footprints, the copy, the face and any unresolved collisions.
    geometry() {
      if (!geo) return null;
      if (geo.mode !== "constellation") return { mode: geo.mode };
      return {
        mode: geo.mode,
        compact: geo.compact,
        problems: geo.problems,
        labelProblems: geoTried,
        face: geo.m.portrait && geo.m.portrait.face,
        text: geo.m.text,
        nodes: nodes.map((n) => ({ id: n.p.id, x: n.x, y: n.y, box: fpAt(n) }))
      };
    }
  };
})();
