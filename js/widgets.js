/* Reads the generated scenario and signal series. Controls change the displayed path, not a random number. */
(() => {
  const scenarioRoot = document.getElementById("scenario");
  const signalPath = document.getElementById("signal-path");
  if (!scenarioRoot && !signalPath) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let payload = null;
  let signalOffset = 0;
  let signalFrame = 0;

  function points(values, width, height, pad) {
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    const span = max - min || 1;
    return values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = pad + (1 - (value - min) / span) * (height - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
  }

  function renderScenario(name) {
    if (!payload || !payload.scenarios || !payload.scenarios[name]) return;
    const scenario = payload.scenarios[name];
    const line = document.getElementById("scenario-line");
    const change = document.getElementById("scenario-change");
    if (line) line.setAttribute("points", points(scenario.values, 220, 64, 6));
    if (change) {
      const signed = scenario.change > 0 ? "+" : scenario.change < 0 ? "−" : "";
      change.textContent = signed + Math.abs(scenario.change).toFixed(1) + "%";
      change.classList.toggle("is-up", scenario.change >= 0);
      change.classList.toggle("is-down", scenario.change < 0);
    }
    scenarioRoot.querySelectorAll("[data-scenario]").forEach((button) => {
      const selected = button.getAttribute("data-scenario") === name;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function drawSignal(time) {
    if (!payload || !signalPath) return;
    const values = payload.signal;
    const windowSize = 28;
    if (!reduce) signalOffset += 0.35;
    const start = Math.floor(signalOffset) % (values.length - windowSize);
    const slice = values.slice(start, start + windowSize);
    signalPath.setAttribute("points", points(slice, 220, 72, 8));
    if (!reduce && !document.hidden) signalFrame = window.requestAnimationFrame(drawSignal);
    else cancelAnimationFrame(signalFrame);
  }

  scenarioRoot?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scenario]");
    if (!button) return;
    renderScenario(button.getAttribute("data-scenario"));
  });

  const ready = window.MarketData || Promise.resolve(null);
  ready.then((data) => {
    payload = data;
    if (!payload) {
      const note = document.getElementById("scenario-change");
      if (note) note.textContent = "—";
      return;
    }
    renderScenario("base");
    drawSignal(0);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && payload && !reduce) drawSignal(0);
  });
})();
