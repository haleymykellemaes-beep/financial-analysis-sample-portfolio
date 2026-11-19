/* Illustrative candle history in a single, slowly advancing background.
   Themes with --theme-chart-silk add a sheer ribbon that narrows into the close-price line. */
(() => {
  const canvas = document.getElementById("ribbon");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hero = canvas.closest(".hero");
  const backdrop = hero && hero.querySelector(".hero-backdrop");
  let prices;
  let detail;
  let history;
  let priceLow;
  let priceHigh;
  let palette;
  let plot;
  let grid;
  let silk = null;
  let width = 0;
  let height = 0;
  let heroHeight = 0;
  let spacing = 1;
  let offset = 0;
  let clock = 0;
  let frame = 0;
  let previousTime = 0;
  let inView = true;
  // Pointer and scroll targets, eased toward so the silk never jumps.
  const drift = { x: 0, y: 0, scroll: 0, toX: 0, toY: 0, toScroll: 0 };

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
    // The silk's price line follows a lightly smoothed close so it reads as one thread, not a zigzag.
    history.forEach((candle, index) => {
      const before = history[(index + history.length - 1) % history.length].close;
      const after = history[(index + 1) % history.length].close;
      candle.line = (before + candle.close * 2 + after) / 4;
    });
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
      volumeDown: read("--theme-chart-volume-down", volume),
      silk: read("--theme-chart-silk", "0") === "1",
      silkInk: read("--theme-chart-silk-ink", "13, 11, 12"),
      line: read("--theme-chart-line", "rgba(13, 11, 12, .88)"),
      lineHalo: read("--theme-chart-line-halo", "rgba(246, 239, 229, .7)")
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

  // Desktop silk keeps to the lane between the buttons and the services rule, then lifts in the gap beside the copy.
  // Layout is read without the intro's transforms so the lane does not shift while the copy settles.
  function measureSilk() {
    if (!palette.silk || !hero || !width || !height) return null;
    const phone = width <= 760;
    if (phone) {
      return { phone, lane: height * 0.68, thick: Math.max(18, height * 0.08), lift: width * 0.06, join: width * 0.2 };
    }
    const box = canvas.getBoundingClientRect();
    const actions = hero.querySelector(".hero-actions");
    const foot = hero.querySelector(".hero-foot");
    if (!actions || !foot) return null;
    const shift = (node) => {
      const value = getComputedStyle(node).transform;
      return value && value !== "none" ? new DOMMatrixReadOnly(value) : { m41: 0, m42: 0 };
    };
    let ink = 0;
    hero.querySelectorAll(".hero-copy h1, .hero-copy .tagline, .hero-copy .hero-description").forEach((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      ink = Math.max(ink, range.getBoundingClientRect().right - shift(node).m41 - box.left);
    });
    actions.querySelectorAll("a, button").forEach((node) => {
      ink = Math.max(ink, node.getBoundingClientRect().right - shift(actions).m41 - box.left);
    });
    const laneTop = actions.getBoundingClientRect().bottom - shift(actions).m42 - box.top;
    const laneBottom = foot.getBoundingClientRect().top - box.top;
    const laneHalf = (laneBottom - laneTop) / 2;
    // Room for the ribbon, its second sheet, and the sway without touching the buttons or the services row.
    const thick = Math.max(22, Math.min(120, (laneHalf - 34) / 0.7));
    const lift = ink + thick * 0.6 + 18;
    return {
      phone,
      lane: laneTop + laneHalf,
      thick,
      sway: Math.min(1, Math.max(0.25, (laneHalf - thick * 0.7 - 6) / 26)),
      ink,
      lift,
      join: lift + width * 0.05,
      clear: ink + 8,
      reveal: ink + Math.max(120, width * 0.12)
    };
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
    silk = measureSilk();
    heroHeight = hero ? hero.offsetHeight : height;
  }

  // Catmull-Rom through four values; t runs from b to c.
  function spline(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  }

  function smoothstep(edge0, edge1, value) {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Samples a Catmull-Rom curve through the points with even spacing per segment.
  function curve(points, perSegment) {
    const out = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[Math.max(0, i - 1)];
      const b = points[i];
      const c = points[i + 1];
      const d = points[Math.min(points.length - 1, i + 2)];
      for (let j = 0; j < perSegment; j += 1) {
        const t = j / perSegment;
        out.push([spline(a[0], b[0], c[0], d[0], t), spline(a[1], b[1], c[1], d[1], t)]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  // One organza layer: a twisting strip whose projected width follows cos(twist). The sheer body
  // darkens edge-on, its edges curl a shade darker, and a few soft threads and hems give it weave.
  function drawSilkLayer(path, widths, twist, layer) {
    const count = path.length;
    const across = [0, 0.16, 0.84, 1];
    const rows = across.map(() => []);
    const shade = [];
    for (let i = 0; i < count; i += 1) {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(count - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const turn = Math.cos(twist[i]);
      const half = widths[i] * 0.5 * turn;
      const lift = layer.offset * widths[i];
      across.forEach((u, row) => {
        const along = lift + half * (1 - 2 * u);
        rows[row].push([path[i][0] + nx * along, path[i][1] + ny * along]);
      });
      shade.push(Math.abs(turn));
    }

    const ink = palette.silkInk;
    const band = (a, b, i, alpha) => {
      ctx.fillStyle = `rgba(${ink}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a[i][0], a[i][1]);
      ctx.lineTo(a[i + 1][0], a[i + 1][1]);
      ctx.lineTo(b[i + 1][0], b[i + 1][1]);
      ctx.lineTo(b[i][0], b[i][1]);
      ctx.closePath();
      ctx.fill();
    };
    for (let i = 0; i < count - 1; i += 1) {
      const edgeOn = 1 - (shade[i] + shade[i + 1]) / 2;
      const body = (0.16 + 0.44 * edgeOn * edgeOn) * layer.alpha;
      band(rows[0], rows[3], i, body);
      band(rows[0], rows[1], i, body * 0.7);
      band(rows[2], rows[3], i, body * 0.7);
    }

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(${ink}, ${(0.06 * layer.alpha).toFixed(3)})`;
    for (let k = 1; k < layer.threads; k += 1) {
      const u = k / layer.threads;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = rows[0][i][0] + (rows[3][i][0] - rows[0][i][0]) * u;
        const y = rows[0][i][1] + (rows[3][i][1] - rows[0][i][1]) * u;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(${ink}, ${(0.62 * layer.alpha).toFixed(3)})`;
    [rows[0], rows[3]].forEach((edge) => {
      ctx.beginPath();
      edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
  }

  function drawSilk(lineAt) {
    const { phone, lane, thick, lift, join, ink } = silk;
    const sway = silk.sway || 1;
    const wave = (speed, phase, amount) => Math.sin(clock * speed + phase) * amount * sway;
    const tilt = drift.y * sway;
    const raise = drift.scroll * sway;
    const joinY = lineAt(join);
    const aheadX = join + spacing * 3;
    const aheadY = lineAt(aheadX);
    const rise = lane - joinY;
    const lanes = phone
      ? [
        [-width * 0.12, lane + wave(0.21, 0, 4) + drift.y * 4],
        [lift * 0.4, lane + wave(0.17, 1.3, 6)],
        [lift + (join - lift) * 0.5, lane - rise * 0.5 + wave(0.19, 0.4, 5)]
      ]
      // The ribbon stays in the lane until it has cleared the buttons, then lifts steeply into the line.
      : [
        [-width * 0.08, lane + wave(0.21, 0, 6) + tilt * 6],
        [width * 0.1 + drift.x * 10, lane + wave(0.17, 1.3, 9) + tilt * 10],
        [ink * 0.68 + drift.x * 12, lane + wave(0.23, 2.1, 8) - raise * 12 + tilt * 6],
        [lift, lane - Math.min(rise * 0.06, thick * 0.3) - raise * 8],
        [lift + (join - lift) * 0.4 + wave(0.19, 0.4, 4) + drift.x * 4, lane - rise * 0.5 - raise * 10],
        [lift + (join - lift) * 0.8, joinY + (lane - joinY) * 0.08]
      ];
    const path = curve(lanes.concat([[join, joinY], [aheadX, aheadY]]), phone ? 20 : 26);
    // Drop the samples past the join; the price line carries on from there.
    const joinIndex = path.length - 1 - (phone ? 20 : 26);
    path.length = joinIndex + 1;

    const lengths = [0];
    for (let i = 1; i < path.length; i += 1) {
      lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    }
    const total = lengths[lengths.length - 1] || 1;
    const lineWidth = phone ? 1.25 : 1.5;
    const phase = clock * 0.16 + drift.x * 0.9 + drift.scroll * 3;
    const layers = [
      { offset: 0, alpha: 1, threads: 6, twist: 0 },
      { offset: -0.2, alpha: 0.7, threads: 4, twist: 0.9 }
    ];
    layers.forEach((layer) => {
      const widths = [];
      const twist = [];
      lengths.forEach((distance) => {
        const s = distance / total;
        const narrow = smoothstep(0.5, 0.98, s);
        widths.push(lineWidth + (thick - lineWidth) * Math.pow(1 - narrow, 1.3));
        twist.push(phase + layer.twist + s * Math.PI * 1.7 + Math.sin(s * 4 + clock * 0.3) * 0.3);
      });
      drawSilkLayer(path, widths, twist, layer);
    });

    // One dark thread surfaces inside the narrowing silk and carries on as the price line.
    const start = Math.max(0, lengths.findIndex((distance) => distance / total >= 0.7));
    const tail = path.slice(start);
    const thread = ctx.createLinearGradient(tail[0][0], tail[0][1], join, joinY);
    thread.addColorStop(0, `rgba(${palette.silkInk}, 0)`);
    thread.addColorStop(1, palette.line);
    ctx.strokeStyle = thread;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    tail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
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

    if (!silk) return;

    // The silk theme clears the candles from the measured edge of the copy instead of with a CSS mask.
    const fade = silk.phone
      ? ctx.createLinearGradient(0, 0, width * 0.25, 0)
      : ctx.createLinearGradient(silk.clear, 0, silk.reveal, 0);
    if (silk.phone) {
      fade.addColorStop(0, "rgba(0, 0, 0, .4)");
      fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    } else {
      fade.addColorStop(0, "#000");
      fade.addColorStop(0.5, "rgba(0, 0, 0, .4)");
      fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";

    const lineAt = (x) => {
      const position = (x + partial) / spacing + 0.5;
      const index = Math.floor(position);
      const t = position - index;
      const value = (k) => y(history[(first + index + k + history.length) % history.length].line);
      return spline(value(-1), value(0), value(1), value(2), t);
    };

    const lineWidth = silk.phone ? 1.25 : 1.5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(silk.join, lineAt(silk.join));
    for (let x = silk.join + 3; x <= width + 4; x += 3) ctx.lineTo(x, lineAt(x));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = palette.lineHalo;
    ctx.lineWidth = lineWidth + 2;
    ctx.stroke();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    drawSilk(lineAt);
    ctx.restore();
  }

  function placeBackdrop() {
    if (!backdrop) return;
    if (!silk || silk.phone) {
      backdrop.style.transform = "";
      return;
    }
    const x = -drift.x * 12;
    const y = -drift.y * 8 + drift.scroll * heroHeight * 0.12;
    backdrop.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
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
    placeBackdrop();
  }

  function step(time) {
    const seconds = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
    const speed = width <= 760 ? 2 : 3.5;
    offset = (offset + seconds * speed) % (spacing * history.length);
    previousTime = time;
    if (silk) {
      clock += seconds;
      const ease = 1 - Math.exp(-seconds * 2.4);
      drift.x += (drift.toX - drift.x) * ease;
      drift.y += (drift.toY - drift.y) * ease;
      drift.scroll += (drift.toScroll - drift.scroll) * ease;
      placeBackdrop();
    }
    draw();
    frame = window.requestAnimationFrame(step);
  }

  function syncMotion() {
    const covered = document.documentElement.classList.contains("welcome-open");
    const shouldAnimate = history && inView && !covered && !document.hidden && !reducedMotion.matches;
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
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    drift.toX = event.clientX / window.innerWidth * 2 - 1;
    drift.toY = event.clientY / window.innerHeight * 2 - 1;
  }, { passive: true });
  window.addEventListener("scroll", () => {
    drift.toScroll = Math.min(1, Math.max(0, window.scrollY / (heroHeight || 1)));
  }, { passive: true });
  if (document.fonts) document.fonts.ready.then(() => { if (history) resize(); });
  reducedMotion.addEventListener("change", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);
  document.addEventListener("welcomeclose", syncMotion);
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
