/*
 * Homepage motion: the opening sequence, scroll transitions, and section arrivals.
 *
 * - The opening plays once per browser session (sessionStorage "hm-intro") and
 *   is skipped for reduced motion or a link straight to a section. Until it
 *   starts, css/home.css hides the layers it reveals (html.intro-pending).
 * - The opening animates each layer's inner element and scrolling animates its
 *   wrapper, so the two never fight over one transform.
 * - TIMING (opening, in seconds) and SCROLL (distances) are the knobs to tune.
 */
(() => {
  "use strict";

  const TIMING = {
    silk: 0, silkDuration: 2.4,        // ribbons part: top drifts up, lower unfolds down
    depth: 0.1, depthDuration: 1.5,
    backdrop: 0.5, line: 0.75, lineDuration: 1.45,
    points: 1.6, pointStagger: 0.13,   // data points light in sequence
    portrait: 0.85, portraitDuration: 1.3,
    name: 1.0, sub: 1.25, rest: 1.5, nav: 1.7,
    seam: 1.4
  };
  const SCROLL = {
    copy: -90, chart: -50, silkTop: -48, silkRight: -34, silkLow: 20, silkBridge: -26, figure: -34, env: 24
  };

  const root = document.documentElement;
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stacked = window.matchMedia("(max-width: 900px), (max-aspect-ratio: 4/5)");
  const nav = document.querySelector(".nav");
  const q = (selector) => hero.querySelector(selector);
  const content = q("[data-hero-content]");
  const signalNav = q("[data-signal-nav]");
  const silk = {
    top: q('[data-silk="top"]'),
    low: q('[data-silk="low"]'),
    right: q('[data-silk="right"]'),
    bridge: q('[data-silk="bridge"]')
  };
  const seam = document.querySelector("[data-seam]");

  /* ----- Stacked layout: the portrait stage starts below the copy ----- */
  function placeStage() {
    if (!stacked.matches) {
      hero.style.removeProperty("--copy-h");
      hero.style.removeProperty("--stage-top");
      hero.style.removeProperty("--content-h");
      return;
    }
    const actions = content.querySelector(".hero-actions") || content;
    const copyBottom = Math.round(actions.getBoundingClientRect().bottom - hero.getBoundingClientRect().top + 30);
    const signalHeight = signalNav ? signalNav.offsetHeight + 22 : 0;
    hero.style.setProperty("--copy-h", copyBottom + "px");
    hero.style.setProperty("--stage-top", copyBottom + signalHeight + "px");
    hero.style.setProperty("--content-h", content.offsetHeight + "px");
  }
  placeStage();
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(placeStage);
    ro.observe(content);
    if (signalNav) ro.observe(signalNav);
  }
  stacked.addEventListener("change", placeStage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeStage);

  /* ----- Navigation turns to glass once the page moves ----- */
  const onScroll = () => nav && nav.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const finishIntro = () => {
    window.clearTimeout(window.__introFallback);
    root.classList.remove("intro-pending");
    if (signalNav) signalNav.classList.add("is-placed");
  };

  if (!gsap || reduce.matches) {
    finishIntro();
    return;
  }
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ----- Opening sequence ----- */
  function playIntro(signal) {
    window.clearTimeout(window.__introFallback);
    try { window.sessionStorage.setItem("hm-intro", "played"); } catch (e) { /* storage blocked */ }

    const artwork = (node) => node && node.firstElementChild;
    const depth = q('[data-layer="depth"]');
    const desk = q('[data-layer="desk"]');
    const portrait = q(".hero-figure__img");
    const reveals = hero.querySelectorAll("[data-reveal]");
    const lines = hero.querySelectorAll("[data-reveal-line]");
    const seamImg = seam && seam.querySelector("img");
    const parts = signal && signal.parts;
    const points = signal ? signal.points : [];

    // Hidden states move inline first, then the CSS cover comes off without a flash.
    gsap.set([depth, desk, portrait, ...reveals, nav, seamImg].filter(Boolean), { opacity: 0 });
    gsap.set(artwork(silk.top), { opacity: 0, xPercent: -5, yPercent: 30, rotation: 4, scale: 1.06, transformOrigin: "0% 0%" });
    gsap.set(artwork(silk.low), { opacity: 0, xPercent: -7, yPercent: -24, rotation: -3, scale: 1.04, transformOrigin: "0% 100%" });
    gsap.set(artwork(silk.right), { opacity: 0, xPercent: 16, yPercent: -10, rotation: -4, transformOrigin: "100% 0%" });
    gsap.set(artwork(silk.bridge), { opacity: 0 });
    gsap.set(portrait, { y: 26 });
    gsap.set(lines, { y: 0, yPercent: 105 });
    gsap.set(reveals, { y: 14 });
    if (seamImg) gsap.set(seamImg, { xPercent: -8 });
    if (parts) {
      gsap.set(parts.backdrop, { opacity: 0 });
      gsap.set([parts.line, parts.halo], { strokeDasharray: 1, strokeDashoffset: 1 });
    }
    if (points.length) gsap.set(points, { opacity: 0 });
    root.classList.remove("intro-pending");
    if (signalNav) signalNav.classList.add("is-placed");

    const silkEase = "sine.inOut";
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        gsap.set([...reveals, ...lines, portrait, nav, depth, desk, seamImg].filter(Boolean), { clearProps: "transform,opacity" });
        if (points.length) gsap.set(points, { clearProps: "opacity" });
        if (parts) gsap.set([parts.line, parts.halo], { clearProps: "strokeDasharray,strokeDashoffset" });
        drift();
      }
    });

    tl.to(artwork(silk.top), { opacity: 1, duration: 0.7, ease: "sine.out" }, TIMING.silk)
      .to(artwork(silk.low), { opacity: 1, duration: 0.7, ease: "sine.out" }, TIMING.silk + 0.08)
      .to(artwork(silk.right), { opacity: 1, duration: 0.9, ease: "sine.out" }, TIMING.silk + 0.3)
      .to(artwork(silk.bridge), { opacity: 1, duration: 1.15, ease: "sine.out" }, TIMING.silk + 0.2)
      .to(artwork(silk.top), { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, duration: TIMING.silkDuration, ease: silkEase }, TIMING.silk)
      .to(artwork(silk.low), { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, duration: TIMING.silkDuration + 0.25, ease: silkEase }, TIMING.silk + 0.05)
      .to(artwork(silk.right), { xPercent: 0, yPercent: 0, rotation: 0, duration: TIMING.silkDuration - 0.2, ease: silkEase }, TIMING.silk + 0.3)
      .to(depth, { opacity: 1, duration: TIMING.depthDuration, ease: "sine.out" }, TIMING.depth)
      .to(desk, { opacity: 1, duration: TIMING.depthDuration, ease: "sine.out" }, TIMING.depth + 0.25);

    if (parts) {
      tl.to(parts.backdrop, { opacity: 1, duration: 1, ease: "sine.out" }, TIMING.backdrop)
        .to([parts.halo, parts.line], { strokeDashoffset: 0, duration: TIMING.lineDuration, ease: "power2.inOut" }, TIMING.line);
    }
    if (points.length) {
      tl.to(points, { opacity: 1, duration: 0.5, stagger: TIMING.pointStagger, ease: "sine.out" }, TIMING.points)
        .fromTo(points.map((p) => p.querySelector(".signal-point__dot")), { scale: 2.4 }, { scale: 1, duration: 0.7, stagger: TIMING.pointStagger, clearProps: "transform" }, TIMING.points);
    }

    tl.to(portrait, { opacity: 1, y: 0, duration: TIMING.portraitDuration, ease: "power2.out" }, TIMING.portrait)
      .to(hero.querySelector(".hero-eyebrow"), { opacity: 1, y: 0, duration: 0.8 }, TIMING.name - 0.15)
      .to(hero.querySelectorAll(".hero-name [data-reveal-line]"), { yPercent: 0, duration: 1.05, ease: "expo.out" }, TIMING.name)
      .to(hero.querySelectorAll(".hero-sub [data-reveal-line]"), { yPercent: 0, duration: 0.95, stagger: 0.12, ease: "expo.out" }, TIMING.sub)
      .to(hero.querySelectorAll(".hero-description, .hero-actions"), { opacity: 1, y: 0, duration: 0.85, stagger: 0.1 }, TIMING.rest)
      .to(nav, { opacity: 1, duration: 0.8, ease: "sine.out" }, TIMING.nav);
    if (seamImg) tl.to(seamImg, { opacity: 1, xPercent: 0, duration: 1.6, ease: silkEase }, TIMING.seam);
    return tl;
  }

  /* ----- After the opening: a slow breath in the silk, and a little pointer drift ----- */
  const idle = [];
  function drift() {
    if (idle.length) return;
    [
      [silk.top, 7, 3, 0.45, 1.024, 17],
      [silk.low, -6, -3, -0.35, 0.98, 19],
      [silk.right, -5, 5, 0.6, 1.025, 16],
      [silk.bridge, 8, 0, -0.35, 1.035, 21]
    ].forEach(([node, x, y, rotation, scaleY, duration]) => {
      const layer = node && node.firstElementChild;
      if (!layer) return;
      idle.push(gsap.to(layer, { x, y, rotation, scaleY, opacity: 0.9, duration, ease: "sine.inOut", repeat: -1, yoyo: true }));
    });
    if (ScrollTrigger) {
      ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom top", onToggle: (self) => idle.forEach((t) => (self.isActive ? t.resume() : t.pause())) });
    }
  }

  if (!reduce.matches) {
    const movers = [[silk.top, 14], [silk.right, -10], [silk.low, 8]].filter(([n]) => n).map(([node, range]) => ({ to: gsap.quickTo(node, "x", { duration: 1.6, ease: "power3" }), range }));
    hero.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || stacked.matches) return;
      const t = event.clientX / window.innerWidth - 0.5;
      movers.forEach((m) => m.to(t * m.range));
    });
  }

  /* ----- Scroll ----- */
  function scrollMotion() {
    if (!ScrollTrigger) return;
    const mm = gsap.matchMedia();
    mm.add("(width > 900px) and (aspect-ratio > 4/5)", () => {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.8 } })
        .to(content, { y: SCROLL.copy, opacity: 0.2, ease: "none" }, 0)
        .to([q("[data-signal]"), signalNav], { y: SCROLL.chart, opacity: 0.25, ease: "none" }, 0)
        .to(silk.top, { y: SCROLL.silkTop, rotation: -2.5, ease: "none" }, 0)
        .to(silk.right, { y: SCROLL.silkRight, rotation: 2, ease: "none" }, 0)
        .to(silk.low, { y: SCROLL.silkLow, rotation: 0.8, ease: "none" }, 0)
        .to(silk.bridge, { y: SCROLL.silkBridge, ease: "none" }, 0)
        .to(q("[data-figure]"), { y: SCROLL.figure, ease: "none" }, 0)
        .to(q(".hero-env"), { y: SCROLL.env, ease: "none" }, 0);
    });
    mm.add(stacked.media, () => {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 } })
        .to(silk.top, { y: -26, ease: "none" }, 0)
        .to(silk.bridge, { y: -15, ease: "none" }, 0)
        .to(q("[data-figure]"), { y: -30, ease: "none" }, 0);
    });

    // The foreground ribbon unfurls toward the edge and opens the gallery.
    if (seam) {
      gsap.to(seam, {
        xPercent: 5, yPercent: -16, rotation: -1.2, scaleY: 1.08, opacity: 0.38, ease: "none",
        scrollTrigger: { trigger: "#work", start: "top bottom", end: "top 18%", scrub: 1 }
      });
    }

    const thread = document.querySelector("[data-thread] path");
    if (thread) {
      gsap.fromTo(thread, { strokeDasharray: 1, strokeDashoffset: 1 }, {
        strokeDashoffset: 0, ease: "none",
        scrollTrigger: { trigger: "#work", start: "top 85%", end: "top 5%", scrub: 0.6 }
      });
      thread.setAttribute("pathLength", "1");
    }

    const bloom = document.querySelector("[data-bloom]");
    if (bloom) gsap.fromTo(bloom, { y: 60, rotation: -4 }, { y: -40, rotation: 3, ease: "none", scrollTrigger: { trigger: "#work", start: "top bottom", end: "bottom top", scrub: 1 } });

    const head = document.querySelector(".work-head");
    if (head) {
      gsap.timeline({ scrollTrigger: { trigger: head, start: "top 82%", once: true } })
        .from(head.querySelectorAll("[data-head-line]"), { yPercent: 105, duration: 1.1, ease: "expo.out" }, 0.05)
        .from(head.querySelectorAll("[data-head-reveal]"), { y: 18, opacity: 0, duration: 0.9, stagger: 0.12, ease: "power3.out", clearProps: "transform,opacity" }, 0);
    }

    // The inner link rises, not the card, so scroll targets on the card stay where they will land.
    const cards = gsap.utils.toArray(".work-card");
    const inner = (card) => card.querySelector(".work-card__link") || card;
    gsap.set(cards.map(inner), { y: 48, opacity: 0 });
    ScrollTrigger.batch(cards, {
      start: "top 90%",
      once: true,
      onEnter: (batch) => gsap.to(batch.map(inner), { y: 0, opacity: 1, duration: 1.05, stagger: 0.12, ease: "power3.out", clearProps: "transform,opacity" })
    });

    gsap.utils.toArray(".intro-grid, .capabilities .eyebrow, .capabilities h2, .cap, .about-grid").forEach((section) => {
      gsap.from(section, { y: 26, opacity: 0, duration: 0.9, ease: "power2.out", clearProps: "transform,opacity", scrollTrigger: { trigger: section, start: "top 88%", once: true } });
    });
  }

  const wantsIntro = root.classList.contains("intro-pending");
  const signalReady = window.HMSignal ? window.HMSignal.ready.catch(() => null) : Promise.resolve(null);
  const portraitImg = q(".hero-figure__img");
  const portraitReady = portraitImg && portraitImg.decode ? portraitImg.decode().catch(() => null) : Promise.resolve();
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  // Start once the chart and portrait are ready, or after a short wait, whichever comes first.
  const signalOrNull = Promise.race([signalReady, wait(900).then(() => null)]).catch(() => null);
  Promise.all([signalOrNull, Promise.race([portraitReady, wait(900)])]).then(([signal]) => {
    if (wantsIntro) playIntro(signal);
    else { finishIntro(); drift(); }
    scrollMotion();
  });
})();
