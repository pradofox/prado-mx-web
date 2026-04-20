/* ============================================================
   PRADO - scroll.js
   Theme (light/dark) + Lenis smooth scroll + cursor-follow
   ============================================================ */

// -- Theme system ------------------------------------------
(function initTheme() {
  const root = document.documentElement;
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  const setLabel = () => {
    const text = root.classList.contains('dark') ? 'Light' : 'Dark';
    document.querySelectorAll('[data-theme-label]').forEach((el) => { el.textContent = text; });
  };
  setLabel();

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = root.classList.contains('dark') ? 'light' : 'dark';
      root.classList.toggle('dark', next === 'dark');
      try { localStorage.setItem('prado-theme', next); } catch (e) {}
      setLabel();
    });
  });

  sysDark.addEventListener('change', (e) => {
    try { if (localStorage.getItem('prado-theme')) return; } catch (err) {}
    root.classList.toggle('dark', e.matches);
    setLabel();
  });
})();

// -- Mobile menu -------------------------------------------
(function initMenu() {
  const overlay = document.querySelector('[data-menu-overlay]');
  if (!overlay) return;
  const open = () => {
    document.body.classList.add('menu-open');
    overlay.setAttribute('aria-hidden', 'false');
    if (typeof lenis !== 'undefined') lenis.stop();
  };
  const close = () => {
    document.body.classList.remove('menu-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (typeof lenis !== 'undefined') lenis.start();
  };
  document.querySelectorAll('[data-menu-open]').forEach((b) => b.addEventListener('click', open));
  document.querySelectorAll('[data-menu-close]').forEach((b) => b.addEventListener('click', close));
  document.querySelectorAll('[data-menu-link]').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
})();

// -- Lenis smooth scroll -----------------------------------
const lenis = new Lenis({
  lerp: 0.1,
  smoothWheel: true,
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// -- Parallax hero ------------------------------------------
const heroImgs = document.querySelectorAll('[data-parallax]');
if (heroImgs.length) {
  const hero = document.querySelector('.hero');
  const heroH = hero ? hero.offsetHeight : window.innerHeight;
  lenis.on('scroll', (e) => {
    if (e.scroll > heroH * 1.2) return;
    heroImgs.forEach((img) => {
      const speed = parseFloat(img.dataset.parallax) || 0.2;
      img.style.transform = `translateY(${e.scroll * speed}px)`;
    });
  });
}

// -- Cursor-follow (desktop only) ---------------------------
const isDesktop = window.matchMedia('(hover: hover)').matches;
if (isDesktop) {
  const preview = document.createElement('div');
  preview.className = 'cursor-preview';
  document.body.appendChild(preview);

  let mouseX = 0, mouseY = 0, curX = 0, curY = 0;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function tick() {
    curX += (mouseX - curX) * 0.18;
    curY += (mouseY - curY) * 0.18;
    preview.style.transform = `translate(${curX}px, ${curY}px) translate(-50%, -50%)`;
    requestAnimationFrame(tick);
  }
  tick();

  const targets = document.querySelectorAll('[data-cursor]');
  targets.forEach((el) => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-active'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-active'));
  });
}

// -- Anchor links through Lenis -----------------------------
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length <= 1) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -40 });
  });
});
