/*
 * Selected work cards: each chart draws in when its card enters view, and on a
 * mouse the card leans a few degrees toward the cursor. Touch screens
 * and reduced motion get the finished charts with no tilt.
 */
(() => {
  "use strict";

  const TILT = { x: 3, y: 4 };   // maximum lean in degrees
  const cards = Array.from(document.querySelectorAll(".work-card"));
  if (!cards.length) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  cards.forEach((card) => {
    card.querySelectorAll("path[data-draw]").forEach((path) => {
      path.style.setProperty("--len", Math.ceil(path.getTotalLength()) + 1);
    });
    card.querySelectorAll(".viz-bars rect, .scatter-dots circle").forEach((node, i) => node.style.setProperty("--i", i));
  });

  if (reduce.matches || !("IntersectionObserver" in window)) {
    cards.forEach((card) => card.classList.add("is-drawn"));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-drawn");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.3 });
    cards.forEach((card) => observer.observe(card));
  }

  cards.forEach((card) => {
    const link = card.querySelector(".work-card__link");
    if (!link) return;
    link.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || reduce.matches) return;
      const box = link.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      link.style.setProperty("--tilt-y", (px * TILT.y).toFixed(2) + "deg");
      link.style.setProperty("--tilt-x", (-py * TILT.x).toFixed(2) + "deg");
    });
    link.addEventListener("pointerleave", () => {
      link.style.setProperty("--tilt-x", "0deg");
      link.style.setProperty("--tilt-y", "0deg");
    });
  });
})();
