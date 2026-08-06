(function () {
  "use strict";

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ---- Footer year ---- */
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---- Nav background on scroll ---- */
  const nav = document.getElementById("nav");
  const onScrollNav = () => {
    if (!nav) return;
    nav.classList.toggle("scrolled", window.scrollY > 40);
  };
  onScrollNav();
  window.addEventListener("scroll", onScrollNav, { passive: true });

  /* ---- Reveal on scroll ---- */
  const revealEls = Array.from(document.querySelectorAll(".reveal"));

  if (prefersReduced || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  } else {
    // Stagger items that belong to the same group.
    const groupSelectors = [".project", ".honor", ".tl"];
    groupSelectors.forEach((sel) => {
      document.querySelectorAll(sel + ".reveal").forEach((el, i) => {
        el.style.setProperty("--d", Math.min(i * 0.07, 0.42) + "s");
      });
    });

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---- Subtle hero parallax ---- */
  const parallax = document.getElementById("heroParallax");
  if (parallax && !prefersReduced) {
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      if (y < window.innerHeight) {
        parallax.style.transform = "translate3d(0," + y * 0.18 + "px,0)";
      }
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
  }
})();
