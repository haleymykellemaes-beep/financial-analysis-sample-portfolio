/* Animated simulated market traces: decorative only, not real or live prices. */
(() => {
  const canvas = document.getElementById("ribbon");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, raf = 0, visible = true, last = 0, pointer = 0, scroll = 0;
  let paths = [];

  const ease = (a, b, t) => a + (b - a) * t;
  function randomCurve(seed, count) {
    // Deterministic pseudo-random walk: market-like turns, not periodic sine waves.
    let s = seed >>> 0;
    const rand = () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    let value = 0.5, momentum = 0;
    const points = [];
    for (let i = 0; i < count; i++) {
      const shock = (rand() - 0.5) * 0.11;
      momentum = momentum * 0.38 + shock + (i % 65 > 51 ? -0.0015 : 0.001);
      value = Math.max(0.13, Math.min(0.86, value + momentum));
      points.push(value);
    }
    return points;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paths = Array.from({length: 18}, (_, i) => randomCurve(8201 + i * 779, 370));
    draw(0);
  }
  function trace(points, index, time) {
    const mobile = width < 760;
    const left = mobile ? width * -.35 : width * .2;
    const right = width * 1.15;
    const scaleX = (right - left) / (points.length - 1);
    const band = index - 8.5;
    const primary = index === 9;
    const shift = !motionQuery.matches ? (time * .007 * (index % 3 + 1)) % scaleX : 0;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = left + i * scaleX - shift;
      const y = height * (.49 + band * .025) + (points[i] - .5) * height * (.38 + (index % 3) * .035)
        + pointer * height * .015 * (index / 18) - scroll * height * .045;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = primary ? 1.55 : index % 4 === 0 ? 1.05 : .56;
    ctx.strokeStyle = primary ? "rgba(230,204,162,.72)" : index % 4 === 0
      ? "rgba(227,193,148,.24)" : "rgba(208,186,151,.095)";
    ctx.stroke();
  }
  function draw(time) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const t = motionQuery.matches ? 0 : time;
    paths.forEach((p, i) => trace(p, i, t));
    const cx = width * .77, cy = height * .41;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * .35);
    glow.addColorStop(0, "rgba(232,194,133,.045)");
    glow.addColorStop(1, "rgba(232,194,133,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  function frame(time) {
    if (!visible) return;
    if (time - last > 32) { draw(time); last = time; }
    if (!motionQuery.matches) raf = window.requestAnimationFrame(frame);
  }
  function restart() {
    cancelAnimationFrame(raf);
    visible = !document.hidden;
    if (visible) {
      draw(0);
      if (!motionQuery.matches) raf = requestAnimationFrame(frame);
    }
  }
  canvas.parentElement.addEventListener("pointermove", e => {
    if (motionQuery.matches) return;
    const r = canvas.getBoundingClientRect();
    pointer = (e.clientY - r.top) / r.height - .5;
  }, {passive:true});
  window.addEventListener("scroll", () => {
    scroll = Math.min(window.scrollY / Math.max(height, 1), 1);
  }, {passive:true});
  window.addEventListener("resize", resize, {passive:true});
  document.addEventListener("visibilitychange", restart);
  motionQuery.addEventListener?.("change", restart);
  resize();
  restart();
})();