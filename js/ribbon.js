/* Illustrative candle history in a single, slowly advancing background. */
(() => {
  const canvas = document.getElementById("ribbon");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let history;
  let priceLow;
  let priceHigh;
  let width = 0;
  let height = 0;
  let spacing = 1;
  let offset = 0;
  let frame = 0;
  let previousTime = 0;
  let inView = true;

  function samplePrices() {
    let seed = 1204;
    let price = 100;
    return Array.from({ length: 240 }, () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      price += (seed / 4294967296 - 0.47) * 1.2;
      return price;
    });
  }

  function prepareHistory(payload) {
    const primary = payload?.tapes?.[0]?.values;
    const prices = Array.isArray(primary) && primary.length >= 120 && primary.every(Number.isFinite)
      ? primary
      : samplePrices();
    const candles = [];
    for (let end = 2; end < prices.length; end += 2) {
      const open = prices[end - 2];
      const close = prices[end];
      const high = Math.max(open, prices[end - 1], close);
      const low = Math.min(open, prices[end - 1], close);
      candles.push({ open, close, high, low });
    }

    // Return along the historical series so the decorative loop joins at the same price.
    const returnPath = candles.slice().reverse().map(({ open, close, high, low }) => ({
      open: close, close: open, high, low
    }));
    history = candles.concat(returnPath);
    priceLow = Math.min(...candles.map((candle) => candle.low));
    priceHigh = Math.max(...candles.map((candle) => candle.high));
  }

  function draw() {
    if (!history || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const phone = width <= 760;
    const plotTop = height * (phone ? 0.14 : 0.25);
    const plotHeight = height * (phone ? 0.52 : 0.48);
    const range = priceHigh - priceLow || 1;
    const y = (price) => plotTop + (priceHigh - price) / range * plotHeight;
    const first = Math.floor(offset / spacing);
    const partial = offset % spacing;
    const columns = Math.ceil(width / spacing) + 2;
    const bodyWidth = spacing * 0.64;

    for (let i = 0; i < columns; i += 1) {
      const candle = history[(first + i) % history.length];
      const x = (i - 0.5) * spacing - partial;
      const openY = y(candle.open);
      const closeY = y(candle.close);
      const color = candle.close >= candle.open ? "rgba(125, 187, 158, .7)" : "rgba(218, 138, 119, .66)";

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y(candle.high));
      ctx.lineTo(x, y(candle.low));
      ctx.stroke();
      ctx.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(1.5, Math.abs(openY - closeY)));
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const progress = offset / spacing;
    width = rect.width;
    height = rect.height;
    spacing = Math.min(16, Math.max(8, width / 120));
    offset = progress * spacing;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function step(time) {
    const seconds = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
    const speed = width <= 760 ? 2 : 3.5;
    offset = (offset + seconds * speed) % (spacing * history.length);
    previousTime = time;
    draw();
    frame = window.requestAnimationFrame(step);
  }

  function syncMotion() {
    const shouldAnimate = history && inView && !document.hidden && !reducedMotion.matches;
    if (shouldAnimate && !frame) {
      previousTime = performance.now();
      frame = window.requestAnimationFrame(step);
    } else if (!shouldAnimate && frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncMotion();
    }).observe(canvas);
  }
  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize, { passive: true });
  }
  reducedMotion.addEventListener("change", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);

  Promise.resolve(window.MarketData).then((payload) => {
    prepareHistory(payload);
    resize();
    syncMotion();
  });
})();
