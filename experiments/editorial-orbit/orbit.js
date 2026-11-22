/*
 * Editorial orbit: the hero's six project nodes, their curves, the preview card,
 * the work section, and the opening and scroll motion. Content: projects.js.
 *
 * Layout
 *   desktop   an artboard in the reference's proportions (1672 x 941 units),
 *             scaled to the window and anchored to the bottom so the portrait
 *             meets the bottom edge. Nodes start at their reference positions and
 *             are nudged, if needed, until no label touches the copy, the card,
 *             the portrait or another node.
 *   stacked   below 1180px or on upright screens (CSS does the work): name,
 *             headline, portrait, a grid of the six studies, then the card.
 *
 * Interaction
 *   hover / focus / tap a node   selects it: the card changes to that study, its
 *                                curves light and a pulse runs along them
 *   pointer on the card          keeps the selection, so nothing flickers
 *   pointer leaves the hero      returns to the featured study
 *   Escape                       returns to the featured study
 *   the card                     opens the selected case study
 */
(() => {
  "use strict";

  const PROJECTS = window.ORBIT_PROJECTS || [];
  const hero = document.querySelector("[data-hero]");
  if (!hero || !PROJECTS.length) return;

  const orbit = hero.querySelector("[data-orbit]");
  const list = hero.querySelector("[data-orbit-nodes]");
  const card = hero.querySelector("[data-card]");
  const stage = hero.querySelector("[data-stage]");
  const svg = hero.querySelector("[data-orbit-lines]");
  const status = hero.querySelector("[data-orbit-status]");
  const headline = hero.querySelector(".headline");
  const role = hero.querySelector(".stage__role");
  const NS = "http://www.w3.org/2000/svg";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stacked = window.matchMedia("(max-width: 1179px), (max-aspect-ratio: 13/10)");
  const FEATURED = PROJECTS.find((p) => p.featured) || PROJECTS[0];

  /* ----- The reference composition, in artboard units ----- */

  const BOARD = { w: 1672, h: 941, gutter: 47 };
  const STAGE = { x: 547, y: 85, w: 501.6, h: 856 };   // the photo's box
  const CARD = { x: 1284, y: 210, w: 345 };
  // dot: the node's dot. label: where the title block sits relative to the dot
  // (left offset; top or bottom edge offset).
  const SLOTS = {
    l1: { dot: [431, 316], label: { x: 6, bottom: -12 }, side: "left" },
    l2: { dot: [318, 492], label: { x: -25, bottom: -20 }, side: "left" },
    l3: { dot: [279, 658], label: { x: -52, top: -17 }, side: "left" },
    r1: { dot: [1063, 235], label: { x: 27, top: -72 }, side: "right" },
    r2: { dot: [1165, 522], label: { x: -32, bottom: -18 }, side: "right" },
    r3: { dot: [1227, 755], label: { x: 23, top: -52 }, side: "right" }
  };
  // Curves run from a node into the portrait (which hides their ends) or between
  // nodes. Ends given as a slot follow that node; control points move with them.
  const CURVES = [
    { from: "l1", to: [650, 470], c1: [440, 380], c2: [520, 445], owners: ["l1"] },
    { from: "l2", to: [610, 632], c1: [350, 560], c2: [450, 612], owners: ["l2"] },
    { from: "l3", to: [660, 540], c1: [300, 600], c2: [430, 540], owners: ["l3"] },
    { from: [318, 748], to: [470, 834], c1: [340, 790], c2: [400, 822], owners: ["l3"], kind: "dotted" },
    { from: "l2", to: "l3", c1: [318, 560], c2: [272, 610], owners: ["l2", "l3"], kind: "dotted" },
    { from: "r1", to: [895, 296], c1: [1022, 238], c2: [960, 262], owners: ["r1"] },
    { from: "r1", to: [990, 470], c1: [1092, 322], c2: [1070, 420], owners: ["r1"], kind: "soft" },
    { from: "r2", to: [995, 602], c1: [1132, 555], c2: [1080, 590], owners: ["r2"] },
    { from: [995, 602], to: "r3", c1: [1140, 600], c2: [1212, 680], owners: ["r3"] },
    { from: "r3", to: [1136, 816], c1: [1216, 790], c2: [1182, 812], owners: ["r3"], kind: "soft" },
    { from: "r2", to: "r3", c1: [1215, 585], c2: [1228, 680], owners: ["r2", "r3"], kind: "dotted" }
  ];
  const SPARKLES = [[372, 574, 9], [1112, 566, 8], [262, 548, 5]];
  // Left and right edges of the cut-out photo: [y, left, right] as fractions of the
  // image. Below the shoulders the sides are feathered, so the edge is the fade.
  const SILHOUETTE = [[0.045, 0.5, 0.5], [0.06, 0.42, 0.54], [0.08, 0.33, 0.61], [0.1, 0.29, 0.65], [0.13, 0.24, 0.7],
    [0.16, 0.22, 0.74], [0.2, 0.19, 0.77], [0.25, 0.16, 0.8], [0.3, 0.15, 0.81], [0.35, 0.12, 0.85], [0.4, 0.1, 0.91],
    [0.45, 0.1, 0.93], [0.5, 0.04, 0.93], [0.55, 0.05, 0.95], [1, 0.05, 0.95]];
  const FACE = { x: 0.3, y: 0.13, w: 0.42, h: 0.33 };

  /* ----- Helpers ----- */

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === "class") el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    kids.flat(Infinity).forEach((kid) => kid != null && el.append(kid));
    return el;
  }
  function s(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const hit = (a, b, pad = 0) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

  function fmt(v, f = {}) {
    const scale = f.scale || 1;
    const num = Math.abs(v / scale).toFixed(f.decimals != null ? f.decimals : 0);
    const sign = v < 0 ? "−" : f.prefix === "+" ? "+" : "";
    const prefix = f.prefix === "+" ? "" : f.prefix || "";
    return sign + prefix + num + (f.suffix || "");
  }

  /* ----- Small charts from published figures ----- */

  let gradId = 0;
  function chart(preview) {
    const W = 280;
    const el = s("svg", { class: "viz-svg", role: "img", focusable: "false" });
    const text = (x, y, str, attrs = {}) => { const t = s("text", { x: r1(x), y: r1(y), ...attrs }, el); t.textContent = str; return t; };
    let H = 120;
    let label = preview.caption;

    if (preview.kind === "area") {
      const v = preview.values, f = preview.format;
      const x0 = 38, x1 = 274, y0 = 8, y1 = 90;
      const lo = 0.4e6, hi = 1.5e6;
      const X = (i) => x0 + (i / (v.length - 1)) * (x1 - x0);
      const Y = (val) => y1 - ((val - lo) / (hi - lo)) * (y1 - y0);
      preview.ticks.forEach((t) => {
        s("line", { class: "viz-grid", x1: x0, x2: x1, y1: r1(Y(t)), y2: r1(Y(t)) }, el);
        text(x0 - 6, Y(t) + 3.5, fmt(t, f), { "text-anchor": "end" });
      });
      const id = `viz-area-${++gradId}`;
      const g = s("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, s("defs", {}, el));
      s("stop", { offset: 0, "stop-color": "var(--viz-hi)", "stop-opacity": 0.42 }, g);
      s("stop", { offset: 1, "stop-color": "var(--viz-hi)", "stop-opacity": 0 }, g);
      const pts = v.map((val, i) => `${r1(X(i))} ${r1(Y(val))}`);
      s("path", { d: `M${pts.join("L")}L${x1} ${y1}L${x0} ${y1}Z`, fill: `url(#${id})` }, el);
      s("path", { class: "viz-line", d: `M${pts.join("L")}` }, el);
      s("circle", { class: "viz-end", cx: r1(X(v.length - 1)), cy: r1(Y(v[v.length - 1])), r: 3.4 }, el);
      preview.axis.forEach(([i, lab], k) => text(X(i), 106, lab, { "text-anchor": k === 0 ? "start" : k === preview.axis.length - 1 ? "end" : "middle" }));
      const peak = Math.max(...v), at = v.indexOf(peak);
      label += `. ${v.length} months, from ${fmt(v[0], f)} to ${fmt(v[v.length - 1], f)}; peak ${fmt(peak, f)} (month ${at + 1}).`;
    } else if (preview.kind === "bars" || preview.kind === "pair") {
      const items = preview.items, f = preview.format || { suffix: preview.unit || "", decimals: 1 };
      const max = Math.max(...items.map((d) => d.value));
      const top = 18, base = 88, bw = preview.kind === "pair" ? 54 : 50;
      const slot = (W - 20) / items.length;
      s("line", { class: "viz-grid", x1: 6, x2: W - 6, y1: base, y2: base }, el);
      items.forEach((d, i) => {
        const cx = 10 + slot * (i + 0.5);
        const bh = Math.max(2, (d.value / max) * (base - top));
        s("rect", { class: "viz-bar" + (i === items.length - 1 ? " viz-bar--hi" : ""), x: r1(cx - bw / 2), y: r1(base - bh), width: bw, height: r1(bh), rx: 2 }, el);
        text(cx, base - bh - 6, fmt(d.value, f), { "text-anchor": "middle", class: "viz-value" });
        text(cx, base + 15, d.label, { "text-anchor": "middle" });
      });
      if (preview.kind === "pair") s("path", { class: "viz-grid", d: `M${W / 2 - 14} 54h28m-6 -5l6 5-6 5`, fill: "none" }, el);
      H = 108;
      label += ": " + items.map((d) => `${d.label} ${fmt(d.value, f)}`).join(", ") + ".";
    } else if (preview.kind === "hbars" || preview.kind === "change") {
      const items = preview.items;
      const f = preview.format || { suffix: "%", decimals: 0 };
      const max = Math.max(...items.map((d) => Math.abs(d.value)));
      const row = 24, labelW = 92;
      if (preview.kind === "hbars") {
        const span = W - labelW - 54;
        items.forEach((d, i) => {
          const y = 8 + i * row, w = Math.max(2, (d.value / max) * span);
          text(0, y + 11, d.label);
          s("rect", { class: "viz-bar" + (i === 0 ? " viz-bar--hi" : ""), x: labelW, y, width: r1(w), height: 14, rx: 2 }, el);
          text(labelW + w + 6, y + 11, fmt(d.value, f), { class: "viz-value" });
        });
      } else {
        const zero = W - 44, span = zero - labelW - 6;
        items.forEach((d, i) => {
          const y = 8 + i * row, w = Math.max(2, (Math.abs(d.value) / max) * span);
          text(0, y + 11, d.label);
          s("rect", { class: "viz-bar" + (i === 0 ? " viz-bar--hi" : ""), x: r1(zero - w), y, width: r1(w), height: 14, rx: 2 }, el);
          text(zero + 8, y + 11, fmt(d.value, f), { class: "viz-value" });
        });
        s("line", { class: "viz-grid", x1: zero, x2: zero, y1: 2, y2: 8 + items.length * row - 4 }, el);
      }
      H = 8 + items.length * row;
      label += ": " + items.map((d) => `${d.label} ${fmt(d.value, f)}`).join(", ") + ".";
    }
    el.setAttribute("viewBox", `0 0 ${W} ${H}`);
    el.setAttribute("aria-label", label);
    return el;
  }

  /* ----- Markup from the configuration ----- */

  const nodes = PROJECTS.map((p) => {
    const slot = SLOTS[p.slot];
    const btn = h("button", { class: "node", type: "button", "aria-pressed": "false", "aria-controls": "orbit-card", "data-id": p.id, "data-slot": p.slot },
      h("span", { class: "node__dot", "aria-hidden": "true" }, h("i", { class: "node__halo" })),
      h("span", { class: "node__num" }, p.id),
      h("span", { class: "node__title" }, p.label.map((line, k) => [k ? " " : null, h("span", {}, line)]))
    );
    list.append(h("li", {}, btn));
    return { p, slot, btn, dot: btn.querySelector(".node__dot"), x: 0, y: 0, box: null };
  });
  const bySlot = Object.fromEntries(nodes.map((n) => [n.p.slot, n]));

  function cardBody(p, isFeatured) {
    return h("div", { class: "card__body" },
      h("p", { class: "card__top" },
        h("span", { class: "card__label" }, isFeatured ? "Featured project" : "Case study"),
        h("span", { class: "card__num", "aria-hidden": "true" }, p.id)),
      h("h2", { class: "card__title", id: "orbit-card-title" }, p.title),
      h("p", { class: "card__desc" }, p.summary || p.description),
      h("figure", { class: "card__viz viz", style: "margin-inline:0;margin-bottom:0" }, chart(p.preview), h("figcaption", { class: "card__caption" }, p.preview.caption)),
      h("ul", { class: "card__tools", "aria-label": "Tools" }, p.tools.map((t) => h("li", {}, t))),
      h("a", { class: "card__link", href: p.href, "aria-label": `View case study: ${p.title}` }, "View Case Study", h("span", { "aria-hidden": "true" }, "→"))
    );
  }

  // Work section: the same studies, the same charts.
  const work = document.querySelector("[data-work]");
  if (work) {
    PROJECTS.forEach((p) => {
      work.append(h("li", { class: "work-card", id: `study-${p.id}` },
        h("a", { href: p.href },
          h("p", { class: "work-card__top" }, h("span", {}, p.kicker), h("span", { class: "work-card__num", "aria-hidden": "true" }, p.id)),
          h("h3", {}, p.title),
          h("p", {}, p.description),
          h("figure", { class: "viz", style: "margin-inline:0;margin-bottom:0" }, chart(p.preview), h("p", { class: "work-card__caption" }, p.preview.caption)),
          h("span", { class: "work-card__go" }, "View case study", h("span", { "aria-hidden": "true" }, "→")))
      ));
    });
  }

  /* ----- Curves ----- */

  const curveEls = CURVES.map((c) => {
    const cls = "curve" + (c.kind ? ` curve--${c.kind}` : "");
    const path = s("path", { class: cls, pathLength: c.kind === "dotted" ? null : 1 }, svg);
    const flow = c.kind ? null : s("path", { class: "curve-flow", pathLength: 1 }, svg);
    return { ...c, path, flow };
  });
  const sparkEls = SPARKLES.map(() => s("path", { class: "sparkle" }, svg));

  /* ----- Layout ----- */

  let geo = null;
  let mode = "";

  function layoutBox(el) {
    let x = 0, y = 0, n = el;
    while (n && n !== hero) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight };
  }

  function layout() {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    const nextMode = stacked.matches ? "stacked" : "desktop";
    if (nextMode !== mode) { mode = nextMode; hero.dataset.layout = mode; }
    sizeCard();
    if (mode === "stacked") {
      hero.style.removeProperty("--s");
      hero.style.removeProperty("--ox");
      hero.style.removeProperty("--oy");
      ["x", "y", "w", "h"].forEach((k) => hero.style.removeProperty(`--stage-${k}`));
      nodes.forEach((n) => { n.btn.style.left = n.btn.style.top = ""; });
      card.style.left = card.style.top = "";
      geo = { mode, W, H };
      return;
    }

    const sc = Math.min(W / BOARD.w, H / BOARD.h);
    const ox = (W - BOARD.w * sc) / 2;
    // Spare height (screens taller than the reference) is split: half above the
    // composition, and the portrait grows to fill the rest down to the bottom edge.
    const oy = (H - BOARD.h * sc) / 2;
    const sp = (H - oy - STAGE.y * sc) / STAGE.h;
    const faceX = ox + (STAGE.x + 0.505 * STAGE.w) * sc;
    const stageBox = { x: faceX - 0.505 * STAGE.w * sp, y: oy + STAGE.y * sc, w: STAGE.w * sp, h: STAGE.h * sp };
    hero.style.setProperty("--s", sc.toFixed(5));
    hero.style.setProperty("--ox", r1(ox) + "px");
    hero.style.setProperty("--oy", r1(oy) + "px");
    ["x", "y", "w", "h"].forEach((k) => hero.style.setProperty(`--stage-${k}`, r1(stageBox[k]) + "px"));
    // Points inside the photo's box move with the photo; the rest with the artboard.
    const P = ([x, y]) => {
      const inside = x >= STAGE.x && x <= STAGE.x + STAGE.w && y >= STAGE.y;
      if (inside) return [stageBox.x + ((x - STAGE.x) / STAGE.w) * stageBox.w, stageBox.y + ((y - STAGE.y) / STAGE.h) * stageBox.h];
      return [ox + x * sc, oy + y * sc];
    };

    // Card: its reference spot, kept inside the right margin.
    const cw = card.offsetWidth;
    const cardX = Math.min(ox + CARD.x * sc, W - BOARD.gutter * sc - cw);
    // It sits at its reference height unless that would crowd the node below it
    // (min font sizes make it relatively taller on small screens); then it rises,
    // but never into the navigation.
    const r3 = SLOTS.r3, r3Top = oy + (r3.dot[1] + r3.label.top) * sc;
    const cardY = clamp(r3Top - 22 - card.offsetHeight, oy + 160 * sc, oy + CARD.y * sc);
    card.style.left = r1(cardX) + "px";
    card.style.top = r1(cardY) + "px";
    const cardBox = { left: cardX, top: cardY, right: cardX + cw, bottom: cardY + card.offsetHeight };

    // Portrait silhouette and face, in px.
    const st = layoutBox(stage);
    const sw = st.right - st.left, sh = st.bottom - st.top;
    const edge = (y, side) => {
      const fy = (y - st.top) / sh;
      if (fy < SILHOUETTE[0][0]) return side === "left" ? Infinity : -Infinity;
      for (let k = 1; k < SILHOUETTE.length; k++) {
        if (fy <= SILHOUETTE[k][0]) {
          const a = SILHOUETTE[k - 1], b = SILHOUETTE[k], t = (fy - a[0]) / (b[0] - a[0]);
          const fx = side === "left" ? a[1] + (b[1] - a[1]) * t : a[2] + (b[2] - a[2]) * t;
          return st.left + fx * sw;
        }
      }
      return st.left + (side === "left" ? SILHOUETTE[SILHOUETTE.length - 1][1] : SILHOUETTE[SILHOUETTE.length - 1][2]) * sw;
    };
    const face = { left: st.left + FACE.x * sw, top: st.top + FACE.y * sh, right: st.left + (FACE.x + FACE.w) * sw, bottom: st.top + (FACE.y + FACE.h) * sh };
    const clearOfPortrait = (b, side, gap) => {
      for (let y = b.top; y <= b.bottom; y += 6) {
        if (side === "left" ? b.right > edge(y, "left") - gap : b.left < edge(y, "right") + gap) return false;
      }
      return !hit(b, face, gap);
    };

    // The headline as its text lines (the second is shorter), shifted back past any transform.
    const hb = hero.getBoundingClientRect();
    const lines = [];
    headline.querySelectorAll(":scope > span").forEach((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      const r = range.getBoundingClientRect(), b = span.getBoundingClientRect(), lay = layoutBox(span);
      const dx = b.left - hb.left - lay.left, dy = b.top - hb.top - lay.top;
      lines.push({ left: r.left - hb.left - dx, top: r.top - hb.top - dy, right: r.right - hb.left - dx, bottom: r.bottom - hb.top - dy, pad: 16 });
    });
    const swash = layoutBox(headline.querySelector(".headline__swash"));
    const obstacles = [
      ...lines,
      { ...swash, top: swash.top + layoutBox(headline).top, bottom: swash.bottom + layoutBox(headline).top, left: swash.left + layoutBox(headline).left, right: swash.right + layoutBox(headline).left, pad: 10 },
      { ...cardBox, pad: 18 },
      { left: 0, top: 0, right: W, bottom: 150 * sc + 4, pad: 0 },
      { ...layoutBox(role), pad: 10 }
    ];

    // Place each node at its reference spot, then nudge it to the nearest clear spot.
    const placed = [];
    nodes.forEach((n) => {
      const [dx, dy] = P(n.slot.dot);
      const lw = n.btn.offsetWidth, lh = n.btn.offsetHeight;
      const lx = n.slot.label.x * sc;
      const ly = n.slot.label.top != null ? n.slot.label.top * sc : n.slot.label.bottom * sc - lh;
      const boxAt = (x, y) => {
        const b = { left: x + lx, top: y + ly, right: x + lx + lw, bottom: y + ly + lh };
        return { left: Math.min(b.left, x - 12), top: Math.min(b.top, y - 12), right: Math.max(b.right, x + 12), bottom: Math.max(b.bottom, y + 12) };
      };
      const ok = (x, y) => {
        const b = boxAt(x, y);
        if (b.left < 8 || b.right > W - 8 || b.bottom > H - 8) return false;
        if (!clearOfPortrait(b, n.slot.side, 14)) return false;
        if (obstacles.some((o) => hit(b, o, o.pad))) return false;
        return !placed.some((q) => hit(b, q, 10));
      };
      let best = [dx, dy];
      if (!ok(dx, dy)) {
        let found = null;
        const away = n.slot.side === "left" ? -1 : 1;
        for (let r = 6; r <= 200 && !found; r += 6) {
          for (const [ux, uy] of [[away, 0], [0, 1], [0, -1], [away, 1], [away, -1], [-away, 0], [-away, 1], [-away, -1]]) {
            const x = dx + ux * r, y = dy + uy * r;
            if (ok(x, y)) { found = [x, y]; break; }
          }
        }
        if (found) best = found;
      }
      n.x = best[0];
      n.y = best[1];
      n.box = boxAt(n.x, n.y);
      n.ok = ok(n.x, n.y);
      placed.push(n.box);
      n.btn.style.left = r1(n.x + lx) + "px";
      n.btn.style.top = r1(n.y + ly) + "px";
      n.btn.style.setProperty("--dot-x", r1(-lx) + "px");
      n.btn.style.setProperty("--dot-y", r1(-ly) + "px");
      n.shift = [n.x - dx, n.y - dy];
    });

    // Curves follow their nodes.
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const point = (end, near) => {
      if (typeof end === "string") { const n = bySlot[end]; return { p: [n.x, n.y], d: n.shift }; }
      return { p: P(end), d: [0, 0] };
    };
    curveEls.forEach((c) => {
      const a = point(c.from), b = point(c.to);
      const c1 = P(c.c1), c2 = P(c.c2);
      const d = `M${r1(a.p[0])} ${r1(a.p[1])}C${r1(c1[0] + a.d[0])} ${r1(c1[1] + a.d[1])} ${r1(c2[0] + b.d[0])} ${r1(c2[1] + b.d[1])} ${r1(b.p[0])} ${r1(b.p[1])}`;
      c.path.setAttribute("d", d);
      if (c.flow) c.flow.setAttribute("d", d);
    });
    SPARKLES.forEach(([x, y, size], k) => {
      const [cx, cy] = P([x, y]);
      const r = size * sc, w = r * 0.24;
      sparkEls[k].setAttribute("d", `M${r1(cx)} ${r1(cy - r)}Q${r1(cx + w)} ${r1(cy - w)} ${r1(cx + r)} ${r1(cy)}Q${r1(cx + w)} ${r1(cy + w)} ${r1(cx)} ${r1(cy + r)}Q${r1(cx - w)} ${r1(cy + w)} ${r1(cx - r)} ${r1(cy)}Q${r1(cx - w)} ${r1(cy - w)} ${r1(cx)} ${r1(cy - r)}Z`);
    });

    geo = { mode, W, H, s: sc, face, card: cardBox, nodes: nodes.map((n) => ({ id: n.p.id, ok: n.ok, box: n.box, shift: n.shift.map(Math.round) })) };
  }

  // The card keeps one height for every study, so it never jumps while browsing.
  function sizeCard() {
    card.style.minHeight = "";
    const current = card.firstElementChild;
    let tallest = 0;
    PROJECTS.forEach((p) => {
      const body = cardBody(p, p === FEATURED);
      body.style.visibility = "hidden";
      body.style.position = "absolute";
      body.style.inset = "0 auto auto 0";
      body.style.width = getComputedStyle(card).width;
      body.style.padding = getComputedStyle(card).padding;
      body.style.boxSizing = "border-box";
      card.append(body);
      tallest = Math.max(tallest, body.offsetHeight);
      body.remove();
    });
    if (current) card.append(current);
    card.style.minHeight = Math.ceil(tallest) + "px";
  }

  /* ----- Selection ----- */

  let selected = null;
  let engaged = false;
  let swap = null;

  function select(p, opts = {}) {
    const changed = p !== selected;
    selected = p;
    nodes.forEach((n) => {
      const on = n.p === p;
      n.btn.classList.toggle("is-active", on);
      n.btn.setAttribute("aria-pressed", String(on));
    });
    const slot = p.slot;
    curveEls.forEach((c) => c.path.classList.toggle("is-on", c.owners.includes(slot)));
    setEngaged(opts.engage != null ? opts.engage : engaged);
    if (!changed && card.firstElementChild) return;
    showCard(p, opts.instant);
    if (opts.announce) status.textContent = `Showing ${p.id}, ${p.title}`;
    if (changed && engaged && !reduce.matches && mode === "desktop") pulse(slot);
  }

  function setEngaged(on) {
    engaged = on;
    orbit.classList.toggle("is-engaged", on);
    svg.classList.toggle("is-engaged", on);
  }

  function showCard(p, instant) {
    const next = cardBody(p, p === FEATURED);
    const prev = card.querySelector(".card__body");
    if (swap) { swap.cancel(); swap = null; card.querySelectorAll(".card__body.is-leaving").forEach((b) => b.remove()); }
    if (!prev || instant || reduce.matches) {
      card.replaceChildren(next);
      return;
    }
    prev.classList.add("is-leaving");
    const out = prev.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 140, easing: "ease-in", fill: "forwards" });
    swap = out;
    out.onfinish = () => {
      if (swap !== out) return;
      swap = null;
      card.replaceChildren(next);
      next.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
    };
  }

  // A soft pulse runs along the selected node's curves.
  function pulse(slot) {
    curveEls.forEach((c) => {
      if (!c.flow || !c.owners.includes(slot)) return;
      const reverse = typeof c.to === "string" && c.to === slot;
      c.flow.animate([
        { strokeDasharray: "0.16 1", strokeDashoffset: reverse ? -1 : 0.16, opacity: 0 },
        { opacity: 0.9, offset: 0.25 },
        { strokeDasharray: "0.16 1", strokeDashoffset: reverse ? 0.16 : -1, opacity: 0 }
      ], { duration: 950, easing: "cubic-bezier(.4,0,.2,1)" });
    });
  }

  let leaveTimer = 0;
  const backToFeatured = () => { select(FEATURED, { engage: false }); };

  nodes.forEach((n) => {
    n.btn.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      window.clearTimeout(leaveTimer);
      select(n.p, { engage: true });
    });
    n.btn.addEventListener("focus", () => {
      if (!n.btn.matches(":focus-visible")) return;
      select(n.p, { engage: true, announce: true });
    });
    n.btn.addEventListener("click", () => {
      select(n.p, { engage: true, announce: true });
      if (mode === "stacked") {
        const r = card.getBoundingClientRect();
        if (r.bottom > window.innerHeight || r.top < 0) card.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "nearest" });
      }
    });
  });
  hero.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse" || mode !== "desktop") return;
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => { if (!orbit.contains(document.activeElement)) backToFeatured(); }, 400);
  });
  hero.addEventListener("pointerenter", () => window.clearTimeout(leaveTimer));
  orbit.addEventListener("focusout", (e) => {
    if (orbit.contains(e.relatedTarget)) return;
    if (!hero.matches(":hover")) backToFeatured();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selected !== FEATURED) { backToFeatured(); status.textContent = `Showing ${FEATURED.id}, ${FEATURED.title}`; }
  });

  /* ----- Opening sequence ----- */

  function intro() {
    const root = document.documentElement;
    window.clearTimeout(window.__orbitIntroFallback);
    if (!root.classList.contains("orbit-intro")) return;
    const ease = "cubic-bezier(.2,.8,.2,1)";
    const run = (el, frames, delay, duration) => el && el.animate(frames, { delay, duration, easing: ease, fill: "backwards" });
    const fadeUp = (y) => [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "none" }];
    const q = (sel) => hero.querySelector(`[data-intro="${sel}"]`);

    run(q("nav"), [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], 0, 550);
    run(q("headline"), fadeUp(14), 150, 700);
    run(q("disc"), [{ opacity: 0, transform: "translate(-50%, -50%) scale(.9)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }], 100, 900);
    run(q("portrait"), fadeUp(28), 200, 900);
    run(q("role"), [{ opacity: 0, transform: "translate(-50%, -30%)" }, { opacity: 1, transform: "translate(-50%, -50%)" }], 900, 600);
    if (mode === "desktop") {
      curveEls.forEach((c, i) => {
        if (c.kind === "dotted") run(c.path, [{ opacity: 0 }, { opacity: 1 }], 900 + i * 30, 500);
        else run(c.path, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], 450 + i * 50, 800);
      });
      sparkEls.forEach((el, i) => run(el, [{ opacity: 0 }, { opacity: 1 }], 1150 + i * 80, 500));
    }
    nodes.forEach((n, i) => {
      run(n.dot, [{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1)" }], 800 + i * 70, 450);
      run(n.btn.querySelector(".node__num"), fadeUp(6), 950 + i * 60, 500);
      run(n.btn.querySelector(".node__title"), fadeUp(6), 1000 + i * 60, 500);
    });
    run(q("card"), fadeUp(18), 1150, 650);
    root.classList.remove("orbit-intro");
  }

  /* ----- Scroll: the hero eases away into the work ----- */

  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const p = clamp(window.scrollY / Math.max(1, hero.offsetHeight), 0, 1);
      hero.style.setProperty("--p", p.toFixed(3));
    });
  }

  const cards = Array.from(document.querySelectorAll(".work-card"));
  if ("IntersectionObserver" in window && !reduce.matches) {
    cards.forEach((c) => c.classList.add("is-waiting"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const i = cards.indexOf(entry.target);
        entry.target.style.transitionDelay = `${(i % 3) * 90}ms`;
        entry.target.classList.remove("is-waiting");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    cards.forEach((c) => io.observe(c));
  }

  /* ----- Start ----- */

  select(FEATURED, { instant: true });
  let pending = 0;
  const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; layout(); }); };
  layout();
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(hero);
  else window.addEventListener("resize", schedule);
  stacked.addEventListener("change", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  const img = stage.querySelector("img");
  const begin = () => { layout(); intro(); };
  if (img && !img.complete) {
    img.addEventListener("load", begin, { once: true });
    img.addEventListener("error", begin, { once: true });
  } else begin();
  if (!reduce.matches) {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  window.OrbitHome = {
    select: (id) => { const n = nodes.find((x) => x.p.id === id); if (n) select(n.p, { engage: true }); },
    geometry: () => geo
  };
})();
