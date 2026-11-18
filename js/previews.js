/* Project previews: simulated, deterministic examples. No real-time market or sportsbook feeds. */
(() => {
  "use strict";
  const root = document.querySelector("#work");
  const examples = Array.from(document.querySelectorAll("[data-preview]"));
  if (!root || !examples.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const visible = new Set();
  const states = new Map();
  const money = n => "$" + n.toFixed(1) + "M";
  const minus = s => String(s).replace(/-/g, "−");
  const formatOdd = n => n > 0 ? "+" + n : "−" + Math.abs(n);
  const probability = n => n > 0 ? 10000 / (100 + n) : Math.abs(n) * 100 / (Math.abs(n) + 100);
  const signed = n => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1);
  const safeText = (element, text) => { if (element) element.textContent = text; };

  const revenueExamples = [
    { booked: 4.8, range: 6, hist: [150,138,146,112,120,86,92], future: [92,74,82,58] },
    { booked: 4.9, range: 5, hist: [150,143,136,119,103,109,86], future: [86,73,60,49] },
    { booked: 4.7, range: 8, hist: [149,130,145,128,139,102,110], future: [110,93,100,74] },
    { booked: 5.0, range: 5, hist: [154,140,136,115,121,93,79], future: [79,73,64,43] }
  ];
  const oddsExamples = [
    { a: -110, b: 105, modelA: 55.5, modelB: 46.0 },
    { a: -115, b: 110, modelA: 56.0, modelB: 45.7 },
    { a: -105, b: -105, modelA: 54.7, modelB: 47.5 },
    { a: -120, b: 115, modelA: 56.2, modelB: 44.8 }
  ];
  const agingExamples = [
    [58,22,12,8], [60,23,11,6], [57,21,13,9], [62,19,12,7]
  ];
  const riskExamples = [[42,28,18],[37,34,17],[45,24,20],[39,30,20]];
  const anomalyExamples = [
    {x:286,y:28,flags:"01",sample:"7,840"},
    {x:264,y:36,flags:"02",sample:"8,120"},
    {x:278,y:17,flags:"01",sample:"9,350"},
    {x:298,y:32,flags:"03",sample:"6,780"}
  ];
  const scenarioExamples = [
    {mode:"BASE", bars:[46,62,38,44,58,22,28,30]},
    {mode:"STRESS", bars:[67,40,54,28,72,18,44,24]},
    {mode:"UPSIDE", bars:[24,80,22,68,35,57,18,55]},
    {mode:"BASE", bars:[46,62,38,44,58,22,28,30]}
  ];

  const sets = {
    revenue: revenueExamples, odds: oddsExamples, receivables: agingExamples,
    risk: riskExamples, anomalies: anomalyExamples, scenarios: scenarioExamples
  };

  function metric(card, i, label) {
    safeText(card.querySelectorAll(".metric strong")[i], label);
  }
  function pulse(elements) {
    elements.filter(Boolean).forEach(element => {
      element.classList.remove("preview-tick");
      // Force reflow only for the element whose value changed.
      void element.offsetWidth;
      element.classList.add("preview-tick");
    });
  }
  function addChrome(card, kind) {
    const preview = card.querySelector(".console") || card;
    preview.classList.add("preview-surface");
    const row = document.createElement("div");
    row.className = "preview-status";
    row.innerHTML = '<span><i class="preview-dot" aria-hidden="true"></i> SIMULATED PREVIEW <span class="preview-counter">01 / 04</span></span><span class="preview-view">EXPLORE PROJECT ↗</span>';
    preview.append(row);
    const chip = preview.querySelector(".console-top .chip, .tile-top .chip");
    if (chip) {
      chip.textContent = "DEMO DATA";
      chip.classList.add("preview-chip");
    }
    if (kind === "risk") {
      const caption = document.createElement("div");
      caption.className = "risk-caption";
      caption.innerHTML = '<strong data-risk-weight>42%</strong><span>LARGEST WEIGHT <span data-risk-other> / 3 ASSETS</span></span>';
      preview.querySelector(".tile-viz")?.append(caption);
    }
    if (kind === "anomalies") {
      const caption = document.createElement("div");
      caption.className = "anomaly-caption";
      caption.innerHTML = '<span>EXCEPTION DETECTED</span><strong><span data-anomaly-count>01</span> <small>FLAGGED</small></strong>';
      preview.querySelector(".scatter")?.insertAdjacentElement("afterend",caption);
    }
    if (kind === "scenarios") {
      const mode = document.createElement("div");
      mode.className = "scenario-mode";
      mode.innerHTML = '<span>ANALYSIS MODE</span><b data-scenario-mode>BASE CASE</b>';
      preview.querySelector(".tornado")?.insertAdjacentElement("beforebegin",mode);
    }
  }
  const yPositions = [20,90,160,230,300,370,400];
  const xFuture = [400,470,540,630];

  function updateRevenue(card, next, previous, animated) {
    const info = revenueExamples[next];
    metric(card,0,money(info.booked));
    metric(card,1,"±" + info.range + "%");
    metric(card,2,"4 mo");
    const hist = card.querySelector("[data-revenue-history]");
    const future = card.querySelector("[data-revenue-projection]");
    const band = card.querySelector("[data-revenue-band]");
    if (!hist || !future || !band) return;
    const from = revenueExamples[previous] || info;
    const draw = t => {
      const blend = (a,b) => a + (b-a)*t;
      const values = info.hist.map((v,i)=>blend(from.hist[i],v,t));
      const fValues = info.future.map((v,i)=>blend(from.future[i],v,t));
      hist.setAttribute("points",values.map((v,i)=>yPositions[i] + "," + v.toFixed(1)).join(" "));
      future.setAttribute("points",fValues.map((v,i)=>xFuture[i] + "," + v.toFixed(1)).join(" "));
      const upper = fValues.map((v,i)=> [xFuture[i],v - info.range * (i+2) * .9]);
      const lower = fValues.map((v,i)=> [xFuture[i],v + info.range * (i+2) * .9]).reverse();
      band.setAttribute("d","M" + [...upper,...lower].map(v=>v.map(n=>n.toFixed(1)).join(" ")).join(" L") + " Z");
    };
    if (!animated || reduceMotion.matches) { draw(1); return; }
    let start = 0;
    const animate = time => {
      if (!start) start = time;
      const p = Math.min(1,(time-start)/800);
      draw(1 - Math.pow(1-p,3));
      if (p < 1 && !document.hidden) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  function updateOdds(card, next) {
    const data = oddsExamples[next];
    const impliedA = probability(data.a);
    const impliedB = probability(data.b);
    metric(card,0,formatOdd(data.a));
    metric(card,1,impliedA.toFixed(1)+"%");
    metric(card,2,data.modelA.toFixed(1)+"%");
    safeText(card.querySelector("[data-odds-price-a]"), formatOdd(data.a));
    safeText(card.querySelector("[data-odds-price-b]"), formatOdd(data.b));
    const a = card.querySelector("[data-odds-prob-a]");
    const b = card.querySelector("[data-odds-prob-b]");
    safeText(a,impliedA.toFixed(1)+"% / "+data.modelA.toFixed(1)+"%");
    safeText(b,impliedB.toFixed(1)+"% / "+data.modelB.toFixed(1)+"%");
    const edges = card.querySelectorAll(".odds-model small");
    safeText(edges[0],signed(data.modelA-impliedA)+" percentage pts");
    safeText(edges[1],signed(data.modelB-impliedB)+" percentage pts");
    pulse([card.querySelector("[data-odds-price-a]"),card.querySelector("[data-odds-price-b]")]);
  }

  function updateReceivables(card, next) {
    const row = agingExamples[next];
    metric(card,0,money([1.2,1.24,1.19,1.28][next]));
    metric(card,1,row[0]+"%");
    metric(card,2,row[3]+"%");
    card.querySelectorAll(".aging-row").forEach((line,i) => {
      line.querySelector("i")?.style.setProperty("--w",row[i]+"%");
      safeText(line.querySelector("b"),row[i]);
    });
  }

  function updateRisk(card, next) {
    const weights = riskExamples[next], circumference = 2*Math.PI*42;
    const rings = card.querySelectorAll(".donut circle");
    let accumulated = 0;
    weights.forEach((weight,i) => {
      const circle = rings[i+1];
      if (!circle) return;
      const segment = circumference * weight / 100;
      circle.style.strokeDasharray = segment.toFixed(2) + " " + circumference.toFixed(2);
      circle.style.strokeDashoffset = (-accumulated).toFixed(2);
      accumulated += segment;
    });
    safeText(card.querySelector("[data-risk-weight]"),Math.max(...weights)+"%");
  }

  function updateAnomalies(card, next) {
    const data = anomalyExamples[next];
    const point = card.querySelector(".scatter circle:last-child");
    if (point) {
      point.setAttribute("cx",data.x);
      point.setAttribute("cy",data.y);
    }
    safeText(card.querySelector("[data-anomaly-count]"),data.flags);
  }

  function updateScenarios(card, next) {
    const values = scenarioExamples[next];
    const bars = card.querySelectorAll(".tornado i");
    bars.forEach((bar,i)=>bar.style.setProperty("--w",values.bars[i]+"%"));
    safeText(card.querySelector("[data-scenario-mode]"),values.mode+" CASE");
  }

  const handlers = {
    revenue:updateRevenue, odds:updateOdds, receivables:updateReceivables,
    risk:updateRisk, anomalies:updateAnomalies, scenarios:updateScenarios
  };
  examples.forEach(card => {
    const kind = card.dataset.preview;
    if (!handlers[kind]) return;
    states.set(card,0);
    addChrome(card,kind);
    handlers[kind](card,0,0,false);
    card.addEventListener("pointerenter",()=>card.classList.add("preview-hovered"));
    card.addEventListener("pointerleave",()=>card.classList.remove("preview-hovered"));
    card.addEventListener("focusin",()=>card.classList.add("preview-hovered"));
    card.addEventListener("focusout",()=>card.classList.remove("preview-hovered"));
  });

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry=> {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
      },{rootMargin:"100px 0px",threshold:0.05}) : null;

  examples.forEach(card=> {
    if (observer) observer.observe(card);
    else visible.add(card);
  });

  function tick() {
    if (document.hidden || reduceMotion.matches) return;
    visible.forEach(card => {
      if (card.classList.contains("preview-hovered")) return;
      const kind = card.dataset.preview;
      if (!sets[kind]) return;
      const old = states.get(card) || 0;
      const next = (old+1)%sets[kind].length;
      states.set(card,next);
      handlers[kind](card,next,old,true);
      safeText(card.querySelector(".preview-counter"),
        String(next+1).padStart(2,"0")+" / "+String(sets[kind].length).padStart(2,"0"));
      card.classList.remove("preview-refresh");
      void card.offsetWidth;
      card.classList.add("preview-refresh");
    });
  }
  // Motion only while cards are in/near the viewport. No external requests.
  const interval = window.setInterval(tick,4400);
  window.addEventListener("pagehide",()=>window.clearInterval(interval),{once:true});
})();
