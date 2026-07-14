/* Marcas - ASCII equalizer
   Barras verticales subiendo y bajando como ecualizador de audio:
   señal, alcance, medios. Cada barra anima su altura con ruido suave
   (dos senoides desfasadas por columna). Chars del vocabulario del
   sitio: @ en la cresta, # cuerpo, + base, · grid de fondo.
   Monocromo via currentColor; respeta reduced-motion y tab oculta. */
(function () {
  const el = document.querySelector('[data-marcas-ascii]');
  if (!el) return;

  let COLS = 0, ROWS = 0;
  let charW = 0, lineH = 0;
  let bars = [];   // por columna de barra: { c, phase, speed, phase2, speed2 }

  const BAR_EVERY = 3;  // una barra cada N columnas (aire entre barras)

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
  }

  function sizeGrid() {
    measure();
    COLS = Math.max(30, Math.floor(el.clientWidth / charW));
    ROWS = Math.max(16, Math.floor(el.clientHeight / lineH));
    bars = [];
    for (let c = 1; c < COLS - 1; c += BAR_EVERY) {
      bars.push({
        c,
        phase: (c * 0.7) % (Math.PI * 2),
        speed: 0.5 + ((c * 7919) % 100) / 160,   // 0.5 - 1.12 rad/s, determinista
        phase2: (c * 1.3) % (Math.PI * 2),
        speed2: 0.17 + ((c * 104729) % 100) / 400,
      });
    }
  }

  let t = 0;

  function render() {
    // Altura de cada barra en filas (0 .. ROWS-2), suave.
    const heights = new Array(COLS).fill(-1);
    for (const b of bars) {
      const n = 0.5
        + 0.32 * Math.sin(b.phase + t * b.speed)
        + 0.18 * Math.sin(b.phase2 + t * b.speed2 * 3.1);
      const h = Math.max(1, Math.round(n * (ROWS - 3)));
      heights[b.c] = h;
    }

    let out = '';
    for (let r = 0; r < ROWS; r++) {
      const fromBottom = ROWS - 1 - r;
      for (let c = 0; c < COLS; c++) {
        const h = heights[c];
        if (h < 0) {
          // columna sin barra: grid ralo
          out += (r % 4 === 0 && c % 6 === 3) ? '·' : ' ';
          continue;
        }
        if (fromBottom === 0) { out += '+'; continue; }        // base
        if (fromBottom < h) { out += '#'; continue; }          // cuerpo
        if (fromBottom === h) { out += '@'; continue; }        // cresta
        out += ' ';
      }
      if (r < ROWS - 1) out += '\n';
    }
    el.textContent = out;
  }

  let last = 0;
  function tick(now) {
    if (document.hidden) { requestAnimationFrame(tick); return; }
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    render();
    requestAnimationFrame(tick);
  }

  function start() {
    sizeGrid();
    lastW = el.clientWidth;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { t = 2.4; render(); return; }
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
      if (w !== lastW) { lastW = w; sizeGrid(); render(); }
    }, 180);
  });
})();
