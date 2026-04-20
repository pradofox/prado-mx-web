/* PRADO Consulting - ASCII concentric ripples
   Sonar-like rings expanding from center; each ring ages out as it grows.
   Metaphor: criterio de sala propagándose. */
(function () {
  const el = document.querySelector('[data-consulting-ascii]');
  if (!el) return;

  let COLS = 0, ROWS = 0, CX = 0, CY = 0;
  let charW = 0, lineH = 0, ASPECT = 0.55;
  let ripples = [];

  function measure() {
    const probe = document.createElement('span');
    probe.style.cssText = 'visibility:hidden;position:absolute;left:-9999px;top:0;font:inherit;line-height:inherit;white-space:pre;display:inline-block;';
    probe.textContent = Array(10).fill('MMMMMMMMMM').join('\n');
    el.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    charW = rect.width / 10;
    lineH = rect.height / 10;
    el.removeChild(probe);
    if (!(charW > 1)) charW = 8;
    if (!(lineH > 1)) lineH = 12;
    ASPECT = charW / lineH;
  }

  function sizeGrid() {
    measure();
    const w = el.clientWidth, h = el.clientHeight;
    COLS = Math.max(20, Math.floor(w / charW));
    ROWS = Math.max(12, Math.floor(h / lineH));
    // Center the rings roughly over the middle; shift slightly right so the
    // wordmark at bottom-left has breathing room.
    CX = COLS * 0.58;
    CY = ROWS * 0.48;
    // ensure at least one ripple right away so the hero never starts empty
    if (ripples.length === 0) ripples.push({ r: 1, age: 0, speed: 8 });
  }

  function spawn() {
    ripples.push({
      r: 0.5,
      age: 0,
      speed: 6 + Math.random() * 4, // cells/sec
    });
  }

  function update(dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += rp.speed * dt;
      rp.age += dt;
      const maxR = Math.hypot(Math.max(CX, COLS - CX) / ASPECT, Math.max(CY, ROWS - CY));
      if (rp.r > maxR + 4) ripples.splice(i, 1);
    }
  }

  // Pick glyph based on how close the cell is to a ripple edge.
  // Thin band = bright; slightly outside or inside = dim.
  function glyphFor(dist, radius) {
    const diff = Math.abs(dist - radius);
    if (diff < 0.35) return '@';
    if (diff < 0.85) return '#';
    if (diff < 1.6) return '+';
    if (diff < 2.6) return '.';
    return null;
  }

  function render() {
    let out = '';
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const dx = (i - CX) * ASPECT;
        const dy = (j - CY);
        const dist = Math.hypot(dx, dy);
        let best = null, bestDiff = 999;
        for (let k = 0; k < ripples.length; k++) {
          const rp = ripples[k];
          const d = Math.abs(dist - rp.r);
          if (d < bestDiff) { bestDiff = d; best = rp; }
        }
        if (best) {
          const g = glyphFor(dist, best.r);
          out += g || ' ';
        } else {
          out += ' ';
        }
      }
      if (j < ROWS - 1) out += '\n';
    }
    el.textContent = out;
  }

  let last = 0;
  let sinceSpawn = 0;
  const SPAWN_EVERY = 1.4; // seconds between ripples

  function tick(t) {
    if (document.hidden) { requestAnimationFrame(tick); return; }
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    sinceSpawn += dt;
    if (sinceSpawn >= SPAWN_EVERY) { spawn(); sinceSpawn -= SPAWN_EVERY; }
    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  function start() {
    sizeGrid();
    lastW = el.clientWidth;
    // seed with a few staggered rings so the first frame already has depth
    ripples = [
      { r: 2, age: 0, speed: 7 },
      { r: 9, age: 0, speed: 8 },
      { r: 18, age: 0, speed: 7.5 },
    ];
    render();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // leave frozen initial pattern
    last = 0;
    requestAnimationFrame(tick);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else start();

  let rto = 0;
  let lastW = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rto);
    rto = setTimeout(() => {
      const w = el.clientWidth;
      if (w !== lastW) {
        lastW = w;
        sizeGrid();
        render();
      }
    }, 180);
  });
})();
