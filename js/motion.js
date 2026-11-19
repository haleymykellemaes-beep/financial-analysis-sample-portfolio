/* Restrained hero and section arrival. Decorative motion only. */
(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) return;

  const gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);

  // Behind the welcome curtain the hero is already in place when the panels open.
  if (!document.documentElement.classList.contains("welcome-open")) {
    gsap.from(".hero-copy > *", {
      y: 18,
      duration: 1.05,
      stagger: 0.07,
      ease: "power3.out",
      clearProps: "transform"
    });
  }

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
})();
