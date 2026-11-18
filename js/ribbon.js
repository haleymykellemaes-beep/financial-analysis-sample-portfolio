(function () {
  var canvas = document.getElementById("ribbon");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var view = { w: 1, h: 1 };
  var running = true;
  var frameId = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = w;
    view.h = h;
  }

  function ribbon(w, h, time, index) {
    var base = h * (0.36 + index * 0.075);
    var amp = h * (0.028 + (index % 3) * 0.014);
    var freq = 0.00125 + index * 0.00031;
    var drift = reduce ? index * 0.85 : time * (0.00018 + index * 0.000045);
    var step = w > 800 ? 3 : 6;
    ctx.beginPath();
    for (var x = 0; x <= w; x += step) {
      var y = base
        + Math.sin(x * freq + drift) * amp
        + Math.sin(x * freq * 2.17 + drift * 1.35) * amp * 0.34
        + Math.sin(x * freq * 0.43 - drift * 0.7) * amp * 0.2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    var colors = [
      "rgba(212,194,162,0.16)",
      "rgba(222,198,155,0.28)",
      "rgba(237,226,204,0.72)",
      "rgba(212,194,162,0.34)",
      "rgba(169,150,118,0.22)",
      "rgba(222,198,155,0.14)"
    ];
    ctx.strokeStyle = colors[index];
    ctx.lineWidth = index === 2 ? 1.7 : 0.85;
    ctx.stroke();
  }

  function draw(time) {
    var w = view.w;
    var h = view.h;
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(212,194,162,0.08)";
    ctx.lineWidth = 1;
    for (var g = 1; g <= 4; g++) {
      var y = h * (0.22 + g * 0.14);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (var i = 0; i < 6; i++) ribbon(w, h, time || 0, i);
  }

  function loop(time) {
    draw(time);
    if (!reduce && running) frameId = requestAnimationFrame(loop);
  }

  resize();
  loop(0);

  window.addEventListener("resize", function () {
    resize();
    if (reduce) draw(0);
  });

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running && !reduce) frameId = requestAnimationFrame(loop);
    else cancelAnimationFrame(frameId);
  });
})();
