/*!
 * CandleBackdrop: a decorative daily candlestick + volume background.
 * Plain script, no dependencies, no network requests. Exposes window.CandleBackdrop.
 *
 * Mount
 *   const chart = CandleBackdrop.mount(container, candles, options);
 *
 *   container  HTMLElement with a size. The chart fills it and redraws when the
 *              container is resized. The component adds the class
 *              "candle-backdrop", aria-hidden="true" and inert to it.
 *   candles    Array of { t, o, h, l, c, v }, oldest first. t is an ISO date
 *              string ("2026-11-18"); o/h/l/c are prices; v is volume.
 *   options    Optional { headroom, footroom, volumeHeadroom } (fractions).
 *              headroom/footroom: space above/below the visible price range
 *              (defaults 0.14 / 0.06). volumeHeadroom: extra room above the
 *              tallest visible volume bar (default 0.3). The headroom is what
 *              lets the latest candle move without rescaling the chart.
 *
 * Methods
 *   chart.updateLatest(candle) -> boolean
 *       Revises the newest candle in place, e.g. from a live feed.
 *       Accepts a full or partial candle: { o?, h?, l?, c?, v?, t? }.
 *       Missing fields keep their current value; h and l are widened to cover
 *       o and c. If t is given it must equal the newest candle's t, otherwise
 *       nothing changes and false is returned (use setData for a new day).
 *       Only the newest candle and its volume bar are redrawn. The price and
 *       volume scales stay locked; values beyond them are clipped at the edge.
 *   chart.setData(candles)
 *       Replaces the series and redraws everything, refitting the scales.
 *       Use it when a new daily candle opens.
 *   chart.getLatestColumn() -> { left, right, priceTop, priceBottom, volumeTop, volumeBottom }
 *       The newest candle's column in CSS px, relative to the container.
 *   chart.getScale() -> { min, max, volumeMax }
 *   chart.destroy()
 *
 * Appearance is set with CSS custom properties on the container; see
 * candle-backdrop.css for the full list and defaults.
 */
(function (global) {
  "use strict";

  const DEFAULTS = { headroom: 0.14, footroom: 0.06, volumeHeadroom: 0.3 };
  const FIELDS = ["o", "h", "l", "c", "v"];

  function niceStep(raw) {
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / exp;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * exp;
  }

  function checkCandle(d, i) {
    for (const k of FIELDS) {
      if (typeof d[k] !== "number" || !Number.isFinite(d[k])) {
        throw new TypeError(`CandleBackdrop: candle ${i} has an invalid "${k}" value`);
      }
    }
  }

  function normalize(d) {
    const out = { t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: Math.max(0, d.v) };
    out.h = Math.max(out.h, out.o, out.c);
    out.l = Math.min(out.l, out.o, out.c);
    return out;
  }

  function mount(container, candles, options) {
    if (!(container instanceof HTMLElement)) throw new TypeError("CandleBackdrop: container must be an element");
    const opts = Object.assign({}, DEFAULTS, options);

    container.classList.add("candle-backdrop");
    container.setAttribute("aria-hidden", "true");
    container.inert = true;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    // Two layers: everything that never moves, and the newest candle on its own.
    const base = document.createElement("canvas");
    const live = document.createElement("canvas");
    base.className = "candle-backdrop__layer candle-backdrop__layer--base";
    live.className = "candle-backdrop__layer candle-backdrop__layer--latest";
    container.append(base, live);
    const bctx = base.getContext("2d");
    const lctx = live.getContext("2d");

    let data = [];
    let L = null;       // layout in device pixels
    let size = "";

    function readStyle(w, h) {
      const cs = getComputedStyle(container);
      const raw = (name, fb) => cs.getPropertyValue(name).trim() || fb;
      const len = (name, fb, basis) => {
        const s = raw(name, fb);
        const n = parseFloat(s);
        return s.endsWith("%") ? (n / 100) * basis : n;
      };
      return {
        up: raw("--cb-up", "#58a593"),
        down: raw("--cb-down", "#c9744f"),
        upVolume: raw("--cb-up-volume", "rgba(88, 165, 147, 0.4)"),
        downVolume: raw("--cb-down-volume", "rgba(201, 116, 79, 0.4)"),
        grid: raw("--cb-grid", "rgba(255, 240, 222, 0.08)"),
        gridRows: Math.max(2, parseFloat(raw("--cb-grid-rows", "6"))),
        spacing: Math.max(2, len("--cb-spacing", "8px", w)),
        body: Math.min(1, Math.max(0.1, parseFloat(raw("--cb-body", "0.64")))),
        wick: Math.max(0.5, len("--cb-wick", "1px", w)),
        rightPad: len("--cb-right-pad", "24px", w),
        padTop: len("--cb-pad-top", "6%", h),
        padBottom: len("--cb-pad-bottom", "2%", h),
        volumeHeight: len("--cb-volume-height", "16%", h),
        paneGap: len("--cb-pane-gap", "3%", h),
      };
    }

    function layout() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h || !data.length) return;
      const dpr = Math.min(3, Math.max(1, global.devicePixelRatio || 1));
      size = `${w}x${h}@${dpr}`;
      const W = Math.round(w * dpr);
      const H = Math.round(h * dpr);
      for (const cv of [base, live]) {
        cv.width = W; cv.height = H;
        cv.style.width = `${W / dpr}px`;   // exactly one canvas pixel per device pixel
        cv.style.height = `${H / dpr}px`;
      }

      const st = readStyle(w, h);
      const S = Math.max(2, Math.round(st.spacing * dpr));          // column pitch
      const ww = Math.max(1, Math.round(st.wick * dpr));            // wick width
      let bw = Math.max(ww, Math.round(S * st.body));               // body width
      if ((bw - ww) % 2) bw -= 1;                                   // keep the wick centered
      bw = Math.max(ww, Math.min(bw, S - 1));

      const lastX = Math.round(W - st.rightPad * dpr - S / 2);
      const fit = Math.floor((lastX + S / 2) / S) + 1;
      const first = Math.max(0, data.length - fit);

      const volBottom = Math.round(H - st.padBottom * dpr);
      const volTop = Math.round(volBottom - st.volumeHeight * dpr);
      const priceBottom = Math.round(volTop - st.paneGap * dpr);
      const priceTop = Math.round(st.padTop * dpr);

      let lo = Infinity, hi = -Infinity, vmax = 0;
      for (let i = first; i < data.length; i++) {
        lo = Math.min(lo, data[i].l); hi = Math.max(hi, data[i].h); vmax = Math.max(vmax, data[i].v);
      }
      const range = hi - lo || Math.abs(hi) * 0.02 || 1;

      L = {
        dpr, W, H, S, ww, bw, lastX, first, st,
        priceTop, priceBottom, volTop, volBottom,
        min: lo - range * opts.footroom,
        max: hi + range * opts.headroom,
        vmax: (vmax || 1) * (1 + opts.volumeHeadroom),
      };
      snap();
      drawBase();
      drawLatest();
    }

    // Shift the canvases by the container's sub-pixel offset so canvas pixels land
    // on device pixels; otherwise the browser resamples them and edges go soft.
    function snap() {
      if (!L) return;
      const r = container.getBoundingClientRect();
      const dx = (Math.round(r.left * L.dpr) - r.left * L.dpr) / L.dpr;
      const dy = (Math.round(r.top * L.dpr) - r.top * L.dpr) / L.dpr;
      const t = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
      base.style.transform = t;
      live.style.transform = t;
    }

    const xOf = (i) => L.lastX - (data.length - 1 - i) * L.S;
    const yOf = (p) => L.priceTop + ((L.max - p) / (L.max - L.min)) * (L.priceBottom - L.priceTop);

    function column(i) {
      const cx = xOf(i);
      const wickX = cx - Math.floor(L.ww / 2);
      return { cx, wickX, bodyX: wickX - (L.bw - L.ww) / 2, left: cx - Math.floor(L.S / 2), right: cx - Math.floor(L.S / 2) + L.S };
    }

    function drawCandle(ctx, d, i) {
      const col = column(i);
      const up = d.c >= d.o;
      const minH = Math.max(1, Math.round(L.dpr));
      ctx.fillStyle = up ? L.st.up : L.st.down;
      const yh = Math.round(yOf(d.h));
      const yl = Math.round(yOf(d.l));
      ctx.fillRect(col.wickX, yh, L.ww, Math.max(minH, yl - yh));
      let top = Math.round(yOf(Math.max(d.o, d.c)));
      let bottom = Math.round(yOf(Math.min(d.o, d.c)));
      if (bottom - top < minH) bottom = top + minH;
      ctx.fillRect(col.bodyX, top, L.bw, bottom - top);

      const vh = Math.max(minH, Math.round((d.v / L.vmax) * (L.volBottom - L.volTop)));
      ctx.fillStyle = up ? L.st.upVolume : L.st.downVolume;
      ctx.fillRect(col.bodyX, L.volBottom - vh, L.bw, vh);
    }

    function drawBase() {
      const ctx = bctx;
      ctx.clearRect(0, 0, L.W, L.H);
      const gw = Math.max(1, Math.round(L.dpr));
      ctx.fillStyle = L.st.grid;

      // Horizontal grid at round price levels, price pane only.
      const step = niceStep((L.max - L.min) / L.st.gridRows);
      for (let p = Math.ceil(L.min / step) * step; p <= L.max; p += step) {
        const y = Math.round(yOf(p));
        if (y > L.priceTop && y < L.priceBottom) ctx.fillRect(0, y, L.W, gw);
      }
      // Vertical grid at the first trading day of each month, through both panes.
      for (let i = Math.max(1, L.first); i < data.length; i++) {
        const a = data[i - 1].t, b = data[i].t;
        if (typeof a === "string" && typeof b === "string" && a.slice(0, 7) !== b.slice(0, 7)) {
          ctx.fillRect(xOf(i) - Math.floor(gw / 2), L.priceTop, gw, L.volBottom - L.priceTop);
        }
      }
      for (let i = L.first; i < data.length - 1; i++) drawCandle(ctx, data[i], i);
    }

    function drawLatest() {
      const ctx = lctx;
      ctx.clearRect(0, 0, L.W, L.H);
      const i = data.length - 1;
      const col = column(i);
      ctx.save();
      ctx.beginPath();
      ctx.rect(col.left, L.priceTop, L.S, L.priceBottom - L.priceTop);
      ctx.rect(col.left, L.volTop, L.S, L.volBottom - L.volTop);
      ctx.clip();
      drawCandle(ctx, data[i], i);
      ctx.restore();
    }

    const ro = new ResizeObserver(() => {
      const dpr = Math.min(3, Math.max(1, global.devicePixelRatio || 1));
      if (`${container.clientWidth}x${container.clientHeight}@${dpr}` !== size) layout();
      else snap();
    });
    // The container can move without resizing (e.g. when web fonts reflow the page).
    const resnap = () => snap();
    global.addEventListener("resize", resnap);
    global.addEventListener("load", resnap);
    if (document.fonts) document.fonts.ready.then(resnap);

    const api = {
      setData(next) {
        if (!Array.isArray(next) || !next.length) throw new TypeError("CandleBackdrop: candles must be a non-empty array");
        next.forEach(checkCandle);
        data = next.map(normalize);
        layout();
      },

      updateLatest(candle) {
        if (!candle || typeof candle !== "object" || !data.length) return false;
        const last = data[data.length - 1];
        if (candle.t !== undefined && candle.t !== last.t) {
          console.warn("CandleBackdrop.updateLatest: t does not match the newest candle; use setData() for a new candle.");
          return false;
        }
        const merged = Object.assign({}, last);
        for (const k of FIELDS) {
          if (candle[k] === undefined) continue;
          if (typeof candle[k] !== "number" || !Number.isFinite(candle[k])) {
            throw new TypeError(`CandleBackdrop.updateLatest: invalid "${k}" value`);
          }
          merged[k] = candle[k];
        }
        data[data.length - 1] = normalize(merged);
        if (L) drawLatest();
        return true;
      },

      getLatest() {
        return data.length ? Object.assign({}, data[data.length - 1]) : null;
      },

      getLatestColumn() {
        if (!L) return null;
        const col = column(data.length - 1);
        const d = L.dpr;
        return {
          left: col.left / d, right: col.right / d,
          priceTop: L.priceTop / d, priceBottom: L.priceBottom / d,
          volumeTop: L.volTop / d, volumeBottom: L.volBottom / d,
        };
      },

      getScale() {
        return L ? { min: L.min, max: L.max, volumeMax: L.vmax } : null;
      },

      destroy() {
        ro.disconnect();
        global.removeEventListener("resize", resnap);
        global.removeEventListener("load", resnap);
        base.remove();
        live.remove();
        container.classList.remove("candle-backdrop");
      },
    };

    api.setData(candles);
    ro.observe(container);
    return api;
  }

  global.CandleBackdrop = { mount };
})(window);
