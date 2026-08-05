// Scroll journey, nav state, card tilt and hero type-in.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- nav ---------- */
const nav = document.querySelector('.nav');
const navToggle = document.querySelector('.nav-toggle');
const navLinks = [...document.querySelectorAll('.nav-links a')];

navToggle?.addEventListener('click', () => nav.classList.toggle('open'));
navLinks.forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));

addEventListener('scroll', () => {
  nav.classList.toggle('tucked', scrollY > 40);
}, { passive: true });

/* ---------- reveal on scroll ---------- */
const revealables = document.querySelectorAll('.reveal, .milestone');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
revealables.forEach(el => revealObserver.observe(el));

/* ---------- active section in nav ---------- */
const sections = [...document.querySelectorAll('section[id]')];
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(link => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
    });
  });
}, { threshold: 0.4 });
sections.forEach(section => sectionObserver.observe(section));

/* ---------- timeline progress ---------- */
const timeline = document.querySelector('.timeline');
if (timeline) {
  const updateTimeline = () => {
    const rect = timeline.getBoundingClientRect();
    const travelled = innerHeight * 0.65 - rect.top;
    const progress = Math.max(0, Math.min(1, travelled / rect.height));
    timeline.style.setProperty('--progress', `${progress * 100}%`);
  };
  addEventListener('scroll', updateTimeline, { passive: true });
  addEventListener('resize', updateTimeline);
  updateTimeline();
}

/* ---------- project card tilt + spotlight ---------- */
if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('.project').forEach(card => {
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
      card.style.transform =
        `perspective(900px) rotateX(${(0.5 - py) * 6}deg) rotateY(${(px - 0.5) * 8}deg) translateY(-4px)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

/* ---------- hero parallax ---------- */
const hero = document.querySelector('.hero');
if (hero && !reduceMotion) {
  let ticking = false;
  const parallax = () => {
    ticking = false;
    const shift = Math.min(scrollY, innerHeight) * 0.28;
    hero.style.setProperty('--parallax', `${shift}px`);
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(parallax);
  }, { passive: true });
  parallax();
}

/* ---------- playground: loaded only when asked for ---------- */
const stage = document.getElementById('stage');
const launch = document.getElementById('launch-play');
const closeStage = document.getElementById('close-play');

launch?.addEventListener('click', () => {
  if (stage.querySelector('iframe')) return;
  const frame = document.createElement('iframe');
  frame.src = 'play/';
  frame.title = 'The Build World — interactive 3D playground';
  frame.allow = 'autoplay; fullscreen';
  frame.loading = 'lazy';
  stage.appendChild(frame);
  stage.classList.add('is-live');
  closeStage.hidden = false;
  stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  // keyboard driving only works once the canvas owns focus
  frame.addEventListener('load', () => frame.contentWindow?.focus());
});

closeStage?.addEventListener('click', () => {
  stage.querySelector('iframe')?.remove();
  stage.classList.remove('is-live');
  closeStage.hidden = true;
});

/* ---------- hero entrance ---------- */
requestAnimationFrame(() => document.body.classList.add('is-ready'));
