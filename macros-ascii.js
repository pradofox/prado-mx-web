/* Macros Monterrey - ASCII digital rain
   Nutrition-themed cascading characters (kcal, P/C/F, %, numbers, =, :).
   Monochrome via currentColor; respects reduced motion + tab visibility. */
(function () {
  const el = document.querySelector('[data-macros-ascii]');
  if (!el) return;

  const POOL = '0123456789PCFg%=:+kcal'.split('');
  function randChar() { return POOL[(Math.random() * POOL.length) | 0]; }

  let COLS = 0, ROWS = 0;
  let charW = 0, lineH = 0;
  let drops = [];
  let buffer = [];

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
    COLS = Math.max(12, Math.floor(w / charW));
    ROWS = Math.max(10, Math.floor(h / lineH));
    buffer = new Array(ROWS);
    for (let r = 0; r < ROWS; r++) buffer[r] = new Array(COLS).fill(null);
    drops = new Array(COLS);
    for (let c = 0; c < COLS; c++) drops[c] = newDrop(true);
  }

  function newDrop(spread) {
    return {
      y: spread ? -Math.random() * ROWS * 1.5 : -Math.random() * 4,
      speed: 6 + Math.random() * 14,   // rows/sec
      lastRow: -1,
      active: Math.random() > 0.25      // some columns idle
    };
  }

  function update(dt) {
    for (let c = 0; c < COLS; c++) {
      const d = drops[c];
      if (!d.active) continue;
      d.y += d.speed * dt;
      const row = Math.floor(d.y);
      if (row !== d.lastRow && row >= 0 && row < ROWS) {
        buffer[row][c] = { ch: randChar(), age: 0 };
        d.lastRow = row;
      }
      if (d.y > ROWS + 4) drops[c] = newDrop(false);
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (buffer[r][c]) buffer[r][c].age += dt;
      }
    }
    // occasional flicker: flip an active head to a new random char
    if (Math.random() < 0.3) {
      const c = (Math.random() * COLS) | 0;
      const r = drops[c].lastRow;
      if (r >= 0 && r < ROWS && buffer[r][c]) buffer[r][c].ch = randChar();
    }
  }

  function render() {
    let out = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = buffer[r][c];
        if (!cell) { out += ' '; continue; }
        const a = cell.age;
        if (a < 0.25) out += cell.ch;
        else if (a < 0.8) out += '#';
        else if (a < 1.6) out += '+';
        else if (a < 2.4) out += '.';
        else { buffer[r][c] = null; out += ' '; }
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
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      for (let i = 0; i < 6; i++) update(0.05);
      render();
      return;
    }
    last = 0;
    requestAnimationFrame(tick);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else start();

  let rto = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rto);
    rto = setTimeout(() => { sizeGrid(); render(); }, 120);
  });
})();
