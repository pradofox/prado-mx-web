/* PRADO Plan - app.prado-mx.com
   Producto B2C de suscripción. Cuestionario, auth magic link, dashboard,
   Stripe checkout. Reusa el algoritmo SMAE del admin con preferencias del
   cuestionario. */
(function () {
  'use strict';

  const API_BASE = '/api/app';
  const SMAE_API = '/api/smae';

  // Foods se cargan una vez al inicio (catálogo SMAE) para auto-generar
  // opciones de menú por tiempo. Sin esto el plan queda muy abstracto.
  let CATALOG_FOODS = [];

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

  // Filtra foods según preferencias del usuario (dislikes del cuestionario)
  // y mode. Devuelve los foods elegibles para cada grupo.
  function filterFoods(foods, mode, dislikes) {
    const dislikeSet = new Set((dislikes || []).map(d => d.toLowerCase()));
    return foods.filter(f => {
      const name = (f.name || '').toLowerCase();
      const group = (f.group_key || '').toLowerCase();
      // Vegano: sin AOA ni leche ni huevo
      if (mode === 'vegano') {
        if (group.startsWith('aoa-') || group.startsWith('leche-')) return false;
        if (name.includes('huevo') || name.includes('atún') || name.includes('atun') || name.includes('pollo') || name.includes('res') || name.includes('cerdo') || name.includes('pavo') || name.includes('pescado') || name.includes('salmón') || name.includes('salmon') || name.includes('camarón') || name.includes('camaron') || name.includes('tocino') || name.includes('chorizo') || name.includes('queso') || name.includes('yogurt') || name.includes('leche')) return false;
      }
      // Vegetariano: sin AOA con carne
      if (mode === 'vegetariano') {
        if (name.includes('pollo') || name.includes('res') || name.includes('cerdo') || name.includes('pavo') || name.includes('pescado') || name.includes('salmón') || name.includes('salmon') || name.includes('camarón') || name.includes('camaron') || name.includes('tocino') || name.includes('chorizo') || name.includes('arrachera') || name.includes('jamón') || name.includes('jamon') || name.includes('atún') || name.includes('atun') || name.includes('tilapia') || name.includes('mero') || name.includes('bistec') || name.includes('costilla') || name.includes('salchicha')) return false;
      }
      // Renal: limitar AOA alto y embutidos
      if (mode === 'renal') {
        if (group === 'aoa-a') return false;
        if (name.includes('chorizo') || name.includes('tocino') || name.includes('salchicha') || name.includes('queso amarillo')) return false;
      }
      // Dislikes globales
      if (dislikeSet.has('huevo') && name.includes('huevo')) return false;
      if (dislikeSet.has('leche') && (group.startsWith('leche-') || name.includes('leche') || name.includes('yogurt') || name.includes('queso'))) return false;
      if (dislikeSet.has('cerdo') && (name.includes('cerdo') || name.includes('tocino') || name.includes('chorizo'))) return false;
      if (dislikeSet.has('mariscos') && (name.includes('camarón') || name.includes('camaron') || name.includes('marisco'))) return false;
      if (dislikeSet.has('gluten') && (name.includes('pan') || name.includes('pasta') || name.includes('galleta') || name.includes('bisquet') || name.includes('bolillo') || name.includes('waffle'))) return false;
      return true;
    });
  }

  // Para cada grupo con equivalencias > 0, escoge 2-3 foods elegibles como
  // sugerencias por defecto. Esto alimenta el algoritmo de menú.
  function pickDefaultExamples(equivalencias, mode, dislikes) {
    if (!CATALOG_FOODS.length) return {};
    const eligible = filterFoods(CATALOG_FOODS, mode, dislikes);
    const byGroup = {};
    eligible.forEach(f => {
      if (!byGroup[f.group_key]) byGroup[f.group_key] = [];
      byGroup[f.group_key].push(f);
    });
    const examples = {};
    GROUPS.forEach(g => {
      if ((equivalencias[g.key] || 0) === 0) return;
      const pool = byGroup[g.key] || [];
      if (pool.length === 0) return;
      // Toma hasta 3 distintos para variar entre opciones de menú
      const picks = pool.slice(0, 3).map(f => f.id);
      examples[g.key] = picks;
    });
    return examples;
  }

  // Genera 3 opciones de menú por tiempo a partir de meals + examples.
  // Rota foods entre opciones para que cada una sea distinta.
  function generateMenuOptions(meals, mealsArr, examples) {
    const result = {};
    if (!CATALOG_FOODS.length) return result;
    mealsArr.forEach(m => {
      const groupsWithEq = GROUPS.filter(g => (meals[m.key] && meals[m.key][g.key] || 0) > 0);
      if (groupsWithEq.length === 0) { result[m.key] = ['', '', '']; return; }
      result[m.key] = [0, 1, 2].map(optIdx => {
        return groupsWithEq.map(g => {
          const amount = meals[m.key][g.key];
          const ids = (examples && examples[g.key]) || [];
          const pool = ids.length
            ? CATALOG_FOODS.filter(f => ids.includes(f.id))
            : CATALOG_FOODS.filter(f => f.group_key === g.key);
          if (pool.length === 0) return `${formatN(amount)} ${g.label}`;
          const food = pool[optIdx % pool.length];
          const portionText = amount === 1
            ? food.portion
            : `${food.portion} × ${formatN(amount)}`;
          return `${food.name}: ${portionText}`;
        }).join('\n');
      });
    });
    return result;
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
    if (path === '/version' || path === '/v1' || path === '/cohorte' || path === '/protocolo' || path === '/inscribirse') return 'version';
    if (path === '/login' || path === '/signup' || path === '/entrar') return 'signup';
    if (path === '/cuestionario') return 'questionnaire';
    if (path === '/bienvenida' || path === '/onboarding') return 'onboarding';
    if (path === '/dashboard' || path === '/plan' || path === '/mi-plan') return 'dashboard';
    if (path === '/cuenta' || path === '/mi-cuenta' || path === '/account') return 'account';
    if (path === '/ayuda' || path === '/help') return 'help';
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
    if (view === 'account') await loadAccount();
    if (view === 'onboarding') showOnbStep(1);
    if (view === 'landing' || view === 'version') await loadCohortInfo();
  }

  // ---------- Weekly focus (roadmap P12) ---------------------------------

  let WEEKLY_FOCUS_CACHE = null;

  async function fetchWeeklyFocus() {
    if (WEEKLY_FOCUS_CACHE) return WEEKLY_FOCUS_CACHE;
    const r = await fetch(API_BASE + '/weekly-focus', { credentials: 'omit' });
    if (!r.ok) return null;
    const j = await r.json();
    WEEKLY_FOCUS_CACHE = j.weeks || [];
    return WEEKLY_FOCUS_CACHE;
  }

  async function renderWeeklyFocus(sub) {
    const card = document.querySelector('[data-weekly-focus]');
    if (!card) return;
    // Solo enrolled + cohort_id válido
    if (!sub.cohort_id) { card.hidden = true; return; }

    // Trae versión actual para calcular semana
    let cohort = null;
    try {
      const r = await fetch(API_BASE + '/cohorts/current', { credentials: 'omit' });
      const j = await r.json();
      if (j.cohort && j.cohort.id === sub.cohort_id) cohort = j.cohort;
    } catch (e) { /* noop */ }
    if (!cohort) { card.hidden = true; return; }

    const start = new Date(cohort.start_date);
    const end = new Date(cohort.end_date);
    const today = new Date();
    const totalWeeks = 12;

    let weekNumber;
    let stateLabel;
    if (today < start) {
      weekNumber = 1;
      const days = Math.ceil((start - today) / 86400000);
      stateLabel = `[ Semana 1 arranca en ${days} día${days === 1 ? '' : 's'} ]`;
    } else if (today > end) {
      weekNumber = 12;
      stateLabel = '[ V1 cerrada · descarga tu PDF final ]';
    } else {
      const daysIn = Math.floor((today - start) / 86400000);
      weekNumber = Math.min(totalWeeks, Math.max(1, Math.floor(daysIn / 7) + 1));
      stateLabel = `[ Semana ${weekNumber} de ${totalWeeks} ]`;
    }

    const weeks = await fetchWeeklyFocus();
    if (!weeks) { card.hidden = true; return; }
    const w = weeks.find(x => x.week_number === weekNumber);
    if (!w) { card.hidden = true; return; }

    document.querySelector('[data-wf-eyebrow]').textContent = stateLabel;
    document.querySelector('[data-wf-title]').textContent = w.title || '';
    document.querySelector('[data-wf-desc]').textContent = w.description || '';
    document.querySelector('[data-wf-habit]').textContent = w.habit || '';
    card.hidden = false;
  }

  // ---------- Próximos Q&A en dashboard ---------------------------------

  async function renderUpcomingQA(sub) {
    const card = document.querySelector('[data-qa-card]');
    const list = document.querySelector('[data-qa-list]');
    if (!card || !list) return;
    if (!sub.cohort_id) { card.hidden = true; return; }
    try {
      const r = await api('/qa-sessions');
      const sessions = (r && r.sessions) || [];
      if (!sessions.length) { card.hidden = true; return; }
      const fmt = iso => new Date(iso).toLocaleString('es-MX', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      });
      const now = Date.now();
      list.innerHTML = sessions.slice(0, 3).map(s => {
        const isUpcoming = new Date(s.scheduled_at).getTime() > now;
        const days = Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000);
        let badge;
        if (s.status === 'live') badge = '<span class="qa-badge qa-badge--live">EN VIVO</span>';
        else if (s.status === 'done' && s.recording_link) badge = '<span class="qa-badge">Grabación</span>';
        else if (isUpcoming && days <= 1) badge = '<span class="qa-badge qa-badge--soon">Pronto</span>';
        else badge = '';
        const link = s.status === 'done' ? s.recording_link : s.meeting_link;
        const linkLabel = s.status === 'done' ? 'Ver grabación' : 'Entrar al Q&A';
        return `
          <li class="qa-list-item">
            <div class="qa-list-head">
              <span class="label">${fmt(s.scheduled_at)}</span>
              ${badge}
            </div>
            ${s.topic ? `<p class="qa-list-topic">${escapeHTML(s.topic)}</p>` : ''}
            ${link ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener" class="inline-link">${linkLabel} →</a>` : '<span class="label label--muted">Link próximamente</span>'}
          </li>
        `;
      }).join('');
      card.hidden = false;
    } catch (e) {
      card.hidden = true;
    }
  }

  // ---------- Versión actual (fetch) -------------------------------------

  async function loadCohortInfo() {
    try {
      const r = await fetch(API_BASE + '/cohorts/current', { credentials: 'omit' });
      if (!r.ok) return;
      const { cohort } = await r.json();
      if (!cohort) return;
      const fmtDate = iso => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
      document.querySelectorAll('[data-cohort-name]').forEach(el => el.textContent = cohort.name);
      document.querySelectorAll('[data-cohort-dates]').forEach(el => {
        const days = Math.ceil((new Date(cohort.start_date) - new Date()) / 86400000);
        let prefix;
        if (days > 0) prefix = `Empieza en ${days} día${days === 1 ? '' : 's'} · `;
        else if (days === 0) prefix = `Empieza hoy · `;
        else prefix = `En curso · `;
        el.textContent = `${prefix}${fmtDate(cohort.start_date)} → ${fmtDate(cohort.end_date)}`;
      });
      document.querySelectorAll('[data-cohort-price]').forEach(el => {
        el.textContent = '$' + (cohort.price_mxn || 2999).toLocaleString('es-MX');
      });
      document.querySelectorAll('[data-cohort-seats]').forEach(el => {
        const left = cohort.seats_left;
        const total = cohort.capacity;
        const sold = total - left;
        if (left === 0) {
          el.innerHTML = '<strong>[ Versión cerrada ]</strong> · Apartamos tu acceso para la siguiente';
        } else if (left <= 5) {
          el.innerHTML = `<strong>[ ${sold} / ${total} accesos apartados · solo quedan ${left} ]</strong>`;
        } else {
          el.innerHTML = `<strong>${sold} / ${total} accesos apartados</strong> · ${left} disponibles`;
        }
      });
      // Checkout listo (Stripe configurado) → CTA de compra.
      // Checkout pendiente → lista de espera. Cambia solo, sin deploy.
      const ready = !!cohort.checkout_ready;
      document.querySelectorAll('[data-checkout-cta]').forEach(el => { el.hidden = !ready; });
      document.querySelectorAll('[data-waitlist]').forEach(el => { el.hidden = ready; });
    } catch (e) { /* silencioso */ }
  }

  // ---------- Lista de espera --------------------------------------------

  async function handleWaitlistSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const email = (form.email.value || '').trim();
    if (!email) return;
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;
    try {
      const campaign = new URLSearchParams(window.location.search).get('c') || null;
      const r = await fetch(API_BASE + '/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          website: form.website ? form.website.value : '',
          source: 'p12-v1',
          campaign,
        }),
      });
      if (!r.ok) throw new Error('error');
      form.hidden = true;
      const done = form.parentElement.querySelector('[data-waitlist-done]');
      if (done) done.hidden = false;
    } catch (err) {
      btn.textContent = orig;
      btn.disabled = false;
      toast('No se pudo guardar. Intenta de nuevo.', 'error');
    }
  }

  // ---------- Toast notifications ----------------------------------------

  function toast(message, kind) {
    const container = document.querySelector('[data-toast-container]');
    if (!container) { console.log('[toast]', message); return; }
    const el = document.createElement('div');
    el.className = 'toast toast--' + (kind || 'info');
    el.innerHTML = `<span class="label">[ ${kind === 'error' ? '×' : kind === 'success' ? '✓' : '•'} ]</span> <span>${escapeHTML(message)}</span>`;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 200);
    }, kind === 'error' ? 5000 : 3000);
  }

  // ---------- Mi cuenta --------------------------------------------------

  async function loadAccount() {
    try {
      const { subscriber } = await api('/me');
      populateAccountForm(subscriber);
      renderAccountSubscription(subscriber);
      document.dispatchEvent(new CustomEvent('account-loaded'));
    } catch (e) {
      // unauth ya redirige
    }
  }

  function populateAccountForm(s) {
    const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.value = v == null ? '' : v; };
    set('#acc-name', s.name);
    set('#acc-email', s.email);
    set('#acc-age', s.age);
    set('#acc-weight', s.weight);
    set('#acc-weight-target', s.weight_target);
    set('#acc-height', s.height);
    if (s.activity) set('#acc-activity', s.activity);
    if (s.goal) set('#acc-goal', s.goal);
    const status = document.querySelector('[data-account-status]');
    if (status) {
      const map = {
        none: '[ Sin suscripción · activa tu trial cuando quieras ]',
        trialing: '[ Trial activo ]',
        active: '[ Membresía activa ]',
        past_due: '[ Pago pendiente ]',
        canceled: '[ Cancelada ]',
      };
      status.textContent = map[s.subscription_status] || `[ ${s.subscription_status || 'pendiente'} ]`;
    }
  }

  function renderAccountSubscription(s) {
    const container = document.querySelector('[data-account-subscription]');
    if (!container) return;
    const status = s.subscription_status || 'none';
    const ends = s.trial_ends_at || s.current_period_end;
    const endsStr = ends ? new Date(ends).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    let html = '';
    if (status === 'active' || status === 'trialing') {
      html = `
        <div style="padding: 0 20px 20px;">
          <p><strong>Estado:</strong> ${status === 'trialing' ? 'Periodo de prueba' : 'Membresía activa'}</p>
          ${endsStr ? `<p><strong>${status === 'trialing' ? 'Trial termina' : 'Próximo cobro'}:</strong> ${endsStr}</p>` : ''}
          <div class="smae-form-actions" style="margin-top: 16px;">
            <button type="button" class="closing-cta-btn closing-cta-btn--ghost smae-danger" data-account-cancel-sub>Cancelar suscripción</button>
          </div>
          <p class="label" style="color: var(--gray); margin-top: 12px;">Al cancelar mantienes acceso hasta el final del periodo pagado. Sin reembolsos parciales.</p>
        </div>`;
    } else {
      html = `
        <div style="padding: 0 20px 20px;">
          <p>No tienes una suscripción activa. Tu plan sigue disponible para visualizar.</p>
          <div class="smae-form-actions" style="margin-top: 16px;">
            <button type="button" class="closing-cta-btn" data-account-subscribe>Activar membresía →</button>
          </div>
        </div>`;
    }
    container.innerHTML = html;
    const cancel = container.querySelector('[data-account-cancel-sub]');
    if (cancel) cancel.addEventListener('click', cancelSubscription);
    const sub = container.querySelector('[data-account-subscribe]');
    if (sub) sub.addEventListener('click', () => startCheckout('mensual'));
  }

  async function saveAccount(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const num = k => { const n = parseFloat(fd.get(k)); return Number.isFinite(n) ? n : null; };
    const data = {
      name: (fd.get('name') || '').toString().trim() || null,
      age: num('age'),
      weight: num('weight'),
      weight_target: num('weight_target'),
      height: num('height'),
      activity: num('activity'),
      goal: num('goal'),
    };
    try {
      await api('/profile', { method: 'PATCH', body: data });
      toast('Cambios guardados', 'success');
      await loadAccount();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  async function regenAccount() {
    try {
      const { subscriber } = await api('/me');
      const macros = autoMacros(subscriber);
      if (!macros) { toast('Faltan datos para generar plan', 'error'); return; }
      const eq = calculateBase(macros, subscriber.mode || 'normal', (subscriber.preferences && subscriber.preferences.dislikes) || []);
      const meals = MEAL_PRESETS[(subscriber.preferences && subscriber.preferences.meals_preset) || 'estandar-5'];
      const m = distributeMeals(eq, meals);
      await api('/profile', { method: 'PATCH', body: {
        kcal_target: macros.kcal,
        protein_target: macros.protein,
        carb_target: macros.carb,
        fat_target: macros.fat,
      }});
      await api('/plan/generate', {
        method: 'POST',
        body: {
          macros, equivalencias: eq, meals: m,
          meals_distribution: meals.map(mm => ({ key: mm.key, pct: mm.pct, label: mm.label })),
          mode: subscriber.mode || 'normal',
          examples: {}, menu_options: {},
        },
      });
      toast('Plan regenerado', 'success');
      navigate('/dashboard');
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }

  async function cancelSubscription() {
    if (!confirm('¿Cancelar tu suscripción? Mantendrás acceso hasta el final del periodo pagado.')) return;
    try {
      await api('/subscription/cancel', { method: 'POST' });
      toast('Suscripción cancelada. Tendrás acceso hasta el final del periodo.', 'success');
      await loadAccount();
    } catch (err) {
      toast('Por ahora cancela escribiendo a hola@prado-mx.com. Te lo procesamos.', 'info');
    }
  }

  async function deleteAccount() {
    if (!confirm('¿Eliminar tu cuenta y TODOS tus datos? Esta acción es irreversible.')) return;
    if (!confirm('Última confirmación: vas a borrar todo. ¿Continuar?')) return;
    try {
      await api('/account', { method: 'DELETE' });
      toast('Cuenta eliminada', 'success');
      navigate('/');
    } catch (err) {
      toast('Por ahora escribe a hola@prado-mx.com para eliminar tu cuenta.', 'info');
    }
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
      persistQStep();
    }
  }
  function qPrev() {
    if (qState.step > 1) { qState.step--; renderQStep(); persistQStep(); }
  }
  function persistQStep() {
    try {
      const raw = localStorage.getItem('prado-q-draft');
      const draft = raw ? JSON.parse(raw) : { fields: {} };
      draft.step = qState.step;
      draft.ts = Date.now();
      localStorage.setItem('prado-q-draft', JSON.stringify(draft));
    } catch (e) {}
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
    if (!fd.get('consent')) { toast('Necesitas aceptar el aviso para continuar.', 'error'); return; }

    // Calcular macros + plan
    const macros = autoMacros(data);
    if (!macros) { toast('Faltan datos. Revisa los pasos anteriores.', 'error'); return; }
    data.kcal_target = macros.kcal;
    data.protein_target = macros.protein;
    data.carb_target = macros.carb;
    data.fat_target = macros.fat;
    const equivalencias = calculateBase(macros, data.mode, data.preferences.dislikes);
    const meals = MEAL_PRESETS[data.preferences.meals_preset] || MEAL_PRESETS['estandar-5'];
    const mealsDistribution = distributeMeals(equivalencias, meals);

    try {
      // Asegura que foods estén cargados antes de generar opciones
      if (!CATALOG_FOODS.length) await loadFoods();
      const examples = pickDefaultExamples(equivalencias, data.mode, data.preferences.dislikes);
      const menuOptions = generateMenuOptions(mealsDistribution, meals, examples);
      await api('/profile', { method: 'PATCH', body: data });
      await api('/plan/generate', {
        method: 'POST',
        body: {
          macros,
          equivalencias,
          meals: mealsDistribution,
          meals_distribution: meals.map(m => ({ key: m.key, pct: m.pct, label: m.label })),
          mode: data.mode,
          examples,
          menu_options: menuOptions,
        },
      });
      toast('Tu plan está listo', 'success');
      // Si es primera vez, mostrar onboarding antes del dashboard
      const seenOnboarding = (() => { try { return localStorage.getItem('app-onboarded') === '1'; } catch (e) { return false; } })();
      navigate(seenOnboarding ? '/dashboard' : '/bienvenida');
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  // ---------- Onboarding (post-cuestionario, 3 cards) -------------------

  let onbStep = 1;
  function showOnbStep(n) {
    onbStep = n;
    document.querySelectorAll('[data-onb-step]').forEach(el => {
      el.hidden = parseInt(el.dataset.onbStep, 10) !== n;
    });
    document.querySelectorAll('[data-step-dot]').forEach(d => {
      d.classList.toggle('is-active', parseInt(d.dataset.stepDot, 10) === n);
    });
    const prev = document.querySelector('[data-onb-prev]');
    const next = document.querySelector('[data-onb-next]');
    const finish = document.querySelector('[data-onb-finish]');
    if (prev) prev.hidden = n === 1;
    if (next) next.hidden = n === 3;
    if (finish) finish.hidden = n !== 3;
  }
  function finishOnboarding() {
    try { localStorage.setItem('app-onboarded', '1'); } catch (e) {}
    navigate('/dashboard');
  }

  async function loadFoods() {
    try {
      const r = await fetch(SMAE_API + '/foods', { credentials: 'omit' });
      if (r.ok) {
        const j = await r.json();
        CATALOG_FOODS = j.foods || [];
      }
    } catch (e) { /* ok, queda vacío */ }
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

  async function renderDashboard(sub, plan) {
    const greeting = document.querySelector('[data-dash-greeting]');
    const status = document.querySelector('[data-dash-status]');
    if (greeting) greeting.textContent = sub.name ? `Hola, ${sub.name}` : 'Tu plan';
    if (status) {
      // Si está enrolled en una versión, mostrar día N de 84
      if (sub.cohort_id && sub.enrolled_at) {
        try {
          const r = await fetch(API_BASE + '/cohorts/current', { credentials: 'omit' });
          const j = await r.json();
          if (j.cohort && j.cohort.id === sub.cohort_id) {
            const start = new Date(j.cohort.start_date);
            const end = new Date(j.cohort.end_date);
            const totalDays = Math.ceil((end - start) / 86400000);
            const today = new Date();
            const daysIn = Math.floor((today - start) / 86400000) + 1;
            if (daysIn < 1) {
              const daysToStart = Math.ceil((start - today) / 86400000);
              status.textContent = `[ ${j.cohort.name} · empieza en ${daysToStart} día${daysToStart === 1 ? '' : 's'} ]`;
            } else if (daysIn > totalDays) {
              status.textContent = `[ ${j.cohort.name} · terminada · acceso de por vida ]`;
            } else {
              status.textContent = `[ ${j.cohort.name} · Día ${daysIn} de ${totalDays} ]`;
            }
          } else {
            status.textContent = `[ ${sub.payment_status === 'paid' ? 'Acceso activo' : 'Acceso pendiente'} ]`;
          }
        } catch (e) {
          status.textContent = '[ Acceso activo ]';
        }
      } else {
        const map = {
          none: '[ Sin acceso activo · aparta tu acceso al V1 ]',
          trialing: '[ Trial · expira ' + (sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('es-MX') : 'pronto') + ' ]',
          active: '[ Acceso activo ]',
          past_due: '[ Pago pendiente ]',
          canceled: '[ Acceso terminado ]',
        };
        status.textContent = map[sub.subscription_status] || `[ ${sub.subscription_status || 'pendiente'} ]`;
      }
    }
    // KPIs
    document.querySelector('[data-dash-kcal]').textContent = sub.kcal_target || '—';
    document.querySelector('[data-dash-protein]').textContent = sub.protein_target || '—';
    document.querySelector('[data-dash-carb]').textContent = sub.carb_target || '—';
    document.querySelector('[data-dash-fat]').textContent = sub.fat_target || '—';

    // Weekly focus card (roadmap P12). Solo si user está enrolled en una versión.
    renderWeeklyFocus(sub).catch(() => { /* silencioso, no rompe dashboard */ });
    // Próximos Q&As. Solo si user está enrolled.
    renderUpcomingQA(sub).catch(() => { /* silencioso */ });

    // CTA "Apartar mi acceso" visible si no está enrolled ni pagado
    const checkoutBtn = document.querySelector('[data-dash-checkout]');
    if (checkoutBtn) {
      const isEnrolled = !!sub.cohort_id && sub.payment_status === 'paid';
      const isActive = sub.subscription_status === 'active' || sub.subscription_status === 'trialing';
      checkoutBtn.hidden = isEnrolled || isActive;
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

    // Si el plan no tiene menu_options (plan viejo o sin foods), generarlas
    // ahora con los foods cargados. No persiste hasta que el user re-guarde.
    if (!plan.menu_options || Object.keys(plan.menu_options).length === 0) {
      if (CATALOG_FOODS.length === 0) await loadFoods();
      if (CATALOG_FOODS.length > 0) {
        const mealsArr = plan.meals_distribution && plan.meals_distribution.length
          ? plan.meals_distribution
          : MEAL_PRESETS[(sub.preferences && sub.preferences.meals_preset) || 'estandar-5'];
        const examples = plan.examples && Object.keys(plan.examples).length
          ? plan.examples
          : pickDefaultExamples(plan.equivalencias, sub.mode || 'normal', sub.preferences && sub.preferences.dislikes);
        plan.examples = examples;
        plan.menu_options = generateMenuOptions(plan.meals, mealsArr, examples);
        // Persistir el plan enriquecido en background (no bloquea render)
        api('/plan/generate', {
          method: 'POST',
          body: {
            macros: plan.macros,
            equivalencias: plan.equivalencias,
            meals: plan.meals,
            meals_distribution: mealsArr,
            mode: plan.mode || sub.mode || 'normal',
            examples: plan.examples,
            menu_options: plan.menu_options,
          },
        }).catch(() => {});
      }
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
      const icon = (window.SMAE_ICONS && window.SMAE_ICONS[g.key]) || '';
      const row = document.createElement('div');
      row.className = 'smae-group app-dash-group';
      row.innerHTML = `
        <div class="app-dash-group-icon">${icon}</div>
        <div class="smae-group-head">
          <span class="smae-group-abbr">[ ${g.abbr} ]</span>
          <span class="smae-group-label">${g.label}</span>
        </div>
        <div class="smae-group-meta label">${g.kcal} kcal · ${g.p}P · ${g.c}C · ${g.g}G</div>
        <div class="app-dash-group-count">${formatN(val)}</div>
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
    const menuOpts = plan.menu_options || {};
    const today = new Date().toISOString().slice(0, 10);
    const tracker = getTracker(today);
    c.innerHTML = '';
    mealsArr.forEach(m => {
      const items = GROUPS.filter(g => (plan.meals[m.key] && plan.meals[m.key][g.key] || 0) > 0)
        .map(g => `<li><span class="label">[ ${g.abbr} ]</span><span class="smae-meal-name">${g.label}</span><strong>${formatN(plan.meals[m.key][g.key])}</strong></li>`).join('');
      const opts = menuOpts[m.key] || ['', '', ''];
      const optsHtml = opts.some(o => o && o.trim())
        ? `<div class="app-meal-options">
            ${opts.map((opt, i) => opt && opt.trim() ? `
              <div class="app-meal-option">
                <span class="label">[ Opción ${i + 1} ]</span>
                <pre class="app-meal-option-text">${enhanceOptionText(opt)}</pre>
              </div>` : '').join('')}
          </div>`
        : '';
      const isChecked = tracker[m.key] === true;
      const card = document.createElement('div');
      card.className = 'smae-meal app-dash-meal' + (isChecked ? ' is-checked' : '');
      card.innerHTML = `
        <div class="smae-meal-head">
          <label class="app-meal-check">
            <input type="checkbox" data-meal-check="${m.key}" ${isChecked ? 'checked' : ''}>
            <span class="label">[ ${m.label} ]</span>
          </label>
          <span class="label smae-meal-pct">${Math.round(m.pct * 100)}%</span>
        </div>
        ${items ? `<ul class="smae-meal-list">${items}</ul>` : '<p class="smae-empty label">[ vacío ]</p>'}
        ${optsHtml}
      `;
      c.appendChild(card);
    });

    // Listeners checkboxes tracker
    c.querySelectorAll('[data-meal-check]').forEach(cb => {
      cb.addEventListener('change', () => {
        toggleMealCheck(today, cb.dataset.mealCheck, cb.checked);
        cb.closest('.smae-meal').classList.toggle('is-checked', cb.checked);
        renderTrackerSummary(mealsArr);
      });
    });
    renderTrackerSummary(mealsArr);
  }

  // Highlight de porciones en texto plano para que sean tooltipeables.
  // Detecta patrones como "1/2 taza", "30 g", "1 cucharadita", etc.
  function enhanceOptionText(text) {
    const escaped = escapeHTML(text);
    return escaped.replace(/(\d+(?:\.\d+)?\s?\/\s?\d+|\d+(?:\.\d+)?)\s*(taza|tazas|cucharadita|cucharaditas|cucharada|cucharadas|g|gr|gramos|pieza|piezas|rebanada|rebanadas|mitades|mediano|mediana|chica|grande)\b/gi, (m, num, unit) => {
      const tip = portionTip(num.trim(), unit.toLowerCase());
      if (!tip) return m;
      return `<span class="portion-tip" data-tip="${escapeHTML(tip)}">${m}</span>`;
    });
  }

  function portionTip(num, unit) {
    const u = unit.replace(/s$/, ''); // singular
    if (u === 'taza') {
      if (num === '1/2' || num === '0.5') return '≈ tu puño cerrado · ~125 ml';
      if (num === '1') return '≈ dos puños cerrados · ~250 ml';
      if (num === '1/3') return '≈ algo menos que tu puño · ~80 ml';
      if (num === '3/4') return '≈ tres cuartos de un puño y medio · ~190 ml';
      if (num === '2') return '≈ cuatro puños cerrados · ~500 ml';
      return '≈ medido en taza estándar';
    }
    if (u === 'cucharadita') return '≈ punta de tu dedo · ~5 ml';
    if (u === 'cucharada') return '≈ tu pulgar entero · ~15 ml';
    if (u === 'g' || u === 'gr' || u === 'gramo') {
      const n = parseInt(num, 10);
      if (n <= 35) return '≈ tres dedos juntos · porción individual';
      if (n <= 50) return '≈ media palma de tu mano';
      if (n <= 100) return '≈ tu palma completa';
      return '≈ doble palma';
    }
    if (u === 'pieza') return 'Tal como viene la pieza';
    if (u === 'rebanada') return '≈ una rebanada estándar (1 cm)';
    if (u === 'mitade') return '≈ media pieza partida';
    return null;
  }

  // ---------- Daily meal tracker (localStorage por día) -----------------

  function getTracker(date) {
    try {
      const raw = localStorage.getItem('app-tracker-' + date);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function toggleMealCheck(date, mealKey, checked) {
    try {
      const t = getTracker(date);
      t[mealKey] = !!checked;
      localStorage.setItem('app-tracker-' + date, JSON.stringify(t));
    } catch (e) {}
  }
  function renderTrackerSummary(mealsArr) {
    const today = new Date().toISOString().slice(0, 10);
    const t = getTracker(today);
    const done = mealsArr.filter(m => t[m.key]).length;
    const total = mealsArr.length;
    const el = document.querySelector('[data-tracker-summary]');
    if (el) {
      el.innerHTML = done === 0
        ? `<span class="label">[ Hoy ] · Toca tu primer tiempo cuando lo completes ↓</span>`
        : `<span class="label">[ Hoy ] · ${done} de ${total} tiempos completados ${done === total ? '· ¡Día completo! 🎯' : ''}</span>`;
    }
  }

  // ---------- Glosario modal ---------------------------------------------

  function openGlossary() {
    const m = document.querySelector('[data-glossary-modal]');
    if (!m) return;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
  }
  function closeGlossary() {
    const m = document.querySelector('[data-glossary-modal]');
    if (!m) return;
    m.classList.remove('is-open');
    setTimeout(() => { m.hidden = true; }, 200);
  }

  // ---------- Tooltip global (delegación) -------------------------------

  let activeTip = null;
  function showTip(target) {
    hideTip();
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const tip = document.createElement('div');
    tip.className = 'tip-popover';
    tip.textContent = text;
    document.body.appendChild(tip);
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top = rect.top - tipRect.height - 8 + window.scrollY;
    let left = rect.left + (rect.width - tipRect.width) / 2 + window.scrollX;
    if (top < window.scrollY + 8) top = rect.bottom + 8 + window.scrollY;
    left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
    requestAnimationFrame(() => tip.classList.add('is-visible'));
    activeTip = tip;
  }
  function hideTip() {
    if (activeTip) { activeTip.remove(); activeTip = null; }
  }

  async function startCheckout(plan) {
    try {
      const r = await api('/checkout', { method: 'POST', body: { plan: plan || 'mensual' } });
      if (r.url) window.location.href = r.url;
      else if (r.stub) toast('Stripe aún no está configurado. Pronto.', 'info');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function doLogout() {
    try { await api('/logout', { method: 'POST' }); } catch (e) {}
    navigate('/');
  }

  // ---------- Init ------------------------------------------------------

  async function checkDevMode() {
    try {
      const r = await fetch(API_BASE + '/dev/status');
      const j = await r.json();
      if (j.dev) {
        document.querySelectorAll('[data-dev-only]').forEach(el => { el.hidden = false; });
      }
    } catch (e) {}
  }

  function init() {
    handleRoute();
    checkDevMode();
    loadFoods();

    window.addEventListener('popstate', handleRoute);

    // SPA navigation
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.target === '_blank' || href.startsWith('http') || href.startsWith('mailto:')) return;
      // Páginas standalone (no SPA): terminos, privacidad
      if (href === '/terminos' || href === '/privacidad' || href === '/terms' || href === '/privacy') return;
      // Endpoints API (dev login redirect, etc): no interceptar
      if (href.startsWith('/api/')) return;
      if (a.hasAttribute('data-app-route') || ['/', '/login', '/signup', '/cuestionario', '/dashboard', '/cuenta', '/mi-cuenta', '/ayuda', '/help', '/bienvenida', '/cohorte', '/protocolo', '/inscribirse'].includes(href)) {
        e.preventDefault();
        navigate(href);
      }
    });

    // Onboarding
    const onbNext = document.querySelector('[data-onb-next]');
    const onbPrev = document.querySelector('[data-onb-prev]');
    const onbSkip = document.querySelector('[data-onb-skip]');
    const onbFinish = document.querySelector('[data-onb-finish]');
    if (onbNext) onbNext.addEventListener('click', () => showOnbStep(Math.min(3, onbStep + 1)));
    if (onbPrev) onbPrev.addEventListener('click', () => showOnbStep(Math.max(1, onbStep - 1)));
    if (onbSkip) onbSkip.addEventListener('click', finishOnboarding);
    if (onbFinish) onbFinish.addEventListener('click', finishOnboarding);

    // Glossary
    document.querySelectorAll('[data-open-glossary]').forEach(b => b.addEventListener('click', openGlossary));
    document.querySelectorAll('[data-close-glossary]').forEach(b => b.addEventListener('click', closeGlossary));

    // Tooltip global (delegación de eventos)
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-tip]');
      if (t) showTip(t);
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('[data-tip]')) hideTip();
    });
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-tip]');
      if (t) { e.preventDefault(); showTip(t); setTimeout(hideTip, 2500); }
    }, true);
    document.addEventListener('scroll', hideTip, true);

    // Account form
    const accForm = document.querySelector('[data-account-form]');
    if (accForm) accForm.addEventListener('submit', saveAccount);
    const accRegen = document.querySelector('[data-account-regen]');
    if (accRegen) accRegen.addEventListener('click', regenAccount);
    const accDelete = document.querySelector('[data-account-delete]');
    if (accDelete) accDelete.addEventListener('click', deleteAccount);
    const accLogout = document.querySelector('[data-account-logout]');
    if (accLogout) accLogout.addEventListener('click', doLogout);

    // Hint dinámico IMC en /cuenta (idéntico al cuestionario)
    const accHeight = document.getElementById('acc-height');
    const accWeight = document.getElementById('acc-weight');
    const accWT = document.getElementById('acc-weight-target');
    const accHint = document.getElementById('acc-weight-target-hint');
    const updateAccWTHint = () => {
      if (!accHint) return;
      const h = parseFloat(accHeight && accHeight.value);
      if (!Number.isFinite(h) || h < 120 || h > 220) {
        accHint.textContent = 'Llena altura para sugerencia.';
        return;
      }
      const m = h / 100;
      const min = Math.round(20 * m * m);
      const max = Math.round(25 * m * m);
      const mid = Math.round(22 * m * m);
      const curW = parseFloat(accWeight && accWeight.value);
      let suggestion = mid;
      let label = `Sugerido: ${mid} kg`;
      if (Number.isFinite(curW) && curW >= min && curW <= max) {
        suggestion = Math.round(curW);
        label = `Sugerido: mantener (${suggestion} kg)`;
      }
      accHint.innerHTML = `Rango saludable: <strong>${min}-${max} kg</strong>. <a href="#" data-acc-fill style="color: var(--fg); text-decoration: underline;">${label}</a>`;
      const link = accHint.querySelector('[data-acc-fill]');
      if (link) link.addEventListener('click', (e) => {
        e.preventDefault();
        if (accWT) { accWT.value = suggestion; accWT.focus(); }
      });
    };
    if (accHeight) accHeight.addEventListener('input', updateAccWTHint);
    if (accWeight) accWeight.addEventListener('input', updateAccWTHint);
    // Y dispara al cargar el view (cuando /cuenta se popule)
    document.addEventListener('account-loaded', updateAccWTHint);

    // Forms
    const signupForm = document.querySelector('[data-signup-form]');
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    document.querySelectorAll('[data-waitlist-form]').forEach(f => f.addEventListener('submit', handleWaitlistSubmit));
    const qForm = document.querySelector('[data-q-form]');
    if (qForm) {
      qForm.addEventListener('submit', handleQSubmit);
      document.querySelector('[data-q-next]').addEventListener('click', qNext);
      document.querySelector('[data-q-prev]').addEventListener('click', qPrev);
      // Hint dinámico de peso objetivo según altura (rango IMC 20-25)
      const qHeight = document.getElementById('q-height');
      const qWeight = document.getElementById('q-weight');
      const qWeightTarget = document.getElementById('q-weight-target');
      const qWeightTargetHint = document.getElementById('q-weight-target-hint');
      const updateWeightTargetHint = () => {
        if (!qHeight || !qWeightTargetHint) return;
        const h = parseFloat(qHeight.value);
        if (!Number.isFinite(h) || h < 120 || h > 220) {
          qWeightTargetHint.innerHTML = 'Si no lo tienes claro, llena tu altura arriba y te sugerimos un rango.';
          return;
        }
        const m = h / 100;
        const min = Math.round(20 * m * m);
        const max = Math.round(25 * m * m);
        const mid = Math.round(22 * m * m);
        const curW = parseFloat(qWeight && qWeight.value);
        // Si peso actual ya está dentro del rango saludable, sugerencia es mantener
        let suggestion = mid;
        let suggestionLabel = `Sugerido: ${mid} kg`;
        if (Number.isFinite(curW) && curW >= min && curW <= max) {
          suggestion = Math.round(curW);
          suggestionLabel = `Sugerido: mantener (${suggestion} kg)`;
        }
        qWeightTargetHint.innerHTML = `Rango saludable para tu altura: <strong>${min}-${max} kg</strong>. <a href="#" data-fill-target style="color: var(--fg); text-decoration: underline;">${suggestionLabel}</a>`;
        const link = qWeightTargetHint.querySelector('[data-fill-target]');
        if (link) link.addEventListener('click', (e) => {
          e.preventDefault();
          if (qWeightTarget) { qWeightTarget.value = suggestion; qWeightTarget.focus(); }
        });
      };
      if (qHeight) qHeight.addEventListener('input', updateWeightTargetHint);
      if (qWeight) qWeight.addEventListener('input', updateWeightTargetHint);

      // Auto-save draft del cuestionario en localStorage
      const Q_DRAFT_KEY = 'prado-q-draft';
      const restoreDraft = () => {
        try {
          const raw = localStorage.getItem(Q_DRAFT_KEY);
          if (!raw) return;
          const draft = JSON.parse(raw);
          Object.entries(draft.fields || {}).forEach(([name, value]) => {
            const els = qForm.querySelectorAll(`[name="${name}"]`);
            els.forEach(el => {
              if (el.type === 'radio' || el.type === 'checkbox') {
                if (Array.isArray(value) ? value.includes(el.value) : el.value === value) el.checked = true;
              } else {
                el.value = value;
              }
            });
          });
          if (draft.step && draft.step >= 1 && draft.step <= qState.total) {
            qState.step = draft.step;
          }
          updateWeightTargetHint();
        } catch (e) { /* ignore */ }
      };
      const saveDraft = () => {
        try {
          const fd = new FormData(qForm);
          const fields = {};
          for (const [k, v] of fd.entries()) {
            if (fields[k] !== undefined) {
              fields[k] = Array.isArray(fields[k]) ? [...fields[k], v] : [fields[k], v];
            } else {
              fields[k] = v;
            }
          }
          localStorage.setItem(Q_DRAFT_KEY, JSON.stringify({ fields, step: qState.step, ts: Date.now() }));
        } catch (e) { /* ignore quota */ }
      };
      qForm.addEventListener('input', saveDraft);
      qForm.addEventListener('change', saveDraft);
      // Limpia draft al submit exitoso (handleQSubmit ya navega a /bienvenida)
      qForm.addEventListener('submit', () => {
        // Esperamos al async submit; si éxito, limpiamos en el próximo tick
        setTimeout(() => {
          try { if (document.querySelector('[data-view="dashboard"]:not([hidden])') || document.querySelector('[data-view="onboarding"]:not([hidden])')) localStorage.removeItem(Q_DRAFT_KEY); } catch (e) {}
        }, 1500);
      });
      restoreDraft();

      renderQStep();
    }

    // Dashboard buttons — el botón de checkout ahora es un link a /version,
    // ya no llama startCheckout directo. El checkout real se inicia desde
    // /version cuando el usuario está logged in.
    const logoutBtn = document.querySelector('[data-dash-logout]');
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    const editBtn = document.querySelector('[data-dash-edit]');
    if (editBtn) editBtn.addEventListener('click', () => navigate('/cuestionario'));
    const printBtn = document.querySelector('[data-dash-print]');
    if (printBtn) printBtn.addEventListener('click', async () => {
      try {
        const { subscriber, plan } = await api('/me');
        if (!plan) { toast('Primero genera tu plan en el cuestionario.', 'info'); return; }
        preparePrintB2C(subscriber, plan);
        window.print();
      } catch (e) { toast('Error al imprimir: ' + e.message, 'error'); }
    });

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

  // ---------- PDF print (B2C) -------------------------------------------

  function preparePrintB2C(sub, plan) {
    const root = document.querySelector('[data-smae-print-area]');
    if (!root) return;
    const mealsArr = plan.meals_distribution && plan.meals_distribution.length
      ? plan.meals_distribution
      : MEAL_PRESETS[(sub.preferences && sub.preferences.meals_preset) || 'estandar-5'];
    const target = plan.macros || {};
    const totalKcal = target.kcal || 0;
    const ptKcal = (target.protein || 0) * 4;
    const lpKcal = (target.fat || 0) * 9;
    const hcKcal = (target.carb || 0) * 4;
    const pct = (n) => totalKcal > 0 ? (n / totalKcal * 100).toFixed(1) : 0;
    const menuOpts = plan.menu_options || {};

    const mealRows = mealsArr.map(m => {
      const eqAbbrs = GROUPS
        .filter(g => (plan.meals[m.key] && plan.meals[m.key][g.key] || 0) > 0)
        .map(g => `${g.abbr} ${formatN(plan.meals[m.key][g.key])}`)
        .join(' · ');
      const opts = menuOpts[m.key] || ['', '', ''];
      const escMl = s => s ? escapeHTML(s).replace(/\n/g, '<br/>') : '<span class="print-empty">-</span>';
      return `
        <tr>
          <td class="print-meal-name">
            <strong>${m.label.toUpperCase()}</strong>
            <div class="print-meal-eqs">${eqAbbrs}</div>
          </td>
          <td>${escMl(opts[0])}</td>
          <td>${escMl(opts[1])}</td>
          <td>${escMl(opts[2])}</td>
        </tr>
      `;
    }).join('');

    const recomendaciones = [
      'Cocina a la plancha, al vapor, al carbón, hervido, al horno o en caldo.',
      'Prepara tus comidas por adelantado para no romper el plan.',
      'Duerme 7-8 horas con el cuarto oscuro a 18-21°C.',
      'Hábitos para reducir estrés: respiración, meditación, introspección.',
      'Tómate fotos 1 vez por semana, observa digestión y energía.',
    ];

    root.innerHTML = `
      <section class="print-page print-cover">
        <div class="print-cover-mark"><span class="print-bracket">[</span><span class="print-prado">PRADO PLAN</span><span class="print-bracket">]</span></div>
        <div class="print-cover-x">x</div>
        <div class="print-cover-name">${escapeHTML(sub.name || sub.email || 'Tu plan').toUpperCase()}</div>
        <div class="print-cover-cita">${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      </section>

      <section class="print-page">
        <h2 class="print-h2">[ Macronutrientes ]</h2>
        <table class="print-macros-tbl">
          <thead><tr><th></th><th>%</th><th>GR</th><th>KCAL</th></tr></thead>
          <tbody>
            <tr><th>PT</th><td>${pct(ptKcal)}</td><td>${target.protein || 0}</td><td>${ptKcal}</td></tr>
            <tr><th>LP</th><td>${pct(lpKcal)}</td><td>${target.fat || 0}</td><td>${lpKcal}</td></tr>
            <tr><th>HC</th><td>${pct(hcKcal)}</td><td>${target.carb || 0}</td><td>${hcKcal}</td></tr>
            <tr class="print-total"><th>TOTAL</th><td>100</td><td></td><td>${totalKcal}</td></tr>
          </tbody>
        </table>

        <h2 class="print-h2">[ Equivalencias por grupo ]</h2>
        <table class="print-antro">
          <thead><tr><th>Grupo</th><th>Equivalencias</th></tr></thead>
          <tbody>
            ${GROUPS.filter(g => (plan.equivalencias[g.key] || 0) > 0).map(g => `
              <tr><th>${g.label}</th><td><strong>${formatN(plan.equivalencias[g.key])}</strong></td></tr>
            `).join('')}
          </tbody>
        </table>
      </section>

      <section class="print-page print-menu-page">
        <h2 class="print-h2">[ Menú semanal ]</h2>
        <p class="print-leyenda">3 opciones por tiempo. Escoge la que más se te antoje cada día. Las porciones cumplen tus equivalencias del grupo.</p>
        <table class="print-menu">
          <thead><tr><th>Tiempo</th><th>Opción 1</th><th>Opción 2</th><th>Opción 3</th></tr></thead>
          <tbody>${mealRows}</tbody>
        </table>
      </section>

      <section class="print-page">
        <h2 class="print-h2">[ Recomendaciones ]</h2>
        <ul class="print-list">${recomendaciones.map(r => `<li>${r}</li>`).join('')}</ul>
        <p class="print-footer">Para plan supervisado con seguimiento clínico, agenda consulta directa con Hugo Prado. <strong>PRADO Plan es información educativa, no consulta médica.</strong></p>
      </section>

      <section class="print-page print-close">
        <p class="print-close-msg">¡Recuerda que es un proceso, y el proceso no es lineal! Todo gran esfuerzo traerá un gran resultado.</p>
        <div class="print-close-pillars"><div>PACIENCIA</div><div>PERSEVERANCIA</div><div>DISCIPLINA</div></div>
        <p class="print-close-wish">¡Te deseo muchísimo éxito!</p>
        <div class="print-cover-mark print-close-mark"><span class="print-bracket">[</span><span class="print-prado">PRADO PLAN</span><span class="print-bracket">]</span></div>
      </section>
    `;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
