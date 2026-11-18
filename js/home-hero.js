/*
 * Homepage hero: mounts the decorative candlestick backdrop behind the portrait.
 * Needs js/ohlcv-fixture.js (illustrative data) and js/candle-backdrop.js first.
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
  window.heroChart = window.CandleBackdrop.mount(container, fixture.candles);
})();
