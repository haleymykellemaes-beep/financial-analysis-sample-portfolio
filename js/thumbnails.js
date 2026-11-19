/*
 * Homepage project cards: small live-dashboard details. Decorative only;
 * no text or figures change.
 *   Revenue console   the history line draws in, a live dot pings at its end,
 *                     the projection dashes flow and the forward band glows.
 *   Expected value    the decorative distribution bars breathe.
 *   Working capital   the aging bars grow in.
 *   Lab tiles         the donut sweeps in, scatter points drift and the
 *                     outlier pings, sensitivity bars grow out from the centre.
 * Animations run only while a card is on screen, use the active theme's
 * colours (css/themes.css), and are skipped for reduced-motion visitors.
 * Styles: css/home.css, "Project cards".
 */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cards = document.querySelectorAll("#work .console, #gallery .tile");
  if (!cards.length || reduce || !("IntersectionObserver" in window)) return;
  var NS = "http://www.w3.org/2000/svg";

  function circle(cls, x, y, r) {
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("class", cls);
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", r);
    return c;
  }

  // Revenue console: draw-in line and a live dot where history ends.
  Array.prototype.forEach.call(document.querySelectorAll("#work .chart"), function (svg) {
    var history = svg.querySelector("polyline:not([stroke-dasharray])");
    if (!history) return;
    history.setAttribute("pathLength", "1");
    history.classList.add("thumb-draw");
    var points = history.getAttribute("points").trim().split(/\s+/);
    var end = points[points.length - 1].split(",");
    svg.appendChild(circle("thumb-ping", end[0], end[1], 4));
    svg.appendChild(circle("thumb-dot", end[0], end[1], 3.6));
  });

  // Scatter tiles: ping the outlier.
  Array.prototype.forEach.call(document.querySelectorAll("#gallery .scatter"), function (svg) {
    var outlier = svg.querySelector('[fill="#e39b96"]');
    if (outlier) svg.appendChild(circle("thumb-ping thumb-ping--alert", outlier.getAttribute("cx"), outlier.getAttribute("cy"), 6));
  });

  // Stagger index for bars and points.
  Array.prototype.forEach.call(document.querySelectorAll(".dist i, .aging-row i, .tornado i, .scatter g circle, .donut circle"), function (el, i) {
    el.style.setProperty("--i", i % 10);
  });

  document.documentElement.classList.add("thumbs-ready");

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      e.target.classList.toggle("is-inview", e.isIntersecting);
      if (e.isIntersecting) e.target.classList.add("was-inview");
    });
  }, { threshold: 0.2 });
  Array.prototype.forEach.call(cards, function (card) { io.observe(card); });
})();
