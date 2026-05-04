/* SMAE - ASCII hero
   Tabla 4x4 de los 16 grupos del Sistema Mexicano de Alimentos Equivalentes,
   con un "scanner" que recorre celdas como si la herramienta calculara el plan.
   Coherente con el lenguaje mono/brackets del sitio. */
(function () {
  const el = document.querySelector('[data-smae-ascii]');
  if (!el) return;

  // Los 16 grupos en orden 4x4: row x col.
  const GRID = [
    [{a:'V', k:25},  {a:'F', k:60},  {a:'Cs',k:70},  {a:'Cg',k:115}],
    [{a:'Lg',k:120}, {a:'mB',k:40},  {a:'B', k:55},  {a:'M', k:75}],
    [{a:'A', k:100}, {a:'Ld',k:95},  {a:'Ls',k:110}, {a:'Le',k:150}],
    [{a:'as',k:45},  {a:'ap',k:70},  {a:'zs',k:40},  {a:'zc',k:85}],
  ];

  const ROWS_G = 4, COLS_G = 4;
  // Geometría de cada celda dentro de la tabla
  const CELL_W = 11; // chars
  const CELL_H = 4;  // lines

  let COLS = 0, ROWS = 0;
  let charW = 0, lineH = 0;
  let scanIdx = 0;       // celda actualmente "iluminada"
  let scanAge = 0;       // segundos en la celda actual
  const SCAN_DWELL = 0.45; // tiempo por celda

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
  }

  // Construye la pantalla como un grid char-por-char.
  // tableW = COLS_G * CELL_W + (COLS_G + 1) (bordes verticales)
  // tableH = ROWS_G * CELL_H + (ROWS_G + 1)
  function tableDims() {
    const w = COLS_G * CELL_W + (COLS_G + 1);
    const h = ROWS_G * CELL_H + (ROWS_G + 1);
    return { w, h };
  }

  function render() {
    const { w: tw, h: th } = tableDims();
    // Origen de la tabla centrada (un poco arriba para dejar espacio al wordmark)
    const ox = Math.floor((COLS - tw) / 2);
    const oy = Math.max(2, Math.floor((ROWS - th) * 0.42));

    // Buffer 2D
    const buf = new Array(ROWS);
    for (let j = 0; j < ROWS; j++) buf[j] = new Array(COLS).fill(' ');

    // Fondo: ruido sutil de glifos numéricos
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        // Densidad baja, solo algunos puntos como textura
        const seed = (i * 73856093) ^ (j * 19349663);
        const r = (Math.sin(seed) * 10000) % 1;
        if (Math.abs(r) > 0.96) buf[j][i] = '.';
      }
    }

    // Dibuja bordes de la tabla
    for (let r = 0; r <= ROWS_G; r++) {
      const y = oy + r * (CELL_H + 1);
      for (let c = 0; c < tw; c++) {
        if (inBounds(ox + c, y)) buf[y][ox + c] = '-';
      }
    }
    for (let c = 0; c <= COLS_G; c++) {
      const x = ox + c * (CELL_W + 1);
      for (let r = 0; r < th; r++) {
        const y = oy + r;
        if (inBounds(x, y)) {
          // Esquinas
          const isCornerRow = (r % (CELL_H + 1)) === 0;
          buf[y][x] = isCornerRow ? '+' : '|';
        }
      }
    }

    // Dibuja contenido de cada celda
    for (let r = 0; r < ROWS_G; r++) {
      for (let c = 0; c < COLS_G; c++) {
        const cell = GRID[r][c];
        const cx = ox + c * (CELL_W + 1) + 1;
        const cy = oy + r * (CELL_H + 1) + 1;
        const isScan = (scanIdx === r * COLS_G + c);
        // Línea 1: abreviación grande "[ Xx ]"
        const labelLine = `[ ${cell.a.padEnd(2, ' ')} ]`;
        const labelX = cx + Math.floor((CELL_W - labelLine.length) / 2);
        writeStr(buf, labelX, cy + 1, labelLine);
        // Línea 2: kcal
        const kStr = `${cell.k} kcal`;
        const kX = cx + Math.floor((CELL_W - kStr.length) / 2);
        writeStr(buf, kX, cy + 2, kStr);
        // Si está siendo "escaneada", rellenar bordes internos con #
        if (isScan) {
          // Highlight: rodear con # los bordes de la celda
          for (let i = 0; i < CELL_W; i++) {
            if (inBounds(cx + i, cy)) buf[cy][cx + i] = '#';
            if (inBounds(cx + i, cy + CELL_H - 1)) buf[cy + CELL_H - 1][cx + i] = '#';
          }
          for (let j = 0; j < CELL_H; j++) {
            if (inBounds(cx, cy + j)) buf[cy + j][cx] = '#';
            if (inBounds(cx + CELL_W - 1, cy + j)) buf[cy + j][cx + CELL_W - 1] = '#';
          }
        }
      }
    }

    // Output como string
    let out = '';
    for (let j = 0; j < ROWS; j++) {
      out += buf[j].join('');
      if (j < ROWS - 1) out += '\n';
    }
    el.textContent = out;

    function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
    function writeStr(b, x, y, s) {
      for (let i = 0; i < s.length; i++) {
        if (inBounds(x + i, y)) b[y][x + i] = s[i];
      }
    }
  }

  let last = 0;
  function tick(t) {
    if (document.hidden) { requestAnimationFrame(tick); return; }
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    scanAge += dt;
    if (scanAge >= SCAN_DWELL) {
      scanAge = 0;
      scanIdx = (scanIdx + 1) % (ROWS_G * COLS_G);
      render();
    }
    requestAnimationFrame(tick);
  }

  function start() {
    sizeGrid();
    lastW = el.clientWidth;
    render();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // grid estática
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
