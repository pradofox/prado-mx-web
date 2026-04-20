// Rotating ASCII globe for PRADO hero.
// Uses high-res earth texture from adamsky/globe (MIT). 300x75 equirectangular.
// Respects currentColor (theme-aware), prefers-reduced-motion, tab visibility.
(function () {
  const el = document.querySelector('[data-globe]');
  if (!el) return;

  let TEX = null;        // string[] of rows, each row is a char array
  let TEX_W = 0, TEX_H = 0;

  // Char -> density 0..1 (from adamsky/globe texture encoding).
  function charDensity(ch) {
    if (ch === '@') return 1.0;
    if (ch === 'g') return 0.7;
    if (ch === 'H') return 0.4;
    return 0; // '.' or anything else = water
  }

  // Sample texture at (lat, lon). lat in [-90, 90], lon in [-180, 180].
  // Bilinear so coastlines stay smooth as sphere rotates.
  function sampleDensity(lat, lon) {
    if (!TEX) return 0;
    const fy = ((90 - lat) / 180) * (TEX_H - 1);
    let fxRaw = ((lon + 180) / 360) * TEX_W;
    // wrap lon horizontally
    fxRaw = ((fxRaw % TEX_W) + TEX_W) % TEX_W;
    const r0 = Math.floor(fy);
    const c0 = Math.floor(fxRaw);
    const dy = fy - r0;
    const dx = fxRaw - c0;
    const r1 = r0 + 1 >= TEX_H ? TEX_H - 1 : r0 + 1;
    const c1 = (c0 + 1) % TEX_W;
    const rowA = TEX[r0], rowB = TEX[r1];
    const a = charDensity(rowA[c0]);
    const b = charDensity(rowA[c1]);
    const c = charDensity(rowB[c0]);
    const d = charDensity(rowB[c1]);
    const top = a * (1 - dx) + b * dx;
    const bot = c * (1 - dx) + d * dx;
    return top * (1 - dy) + bot * dy;
  }

  let COLS = 0, ROWS = 0, CX = 0, CY = 0, R = 0, ASPECT = 0.55;
  let charW = 0, lineH = 0;

  function measure() {
    // Multi-line probe: iOS Safari can return unitless "1" for line-height via
    // getComputedStyle, which breaks pixel-based grid calc. Measure directly.
    const probe = document.createElement('span');
    probe.style.cssText = 'visibility:hidden;position:absolute;left:-9999px;top:0;font:inherit;line-height:inherit;white-space:pre;display:inline-block;';
    probe.textContent = Array(10).fill('MMMMMMMMMM').join('\n');
    el.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    charW = rect.width / 10;
    lineH = rect.height / 10;
    el.removeChild(probe);
    // Safety floors: never let grid calc explode.
    if (!(charW > 1)) charW = 8;
    if (!(lineH > 1)) lineH = 12;
  }

  function sizeGrid() {
    measure();
    if (!charW || !lineH) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    COLS = Math.max(20, Math.floor(w / charW));
    ROWS = Math.max(12, Math.floor(h / lineH));
    ASPECT = charW / lineH;
    CX = (COLS - 1) / 2;
    CY = (ROWS - 1) / 2;
    const rX = CX * ASPECT;
    const rY = CY;
    R = Math.min(rX, rY);
  }

  function frame(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let out = '';
    for (let j = 0; j < ROWS; j++) {
      const y = (j - CY) / R;
      for (let i = 0; i < COLS; i++) {
        const x = ((i - CX) * ASPECT) / R;
        const r2 = x * x + y * y;
        if (r2 > 1) { out += ' '; continue; }
        const z = Math.sqrt(1 - r2);
        // pitch: rotate (y,z) around X axis
        const y1 = y * cp - z * sp;
        const z1 = y * sp + z * cp;
        // yaw: rotate (x,z) around Y axis
        const x2 = x * cy + z1 * sy;
        const z2 = -x * sy + z1 * cy;
        const yc = y1 > 1 ? 1 : y1 < -1 ? -1 : y1;
        const lat = -Math.asin(yc) * 57.2957795;
        const lon = Math.atan2(x2, z2) * 57.2957795;
        const d = sampleDensity(lat, lon);
        if (d > 0.75) out += '@';
        else if (d > 0.45) out += '#';
        else if (d > 0.15) out += '+';
        else out += '.';
      }
      if (j < ROWS - 1) out += '\n';
    }
    return out;
  }

  let yaw = -Math.PI / 2; // start centered on Americas
  const pitch = 0;

  let last = 0;
  let rafId = 0;
  const AUTO_SPEED = 0.28; // rad/sec
  const VEL_DECAY = 1.6;   // 1/sec — lower = longer, more luxurious tail

  // Drag state (horizontal only — vertical pan goes to page scroll)
  let dragging = false;
  let lastX = 0;
  let lastMoveT = 0;
  let velX = 0;      // smoothed angular velocity sampled during drag (rad/s)
  let yawVel = AUTO_SPEED; // current spin velocity, exponentially eased back to AUTO_SPEED

  function render() {
    el.textContent = frame(yaw, pitch);
  }

  function tick(t) {
    if (document.hidden) { rafId = requestAnimationFrame(tick); return; }
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    if (!dragging) {
      const k = 1 - Math.exp(-VEL_DECAY * dt);
      yawVel += (AUTO_SPEED - yawVel) * k;
      yaw += yawVel * dt;
      render();
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    sizeGrid();
    if (!R) return;
    render();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      last = 0;
      rafId = requestAnimationFrame(tick);
    }
    attachDrag();
  }

  function attachDrag() {
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onDown(e) {
    dragging = true;
    lastX = e.clientX;
    lastMoveT = performance.now();
    velX = 0;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(0.005, (now - lastMoveT) / 1000);
    lastMoveT = now;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const k = Math.PI / (R * 2);
    yaw += dx * k;
    const inst = (dx * k) / dt;
    velX = velX * 0.7 + inst * 0.3;
    render();
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    yawVel = velX;
    try { el.releasePointerCapture && el.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  async function init() {
    try {
      const res = await fetch('/assets/earth.txt');
      const txt = await res.text();
      const rows = txt.split('\n').filter(r => r.length > 0);
      TEX = rows;
      TEX_H = rows.length;
      TEX_W = rows[0].length;
    } catch (e) {
      return;
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start);
    } else {
      start();
    }
  }

  init();

  let resizeTO = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(() => { sizeGrid(); render(); }, 120);
  });
})();
