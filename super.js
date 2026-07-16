/* El súper de PRADO — plano explorable.
   No hay scroll: el catálogo vive en un plano grande que se panea
   arrastrando, con la misma física de inercia del globo del home
   (velocidad muestreada + decay exponencial).

   Cada card se materializa con un reveal ASCII-datamosh: la foto se
   convierte en glifos mono (@ # + .), con slices horizontales corridas
   que se van asentando hasta resolver en la imagen real. Mismo alfabeto
   que el globo, la lluvia de /macros y el pulso de /consulta. */
(function () {
  const stage = document.querySelector('[data-super-stage]');
  const plane = document.querySelector('[data-super-plane]');
  if (!stage || !plane) return;

  const API = '/api/app/super';
  const CELL_W = 230, CELL_H = 270;
  const CARD_W = 170, CARD_H = 200;
  const COLS = 12, ROWS = 10;
  const PLANE_W = COLS * CELL_W, PLANE_H = ROWS * CELL_H;
  // Hueco central reservado para el bloque de título.
  const HOLE_W = 780, HOLE_H = 460;

  const CATS = [
    ['todos', 'Todo'],
    ['cereales', 'Cereales'],
    ['proteinas', 'Proteínas'],
    ['grasas', 'Aceites y grasas'],
    ['lacteos', 'Lácteos'],
    ['libres', 'Libres'],
    ['suplementos', 'Suplementos'],
    ['oxxo', 'Oxxo y 7-Eleven'],
    ['material', 'Material'],
  ];

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hash determinista → jitter estable entre filtros y recargas.
  function hash(n) {
    let x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---------- Layout: grid con hueco al centro -------------------------
  function buildSlots() {
    const slots = [];
    const cx = PLANE_W / 2, cy = PLANE_H / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL_W + (CELL_W - CARD_W) / 2;
        const y = r * CELL_H + (CELL_H - CARD_H) / 2;
        // ¿la celda pisa el hueco central?
        const overlapsHole =
          x + CARD_W > cx - HOLE_W / 2 && x < cx + HOLE_W / 2 &&
          y + CARD_H > cy - HOLE_H / 2 && y < cy + HOLE_H / 2;
        if (overlapsHole) continue;
        const i = r * COLS + c;
        slots.push({
          x: x + (hash(i) - 0.5) * 46,
          y: y + (hash(i + 99) - 0.5) * 52,
          d: Math.hypot(x - cx, y - cy),
        });
      }
    }
    // Los primeros productos caen cerca del centro: lo primero que ves.
    slots.sort((a, b) => a.d - b.d);
    return slots;
  }

  // ---------- Reveal ASCII-datamosh ------------------------------------
  const RAMP = ' .+#@';
  const AW = 15, AH = 18;   // resolución del mosaico en caracteres

  // Los packshots son producto sobre blanco (o con alfa). Mapear luminancia
  // directo deja el ASCII casi vacío: un producto claro sobre blanco casi no
  // genera glifos. Por eso separamos fondo (alfa baja o casi-blanco = espacio)
  // y dentro del producto normalizamos el contraste, de modo que su silueta
  // siempre se lee como mosaico denso.
  function asciiFrom(img) {
    const cv = document.createElement('canvas');
    cv.width = AW; cv.height = AH;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, AW, AH);
    try { ctx.drawImage(img, 0, 0, AW, AH); } catch (e) { return null; }
    let data;
    try { data = ctx.getImageData(0, 0, AW, AH).data; } catch (e) { return null; }

    const lum = new Array(AW * AH);
    const isBg = new Array(AW * AH);
    let lo = 1, hi = 0;
    for (let i = 0; i < AW * AH; i++) {
      const p = i * 4;
      const a = data[p + 3] / 255;
      const L = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
      const bg = a < 0.35 || L > 0.93;
      lum[i] = L; isBg[i] = bg;
      if (!bg) { if (L < lo) lo = L; if (L > hi) hi = L; }
    }
    const span = Math.max(0.08, hi - lo);

    const rows = [];
    for (let y = 0; y < AH; y++) {
      let line = '';
      for (let x = 0; x < AW; x++) {
        const i = y * AW + x;
        if (isBg[i]) { line += ' '; continue; }
        const n = 1 - (lum[i] - lo) / span;   // 0..1 dentro del producto
        line += RAMP[1 + Math.round(n * (RAMP.length - 2))];  // nunca espacio
      }
      rows.push(line);
    }
    return rows;
  }

  function shiftRow(s, n) {
    if (!n) return s;
    const k = ((n % s.length) + s.length) % s.length;
    return s.slice(k) + s.slice(0, k);
  }

  function coarsen(rows, t) {
    // t 0→1: al inicio solo 2 niveles (bloques), al final la rampa completa.
    const levels = Math.max(2, Math.round(2 + t * (RAMP.length - 2)));
    if (levels >= RAMP.length) return rows;
    return rows.map(line => line.split('').map(ch => {
      const idx = RAMP.indexOf(ch);
      if (idx <= 0) return ch;
      const q = Math.round((idx / (RAMP.length - 1)) * (levels - 1)) / (levels - 1);
      return RAMP[Math.round(q * (RAMP.length - 1))];
    }).join(''));
  }

  // Cards esperando a que la pestaña sea visible (rAF no corre en background).
  const pending = new Set();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    pending.forEach(fn => fn());
    pending.clear();
  });

  function revealCard(card) {
    if (card.dataset.revealed) return;
    card.dataset.revealed = '1';
    const img = card.querySelector('img');
    const pre = card.querySelector('pre');
    if (!img || !pre) return;

    const run = () => {
      const base = asciiFrom(img);
      if (!base || reduced) { card.classList.add('is-resolved'); return; }
      // rAF no dispara si la pestaña está en background: sin esta red la
      // card se quedaría vacía para siempre (el IO ya la desobservó).
      // Si está oculta, esperamos a que vuelva; si aun así no corre,
      // resolvemos sin animación para nunca dejar producto invisible.
      if (document.hidden) { pending.add(run); return; }
      const safety = setTimeout(() => { card.classList.add('is-resolved'); }, 1600);
      const start = performance.now();
      const DUR = 560;
      // 3 slices que se van asentando
      const slices = [0, 1, 2].map(i => ({
        row: Math.floor(hash(i * 7 + base.length) * AH),
        amp: 3 + Math.floor(hash(i * 13) * 5),
      }));
      function frame(now) {
        const t = Math.min(1, (now - start) / DUR);
        const rows = coarsen(base, t).slice();
        // mosh: desplaza slices, la amplitud decae con t
        slices.forEach(s => {
          const amp = Math.round(s.amp * (1 - t));
          if (!amp) return;
          for (let r = s.row; r < Math.min(AH, s.row + 2); r++) {
            rows[r] = shiftRow(rows[r], amp);
          }
        });
        pre.textContent = rows.join('\n');
        if (t < 1) { requestAnimationFrame(frame); }
        else { clearTimeout(safety); card.classList.add('is-resolved'); }
      }
      requestAnimationFrame(frame);
    };

    if (img.complete && img.naturalWidth) run();
    else img.addEventListener('load', run, { once: true });
  }

  // ---------- Pan con inercia (misma física del globo) ------------------
  let px = 0, py = 0;            // traslación del plano
  let scale = 1;                 // zoom
  let dragging = false, moved = false;
  let startX = 0, startY = 0;    // origen del gesto (para distinguir click de drag)
  let lastX = 0, lastY = 0, lastT = 0;
  const DRAG_PX = 7;             // umbral: nadie hace click sin moverse 1-2px
  const MIN_S = 0.35, MAX_S = 2.5;

  // Punteros activos: con 2 dedos es pellizco, con 1 es arrastre.
  const punteros = new Map();
  let pinchDist = 0, pinchScale = 1;
  let vx = 0, vy = 0;            // velocidad suavizada px/s
  const DECAY = 2.6;            // 1/s

  // El plano tiene su esquina superior-izquierda en (0,0) del stage; px/py
  // lo trasladan. Para ver el borde izquierdo px = 0; para ver el derecho
  // px = vw - PLANE_W. Dejamos PAD de overscroll a cada lado.
  const PAD = 180;
  // El stage es fixed inset:0, así que el viewport ES su tamaño. Usamos
  // innerWidth/Height porque clientWidth puede ser 0 si medimos antes de
  // que el layout exista (y un 0 aquí manda el plano fuera de pantalla).
  function vw() { return stage.clientWidth || window.innerWidth || 1280; }
  function vh() { return stage.clientHeight || window.innerHeight || 720; }
  function clamp() {
    // el plano mide PLANE_* × scale en pantalla
    const W = PLANE_W * scale, H = PLANE_H * scale;
    const minX = Math.min(0, vw() - W) - PAD, maxX = Math.max(0, vw() - W) + PAD;
    const minY = Math.min(0, vh() - H) - PAD, maxY = Math.max(0, vh() - H) + PAD;
    px = Math.max(minX, Math.min(maxX, px));
    py = Math.max(minY, Math.min(maxY, py));
  }
  function apply() {
    plane.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${scale})`;
  }

  // Zoom anclado a un punto: lo que está bajo tus dedos (o el cursor) se
  // queda ahí. Con transform-origin 0 0, un punto X del plano cae en
  // pantalla en px + X*scale; despejando para que no se mueva sale esto.
  function zoomAt(cx, cy, objetivo) {
    const s = Math.max(MIN_S, Math.min(MAX_S, objetivo));
    if (Math.abs(s - scale) < 0.0005) return;
    const r = s / scale;
    px = cx - (cx - px) * r;
    py = cy - (cy - py) * r;
    scale = s;
    clamp(); apply();
  }

  function onDown(e) {
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2) {
      // arranca pellizco: se cancela el arrastre y la inercia
      dragging = false; moved = true;
      vx = vy = 0;
      const [a, b] = [...punteros.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchScale = scale;
      hideHint();
      return;
    }
    if (punteros.size > 2) return;
    dragging = true; moved = false;
    startX = e.clientX; startY = e.clientY;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    vx = vy = 0;
    stage.classList.add('is-dragging');
    // NO usamos setPointerCapture: capturar el puntero en el stage
    // reasigna el pointerup y mata el evento `click` de los hijos (pills y
    // cards dejaban de responder). El drag ya funciona con los listeners
    // de pointermove/pointerup en window.
  }
  function onMove(e) {
    if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Dos dedos: pellizco. El ancla es el punto medio entre ellos.
    if (punteros.size === 2 && pinchDist > 0) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinchScale * (d / pinchDist));
      return;
    }

    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(0.006, (now - lastT) / 1000);
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    // Drag vs click: distancia TOTAL desde el origen del gesto, no el delta
    // entre frames. Con el delta, un click normal (que siempre mueve 1-2px)
    // se marcaba como arrastre y se cancelaba la apertura del producto.
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_PX) {
      moved = true; hideHint();
    }
    px += dx; py += dy;
    clamp(); apply();
    vx = vx * 0.6 + (dx / dt) * 0.4;
    vy = vy * 0.6 + (dy / dt) * 0.4;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
  }
  function onUp(e) {
    punteros.delete(e.pointerId);
    // Al soltar un dedo del pellizco queda uno: hay que re-anclar el
    // arrastre ahí, o el plano pega un brinco por el delta acumulado.
    if (punteros.size === 1) {
      pinchDist = 0;
      const [p] = [...punteros.values()];
      lastX = p.x; lastY = p.y; lastT = performance.now();
      startX = p.x; startY = p.y;
      dragging = true; moved = true;   // venía de un gesto: no es click
      vx = vy = 0;
      return;
    }
    if (punteros.size > 0) return;
    pinchDist = 0;
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    if (!reduced && moved) glide();
  }
  let gliding = 0;
  function glide() {
    cancelAnimationFrame(gliding);
    let last = performance.now();
    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = Math.exp(-DECAY * dt);
      vx *= k; vy *= k;
      px += vx * dt; py += vy * dt;
      clamp(); apply();
      if (Math.hypot(vx, vy) > 12) gliding = requestAnimationFrame(step);
    }
    gliding = requestAnimationFrame(step);
  }

  function hideHint() {
    const h = document.querySelector('[data-super-hint]');
    if (h) h.classList.add('is-gone');
  }

  // Rueda / trackpad: panean. Con ctrl/cmd hacen zoom — así es como el
  // navegador reporta el pellizco de trackpad (llega como wheel+ctrlKey).
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // el trackpad manda deltas chicos (pellizco suave); la rueda de mouse
      // manda ~100 de golpe y saltaría de 1x al tope en un solo notch.
      const dy = Math.max(-40, Math.min(40, e.deltaY));
      zoomAt(e.clientX, e.clientY, scale * Math.exp(-dy * 0.01));
    } else {
      px -= e.deltaX; py -= e.deltaY;
      clamp(); apply();
    }
    hideHint();
  }, { passive: false });

  // Teclado: +/- para zoom, 0 para reencuadrar.
  document.addEventListener('keydown', (e) => {
    // ojo: e.target puede ser `document`, que no tiene .matches()
    const t = e.target;
    if (t && typeof t.matches === 'function' && t.matches('input, textarea')) return;
    const cx = vw() / 2, cy = vh() / 2;
    if (e.key === '+' || e.key === '=') { zoomAt(cx, cy, scale * 1.2); hideHint(); }
    else if (e.key === '-' || e.key === '_') { zoomAt(cx, cy, scale / 1.2); hideHint(); }
    else if (e.key === '0') { scale = 1; centerPlane(); hideHint(); }
  });

  stage.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', () => { clamp(); apply(); });

  // ---------- Modal -----------------------------------------------------
  const modal = document.querySelector('[data-super-modal]');

  // Ficha nutrimental. Solo llega si Hugo ya la confirmó (el worker no
  // publica lo que está en borrador).
  const NUTRI_FILAS = [
    ['kcal', 'Energía', 'kcal'],
    ['protein', 'Proteína', 'g'],
    ['carbs', 'Carbohidratos', 'g'],
    ['fiber', 'Fibra', 'g'],
    ['sugar', 'Azúcares', 'g'],
    ['fat', 'Grasas', 'g'],
    ['sat', 'Grasa saturada', 'g'],
    ['sodium', 'Sodio', 'mg'],
  ];
  function renderNutri(n) {
    const tabla = modal.querySelector('[data-modal-nutri]');
    const body = modal.querySelector('[data-modal-nutri-body]');
    const basis = modal.querySelector('[data-modal-nutri-basis]');
    if (!tabla || !body) return;
    if (!n) { tabla.hidden = true; return; }
    const filas = NUTRI_FILAS
      .filter(([k]) => typeof n[k] === 'number')
      .map(([k, label, unidad]) =>
        `<tr><th>${label}</th><td>${n[k]}${unidad === 'kcal' ? ' kcal' : ' ' + unidad}</td></tr>`);
    if (!filas.length) { tabla.hidden = true; return; }
    body.innerHTML = filas.join('');
    // Nunca decir "por 100 g" si la fuente daba por porción.
    basis.textContent = n.per_serving
      ? `[ Por porción de ${n.basis || '?'} ]`
      : '[ Por 100 g ]';
    tabla.hidden = false;
  }
  function openModal(p) {
    if (!modal) return;
    modal.querySelector('[data-modal-img]').src = p.image;
    modal.querySelector('[data-modal-img]').alt = p.name;
    const catLabel = (CATS.find(c => c[0] === p.category) || [null, p.category])[1];
    modal.querySelector('[data-modal-cat]').textContent = `[ ${catLabel} ]`;
    modal.querySelector('[data-modal-name]').textContent = p.name;
    const brand = modal.querySelector('[data-modal-brand]');
    brand.textContent = p.brand || '';
    brand.hidden = !p.brand;
    const note = modal.querySelector('[data-modal-note]');
    note.textContent = p.note || '';
    note.hidden = !p.note;
    renderNutri(p.nutrition);
    const buy = modal.querySelector('[data-modal-buy]');
    const disc = modal.querySelector('[data-modal-disclosure]');
    buy.hidden = !p.amazon_url;
    if (p.amazon_url) buy.href = '/api/out/' + encodeURIComponent(p.id);
    // El label de afiliado solo aparece cuando el link REALMENTE lleva tag:
    // hoy no hay ninguno (le quitamos el tag ajeno y Hugo aún no tiene el
    // suyo), así que declararlo sería falso. Cuando cargue su tag desde
    // admin, el label sale solo.
    disc.hidden = !(p.amazon_url && /[?&]tag=/.test(p.amazon_url));
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(() => { modal.hidden = true; }, 200);
  }
  document.querySelectorAll('[data-super-close]').forEach(b => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ---------- Filtros ---------------------------------------------------
  let active = 'todos';
  function renderFilters(counts) {
    const box = document.querySelector('[data-super-filters]');
    if (!box) return;
    box.innerHTML = CATS
      .filter(([id]) => id === 'todos' || counts[id])
      .map(([id, label]) => {
        const n = id === 'todos' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[id];
        return `<button type="button" class="super-pill${id === active ? ' is-active' : ''}" data-cat="${id}">${label} <span class="super-pill-n">${n}</span></button>`;
      }).join('');
    box.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => {
        active = b.dataset.cat;
        box.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('is-active', x.dataset.cat === active));
        applyFilter();
      });
    });
  }
  function applyFilter() {
    plane.querySelectorAll('[data-super-card]').forEach(card => {
      const on = active === 'todos' || card.dataset.cat === active;
      card.classList.toggle('is-hidden', !on);
    });
  }

  // ---------- Init ------------------------------------------------------
  // Arranca con el centro del plano (el bloque de título) en el centro
  // de la pantalla.
  function centerPlane() {
    px = (vw() - PLANE_W * scale) / 2;
    py = (vh() - PLANE_H * scale) / 2;
    apply();
  }

  async function init() {
    let products = [];
    try {
      const r = await fetch(API);
      products = (await r.json()).products || [];
    } catch (e) { /* noop */ }

    const loading = document.querySelector('[data-super-loading]');
    if (!products.length) {
      if (loading) loading.textContent = '[ No se pudo cargar el súper. Recarga la página. ]';
      return;
    }
    if (loading) loading.remove();

    plane.style.width = PLANE_W + 'px';
    plane.style.height = PLANE_H + 'px';

    // Centro
    const center = document.querySelector('[data-super-center]');
    if (center) {
      center.style.left = (PLANE_W / 2) + 'px';
      center.style.top = (PLANE_H / 2) + 'px';
    }

    const slots = buildSlots();
    const counts = {};
    const frag = document.createDocumentFragment();

    products.forEach((p, i) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
      const slot = slots[i % slots.length];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'super-card';
      el.setAttribute('data-super-card', '');
      el.dataset.cat = p.category;
      el.style.left = slot.x + 'px';
      el.style.top = slot.y + 'px';
      el.innerHTML =
        '<pre class="super-card-ascii" aria-hidden="true"></pre>' +
        `<img src="${p.image}" alt="${p.name}" loading="lazy" draggable="false">` +
        `<span class="super-card-name">${p.name}</span>`;
      el.addEventListener('click', () => { if (!moved) openModal(p); });
      frag.appendChild(el);
    });
    plane.appendChild(frag);

    renderFilters(counts);
    centerPlane();
    // Re-centra cuando el layout ya asentó (por si medimos en seco).
    requestAnimationFrame(centerPlane);
    window.addEventListener('load', centerPlane, { once: true });

    // Reveal al entrar al viewport
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { revealCard(en.target); io.unobserve(en.target); } });
    }, { root: stage, rootMargin: '80px' });
    plane.querySelectorAll('[data-super-card]').forEach(c => io.observe(c));
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  else init();
})();
