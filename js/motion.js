/* Restrained hero parallax and section arrival. Decorative motion only. */
(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) return;

  const gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);

  const icons = document.querySelector(".icon-column");
  const cards = document.querySelector(".hero-widgets");
  const hero = document.querySelector(".hero");
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const depth = mobile ? 0.45 : 1;

  gsap.from(".hero-copy > *", {
    y: 18,
    duration: 1.05,
    stagger: 0.07,
    ease: "power3.out",
    clearProps: "transform"
  });

  const sections = gsap.utils.toArray(".intro-grid, .section-head, .feature, .cap, .tile, .about-grid");
  sections.forEach((section) => {
    gsap.from(section, {
      y: 26,
      duration: 0.85,
      ease: "power2.out",
      clearProps: "transform",
      scrollTrigger: {
        trigger: section,
        start: "top 88%",
        once: true
      }
    });
  });

  let progress = 0;
  let pointerX = 0;
  let pointerY = 0;
  let currentX = 0;
  let currentY = 0;

  if (hero) {
    window.ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: 0.4,
      onUpdate: (self) => {
        progress = self.progress;
      }
    });

    if (finePointer && !mobile) {
      hero.addEventListener("pointermove", (event) => {
        const bounds = hero.getBoundingClientRect();
        pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
        pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;
      }, { passive: true });
      hero.addEventListener("pointerleave", () => {
        pointerX = 0;
        pointerY = 0;
      });
    }
  }

  gsap.ticker.add(() => {
    currentX += (pointerX - currentX) * 0.06;
    currentY += (pointerY - currentY) * 0.06;
    const scroll = progress * depth;
    if (icons) {
      icons.style.transform = "translate3d(" + (currentX * 10) + "px," + (currentY * -12) + "px,0)";
    }
    if (cards) {
      cards.style.transform = "translate3d(" + (currentX * -8) + "px," + (scroll * 16 + currentY * 6) + "px,0)";
    }
  });
})();
