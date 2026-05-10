/* PRADO Plan - app.prado-mx.com
   Producto B2C de suscripción. Cuestionario, auth magic link, dashboard,
   Stripe checkout. Reusa el algoritmo SMAE del admin con preferencias del
   cuestionario. */
(function () {
  'use strict';

  const API_BASE = '/api/app';

  // ---------- SMAE constants ---------------------------------------------

  const GROUPS = [
    { key: 'verduras',    label: 'Verduras',         abbr: 'V',  kcal: 25,  c: 4,  p: 2, g: 0 },
    { key: 'frutas',      label: 'Frutas',           abbr: 'F',  kcal: 60,  c: 15, p: 0, g: 0 },
    { key: 'cereales-sg', label: 'Cereales s/grasa', abbr: 'Cs', kcal: 70,  c: 15, p: 2, g: 0 },
    { key: 'cereales-cg', label: 'Cereales c/grasa', abbr: 'Cg', kcal: 115, c: 15, p: 2, g: 5 },
    { key: 'leguminosas', label: 'Leguminosas',      abbr: 'Lg', kcal: 120, c: 20, p: 8, g: 1 },
    { key: 'aoa-mb',      label: 'AOA muy bajo gr.', abbr: 'mB', kcal: 40,  c: 0,  p: 7, g: 1 },
    { key: 'aoa-b',       label: 'AOA bajo grasa',   abbr: 'B',  kcal: 55,  c: 0,  p: 7, g: 3 },
    { key: 'aoa-m',       label: 'AOA moderado gr.', abbr: 'M',  kcal: 75,  c: 0,  p: 7, g: 5 },
    { key: 'aoa-a',       label: 'AOA alto grasa',   abbr: 'A',  kcal: 100, c: 0,  p: 7, g: 8 },
    { key: 'leche-d',     label: 'Leche descremada', abbr: 'Ld', kcal: 95,  c: 12, p: 9, g: 2 },
    { key: 'leche-s',     label: 'Leche semi',       abbr: 'Ls', kcal: 110, c: 12, p: 9, g: 4 },
    { key: 'leche-e',     label: 'Leche entera',     abbr: 'Le', kcal: 150, c: 12, p: 9, g: 8 },
    { key: 'aceites-sp',  label: 'Aceites s/proteína', abbr: 'as', kcal: 45, c: 0, p: 0, g: 5 },
    { key: 'aceites-cp',  label: 'Aceites c/proteína', abbr: 'ap', kcal: 70, c: 0, p: 3, g: 5 },
    { key: 'azucar-sg',   label: 'Azúcar s/grasa',   abbr: 'zs', kcal: 40,  c: 10, p: 0, g: 0 },
    { key: 'azucar-cg',   label: 'Azúcar c/grasa',   abbr: 'zc', kcal: 85,  c: 10, p: 0, g: 5 },
  ];

  const MEAL_PRESETS = {
    'estandar-5': [
      { key: 'desayuno', label: 'Desayuno', pct: 0.25 },
      { key: 'col1',     label: 'Colación AM', pct: 0.10 },
      { key: 'comida',   label: 'Comida', pct: 0.30 },
      { key: 'col2',     label: 'Colación PM', pct: 0.10 },
      { key: 'cena',     label: 'Cena', pct: 0.25 },
    ],
    'tres-comidas': [
      { key: 'desayuno', label: 'Desayuno', pct: 0.30 },
      { key: 'comida',   label: 'Comida', pct: 0.40 },
      { key: 'cena',     label: 'Cena', pct: 0.30 },
    ],
    'pre-post-entreno': [
      { key: 'desayuno', label: 'Desayuno', pct: 0.20 },
      { key: 'pre',      label: 'Pre-entreno', pct: 0.15 },
      { key: 'post',     label: 'Post-entreno', pct: 0.20 },
      { key: 'comida',   label: 'Comida', pct: 0.25 },
      { key: 'cena',     label: 'Cena', pct: 0.20 },
    ],
  };

  // ---------- Algoritmo --------------------------------------------------

  function autoMacros(d) {
    if (!d.weight || !d.height || !d.age || !d.activity || !d.goal) return null;
    const sex = d.sex || 'f';
    const base = 10 * d.weight + 6.25 * d.height - 5 * d.age + (sex === 'm' ? 5 : -161);
    const target = base * d.activity * d.goal;
    const protein = Math.round(d.weight * 1.8);
    const fat = Math.round((target * 0.25) / 9);
    const carb = Math.round((target - protein * 4 - fat * 9) / 4);
    return { kcal: Math.round(target), protein, carb, fat };
  }

  function calculateBase(macros, mode, dislikes) {
    const eq = {};
    GROUPS.forEach(g => eq[g.key] = 0);
    const isVeg = (mode === 'vegetariano' || mode === 'vegano');
    const isVegan = (mode === 'vegano');
    const isRenal = (mode === 'renal');
    const noLeche = isVegan || (dislikes && dislikes.includes('leche'));
    eq['verduras'] = Math.max(3, Math.ceil(macros.kcal / 600));
    eq['frutas']   = Math.max(2, Math.ceil(macros.kcal / 500));
    if (!noLeche) eq[isRenal ? 'leche-d' : 'leche-s'] = 1;
    eq['leguminosas'] = isVegan ? 3 : (isVeg ? 2 : 1);
    let covered = sumEq(eq);
    let restP = macros.protein - covered.p;
    if (restP > 0) {
      if (isVegan) eq['leguminosas'] += Math.max(0, Math.ceil(restP / 8));
      else if (isVeg && !(dislikes && dislikes.includes('huevo'))) eq['aoa-m'] = Math.max(0, Math.ceil(restP / 7));
      else if (isRenal) eq['aoa-mb'] = Math.max(0, Math.ceil(restP / 7));
      else eq['aoa-b'] = Math.max(0, Math.ceil(restP / 7));
    }
    covered = sumEq(eq);
    let restC = macros.carb - covered.c;
    if (restC > 0) eq['cereales-sg'] = Math.max(0, Math.ceil(restC / 15));
    covered = sumEq(eq);
    let restG = macros.fat - covered.g;
    if (restG > 0) eq['aceites-sp'] = Math.max(0, Math.ceil(restG / 5));
    return eq;
  }

  function sumEq(eq) {
    let kcal = 0, c = 0, p = 0, g = 0;
    GROUPS.forEach(grp => {
      const n = eq[grp.key] || 0;
      kcal += n * grp.kcal; c += n * grp.c; p += n * grp.p; g += n * grp.g;
    });
    return { kcal, c, p, g };
  }

  function distributeMeals(eq, meals) {
    const out = {};
    meals.forEach(m => { out[m.key] = {}; GROUPS.forEach(g => out[m.key][g.key] = 0); });
    GROUPS.forEach(g => {
      const total = eq[g.key] || 0;
      if (total === 0) return;
      let assigned = 0;
      meals.forEach((m, idx) => {
        const portion = idx === meals.length - 1
          ? Math.max(0, total - assigned)
          : Math.ceil(total * m.pct);
        const safe = Math.min(portion, Math.max(0, total - assigned));
        out[m.key][g.key] = safe;
        assigned += safe;
      });
    });
    return out;
  }

  function formatN(n) { return Math.abs(n - Math.round(n)) < 0.01 ? Math.round(n) : n.toFixed(1); }

  // ---------- Utils ------------------------------------------------------

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function api(path, options = {}) {
    const opts = {
      ...options,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    };
    if (options.body && typeof options.body !== 'string') opts.body = JSON.stringify(options.body);
    const r = await fetch(API_BASE + path, opts);
    if (!r.ok && r.status === 401) {
      // No autenticado: redirigir a login si no estamos ahí
      if (window.location.pathname !== '/login' && window.location.pathname !== '/signup' && window.location.pathname !== '/') {
        navigate('/login');
      }
      throw new Error('unauthorized');
    }
    if (!r.ok) {
      let msg = 'error ' + r.status;
      try { const j = await r.json(); msg = j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return r.json();
  }

  // ---------- Routing ----------------------------------------------------

  function resolveView() {
    const path = window.location.pathname;
    if (path === '/' || path === '/inicio') return 'landing';
    if (path === '/login' || path === '/signup' || path === '/entrar') return 'signup';
    if (path === '/cuestionario' || path === '/onboarding') return 'questionnaire';
    if (path === '/dashboard' || path === '/plan' || path === '/mi-plan') return 'dashboard';
    return 'landing';
  }

  function showView(name) {
    document.querySelectorAll('[data-view]').forEach(el => {
      el.hidden = el.dataset.view !== name;
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function navigate(href) {
    const url = new URL(href, window.location.origin);
    if (url.pathname !== window.location.pathname) {
      window.history.pushState({}, '', url.pathname);
    }
    handleRoute();
  }

  async function handleRoute() {
    const view = resolveView();
    showView(view);
    if (view === 'dashboard') await loadDashboard();
  }

  // ---------- Signup / Login --------------------------------------------

  async function handleSignup(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const email = (fd.get('email') || '').toString().trim();
    const name = (fd.get('name') || '').toString().trim();
    const resultEl = document.querySelector('[data-signup-result]');
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Enviando...';
    try {
      const r = await api('/signup', { method: 'POST', body: { email, name } });
      resultEl.hidden = false;
      resultEl.style.color = 'var(--fg)';
      resultEl.innerHTML = r.debug_link
        ? `[ ✓ ] Listo (modo dev). <a href="${r.debug_link}" style="color:var(--fg);text-decoration:underline;">Abrir tu link</a>`
        : `[ ✓ ] Revisa tu correo (${escapeHTML(email)}). El link expira en 15 minutos.`;
    } catch (err) {
      resultEl.hidden = false;
      resultEl.style.color = 'var(--gray)';
      resultEl.textContent = `[ × ] ${err.message}`;
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Mandar link →';
    }
  }

  // ---------- Cuestionario ----------------------------------------------

  let qState = { step: 1, total: 6, data: {} };

  function renderQStep() {
    const lbl = document.querySelector('[data-step-label]');
    if (lbl) lbl.textContent = `[ ${qState.step} de ${qState.total} ]`;
    document.querySelectorAll('.q-step').forEach(s => s.hidden = parseInt(s.dataset.step, 10) !== qState.step);
    const prev = document.querySelector('[data-q-prev]');
    const next = document.querySelector('[data-q-next]');
    const submit = document.querySelector('[data-q-submit]');
    prev.hidden = qState.step === 1;
    if (qState.step === qState.total) { next.hidden = true; submit.hidden = false; }
    else { next.hidden = false; submit.hidden = true; }
    // Progress bar
    const pct = (qState.step / qState.total) * 100;
    const bar = document.querySelector('[data-q-progress] .q-progress-bar');
    if (bar) bar.style.width = pct + '%';
  }

  function qNext() {
    // Validar campos del paso actual
    const stepEl = document.querySelector(`.q-step[data-step="${qState.step}"]`);
    const required = stepEl.querySelectorAll('input[required], select[required]');
    for (const inp of required) {
      if (!inp.value) { inp.focus(); return; }
    }
    if (qState.step < qState.total) {
      qState.step++;
      renderQStep();
    }
  }
  function qPrev() {
    if (qState.step > 1) { qState.step--; renderQStep(); }
  }

  async function handleQSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const num = k => { const n = parseFloat(fd.get(k)); return Number.isFinite(n) ? n : null; };
    const data = {
      sex: fd.get('sex') || 'f',
      age: num('age'),
      weight: num('weight'),
      weight_target: num('weight_target'),
      height: num('height'),
      activity: num('activity'),
      goal: num('goal'),
      mode: fd.get('mode') || 'normal',
      conditions: (fd.get('conditions') || '').toString().trim() || null,
      preferences: {
        dislikes: fd.getAll('dislikes'),
        meals_preset: fd.get('meals_preset') || 'estandar-5',
      },
    };
    if (!fd.get('consent')) { alert('Necesitas aceptar el aviso para continuar.'); return; }

    // Calcular macros + plan
    const macros = autoMacros(data);
    if (!macros) { alert('Faltan datos.'); return; }
    data.kcal_target = macros.kcal;
    data.protein_target = macros.protein;
    data.carb_target = macros.carb;
    data.fat_target = macros.fat;
    const equivalencias = calculateBase(macros, data.mode, data.preferences.dislikes);
    const meals = MEAL_PRESETS[data.preferences.meals_preset] || MEAL_PRESETS['estandar-5'];
    const mealsDistribution = distributeMeals(equivalencias, meals);

    try {
      await api('/profile', { method: 'PATCH', body: data });
      await api('/plan/generate', {
        method: 'POST',
        body: {
          macros,
          equivalencias,
          meals: mealsDistribution,
          meals_distribution: meals.map(m => ({ key: m.key, pct: m.pct, label: m.label })),
          mode: data.mode,
          examples: {},
          menu_options: {},
        },
      });
      navigate('/dashboard');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // ---------- Dashboard -------------------------------------------------

  async function loadDashboard() {
    try {
      const { subscriber, plan } = await api('/me');
      renderDashboard(subscriber, plan);
    } catch (e) {
      // unauth ya redirige
    }
  }

  function renderDashboard(sub, plan) {
    const greeting = document.querySelector('[data-dash-greeting]');
    const status = document.querySelector('[data-dash-status]');
    if (greeting) greeting.textContent = sub.name ? `Hola, ${sub.name}` : 'Tu plan';
    if (status) {
      const map = {
        none: '[ Sin suscripción activa · 7 días gratis ]',
        trialing: '[ Trial · expira ' + (sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('es-MX') : 'pronto') + ' ]',
        active: '[ Membresía activa ]',
        past_due: '[ Pago pendiente ]',
        canceled: '[ Cancelada ]',
      };
      status.textContent = map[sub.subscription_status] || `[ ${sub.subscription_status} ]`;
    }
    // KPIs
    document.querySelector('[data-dash-kcal]').textContent = sub.kcal_target || '—';
    document.querySelector('[data-dash-protein]').textContent = sub.protein_target || '—';
    document.querySelector('[data-dash-carb]').textContent = sub.carb_target || '—';
    document.querySelector('[data-dash-fat]').textContent = sub.fat_target || '—';

    // Checkout button visible si no tiene suscripción activa
    const checkoutBtn = document.querySelector('[data-dash-checkout]');
    if (checkoutBtn) {
      checkoutBtn.hidden = sub.subscription_status === 'active' || sub.subscription_status === 'trialing';
    }

    // Si no hay plan, redirigir a cuestionario
    if (!plan) {
      if (!sub.kcal_target) {
        navigate('/cuestionario');
        return;
      }
      // Tiene perfil pero no plan: generar uno y recargar
      const meals = MEAL_PRESETS[(sub.preferences && sub.preferences.meals_preset) || 'estandar-5'];
      const macros = {
        kcal: sub.kcal_target, protein: sub.protein_target,
        carb: sub.carb_target, fat: sub.fat_target,
      };
      const eq = calculateBase(macros, sub.mode || 'normal', sub.preferences && sub.preferences.dislikes);
      const m = distributeMeals(eq, meals);
      plan = { macros, equivalencias: eq, meals: m, meals_distribution: meals };
    }
    renderGroups(plan);
    renderTotals(plan);
    renderMeals(plan, sub);
  }

  function renderGroups(plan) {
    const c = document.querySelector('[data-dash-groups]');
    if (!c) return;
    c.innerHTML = '';
    GROUPS.forEach(g => {
      const val = plan.equivalencias[g.key] || 0;
      if (val === 0) return;
      const row = document.createElement('div');
      row.className = 'smae-group';
      row.innerHTML = `
        <div class="smae-group-head">
          <span class="smae-group-abbr">[ ${g.abbr} ]</span>
          <span class="smae-group-label">${g.label}</span>
        </div>
        <div class="smae-group-meta label" style="grid-column: 2;">${g.kcal} kcal · ${g.p}P · ${g.c}C · ${g.g}G</div>
        <div style="grid-row: 1 / span 2; grid-column: auto; font-family: var(--font-sans); font-weight: 700; font-size: 28px; letter-spacing: -0.02em;">${formatN(val)}</div>
      `;
      c.appendChild(row);
    });
  }

  function renderTotals(plan) {
    const t = sumEq(plan.equivalencias);
    const list = document.querySelector('[data-dash-totals-list]');
    if (!list) return;
    list.innerHTML = `
      <li><span class="label">Kcal</span><strong>${Math.round(t.kcal)}</strong></li>
      <li><span class="label">Proteína</span><strong>${Math.round(t.p)} g</strong></li>
      <li><span class="label">Carbohidratos</span><strong>${Math.round(t.c)} g</strong></li>
      <li><span class="label">Grasa</span><strong>${Math.round(t.g)} g</strong></li>
    `;
  }

  function renderMeals(plan, sub) {
    const c = document.querySelector('[data-dash-meals]');
    if (!c) return;
    const mealsArr = plan.meals_distribution && plan.meals_distribution.length
      ? plan.meals_distribution
      : MEAL_PRESETS[(sub && sub.preferences && sub.preferences.meals_preset) || 'estandar-5'];
    c.innerHTML = '';
    mealsArr.forEach(m => {
      const items = GROUPS.filter(g => (plan.meals[m.key] && plan.meals[m.key][g.key] || 0) > 0)
        .map(g => `<li><span class="label">[ ${g.abbr} ]</span><span class="smae-meal-name">${g.label}</span><strong>${formatN(plan.meals[m.key][g.key])}</strong></li>`).join('');
      const card = document.createElement('div');
      card.className = 'smae-meal';
      card.innerHTML = `
        <div class="smae-meal-head">
          <span class="label">[ ${m.label} ]</span>
          <span class="label smae-meal-pct">${Math.round(m.pct * 100)}%</span>
        </div>
        ${items ? `<ul class="smae-meal-list">${items}</ul>` : '<p class="smae-empty label">[ vacío ]</p>'}
      `;
      c.appendChild(card);
    });
  }

  async function startCheckout(plan) {
    try {
      const r = await api('/checkout', { method: 'POST', body: { plan: plan || 'mensual' } });
      if (r.url) window.location.href = r.url;
      else if (r.stub) alert('Stripe aún no está configurado. Pronto.');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async function doLogout() {
    try { await api('/logout', { method: 'POST' }); } catch (e) {}
    navigate('/');
  }

  // ---------- Init ------------------------------------------------------

  function init() {
    handleRoute();

    window.addEventListener('popstate', handleRoute);

    // SPA navigation
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.target === '_blank' || href.startsWith('http') || href.startsWith('mailto:')) return;
      if (a.hasAttribute('data-app-route') || ['/', '/login', '/signup', '/cuestionario', '/dashboard'].includes(href)) {
        e.preventDefault();
        navigate(href);
      }
    });

    // Forms
    const signupForm = document.querySelector('[data-signup-form]');
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    const qForm = document.querySelector('[data-q-form]');
    if (qForm) {
      qForm.addEventListener('submit', handleQSubmit);
      document.querySelector('[data-q-next]').addEventListener('click', qNext);
      document.querySelector('[data-q-prev]').addEventListener('click', qPrev);
      renderQStep();
    }

    // Dashboard buttons
    const checkoutBtn = document.querySelector('[data-dash-checkout]');
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => startCheckout('mensual'));
    const logoutBtn = document.querySelector('[data-dash-logout]');
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    const editBtn = document.querySelector('[data-dash-edit]');
    if (editBtn) editBtn.addEventListener('click', () => navigate('/cuestionario'));
    const printBtn = document.querySelector('[data-dash-print]');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    // Theme toggle
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.addEventListener('click', () => {
        const dark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('prado-theme', dark ? 'dark' : 'light'); } catch (e) {}
        document.querySelectorAll('[data-theme-label]').forEach(l => l.textContent = dark ? 'Light' : 'Dark');
      });
    });
    // Sync theme label
    document.querySelectorAll('[data-theme-label]').forEach(l => {
      l.textContent = document.documentElement.classList.contains('dark') ? 'Light' : 'Dark';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
