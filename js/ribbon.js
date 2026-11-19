/* Layered market traces. Prefers python/generate_market.py output, and falls back to a local walk. */
(() => {
  const canvas = document.getElementById("ribbon");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const colors = [
    "rgba(232,214,186,0.28)",
    "rgba(244,228,204,0.62)",
    "rgba(214,190,156,0.22)",
    "rgba(236,220,196,0.4)"
  ];
  let width = 0;
  let height = 0;
  let raf = 0;
  let running = false;
  let last = 0;
  let offset = 0;
  let pointerX = 0;
  let pointerY = 0;
  let tapes = [];
  let candles = [];
  let portraitPixels = null;

  function localTape(seed, count, drift) {
    let state = seed >>> 0;
    const unit = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const values = [];
    let noise = 0;
    for (let i = 0; i < count; i += 1) {
      const trend = 1 + drift * (i / (count - 1));
      noise = noise * 0.86 + (unit() - 0.5) * 0.02;
      values.push(trend * (1 + noise));
    }
    return values;
  }

  function usePayload(data) {
    if (data && Array.isArray(data.tapes)) {
      tapes = data.tapes.map((tape) => ({ speed: tape.speed || 0.2, values: tape.values }));
      candles = Array.isArray(data.candles) ? data.candles : [];
      return;
    }
    tapes = [
      { speed: 0.22, values: localTape(1204, 180, 0.08) },
      { speed: 0.16, values: localTape(3371, 180, 0.03) },
      { speed: 0.28, values: localTape(7740, 180, -0.04) },
      { speed: 0.12, values: localTape(5519, 180, 0.02) }
    ];
    candles = [];
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function sample(values, at) {
    const span = values.length - 1;
    const wrapped = ((at % span) + span) % span;
    const index = Math.floor(wrapped);
    const next = (index + 1) % values.length;
    const fraction = wrapped - index;
    return values[index] + (values[next] - values[index]) * fraction;
  }

  function bounds(values) {
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i += 1) {
      min = Math.min(min, values[i]);
      max = Math.max(max, values[i]);
    }
    return { min, max: max === min ? min + 1 : max };
  }

  function barsFrom(values, start, count, span) {
    const bars = [];
    const length = values.length;
    const origin = Math.floor(start);
    for (let i = 0; i < count; i += 1) {
      const at = (origin + i * span) % (length - span);
      let high = -Infinity;
      let low = Infinity;
      for (let k = 0; k < span; k += 1) {
        const price = values[at + k];
        high = Math.max(high, price);
        low = Math.min(low, price);
      }
      bars.push({ o: values[at], c: values[at + span - 1], h: high, l: low });
    }
    return bars;
  }

  function readPortrait() {
    if (portraitPixels) return portraitPixels;
    const img = document.querySelector(".hero-portrait");
    if (!img || !img.complete || !img.naturalWidth) return null;
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const offCtx = off.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return null;
    offCtx.drawImage(img, 0, 0);
    portraitPixels = {
      width: off.width,
      height: off.height,
      data: offCtx.getImageData(0, 0, off.width, off.height).data
    };
    return portraitPixels;
  }

  function lumAt(vx, vy) {
    const photo = readPortrait();
    if (!photo) return 255;
    const box = canvas.getBoundingClientRect();
    const scale = Math.max(box.width / photo.width, box.height / photo.height);
    const offsetX = photo.width * scale - box.width;
    const offsetY = (photo.height * scale - box.height) / 2;
    const ix = Math.round((vx + offsetX) / scale);
    const iy = Math.round((vy + offsetY) / scale);
    if (ix < 0 || iy < 0 || ix >= photo.width || iy >= photo.height) return 255;
    const i = (iy * photo.width + ix) * 4;
    const data = photo.data;
    return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
  }

  function isBackground(x, y) {
    return lumAt(x, y) > 168;
  }

  function strokeOpen(x, y0, y1, style, widthPx) {
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    ctx.strokeStyle = style;
    ctx.lineWidth = widthPx;
    ctx.lineCap = "butt";
    let run = null;
    for (let y = top; y <= bottom; y += 2) {
      if (isBackground(x, y)) {
        if (run === null) run = y;
      } else if (run !== null) {
        ctx.beginPath();
        ctx.moveTo(x, run);
        ctx.lineTo(x, y);
        ctx.stroke();
        run = null;
      }
    }
    if (run !== null) {
      ctx.beginPath();
      ctx.moveTo(x, run);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
  }

  function fillOpen(x, y, w, h, fill) {
    ctx.fillStyle = fill;
    let run = null;
    const bottom = y + h;
    for (let yy = y; yy <= bottom; yy += 2) {
      const clear = isBackground(x + 1, yy) && isBackground(x + w - 1, yy);
      if (clear) {
        if (run === null) run = yy;
      } else if (run !== null) {
        ctx.fillRect(x, run, w, Math.max(2, yy - run));
        run = null;
      }
    }
    if (run !== null) ctx.fillRect(x, run, w, Math.max(2, bottom - run));
  }

  function paintChart(values, box, count) {
    if (!values || values.length < 12) return;
    const start = offset * 18;
    const series = barsFrom(values, start, count, 3);
    let min = series[0].c;
    let max = series[0].c;
    series.forEach((bar) => {
      min = Math.min(min, bar.o, bar.c);
      max = Math.max(max, bar.o, bar.c);
    });
    const pad = (max - min) * 0.45 || 1;
    min -= pad;
    max += pad;
    const span = max - min || 1;
    const step = box.w / series.length;
    const yOf = (value) => box.y + (1 - (value - min) / span) * box.h;
    const shift = pointerX * 8;
    series.forEach((bar, index) => {
      const x = box.x + index * step + step * 0.5 + shift;
      const up = bar.c >= bar.o;
      const bodyW = Math.min(6.4, step * 0.56);
      strokeOpen(x, yOf(bar.h), yOf(bar.l), up ? "#146b38" : "#8e2b2b", 1.4);
      const top = Math.min(yOf(bar.o), yOf(bar.c));
      const body = Math.max(2, Math.abs(yOf(bar.o) - yOf(bar.c)));
      fillOpen(x - bodyW / 2, top, bodyW, body, up ? "#1f9d55" : "#d64545");
    });
    ctx.strokeStyle = "rgba(255,236,210,0.92)";
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    let drawing = false;
    ctx.beginPath();
    series.forEach((bar, index) => {
      const x = box.x + index * step + step * 0.5 + shift;
      const y = yOf(bar.c) + pointerY * 6;
      if (!isBackground(x, y)) {
        if (drawing) ctx.stroke();
        drawing = false;
        ctx.beginPath();
        return;
      }
      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else ctx.lineTo(x, y);
    });
    if (drawing) ctx.stroke();
    const last = series[series.length - 1];
    const lx = box.x + (series.length - 0.5) * step + shift;
    const ly = yOf(last.c) + pointerY * 6;
    if (isBackground(lx, ly)) {
      ctx.beginPath();
      ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,236,210,0.95)";
      ctx.fill();
    }
  }

  function draw() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const primary = (tapes[0] && tapes[0].values) || [];
    const secondary = (tapes[2] && tapes[2].values) || primary;
    if (width < 900) {
      paintChart(primary, { x: width * 0.5, y: height * 0.06, w: width * 0.44, h: height * 0.2 }, 14);
      return;
    }
    paintChart(primary, { x: width * 0.4, y: height * 0.08, w: width * 0.26, h: height * 0.3 }, 18);
    paintChart(secondary, { x: width * 0.58, y: height * 0.34, w: width * 0.2, h: height * 0.18 }, 12);
    if (tapes[1]) {
      const quiet = tapes[1].values;
      const range = bounds(quiet);
      ctx.strokeStyle = colors[2];
      ctx.lineWidth = 1;
      ctx.beginPath();
      const count = 80;
      for (let i = 0; i <= count; i += 1) {
        const x = (i / count) * width * 0.46;
        const value = sample(quiet, (i / count) * quiet.length * 0.5 + offset * 10);
        const y = height * 0.62 + (0.5 - (value - range.min) / (range.max - range.min)) * height * 0.16;
        if (!isBackground(x, y)) {
          ctx.stroke();
          ctx.beginPath();
          continue;
        }
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function frame(time) {
    if (!running) return;
    const dt = Math.min(0.05, (time - last) / 1000 || 0.016);
    last = time;
    if (!reduce.matches) offset += dt;
    draw();
    if (!reduce.matches) raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  canvas.parentElement.addEventListener("pointermove", (event) => {
    if (reduce.matches || width < 760) return;
    const bounds = canvas.getBoundingClientRect();
    pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
    pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;
  }, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !document.hidden) start();
    else stop();
  }, { threshold: 0.02 });
  observer.observe(canvas.parentElement);
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  const portrait = document.querySelector(".hero-portrait");
  if (portrait && !portrait.complete) {
    portrait.addEventListener("load", () => {
      portraitPixels = null;
      draw();
    }, { once: true });
  }

  const ready = window.MarketData || Promise.resolve(null);
  ready.then((data) => {
    usePayload(data);
    resize();
    if (!document.hidden) start();
  });
})();
