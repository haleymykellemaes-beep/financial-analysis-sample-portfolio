/* Illustrative candle history in a single, slowly advancing background. */
(() => {
  const canvas = document.getElementById("ribbon");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prices;
  let detail;
  let history;
  let priceLow;
  let priceHigh;
  let palette;
  let plot;
  let grid;
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

  // Pulls each price toward its local average; detail 1 keeps the tape as published.
  function settle(series, amount) {
    if (amount >= 1) return series;
    const radius = 6;
    return series.map((price, index) => {
      const window = series.slice(Math.max(0, index - radius), index + radius + 1);
      const trend = window.reduce((sum, value) => sum + value, 0) / window.length;
      return trend + (price - trend) * amount;
    });
  }

  function loadPrices(payload) {
    const primary = payload?.tapes?.[0]?.values;
    prices = Array.isArray(primary) && primary.length >= 120 && primary.every(Number.isFinite)
      ? primary
      : samplePrices();
  }

  function prepareHistory() {
    detail = palette.detail;
    const series = settle(prices, detail);
    const candles = [];
    for (let end = 2; end < series.length; end += 2) {
      const open = series[end - 2];
      const close = series[end];
      const high = Math.max(open, series[end - 1], close);
      const low = Math.min(open, series[end - 1], close);
      candles.push({ open, close, high, low });
    }

    // Illustrative volume: wider ranges trade heavier, with a fixed texture so bars never flicker.
    const widest = Math.max(...candles.map((candle) => candle.high - candle.low)) || 1;
    candles.forEach((candle, index) => {
      candle.volume = 0.28 + 0.52 * (candle.high - candle.low) / widest + 0.2 * ((index * 7919) % 13) / 13;
    });

    // Return along the historical series so the decorative loop joins at the same price.
    const returnPath = candles.slice().reverse().map(({ open, close, high, low, volume }) => ({
      open: close, close: open, high, low, volume
    }));
    history = candles.concat(returnPath);
    priceLow = Math.min(...candles.map((candle) => candle.low));
    priceHigh = Math.max(...candles.map((candle) => candle.high));
  }

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    const number = (name, fallback) => {
      const value = parseFloat(read(name, ""));
      return Number.isFinite(value) ? value : fallback;
    };
    const up = read("--theme-chart-up", "rgba(125, 187, 158, .7)");
    const volume = read("--theme-chart-volume", "none");
    palette = {
      up,
      upSoft: read("--theme-chart-up-soft", up),
      down: read("--theme-chart-down", "rgba(218, 138, 119, .66)"),
      hollow: read("--theme-chart-hollow", "0") === "1",
      density: number("--theme-chart-density", 1),
      detail: number("--theme-chart-detail", 1),
      scale: number("--theme-chart-scale", 1),
      body: number("--theme-chart-body", 0.64),
      grid: read("--theme-chart-grid", "none"),
      volume,
      volumeDown: read("--theme-chart-volume-down", volume)
    };
  }

  // Painted once per size or theme. Horizontal rules stop at each vertical so crossings keep the line's alpha.
  function paintGrid(top, bottom, ratio) {
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const g = layer.getContext("2d");
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cell = Math.max(32, Math.round(width / 32));
    g.fillStyle = palette.grid;
    for (let x = cell; x < width; x += cell) g.fillRect(Math.round(x), top, 1, bottom - top);
    for (let y = bottom - cell; y > top; y -= cell) {
      for (let x = 0; x < width; x += cell) {
        const start = x ? Math.round(x) + 1 : 0;
        g.fillRect(start, Math.round(y), Math.min(width, Math.round(x + cell)) - start, 1);
      }
    }
    const fade = g.createLinearGradient(0, top, 0, bottom);
    fade.addColorStop(0, "#000");
    fade.addColorStop(0.3, "rgba(0, 0, 0, 0)");
    fade.addColorStop(0.72, "rgba(0, 0, 0, 0)");
    fade.addColorStop(1, "#000");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = fade;
    g.fillRect(0, top, width, bottom - top);
    return layer;
  }

  function measure(ratio) {
    const phone = width <= 760;
    const bandTop = height * (phone ? 0.14 : 0.25);
    const bandHeight = height * (phone ? 0.52 : 0.48);
    const plotHeight = bandHeight * palette.scale;
    const plotTop = bandTop + (bandHeight - plotHeight) / 2;
    const volumeBase = plotTop + plotHeight + height * 0.06;
    plot = { top: plotTop, height: plotHeight, volumeBase, volumeHeight: height * 0.055 };
    grid = palette.grid === "none" || !width || !height
      ? null
      : paintGrid(bandTop - bandHeight * 0.3, volumeBase + height * 0.04, ratio);
  }

  function draw() {
    if (!history || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const { volumeBase, volumeHeight } = plot;
    const range = priceHigh - priceLow || 1;
    const y = (price) => plot.top + (priceHigh - price) / range * plot.height;
    const first = Math.floor(offset / spacing);
    const partial = offset % spacing;
    const columns = Math.ceil(width / spacing) + 2;
    const bodyWidth = Math.max(1.5, spacing * palette.body);
    const showVolume = palette.volume !== "none";

    if (grid) ctx.drawImage(grid, 0, 0, width, height);

    ctx.lineWidth = 1;
    for (let i = 0; i < columns; i += 1) {
      const candle = history[(first + i) % history.length];
      const x = (i - 0.5) * spacing - partial;
      const openY = y(candle.open);
      const closeY = y(candle.close);
      const rising = candle.close >= candle.open;
      const narrow = Math.abs(candle.close - candle.open) < (candle.high - candle.low) * 0.4;
      const color = rising ? (narrow ? palette.upSoft : palette.up) : palette.down;
      const top = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));

      if (showVolume) {
        const barHeight = candle.volume * volumeHeight;
        ctx.fillStyle = rising ? palette.volume : palette.volumeDown;
        ctx.fillRect(x - bodyWidth / 2, volumeBase - barHeight, bodyWidth, barHeight);
      }

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y(candle.high));
      ctx.lineTo(x, y(candle.low));
      ctx.stroke();
      if (palette.hollow && rising) ctx.strokeRect(x - bodyWidth / 2, top, bodyWidth, bodyHeight);
      else ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, bodyHeight);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const progress = offset / spacing;
    width = rect.width;
    height = rect.height;
    spacing = Math.max(5, Math.min(16, Math.max(8, width / 120)) * palette.density);
    offset = progress * spacing;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    measure(ratio);
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

  readPalette();
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
  document.addEventListener("themechange", () => {
    readPalette();
    if (prices && palette.detail !== detail) prepareHistory();
    resize();
  });

  Promise.resolve(window.MarketData).then((payload) => {
    loadPrices(payload);
    prepareHistory();
    resize();
    syncMotion();
  });
})();
