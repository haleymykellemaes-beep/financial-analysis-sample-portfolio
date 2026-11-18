/*
 * Homepage hero: mounts the decorative candlestick backdrop behind the portrait.
 * Needs js/ohlcv-fixture.js (illustrative data) and js/candle-backdrop.js first.
 *
 * - Redraws in the new colours when the theme changes (js/theme.js fires
 *   "themechange"), keeping the price scale and history where they are.
 * - Animates gently: every few seconds the newest candle and its volume bar
 *   tick within the candle's own range, like a live session. The grid and
 *   history never move. Paused when the hero is off screen or the tab is
 *   hidden, and off entirely for visitors who prefer reduced motion.
 *
 * The chart is exposed as window.heroChart so a live feed can call
 * heroChart.updateLatest(candle) later, and so dev/checks/acceptance.js can
 * test it. See dev/README.md for the API.
 */
(function () {
  "use strict";
  var container = document.getElementById("hero-candles");
  var fixture = window.OHLCV_FIXTURE;
  if (!container || !window.CandleBackdrop || !fixture) return;
  var chart = window.CandleBackdrop.mount(container, fixture.candles);
  window.heroChart = chart;

  document.addEventListener("themechange", function () { chart.refresh(); });

  // Gentle tick on the newest candle (illustrative, like the fixture itself).
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var base = chart.getLatest();
  var close = base.c;
  var step = 0;
  var onScreen = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
    }).observe(container);
  }

  function tick() {
    if (reduce.matches || document.hidden || !onScreen) return;
    var latest = chart.getLatest();
    if (latest.t !== base.t) return; // a live feed has taken over
    step += 1;
    var span = base.h - base.l;
    // Mean-reverting walk that stays inside the candle's own high-low range.
    close += (Math.random() - 0.5) * span * 0.22 + (base.c - close) * 0.18;
    close = Math.min(base.h, Math.max(base.l, close));
    var volume = base.v * (1 + 0.14 * Math.sin(step / 3)) + base.v * 0.04 * Math.random();
    chart.updateLatest({ c: +close.toFixed(2), v: Math.round(volume) });
  }
  window.setInterval(tick, 2400);
})();
