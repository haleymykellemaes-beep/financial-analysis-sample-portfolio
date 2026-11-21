/*
 * Ribbon Signal Network: opening sequence, ribbon drift and scroll motion.
 * Forked from js/home.js so the live homepage is untouched; the easing
 * vocabulary (sine for silk, power3/expo for type) and the knobs are the same.
 *
 * Opening order:
 *   1. ivory paper and ribbons appear      2. ribbons unfold apart
 *   3. pathways draw in                    4. the six nodes light in sequence
 *   5. portrait and type finish their entrance
 *
 * Plays once per browser session ("hm-rsn-intro"; add ?intro to replay).
 * Skipped for reduced motion or a link straight to a section.
 */
(() => {
  "use strict";

  const TIMING = {
    paper: 0, paperDuration: 0.9,
    silk: 0.05, silkFade: 0.8, silkDuration: 2.3,
    flows: 0.45, flowDuration: 1.5,
    edges: 0.65, edgeDuration: 1.2, edgeStagger: 0.1,
    dotted: 1.2,
    nodes: 1.3, nodeStagger: 0.1,
    portrait: 1.45, portraitDuration: 1.45,
    eyebrow: 1.5, name: 1.6, sub: 1.85, rest: 2.05, nav: 2.15, strip: 2.2
  };
  const SCROLL = { copy: -90, net: -50, silkTop: -48, silkRight: -34, silkLow: 20, organza: -26, figure: -34, env: 24 };

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
  const silk = {
    top: q('[data-silk="top"]'),
    low: q('[data-silk="low"]'),
    right: q('[data-silk="right"]'),
    organza: q('[data-silk="organza"]')
  };
  const seam = document.querySelector("[data-seam]");

  /* ----- Navigation turns to glass once the page moves ----- */
  const onScroll = () => nav && nav.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const finishIntro = () => {
    window.clearTimeout(window.__introFallback);
    root.classList.remove("intro-pending");
  };

  if (!gsap || reduce.matches) {
    finishIntro();
    return;
  }
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ----- Opening sequence ----- */
  function playIntro(signal) {
    window.clearTimeout(window.__introFallback);
    try { window.sessionStorage.setItem("hm-rsn-intro", "played"); } catch (e) { /* storage blocked */ }

    const artwork = (node) => node && node.firstElementChild;
    const depth = q('[data-layer="depth"]');
    const desk = q('[data-layer="desk"]');
    const portrait = q(".hero-figure__img");
    const reveals = hero.querySelectorAll("[data-reveal]");
    const lines = hero.querySelectorAll("[data-reveal-line]");
    const stripItems = hero.querySelectorAll(".rsn-strip__label, .rsn-strip__item");
    const seamImg = seam && seam.querySelector("img");
    const parts = signal && signal.parts;
    const nodes = signal ? signal.nodes || [] : [];
    const constellation = !stacked.matches;
    const drawn = parts ? [...parts.flows, ...parts.edges, ...parts.halos] : [];

    gsap.set([depth, desk, portrait, ...reveals, nav, seamImg, ...stripItems].filter(Boolean), { opacity: 0 });
    gsap.set(artwork(silk.top), { opacity: 0, xPercent: -4, yPercent: 26, rotation: 3.5, scale: 1.05, transformOrigin: "0% 0%" });
    gsap.set(artwork(silk.low), { opacity: 0, xPercent: -6, yPercent: -20, rotation: -3, scale: 1.04, transformOrigin: "0% 100%" });
    gsap.set(artwork(silk.right), { opacity: 0, xPercent: 14, yPercent: -9, rotation: -4, transformOrigin: "100% 0%" });
    gsap.set(artwork(silk.organza), { opacity: 0, scaleX: 0.94, transformOrigin: "0% 60%" });
    gsap.set(portrait, { y: 26 });
    gsap.set(lines, { y: 0, yPercent: 105 });
    gsap.set(reveals, { y: 14 });
    gsap.set(stripItems, { y: 10 });
    if (seamImg) gsap.set(seamImg, { xPercent: -8 });
    if (parts && constellation) {
      gsap.set(drawn, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set([...parts.dotted, parts.glints, parts.ticks], { opacity: 0 });
    }
    if (nodes.length) {
      gsap.set(nodes, { opacity: 0 });
      gsap.set(nodes.map((n) => n.querySelector(".rsn-node__dot")), { scale: 0.3 });
    }
    root.classList.remove("intro-pending");

    const silkEase = "sine.inOut";
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        gsap.set([...reveals, ...lines, portrait, nav, depth, desk, seamImg, ...stripItems].filter(Boolean), { clearProps: "transform,opacity" });
        if (nodes.length) {
          gsap.set(nodes, { clearProps: "opacity" });
          gsap.set(nodes.map((n) => n.querySelector(".rsn-node__dot")), { clearProps: "transform" });
        }
        if (parts) {
          gsap.set(drawn, { clearProps: "strokeDasharray,strokeDashoffset" });
          gsap.set([...parts.dotted, parts.glints, parts.ticks], { clearProps: "opacity" });
        }
        drift();
      }
    });

    // 1. Paper and ribbons appear.
    tl.to(depth, { opacity: 1, duration: TIMING.paperDuration, ease: "sine.out" }, TIMING.paper)
      .to(desk, { opacity: 1, duration: TIMING.paperDuration, ease: "sine.out" }, TIMING.paper + 0.3)
      .to(artwork(silk.top), { opacity: 1, duration: TIMING.silkFade, ease: "sine.out" }, TIMING.silk)
      .to(artwork(silk.low), { opacity: 1, duration: TIMING.silkFade, ease: "sine.out" }, TIMING.silk + 0.08)
      .to(artwork(silk.right), { opacity: 1, duration: TIMING.silkFade + 0.2, ease: "sine.out" }, TIMING.silk + 0.25)
      .to(artwork(silk.organza), { opacity: 1, duration: TIMING.silkFade + 0.4, ease: "sine.out" }, TIMING.silk + 0.15)
      // 2. They unfold apart.
      .to(artwork(silk.top), { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, duration: TIMING.silkDuration, ease: silkEase }, TIMING.silk)
      .to(artwork(silk.low), { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, duration: TIMING.silkDuration + 0.25, ease: silkEase }, TIMING.silk + 0.05)
      .to(artwork(silk.right), { xPercent: 0, yPercent: 0, rotation: 0, duration: TIMING.silkDuration - 0.2, ease: silkEase }, TIMING.silk + 0.25)
      .to(artwork(silk.organza), { scaleX: 1, duration: TIMING.silkDuration, ease: silkEase }, TIMING.silk + 0.15);

    // 3. Pathways draw in, currents first.
    if (parts && constellation) {
      tl.to(parts.flows, { strokeDashoffset: 0, duration: TIMING.flowDuration, stagger: 0.12, ease: "power2.inOut" }, TIMING.flows)
        .to(parts.edges, { strokeDashoffset: 0, duration: TIMING.edgeDuration, stagger: TIMING.edgeStagger, ease: "power2.inOut" }, TIMING.edges)
        .to(parts.halos, { strokeDashoffset: 0, duration: TIMING.edgeDuration, stagger: TIMING.edgeStagger, ease: "power2.inOut" }, TIMING.edges)
        .to(parts.dotted, { opacity: 1, duration: 0.8, stagger: 0.1, ease: "sine.out" }, TIMING.dotted)
        .to([parts.glints, parts.ticks], { opacity: 1, duration: 0.9, ease: "sine.out" }, TIMING.dotted + 0.4);
    }

    // 4. The six nodes light in sequence.
    if (nodes.length) {
      const at = constellation ? TIMING.nodes : TIMING.rest + 0.2;
      tl.to(nodes, { opacity: 1, duration: 0.5, stagger: TIMING.nodeStagger, ease: "sine.out" }, at)
        .to(nodes.map((n) => n.querySelector(".rsn-node__dot")), { scale: 1, duration: 0.6, stagger: TIMING.nodeStagger }, at);
    }

    // 5. Portrait and type finish.
    tl.to(portrait, { opacity: 1, y: 0, duration: TIMING.portraitDuration, ease: "power2.out" }, TIMING.portrait)
      .to(q(".hero-eyebrow"), { opacity: 1, y: 0, duration: 0.8 }, TIMING.eyebrow)
      .to(hero.querySelectorAll(".hero-name [data-reveal-line]"), { yPercent: 0, duration: 1.05, ease: "expo.out" }, TIMING.name)
      .to(hero.querySelectorAll(".hero-sub [data-reveal-line]"), { yPercent: 0, duration: 0.95, stagger: 0.12, ease: "expo.out" }, TIMING.sub)
      .to(hero.querySelectorAll(".hero-description, .hero-actions"), { opacity: 1, y: 0, duration: 0.85, stagger: 0.1 }, TIMING.rest)
      .to(nav, { opacity: 1, duration: 0.8, ease: "sine.out" }, TIMING.nav)
      .to(stripItems, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: "power2.out" }, TIMING.strip);
    if (seamImg) tl.to(seamImg, { opacity: 1, xPercent: 0, duration: 1.6, ease: silkEase }, TIMING.strip);
    return tl;
  }

  /* ----- After the opening: a slow breath in the silk (paused off-screen) ----- */
  const idle = [];
  function drift() {
    if (idle.length) return;
    [
      [silk.top, 7, 3, 0.45, 1.024, 17],
      [silk.low, -6, -3, -0.35, 0.98, 19],
      [silk.right, -5, 5, 0.6, 1.025, 16],
      [silk.organza, 10, -2, -0.25, 1.03, 21]
    ].forEach(([node, x, y, rotation, scaleY, duration]) => {
      const layer = node && node.firstElementChild;
      if (!layer) return;
      idle.push(gsap.to(layer, { x, y, rotation, scaleY, duration, ease: "sine.inOut", repeat: -1, yoyo: true }));
    });
    if (ScrollTrigger) {
      ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom top", onToggle: (self) => idle.forEach((t) => (self.isActive ? t.resume() : t.pause())) });
    }
  }

  // A little pointer parallax in the silk; the network itself stays still.
  const movers = [[silk.top, 14], [silk.right, -10], [silk.low, 8]].filter(([n]) => n).map(([node, range]) => ({ to: gsap.quickTo(node, "x", { duration: 1.6, ease: "power3" }), range }));
  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || stacked.matches) return;
    const t = event.clientX / window.innerWidth - 0.5;
    movers.forEach((m) => m.to(t * m.range));
  });

  /* ----- Scroll (as js/home.js) ----- */
  function scrollMotion() {
    if (!ScrollTrigger) return;
    const mm = gsap.matchMedia();
    mm.add("(width > 900px) and (aspect-ratio > 4/5)", () => {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.8 } })
        .to(content, { y: SCROLL.copy, opacity: 0.2, ease: "none" }, 0)
        .to([q("[data-rsn-lines]"), q("[data-rsn]")], { y: SCROLL.net, opacity: 0.25, ease: "none" }, 0)
        .to(silk.top, { y: SCROLL.silkTop, rotation: -2.5, ease: "none" }, 0)
        .to(silk.right, { y: SCROLL.silkRight, rotation: 2, ease: "none" }, 0)
        .to(silk.low, { y: SCROLL.silkLow, rotation: 0.8, ease: "none" }, 0)
        .to(silk.organza, { y: SCROLL.organza, ease: "none" }, 0)
        .to(q("[data-figure]"), { y: SCROLL.figure, ease: "none" }, 0)
        .to(q(".hero-env"), { y: SCROLL.env, ease: "none" }, 0);
    });
    mm.add(stacked.media, () => {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.6 } })
        .to(silk.top, { y: -26, ease: "none" }, 0)
        .to(silk.organza, { y: -15, ease: "none" }, 0);
    });

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

    // The inner link rises, not the card, so scroll targets on the card stay where they land.
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

  const signalOrNull = Promise.race([signalReady, wait(900).then(() => null)]).catch(() => null);
  Promise.all([signalOrNull, Promise.race([portraitReady, wait(900)])]).then(([signal]) => {
    if (wantsIntro) playIntro(signal);
    else { finishIntro(); drift(); }
    scrollMotion();
  });
})();
