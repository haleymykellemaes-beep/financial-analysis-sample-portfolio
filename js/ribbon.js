/* Simulated market traces. Decorative only — not prices, and not a repeating sine wave. */
(() => {
  const canvas = document.getElementById("ribbon");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const colors = [
    "rgba(212,194,162,0.16)",
    "rgba(222,198,155,0.28)",
    "rgba(237,226,204,0.62)",
    "rgba(212,194,162,0.22)",
    "rgba(186,166,132,0.18)",
    "rgba(232,214,176,0.34)",
    "rgba(212,194,162,0.14)"
  ];

  let width = 0;
  let height = 0;
  let raf = 0;
  let running = false;
  let last = 0;
  let carry = 0;
  let obstacle = null;
  let series = [];

  function randFactory(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function gaussian(rand) {
    const u = Math.max(rand(), 1e-7);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  function makeSeries(seed, lane) {
    const rand = randFactory(seed);
    const count = Math.ceil(width / 7) + 8;
    const points = [];
    let value = (rand() - 0.5) * 0.2;
    let momentum = 0;
    for (let i = 0; i < count; i += 1) {
      momentum = momentum * 0.74 + gaussian(rand) * (0.045 + Math.abs(lane) * 0.01);
      value = Math.max(-1, Math.min(1, value * 0.992 + momentum));
      points.push(value);
    }
    return { rand, lane, points, value, momentum, vol: 0.04 + (seed % 4) * 0.008 };
  }

  function stepSeries(item) {
    item.momentum = item.momentum * 0.78 + gaussian(item.rand) * item.vol;
    item.value = Math.max(-1, Math.min(1, item.value * 0.994 + item.momentum));
    item.points.push(item.value);
    item.points.shift();
  }

  function measureObstacle() {
    const frame = document.querySelector(".portrait-frame");
    if (!frame) {
      obstacle = null;
      return;
    }
    const canvasBox = canvas.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    if (!frameBox.width || !canvasBox.width) {
      obstacle = null;
      return;
    }
    obstacle = {
      cx: frameBox.left - canvasBox.left + frameBox.width / 2,
      cy: frameBox.top - canvasBox.top + frameBox.height / 2,
      r: frameBox.width / 2 + 10
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lanes = width < 760 ? [-0.55, -0.18, 0.16, 0.5] : [-0.7, -0.42, -0.16, 0.02, 0.22, 0.44, 0.68];
    series = lanes.map((lane, index) => makeSeries(1901 + index * 977, lane));
    measureObstacle();
    draw();
  }

  function sampleY(baseY, x, lane) {
    if (!obstacle) return baseY;
    const reach = obstacle.r * 1.45;
    const nx = (x - obstacle.cx) / reach;
    if (nx <= -1 || nx >= 1) return baseY;
    const bell = 1 - nx * nx;
    const clearance = Math.abs(baseY - obstacle.cy) / (obstacle.r * 2.4);
    const proximity = Math.max(0, 1 - clearance);
    const side = lane < 0 ? -1 : 1;
    return baseY + side * bell * obstacle.r * (0.42 + proximity * 0.95);
  }

  function trace(item, index) {
    const points = item.points;
    const step = width / (points.length - 1);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i += 1) {
      const x = i * step - 12;
      const baseY = height * (0.5 + item.lane * 0.32) + points[i] * height * 0.055;
      const y = sampleY(baseY, x, item.lane);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else if (i < points.length - 1) {
        const nx = (i + 1) * step - 12;
        const nBase = height * (0.5 + item.lane * 0.32) + points[i + 1] * height * 0.055;
        const ny = sampleY(nBase, nx, item.lane);
        ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = index === 2 ? 1.45 : 0.7;
    ctx.strokeStyle = colors[index % colors.length];
    ctx.stroke();
  }

  function draw() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (obstacle) {
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.arc(obstacle.cx, obstacle.cy, obstacle.r, 0, Math.PI * 2, true);
      ctx.clip("evenodd");
    }
    series.forEach(trace);
    ctx.restore();
  }

  function frame(time) {
    if (!running) return;
    const dt = Math.min(0.05, (time - last) / 1000 || 0.016);
    last = time;
    if (motionQuery.matches) {
      measureObstacle();
      draw();
      return;
    }
    carry += dt;
    while (carry > 0.11) {
      carry -= 0.11;
      series.forEach(stepSeries);
    }
    measureObstacle();
    draw();
    raf = window.requestAnimationFrame(frame);
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

  const hero = canvas.parentElement;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !document.hidden) start();
    else stop();
  }, { threshold: 0.05 });
  observer.observe(hero);

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
  motionQuery.addEventListener?.("change", () => {
    resize();
  });
  resize();
  if (!document.hidden) start();
})();
