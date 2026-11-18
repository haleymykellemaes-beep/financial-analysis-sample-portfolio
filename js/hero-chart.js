/*
 * Homepage hero: the "Live overlay" toggle. On request, loads TradingView's
 * BTC/USD daily chart over the illustrative candles (css/home.css styles it
 * to blend into the scene). Nothing is loaded from TradingView until the
 * button is pressed. If the widget doesn't load within 8 seconds, it falls
 * back to the illustrative candles and says so.
 */
(function () {
  const button = document.querySelector(".hero-chart-toggle");
  const status = document.querySelector(".hero-chart-status");
  const note = document.querySelector(".hero-chart-note");
  const live = document.getElementById("hero-chart-live");
  if (!button || !status || !live) return;
  const chart = live.parentElement;
  const noteText = note ? note.textContent : "";
  let pending = false;
  let timeout;

  function setNote(isLive) {
    if (note) note.textContent = isLive ? "Chart: live BTC/USD" : noteText;
  }

  function showSample(message = "") {
    window.clearTimeout(timeout);
    pending = false;
    live.hidden = true;
    chart.classList.remove("is-live");
    button.removeAttribute("aria-busy");
    button.setAttribute("aria-pressed", "false");
    status.textContent = message;
    setNote(false);

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    live.replaceChildren(widget);
  }

  function showLoadError() {
    if (pending) showSample("TradingView is unavailable. Showing sample candles.");
  }

  live.addEventListener("load", (event) => {
    if (!pending || !(event.target instanceof HTMLIFrameElement)) return;

    window.clearTimeout(timeout);
    pending = false;
    chart.classList.add("is-live");
    button.removeAttribute("aria-busy");
    button.setAttribute("aria-pressed", "true");
    status.textContent = "";
    setNote(true);
  }, true);

  button.addEventListener("click", () => {
    if (pending || chart.classList.contains("is-live")) {
      showSample();
      return;
    }

    pending = true;
    live.hidden = false;
    button.setAttribute("aria-busy", "true");
    status.textContent = "Connecting to TradingView…";
    timeout = window.setTimeout(showLoadError, 8000);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: "BITSTAMP:BTCUSD",
      interval: "D",
      timezone: "Etc/UTC",
      locale: "en",
      theme: "light",
      style: "1",
      backgroundColor: "#ffffff",
      gridColor: "rgba(40, 31, 24, 0.12)",
      hide_side_toolbar: true,
      hide_top_toolbar: true,
      hide_legend: true,
      hide_volume: false,
      allow_symbol_change: false,
      save_image: false,
      withdateranges: false,
    });
    script.addEventListener("error", () => {
      if (script.parentElement === live) showLoadError();
    });
    live.append(script);
  });
})();
