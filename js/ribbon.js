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

  function sideShift() {
    const span = width * (width < 900 ? 0.06 : 0.09);
    const phase = (offset * 22) % (span * 2);
    return phase < span ? phase : span * 2 - phase;
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
      const bodyW = Math.min(7, step * 0.55);
      ctx.strokeStyle = up ? "#f8edd9" : "#e7c2b0";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, yOf(bar.h));
      ctx.lineTo(x, yOf(bar.l));
      ctx.stroke();
      const top = Math.min(yOf(bar.o), yOf(bar.c));
      const body = Math.max(3, Math.abs(yOf(bar.o) - yOf(bar.c)));
      ctx.fillStyle = up ? "#f3ddb8" : "#d7a08a";
      ctx.fillRect(x - bodyW / 2, top, bodyW, body);
    });
    ctx.beginPath();
    series.forEach((bar, index) => {
      const x = box.x + index * step + step * 0.5 + shift;
      const y = yOf(bar.c);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "rgba(255,236,210,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const last = series[series.length - 1];
    const lx = box.x + (series.length - 0.5) * step + shift;
    ctx.beginPath();
    ctx.arc(lx, yOf(last.c), 3, 0, Math.PI * 2);
    ctx.fillStyle = "#f8edd9";
    ctx.fill();
  }

  function draw() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const primary = (tapes[0] && tapes[0].values) || [];
    const slide = sideShift();
    if (width < 900) {
      paintChart(primary, { x: width * 0.46 - slide * 0.35, y: height * 0.1, w: width * 0.48, h: height * 0.22 }, 12);
      return;
    }
    paintChart(primary, { x: width * 0.58 - slide, y: height * 0.12, w: width * 0.36, h: height * 0.52 }, 16);
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

  const ready = window.MarketData || Promise.resolve(null);
  ready.then((data) => {
    usePayload(data);
    resize();
    if (!document.hidden) start();
  });
})();
