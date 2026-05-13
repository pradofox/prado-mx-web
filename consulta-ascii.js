/* Consulta Nutricional - ASCII bioimpedance scan
   Multi-track pulse waveforms representing biometric readouts:
   tres bandas horizontales con pulsos tipo EKG que recorren la
   pantalla a velocidades distintas. Fondo de puntos ralos como
   grid de medición. Monocromo via currentColor. */
(function () {
  const el = document.querySelector('[data-consulta-ascii]');
  if (!el) return;

  let COLS = 0, ROWS = 0;
  let charW = 0, lineH = 0;
  let buffer = [];        // ROWS x COLS grid de chars
  let tracks = [];        // arreglo de pulse-tracks

  // Cada track es una banda horizontal con un pulso que recorre.
  // baselineRow: fila central. pulsePos: x actual del pulso.
  // pulseSpeed: cols/sec. patternIdx: cuál de los patrones EKG.
  // El patrón se dibuja en celdas relativas a pulsePos.
  const PULSE_PATTERNS = [
    // patrón clásico: pequeño bump + spike grande + bump pequeño
    [
      { x: 0,  ch: '_' }, { x: 1,  ch: '_' }, { x: 2,  ch: '/' }, { x: 3,  ch: '\\' },
      { x: 4,  ch: '_' }, { x: 5,  ch: '_' }, { x: 6,  ch: '/' }, { x: 7,  ch: '|' },
      { x: 8,  ch: '\\' }, { x: 9,  ch: '_' }, { x: 10, ch: '_' }, { x: 11, ch: '/' },
      { x: 12, ch: '\\' }, { x: 13, ch: '_' }, { x: 14, ch: '_' },
    ],
    // patrón breve: solo un spike
    [
      { x: 0, ch: '_' }, { x: 1, ch: '_' }, { x: 2, ch: '/' }, { x: 3, ch: '\\' },
      { x: 4, ch: '_' }, { x: 5, ch: '_' }, { x: 6, ch: '_' },
    ],
    // patrón onda suave (respiración)
    [
      { x: 0, ch: '_' }, { x: 1, ch: '/' }, { x: 2, ch: '~' }, { x: 3, ch: '~' },
      { x: 4, ch: '\\' }, { x: 5, ch: '_' }, { x: 6, ch: '_' }, { x: 7, ch: '_' },
    ],
  ];

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

    buffer = new Array(ROWS);
    for (let r = 0; r < ROWS; r++) buffer[r] = new Array(COLS).fill(null);

    // 3 tracks distribuidas verticalmente (no en bordes, no encimadas
    // con el wordmark del centro inferior).
    const trackPositions = [
      Math.floor(ROWS * 0.20),
      Math.floor(ROWS * 0.38),
      Math.floor(ROWS * 0.56),
    ];
    tracks = trackPositions.map((row, i) => ({
      row,
      x: -10 - i * 18,           // arranque escalonado
      speed: 12 + i * 4,         // cols/sec
      pattern: i % PULSE_PATTERNS.length,
      gap: 30 + i * 12,          // espacio entre pulsos
      sincePulse: 0,
    }));

    // Pinta el grid de fondo (puntos ralos) una sola vez
    paintGrid();
  }

  function paintGrid() {
    // Limpia y dibuja puntos cada 4 cols, alternando filas
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r % 4 === 0 && c % 6 === 0) buffer[r][c] = { ch: '·', age: 0, kind: 'grid' };
        else buffer[r][c] = null;
      }
    }
  }

  function drawPulseAt(track) {
    const pat = PULSE_PATTERNS[track.pattern];
    const r = track.row;
    if (r < 0 || r >= ROWS) return;
    const startX = Math.floor(track.x);
    for (let i = 0; i < pat.length; i++) {
      const c = startX + pat[i].x;
      if (c < 0 || c >= COLS) continue;
      // Para spikes verticales también dibujamos en r-1 y r+1 cuando aplique
      const ch = pat[i].ch;
      buffer[r][c] = { ch, age: 0, kind: 'pulse' };
      if (ch === '/' && r - 1 >= 0) buffer[r - 1][c] = { ch: '/', age: 0, kind: 'pulse' };
      if (ch === '\\' && r - 1 >= 0) buffer[r - 1][c] = { ch: '\\', age: 0, kind: 'pulse' };
      if (ch === '|' && r - 1 >= 0) buffer[r - 1][c] = { ch: '|', age: 0, kind: 'pulse' };
    }
  }

  function decay(dt) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = buffer[r][c];
        if (!cell) continue;
        if (cell.kind === 'grid') continue;
        cell.age += dt;
      }
    }
  }

  function update(dt) {
    decay(dt);
    // Restaura grid en cualquier celda que decayó por completo
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = buffer[r][c];
        if (cell && cell.kind === 'pulse' && cell.age > 1.6) {
          if (r % 4 === 0 && c % 6 === 0) buffer[r][c] = { ch: '·', age: 0, kind: 'grid' };
          else buffer[r][c] = null;
        }
      }
    }
    // Avanza tracks
    for (const t of tracks) {
      t.x += t.speed * dt;
      t.sincePulse += dt;
      // Dibuja el pulso en su posición actual
      drawPulseAt(t);
      // Cuando sale por la derecha, reinicia
      if (t.x > COLS + 5) t.x = -10;
    }
  }

  function render() {
    let out = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = buffer[r][c];
        if (!cell) { out += ' '; continue; }
        if (cell.kind === 'pulse') {
          const a = cell.age;
          if (a < 0.6) out += cell.ch;
          else if (a < 1.2) out += '_';
          else out += '·';
        } else {
          out += cell.ch;
        }
      }
      if (r < ROWS - 1) out += '\n';
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
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // Frame estático: avanza un poco los tracks para que haya pulsos visibles
      for (let i = 0; i < 30; i++) update(0.05);
      render();
      return;
    }
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
