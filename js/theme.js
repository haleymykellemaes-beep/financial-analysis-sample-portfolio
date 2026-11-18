/*
 * Theme manager for every page. Load it in <head>, before the stylesheets
 * paint, so the saved theme applies from the first frame:
 *   <script src="js/theme.js"></script>
 *
 * - Six themes (colours and effects live in css/themes.css).
 * - New visitors get Haley's Choice; a choice is saved in localStorage and
 *   applies on every page, and in other open tabs.
 * - Builds the theme picker inside the navigation: into an element with
 *   [data-theme-picker] if the page has one, otherwise at the end of .nav-inner.
 * - Switching crossfades the page with the View Transitions API where the
 *   browser supports it and the visitor hasn't asked for reduced motion.
 * - Fires a "themechange" event on document (detail: { theme }) so canvases
 *   such as the hero chart can redraw in the new colours.
 *
 * API: window.HMTheme = { themes, get(), set(id) }.
 */
(function () {
  "use strict";

  var THEMES = [
    { id: "classic", name: "Classic", meta: "#382a23" },
    { id: "haleys-choice", name: "Haley’s Choice", meta: "#a6bfe8" },
    { id: "mile-high", name: "Mile High", meta: "#fbfaff" },
    { id: "liquidity", name: "Liquidity", meta: "#c3e1fc" },
    { id: "flow", name: "Flow", meta: "#d4ebe3" },
    { id: "surge", name: "Surge", meta: "#fdfbff" },
  ];
  var DEFAULT = "haleys-choice";
  var KEY = "hm-theme";
  var root = document.documentElement;

  function find(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }
  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(id) {
    try { window.localStorage.setItem(KEY, id); } catch (e) { /* private mode: still applies */ }
  }
  function current() {
    return root.getAttribute("data-theme") || DEFAULT;
  }

  function setMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.meta);
  }

  function apply(id) {
    var theme = find(id) || find(DEFAULT);
    root.setAttribute("data-theme", theme.id);
    setMeta(theme);
    syncPickers();
    var event;
    try { event = new CustomEvent("themechange", { detail: { theme: theme.id } }); }
    catch (e) { event = document.createEvent("CustomEvent"); event.initCustomEvent("themechange", false, false, { theme: theme.id }); }
    document.dispatchEvent(event);
  }

  function set(id) {
    if (!find(id) || id === current()) { save(id); return; }
    save(id);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduce) {
      document.startViewTransition(function () { apply(id); });
    } else {
      apply(id);
    }
  }

  // Before first paint: apply the saved theme, or the default.
  root.setAttribute("data-theme", find(stored()) ? stored() : DEFAULT);

  // Another tab changed the theme.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY && find(e.newValue) && e.newValue !== current()) apply(e.newValue);
  });

  /* ----- Picker ----- */

  var pickers = [];
  var uid = 0;

  function el(tag, cls, attrs) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function swatch(id) {
    var s = el("span", "theme-swatch", { "data-theme": id, "aria-hidden": "true" });
    for (var i = 0; i < 4; i++) s.appendChild(document.createElement("i"));
    return s;
  }
  function svg(path, cls) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 16 16");
    s.setAttribute("aria-hidden", "true");
    if (cls) s.setAttribute("class", cls);
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    s.appendChild(p);
    return s;
  }

  function build(host) {
    var n = ++uid;
    var listId = "theme-picker-list-" + n;
    host.classList.add("theme-picker");

    var button = el("button", "theme-picker__button", {
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": listId,
    });
    var buttonSwatch = swatch(current());
    var label = el("span", "theme-picker__label");
    button.appendChild(buttonSwatch);
    button.appendChild(label);
    button.appendChild(svg("M4 6l4 4 4-4"));

    var list = el("ul", "theme-picker__list", { id: listId, role: "listbox", "aria-label": "Theme", tabindex: "-1" });
    list.hidden = true;
    var title = el("li", "theme-picker__title", { role: "presentation" });
    title.textContent = "Theme";
    list.appendChild(title);
    var options = THEMES.map(function (t) {
      var li = el("li", "theme-picker__option", { role: "option", id: listId + "-" + t.id, "data-value": t.id, tabindex: "-1" });
      var name = el("span");
      name.textContent = t.name;
      li.appendChild(swatch(t.id));
      li.appendChild(name);
      li.appendChild(svg("M3 8.5l3.2 3L13 4.5", "theme-picker__check"));
      list.appendChild(li);
      return li;
    });

    host.appendChild(button);
    host.appendChild(list);

    function isOpen() { return !list.hidden; }
    function focusOption(i) {
      var k = (i + options.length) % options.length;
      options[k].focus();
    }
    function selectedIndex() {
      for (var i = 0; i < options.length; i++) if (options[i].getAttribute("data-value") === current()) return i;
      return 0;
    }
    function open() {
      if (isOpen()) return;
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
      focusOption(selectedIndex());
      document.addEventListener("pointerdown", onOutside, true);
    }
    function close(returnFocus) {
      if (!isOpen()) return;
      list.hidden = true;
      button.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onOutside, true);
      if (returnFocus) button.focus();
    }
    function choose(li) {
      set(li.getAttribute("data-value"));
      close(true);
    }
    function onOutside(e) {
      if (!host.contains(e.target)) close(false);
    }

    button.addEventListener("click", function () { isOpen() ? close(false) : open(); });
    button.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest ? e.target.closest(".theme-picker__option") : null;
      if (li) choose(li);
    });
    list.addEventListener("keydown", function (e) {
      var i = options.indexOf(document.activeElement);
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); focusOption(i + 1); break;
        case "ArrowUp": e.preventDefault(); focusOption(i - 1); break;
        case "Home": e.preventDefault(); focusOption(0); break;
        case "End": e.preventDefault(); focusOption(options.length - 1); break;
        case "Enter": case " ": e.preventDefault(); if (i >= 0) choose(options[i]); break;
        case "Escape": e.preventDefault(); close(true); break;
        case "Tab": close(false); break;
      }
    });

    var picker = {
      sync: function () {
        var t = find(current());
        label.textContent = t.name;
        button.setAttribute("aria-label", "Theme: " + t.name);
        buttonSwatch.setAttribute("data-theme", t.id);
        options.forEach(function (li) {
          li.setAttribute("aria-selected", li.getAttribute("data-value") === t.id ? "true" : "false");
        });
      },
    };
    picker.sync();
    pickers.push(picker);
  }

  function syncPickers() {
    pickers.forEach(function (p) { p.sync(); });
  }

  function init() {
    setMeta(find(current()));
    var hosts = document.querySelectorAll("[data-theme-picker]");
    if (!hosts.length) {
      var nav = document.querySelector(".nav-inner");
      if (!nav) return;
      var host = el("div", "", { "data-theme-picker": "" });
      nav.appendChild(host);
      hosts = [host];
    }
    Array.prototype.forEach.call(hosts, build);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.HMTheme = {
    themes: THEMES.map(function (t) { return { id: t.id, name: t.name }; }),
    get: current,
    set: set,
  };
})();
