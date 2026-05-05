/* PRADO Admin - ASCII hero
   Línea de vital signs (estilo ECG) que recorre el ancho con pulsos
   periódicos. Metáfora: el pulso de tu negocio. Coherente con la
   estética mono brackets del resto. */
(function () {
  const el = document.querySelector('[data-admin-ascii]');
  if (!el) return;

  let COLS = 0, ROWS = 0;
  let charW = 0, lineH = 0;
  let scanX = 0;          // posición actual del cursor de barrido (cols)
  const SCAN_SPEED = 30;  // cols/sec
  let beats = [];         // pulsos generados; cada uno es { x, y, age, profile }
  let nextBeatAt = 0;
  let now = 0;

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
    const w = el.clientWidth, h = el.clientHeight;
    COLS = Math.max(40, Math.floor(w / charW));
    ROWS = Math.max(20, Math.floor(h / lineH));
    scanX = 0;
    beats = [];
    nextBeatAt = now + 0.4;
  }

  // Perfil del pulso ECG: 8 cols. Cada col define cuánto se desvía la
  // línea base hacia arriba (positivo) o hacia abajo (negativo).
  const PULSE_PROFILE = [0, 0, -1, 3, -2, 1, 0, 0];

  function spawnBeat() {
    beats.push({ x: scanX, t: now, profile: PULSE_PROFILE });
  }

  function update(dt) {
    now += dt;
    scanX += SCAN_SPEED * dt;
    if (scanX >= COLS) {
      scanX = 0;
      beats = [];
      nextBeatAt = now + 0.4;
    }
    if (now >= nextBeatAt) {
      spawnBeat();
      // Cadencia: ~70 bpm = ~0.85s entre beats
      nextBeatAt = now + 0.75 + Math.random() * 0.25;
    }
  }

  function render() {
    const baseRow = Math.floor(ROWS * 0.46);
    // Buffer 2D
    const buf = new Array(ROWS);
    for (let j = 0; j < ROWS; j++) buf[j] = new Array(COLS).fill(' ');

    // Línea base (─ horizontal) detrás del cursor
    for (let i = 0; i < Math.min(scanX, COLS); i++) {
      // Verifica si este x está dentro de algún pulso activo
      let charY = baseRow;
      for (let k = 0; k < beats.length; k++) {
        const beat = beats[k];
        const dx = i - Math.floor(beat.x);
        if (dx >= 0 && dx < beat.profile.length) {
          const offset = beat.profile[dx];
          if (offset !== 0) {
            // Dibuja toda la transición vertical
            const from = baseRow;
            const to = baseRow - offset;
            const lo = Math.min(from, to), hi = Math.max(from, to);
            for (let y = lo; y <= hi; y++) {
              if (y >= 0 && y < ROWS) buf[y][i] = '|';
            }
            charY = to;
            // baseline char en la posición pulse
            if (charY >= 0 && charY < ROWS) buf[charY][i] = (offset > 0 ? '\\' : '/');
          }
        }
      }
      if (buf[baseRow][i] === ' ') buf[baseRow][i] = '_';
    }

    // Cursor de barrido (vertical bright line)
    const cursorX = Math.floor(scanX);
    if (cursorX >= 0 && cursorX < COLS) {
      for (let y = baseRow - 4; y <= baseRow + 4; y++) {
        if (y >= 0 && y < ROWS) buf[y][cursorX] = '|';
      }
    }

    // Glifos sutiles de fondo: marcas tipo grid cada N cols/rows
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        if (buf[j][i] === ' ' && i % 12 === 0 && j % 4 === 0) buf[j][i] = '·';
      }
    }

    let out = '';
    for (let j = 0; j < ROWS; j++) {
      out += buf[j].join('');
      if (j < ROWS - 1) out += '\n';
    }
    el.textContent = out;
  }

  let last = 0;
  function tick(t) {
    if (document.hidden) { requestAnimationFrame(tick); return; }
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  function start() {
    sizeGrid();
    lastW = el.clientWidth;
    render();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
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
