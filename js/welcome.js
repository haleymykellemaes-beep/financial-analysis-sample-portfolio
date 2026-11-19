/*
 * Homepage welcome: seven theme tiles over two espresso panels that glide
 * apart onto the site in the chosen theme.
 *
 * Load it in <head> right after js/theme.js so a first visit is covered from
 * the first frame, then call HMWelcome.mount() right after the #welcome
 * markup. Copy lives in index.html (#welcome), styles in css/welcome.css,
 * and the reveal timing in TIMING below.
 *
 * - Shown once per browser. Entering or skipping marks it complete.
 * - Not shown when the URL has a hash, so links such as /#capabilities stay
 *   direct. Add ?welcome to the URL to see it again.
 * - Tiles come from HMTheme.themes, the registry the header picker uses.
 *   Hover and keyboard focus preview a theme on the welcome only; the site
 *   theme changes when the visitor enters.
 */
(function () {
  "use strict";

  var TIMING = {
    contentFade: 160,                          // copy and tiles fade out
    contentEase: "cubic-bezier(.4, 0, 1, 1)",
    panelDelay: 110,                           // panels start while the fade finishes
    panelSlide: 650,                           // panels glide apart
    panelEase: "cubic-bezier(.5, 0, .16, 1)",
    artWait: 350                               // longest wait for the chosen artwork before opening anyway
  };
  var KEY = "haley-financial-portfolio-welcome";
  var root = document.documentElement;
  var completed = false;

  function isComplete() {
    try { return window.localStorage.getItem(KEY) === "done"; } catch (e) { return completed; }
  }
  function markComplete() {
    completed = true;
    try { window.localStorage.setItem(KEY, "done"); } catch (e) { /* storage unavailable: still enters */ }
  }

  var forced = /[?&]welcome(?:[=&]|$)/.test(window.location.search);
  var active = !!window.HMTheme && (forced || (!isComplete() && window.location.hash.length < 2));
  if (active) root.classList.add("welcome-open");

  function el(tag, cls, attrs) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function check() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "welcome-tile__check");
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M3.5 8.5l3 3 6-7");
    svg.appendChild(path);
    return svg;
  }
  function thumb(id) { return "assets/themes/thumbs/" + id + ".webp"; }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function frames(n) {
    return new Promise(function (resolve) {
      (function next() { if (n-- <= 0) resolve(); else requestAnimationFrame(next); })();
    });
  }

  function mount() {
    var welcome = document.getElementById("welcome");
    if (!welcome) return;
    if (!active) { welcome.parentNode.removeChild(welcome); return; }

    var tiles = welcome.querySelector("[data-welcome-tiles]");
    var previewHost = welcome.querySelector("[data-welcome-preview]");
    var content = welcome.querySelector(".welcome-content");
    var panels = welcome.querySelectorAll(".welcome-panel");
    var selected = window.HMTheme.get();
    var layers = {};
    var shown = null;
    var art = {};
    var leaving = false;

    window.HMTheme.themes.forEach(function (t) {
      var label = el("label", "welcome-tile");
      var input = el("input", "welcome-tile__input", { type: "radio", name: "welcome-theme", value: t.id });
      input.checked = t.id === selected;
      var frame = el("span", "welcome-tile__frame");
      var pic = el("span", "welcome-tile__art", { "data-theme": t.id });
      pic.appendChild(el("img", "", { src: thumb(t.id), alt: "", width: "480", height: "300", decoding: "async" }));
      var name = el("span", "welcome-tile__name");
      name.textContent = t.name;
      frame.appendChild(pic);
      frame.appendChild(name);
      label.appendChild(input);
      label.appendChild(frame);
      label.appendChild(check());
      tiles.appendChild(label);

      // One layer per theme: a late image only ever fills its own layer, so it
      // can never replace a newer preview.
      var layer = el("span", "welcome-preview__layer", { "data-theme": t.id });
      layer.style.backgroundImage = 'url("' + thumb(t.id) + '"), var(--theme-scene-bg)';
      previewHost.appendChild(layer);
      layers[t.id] = layer;
    });

    function preview(id) {
      if (id === shown || !layers[id]) return;
      if (shown) layers[shown].classList.remove("is-active");
      layers[id].classList.add("is-active");
      shown = id;
    }

    // Decode the chosen theme's hero artwork ahead of the reveal.
    function prepare(id) {
      if (art[id]) return art[id];
      var probe = el("span", "welcome-probe", { "data-theme": id });
      welcome.appendChild(probe);
      var match = /url\(["']?([^"')]+)["']?\)/.exec(window.getComputedStyle(probe).backgroundImage);
      welcome.removeChild(probe);
      if (!match) return (art[id] = Promise.resolve());
      var img = new Image();
      img.src = match[1];
      art[id] = (img.decode ? img.decode() : new Promise(function (resolve) { img.onload = img.onerror = resolve; }))
        .catch(function () { /* the palette fallback shows instead */ });
      return art[id];
    }

    // Hover previews for mouse and pen only; a tap selects instead.
    tiles.addEventListener("pointerover", function (e) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      var tile = e.target.closest && e.target.closest(".welcome-tile");
      if (tile) preview(tile.querySelector("input").value);
    });
    tiles.addEventListener("pointerleave", function () { preview(selected); });
    tiles.addEventListener("focusin", function (e) {
      if (e.target.matches && e.target.matches(":focus-visible")) preview(e.target.value);
    });
    tiles.addEventListener("focusout", function (e) {
      if (!tiles.contains(e.relatedTarget)) preview(selected);
    });
    tiles.addEventListener("change", function (e) {
      selected = e.target.value;
      preview(selected);
      prepare(selected);
    });

    function finish() {
      root.classList.remove("welcome-open");
      Array.prototype.forEach.call(document.querySelectorAll("[data-welcome-inert]"), function (node) {
        node.removeAttribute("inert");
        node.removeAttribute("data-welcome-inert");
      });
      if (welcome.parentNode) welcome.parentNode.removeChild(welcome);
      document.dispatchEvent(new CustomEvent("welcomeclose"));
      var heading = document.querySelector("#top h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }

    function enter(immediate) {
      if (leaving) return;
      leaving = true;
      markComplete();
      welcome.classList.add("is-leaving");
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (immediate || reduce || !content.animate) {
        window.HMTheme.set(selected, { transition: false });
        finish();
        return;
      }
      var start = performance.now();
      content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TIMING.contentFade, easing: TIMING.contentEase, fill: "forwards" });
      // Let the fade reach the screen in its own frame first: the theme change
      // repaints the whole page, and sharing a frame would hold the fade back.
      frames(2)
        .then(function () { return Promise.race([prepare(selected), wait(TIMING.artWait)]); })
        .then(function () {
          // Applied under the closed panels; the curtain is the only transition.
          window.HMTheme.set(selected, { transition: false });
          return frames(2);
        })
        .then(function () { return wait(Math.max(0, TIMING.panelDelay - (performance.now() - start))); })
        .then(function () {
          return Promise.all(Array.prototype.map.call(panels, function (panel, i) {
            return panel.animate(
              [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(" + (i ? "100%" : "-100%") + ", 0, 0)" }],
              { duration: TIMING.panelSlide, easing: TIMING.panelEase, fill: "forwards" }
            ).finished;
          }));
        })
        .then(finish, finish);
    }

    welcome.querySelector("[data-welcome-enter]").addEventListener("click", function () { enter(false); });
    welcome.querySelector("[data-welcome-skip]").addEventListener("click", function () { enter(true); });

    preview(selected);
    prepare(selected);
    welcome.focus({ preventScroll: true });

    function inertPage() {
      if (!welcome.parentNode) return;
      Array.prototype.forEach.call(document.body.children, function (node) {
        if (node === welcome || node.tagName === "SCRIPT") return;
        node.setAttribute("inert", "");
        node.setAttribute("data-welcome-inert", "");
      });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inertPage);
    else inertPage();
  }

  window.HMWelcome = { mount: mount };
})();
