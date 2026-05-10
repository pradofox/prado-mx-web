/* PRADO Plan - ASCII hero
   Concepto: barras de macros (P/C/F) que crecen y bajan rítmicamente,
   como dialing-in de un plan. Coherente con el lenguaje mono/brackets. */
(function () {
  const el = document.querySelector('[data-app-ascii]');
  if (!el) return;

  let COLS = 0, ROWS = 0, charW = 0, lineH = 0;
  let t = 0;
  const BARS = [
    { label: 'KCAL', phase: 0,    target: 0.62, freq: 0.45 },
    { label: 'P',    phase: 1.2,  target: 0.45, freq: 0.55 },
    { label: 'C',    phase: 2.4,  target: 0.78, freq: 0.40 },
    { label: 'F',    phase: 3.6,  target: 0.35, freq: 0.50 },
    { label: 'V',    phase: 4.8,  target: 0.50, freq: 0.60 },
    { label: 'F2',   phase: 6.0,  target: 0.55, freq: 0.42 },
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
    ROWS = Math.max(24, Math.floor(h / lineH));
  }

  function render() {
    const buf = new Array(ROWS);
    for (let j = 0; j < ROWS; j++) buf[j] = new Array(COLS).fill(' ');

    // Background noise sutil
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        if (i % 8 === 0 && j % 3 === 0) buf[j][i] = '·';
      }
    }

    // Barras horizontales que pulsan
    const baseRow = Math.floor(ROWS * 0.4);
    const barCount = BARS.length;
    const barSpacing = Math.max(2, Math.floor((ROWS - baseRow) / (barCount + 1)));
    const maxLen = Math.min(COLS - 16, Math.floor(COLS * 0.6));

    BARS.forEach((bar, idx) => {
      const row = baseRow + idx * barSpacing;
      if (row >= ROWS - 2) return;
      // Length oscilante alrededor del target
      const wave = Math.sin(t * bar.freq + bar.phase) * 0.12;
      const len = Math.max(2, Math.floor((bar.target + wave) * maxLen));
      // Label
      const labelStr = `[ ${bar.label.padEnd(4, ' ')} ]`;
      for (let i = 0; i < labelStr.length && i < COLS; i++) {
        if (row < ROWS) buf[row][2 + i] = labelStr[i];
      }
      // Bar
      const barStart = 2 + labelStr.length + 2;
      for (let i = 0; i < len; i++) {
        const x = barStart + i;
        if (x >= COLS - 2) break;
        const tip = i === len - 1;
        const near = i >= len - 3;
        buf[row][x] = tip ? '>' : (near ? '#' : '=');
      }
    });

    // Líneas guía verticales sutiles (tipo grid)
    const guideEvery = 12;
    for (let i = 8; i < COLS - 2; i += guideEvery) {
      for (let j = baseRow - 1; j < Math.min(baseRow + barCount * barSpacing + 1, ROWS); j++) {
        if (buf[j][i] === ' ') buf[j][i] = '.';
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
      if (w !== lastW) { lastW = w; sizeGrid(); render(); }
    }, 180);
  });
})();
