/* ============================================================
   PRADO — scroll.js
   Lenis smooth scroll + cursor-follow + light-mode trigger
   ============================================================ */

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

// -- Light-mode trigger via scroll --------------------------
const lightTrigger = document.querySelector('[data-light-trigger]');
if (lightTrigger) {
  const trigger = () =>
    lightTrigger.offsetTop + lightTrigger.offsetHeight - window.innerHeight / 2;
  lenis.on('scroll', (e) => {
    document.body.classList.toggle('light', e.scroll > trigger());
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
