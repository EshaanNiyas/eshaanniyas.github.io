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
    const groupSelectors = [".project", ".honor", ".beyond-item", ".tl"];
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

  /* ---- Photo galleries (lightbox) ---- */
  const galleries = window.GALLERIES || {};
  const lb = document.getElementById("lightbox");
  if (lb) {
    const lbImg = document.getElementById("lbImg");
    const lbTitle = document.getElementById("lbTitle");
    const lbCount = document.getElementById("lbCount");
    const lbDesc = document.getElementById("lbDesc");
    const btnClose = document.getElementById("lbClose");
    const btnPrev = document.getElementById("lbPrev");
    const btnNext = document.getElementById("lbNext");

    let current = [];
    let index = 0;
    let lastFocus = null;

    const render = () => {
      const src = current[index];
      if (!src) return;
      lbImg.src = src;
      lbCount.textContent = current.length > 1 ? index + 1 + " / " + current.length : "";
      const single = current.length < 2;
      btnPrev.hidden = single;
      btnNext.hidden = single;
    };

    const open = (slug) => {
      const g = galleries[slug];
      if (!g) return;
      current = g.images || [];
      index = 0;
      lbTitle.textContent = g.label || "";
      lbImg.alt = g.label || "Photo";
      lbDesc.textContent = g.desc || "";
      lbDesc.hidden = !g.desc;
      const hasImages = current.length > 0;
      lbImg.hidden = !hasImages;
      if (hasImages) {
        render();
      } else {
        lbCount.textContent = "";
        btnPrev.hidden = true;
        btnNext.hidden = true;
        lbImg.removeAttribute("src");
      }
      lb.classList.toggle("lb-textonly", !hasImages);
      lastFocus = document.activeElement;
      lb.hidden = false;
      document.body.classList.add("lb-open");
      btnClose.focus();
    };

    const close = () => {
      lb.hidden = true;
      document.body.classList.remove("lb-open");
      lbImg.removeAttribute("src");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    const step = (dir) => {
      if (current.length < 2) return;
      index = (index + dir + current.length) % current.length;
      render();
    };

    // Mark clickable items and bind
    Object.keys(galleries).forEach((slug) => {
      const g = galleries[slug];
      if ((!g.images || !g.images.length) && !g.desc) return;
      const hasImages = g.images && g.images.length;
      document.querySelectorAll('[data-gallery="' + slug + '"]').forEach((el) => {
        el.classList.add("has-gallery");
        if (!hasImages) el.classList.add("gallery-text");
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "button");
        el.setAttribute(
          "aria-label",
          (hasImages ? "View photos of " : "View details of ") + (g.label || slug)
        );
        el.addEventListener("click", () => open(slug));
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open(slug);
          }
        });
      });
    });

    btnClose.addEventListener("click", close);
    btnPrev.addEventListener("click", () => step(-1));
    btnNext.addEventListener("click", () => step(1));
    lb.addEventListener("click", (e) => {
      if (e.target === lb) close();
    });
    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });
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
