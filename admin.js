/* PRADO Admin - CRM completo con SMAE integrado.
   - Vista home con hero ASCII y KPIs
   - Vista panel con sidebar + tabs (Pacientes / Atención / Agenda / Mensajes / Recompensas)
   - Cards de pacientes con drawer detalle
   - Drawer: datos paciente + antropométricos + plan SMAE editable + PDF
   Reusa API en https://prado-mx.com/api/smae con CORS. */
(function () {
  'use strict';

  const API_BASE = 'https://prado-mx.com/api/smae';

  // ---------- SMAE constants (reused from smae.js) -----------------------

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

  const MODES = { normal: 'Normal', vegetariano: 'Vegetariano', vegano: 'Vegano', renal: 'Renal' };

  // ---------- Estado -------------------------------------------------------

  let state = {
    patients: [],
    foods: [],
    activeTab: 'pacientes',
    activeFilter: 'todos',
    searchTerm: '',
    drawer: {
      patient: null,    // datos del paciente abierto
      plan: null,       // plan en edición
      historial: [],    // planes anteriores
      mealsPreset: 'estandar-5',
    },
  };

  // ---------- API ---------------------------------------------------------

  async function api(path, options = {}) {
    const opts = {
      ...options,
      credentials: 'omit',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    };
    if (options.body && typeof options.body !== 'string') opts.body = JSON.stringify(options.body);
    const r = await fetch(API_BASE + path, opts);
    if (!r.ok) {
      let msg = 'API ' + r.status;
      try { const j = await r.json(); msg = j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return r.json();
  }

  // ---------- SMAE algorithm ---------------------------------------------

  function calculateBase(macros, mode) {
    const eq = {};
    GROUPS.forEach(g => eq[g.key] = 0);
    const isVeg = (mode === 'vegetariano' || mode === 'vegano');
    const isVegan = (mode === 'vegano');
    const isRenal = (mode === 'renal');
    eq['verduras'] = Math.max(3, Math.ceil(macros.kcal / 600));
    eq['frutas']   = Math.max(2, Math.ceil(macros.kcal / 500));
    if (!isVegan) eq[isRenal ? 'leche-d' : 'leche-s'] = 1;
    eq['leguminosas'] = isVegan ? 3 : (isVeg ? 2 : 1);
    let covered = sumEq(eq);
    let restP = macros.protein - covered.p;
    if (restP > 0) {
      if (isVegan) eq['leguminosas'] = (eq['leguminosas'] || 0) + Math.max(0, Math.ceil(restP / 8));
      else if (isVeg) eq['aoa-m'] = Math.max(0, Math.ceil(restP / 7));
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

  function autoMacros(p) {
    if (!p.weight || !p.height || !p.age || !p.activity || !p.goal) return null;
    const sex = p.sex || 'f';
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age + (sex === 'm' ? 5 : -161);
    const target = base * p.activity * p.goal;
    const protein = Math.round(p.weight * 1.8);
    const fat = Math.round((target * 0.25) / 9);
    const carb = Math.round((target - protein * 4 - fat * 9) / 4);
    return { kcal: Math.round(target), protein, carb, fat };
  }

  // ---------- Utils -------------------------------------------------------

  function daysSince(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  function daysUntil(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  }
  function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch (e) { return '—'; }
  }
  function tierFor(n) {
    n = n || 0;
    if (n >= 31) return { label: 'Platino', cls: 'tier-platino', icon: '◆', next: null, min: 31 };
    if (n >= 16) return { label: 'Oro', cls: 'tier-oro', icon: '◇', next: 'Platino', min: 16, nextAt: 31 };
    if (n >= 6)  return { label: 'Plata', cls: 'tier-plata', icon: '○', next: 'Oro', min: 6, nextAt: 16 };
    if (n >= 1)  return { label: 'Bronce', cls: 'tier-bronce', icon: '·', next: 'Plata', min: 1, nextAt: 6 };
    return { label: 'Nuevo', cls: '', icon: '·', next: 'Bronce', min: 0, nextAt: 1 };
  }
  function tierProgressBar(count, width = 24) {
    const t = tierFor(count);
    if (!t.next) {
      return `<span class="label" style="color: var(--fg);">[ Tier máximo alcanzado ]</span>`;
    }
    const span = t.nextAt - t.min;
    const inTier = (count || 0) - t.min;
    const pct = span > 0 ? inTier / span : 1;
    const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
    const empty = width - filled;
    const bar = '#'.repeat(filled) + '.'.repeat(empty);
    const toGo = t.nextAt - (count || 0);
    return `
      <div class="tier-progress">
        <div class="tier-progress-label">
          <span class="label">${t.icon} ${t.label}</span>
          <span class="label">→ ${t.next}</span>
        </div>
        <pre class="tier-progress-bar">[${bar}]</pre>
        <p class="label">Faltan ${toGo} consulta${toGo === 1 ? '' : 's'} para ${t.next}</p>
      </div>
    `;
  }
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function formatN(n) {
    if (Math.abs(n - Math.round(n)) < 0.01) return Math.round(n);
    return n.toFixed(1);
  }
  function whatsappLink(phone, msg) {
    const num = (phone || '').replace(/[^0-9]/g, '');
    if (!num) return null;
    return `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`;
  }
  function getInitials(name) {
    return (name || '?').split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
  }

  // ---------- Carga inicial -----------------------------------------------

  async function loadAll() {
    try {
      const [{ patients }, { foods }] = await Promise.all([
        api('/patients'),
        api('/foods'),
      ]);
      state.patients = patients || [];
      state.foods = foods || [];
      renderHomeKPIs();
      renderTabContent();
      updateSidebarCounts();
    } catch (e) {
      console.error('Load error:', e);
      const cards = document.querySelector('[data-admin-cards]');
      if (cards) cards.innerHTML = `<p class="smae-empty label">[ Error: ${escapeHTML(e.message)} ]</p>`;
    }
  }

  // ---------- KPIs --------------------------------------------------------

  function computeKPIs() {
    let activos = 0, perdidos = 0, proximos = 0;
    state.patients.forEach(p => {
      const since = daysSince(p.last_plan_date || p.last_appointment);
      if (since != null && since <= 30) activos++;
      if (since != null && since > 30) perdidos++;
      const until = daysUntil(p.next_appointment);
      if (until != null && until >= 0 && until <= 7) proximos++;
    });
    return { total: state.patients.length, activos, perdidos, proximos };
  }

  function renderHomeKPIs() {
    const k = computeKPIs();
    document.querySelectorAll('[data-kpi]').forEach(el => {
      const which = el.dataset.kpi;
      el.textContent = k[which] != null ? k[which] : '—';
    });
  }

  function updateSidebarCounts() {
    const k = computeKPIs();
    const setCount = (tab, n) => {
      const el = document.querySelector(`[data-tab-count="${tab}"]`);
      if (el) el.textContent = n;
    };
    setCount('pacientes', k.total);
    setCount('atencion', k.perdidos);
    setCount('agenda', k.proximos);
    // Shortcuts en home
    const setShortcut = (key, n) => {
      const el = document.querySelector(`[data-shortcut-count="${key}"]`);
      if (el) el.textContent = n;
    };
    setShortcut('atencion', k.perdidos);
    setShortcut('agenda', k.proximos);
  }

  // ---------- Tabs --------------------------------------------------------

  function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    document.querySelectorAll('[data-tab-content]').forEach(s => {
      s.hidden = s.dataset.tabContent !== tab;
    });
    renderTabContent();
  }

  function renderTabContent() {
    if (state.activeTab === 'pacientes') renderPacientesTab();
    else if (state.activeTab === 'atencion') renderAtencionTab();
    else if (state.activeTab === 'agenda') renderAgendaTab();
    else if (state.activeTab === 'finanzas') loadFinanzas();
    else if (state.activeTab === 'cohortes') loadCohortes();
  }

  // ---------- Pacientes Tab (cards grid) ---------------------------------

  function renderPacientesTab() {
    const container = document.querySelector('[data-admin-cards]');
    const totalEl = document.querySelector('[data-admin-total]');
    if (!container) return;

    let filtered = [...state.patients];
    if (state.activeFilter === 'activos') {
      filtered = filtered.filter(p => {
        const s = daysSince(p.last_plan_date || p.last_appointment);
        return s != null && s <= 30;
      });
    } else if (state.activeFilter === 'atencion') {
      filtered = filtered.filter(p => {
        const s = daysSince(p.last_plan_date || p.last_appointment);
        return s != null && s > 30;
      });
    } else if (state.activeFilter === 'con-cita') {
      filtered = filtered.filter(p => {
        const u = daysUntil(p.next_appointment);
        return u != null && u >= 0;
      });
    }
    if (state.searchTerm) {
      const q = state.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      );
    }

    if (totalEl) totalEl.textContent = `${filtered.length} de ${state.patients.length}`;

    if (filtered.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Sin resultados ]</p>';
      return;
    }

    container.innerHTML = filtered.map(p => renderPatientCard(p)).join('');
    container.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', () => openDrawer(card.dataset.id));
    });
  }

  function renderPatientCard(p) {
    const since = daysSince(p.last_plan_date || p.last_appointment);
    const sinceLabel = since == null ? 'Sin consulta' : (since === 0 ? 'Hoy' : `${since} días`);
    const sinceCls = since != null && since > 30 ? 'is-warn' : '';
    const until = daysUntil(p.next_appointment);
    const tier = tierFor(p.plan_count);
    const initials = getInitials(p.name);
    return `
      <article class="patient-card ${sinceCls}" data-id="${escapeHTML(p.id)}" tabindex="0">
        <div class="patient-card-head">
          <div class="patient-avatar">${escapeHTML(initials)}</div>
          <div class="patient-card-id">
            <h3>${escapeHTML(p.name)}</h3>
            <p class="label">${p.plan_count || 0} plan${p.plan_count === 1 ? '' : 'es'} · <span class="${tier.cls}">${tier.label}</span></p>
          </div>
        </div>
        <div class="patient-card-meta">
          <div>
            <span class="label">Última</span>
            <strong>${sinceLabel}</strong>
          </div>
          <div>
            <span class="label">Próxima</span>
            <strong>${until == null ? '—' : (until === 0 ? 'Hoy' : until === 1 ? 'Mañana' : `En ${until}d`)}</strong>
          </div>
        </div>
        ${(p.phone || p.email) ? `
          <div class="patient-card-contact">
            ${p.phone ? `<span class="label">${escapeHTML(p.phone)}</span>` : ''}
            ${p.email ? `<span class="label">${escapeHTML(p.email)}</span>` : ''}
          </div>` : ''}
      </article>
    `;
  }

  // ---------- Atención Tab ------------------------------------------------

  function renderAtencionTab() {
    const container = document.querySelector('[data-admin-atencion]');
    if (!container) return;
    const enRiesgo = state.patients
      .map(p => ({ ...p, days_since: daysSince(p.last_plan_date || p.last_appointment) }))
      .filter(p => p.days_since != null && p.days_since > 30)
      .sort((a, b) => b.days_since - a.days_since);

    if (enRiesgo.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Todos al día ]</p>';
      return;
    }
    container.innerHTML = enRiesgo.map(p => {
      const initials = getInitials(p.name);
      const reminderMsg = `Hola ${p.name}! Soy Hugo. ¿Cómo te ha ido? Veo que tiene rato que no te veo. ¿Quieres agendar una consulta?`;
      const wa = whatsappLink(p.phone, reminderMsg);
      return `
        <article class="patient-card is-warn" data-id="${escapeHTML(p.id)}" tabindex="0">
          <div class="patient-card-head">
            <div class="patient-avatar">${escapeHTML(initials)}</div>
            <div class="patient-card-id">
              <h3>${escapeHTML(p.name)}</h3>
              <p class="label"><strong>${p.days_since} días</strong> sin venir</p>
            </div>
          </div>
          <div class="patient-card-meta">
            <div><span class="label">Última</span><strong>${formatDate(p.last_plan_date || p.last_appointment)}</strong></div>
          </div>
          <div class="patient-card-actions">
            ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="closing-cta-btn" onclick="event.stopPropagation()">WhatsApp →</a>` : '<span class="label">[ sin teléfono ]</span>'}
          </div>
        </article>
      `;
    }).join('');
    container.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        openDrawer(card.dataset.id);
      });
    });
  }

  // ---------- Agenda Tab --------------------------------------------------

  function renderAgendaTab() {
    const container = document.querySelector('[data-admin-agenda]');
    if (!container) return;
    const upcoming = state.patients
      .map(p => ({ ...p, days_until: daysUntil(p.next_appointment) }))
      .filter(p => p.days_until != null && p.days_until >= 0 && p.days_until <= 14)
      .sort((a, b) => a.days_until - b.days_until);

    if (upcoming.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Sin citas próximas ]</p>';
      return;
    }
    container.innerHTML = upcoming.map(p => {
      const initials = getInitials(p.name);
      const whenLabel = p.days_until === 0 ? 'HOY' : p.days_until === 1 ? 'MAÑANA' : `EN ${p.days_until} DÍAS`;
      const confirmMsg = `Hola ${p.name}! Te recuerdo que tenemos consulta el ${formatDate(p.next_appointment)}. ¿Confirmas?`;
      const wa = whatsappLink(p.phone, confirmMsg);
      return `
        <article class="patient-card patient-card--agenda" data-id="${escapeHTML(p.id)}" tabindex="0">
          <div class="patient-card-when">
            <span class="label">${whenLabel}</span>
            <strong>${formatDate(p.next_appointment)}</strong>
          </div>
          <div class="patient-card-head">
            <div class="patient-avatar">${escapeHTML(initials)}</div>
            <div class="patient-card-id">
              <h3>${escapeHTML(p.name)}</h3>
              ${p.phone ? `<p class="label">${escapeHTML(p.phone)}</p>` : ''}
            </div>
          </div>
          <div class="patient-card-actions">
            ${p.seca_link ? `<a href="${escapeHTML(p.seca_link)}" target="_blank" rel="noopener" class="closing-cta-btn closing-cta-btn--ghost" onclick="event.stopPropagation()">Seca →</a>` : ''}
            ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="closing-cta-btn" onclick="event.stopPropagation()">Confirmar →</a>` : ''}
          </div>
        </article>
      `;
    }).join('');
    container.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        openDrawer(card.dataset.id);
      });
    });
  }

  // ---------- DRAWER (paciente detalle) ----------------------------------

  function openNewDrawer() {
    state.drawer = { patient: null, plan: null, historial: [], mealsPreset: 'estandar-5' };
    populateDrawer({}, []);
    showDrawer();
    document.querySelector('[data-drawer-name]').textContent = 'Nuevo paciente';
    document.querySelector('[data-drawer-tier]').textContent = '[ Capturando datos ]';
    document.querySelector('[data-drawer-delete]').hidden = true;
  }

  async function openDrawer(id) {
    try {
      const { patient, plans } = await api('/patients/' + id);
      state.drawer.patient = patient;
      state.drawer.historial = plans || [];
      const last = plans && plans[0];
      state.drawer.plan = last ? cloneFromPlan(last, patient) : null;
      populateDrawer(patient, plans || []);
      const tier = tierFor(plans && plans.length || 0);
      document.querySelector('[data-drawer-name]').textContent = patient.name;
      document.querySelector('[data-drawer-tier]').innerHTML = `<span class="admin-tier-badge ${tier.cls}">${tier.icon} ${tier.label}</span> <span class="label">${plans.length} plan${plans.length === 1 ? '' : 'es'}</span>`;
      // Renderizar barra de progreso al siguiente tier en el historial
      const histContainer = document.querySelector('[data-drawer-historial]');
      // se renderiza en renderDrawerHistorial pero le agregamos prefix
      document.querySelector('[data-drawer-delete]').hidden = false;
      showDrawer();
    } catch (e) {
      alert('No se pudo abrir paciente: ' + e.message);
    }
  }

  function cloneFromPlan(plan, patient) {
    return {
      patientId: patient.id,
      name: patient.name,
      macros: plan.macros || autoMacros(patient) || { kcal: 0, protein: 0, carb: 0, fat: 0 },
      mode: plan.mode || 'normal',
      equivalencias: plan.equivalencias || {},
      meals: plan.meals || {},
      examples: plan.examples || {},
      menu_options: plan.menu_options || {},
    };
  }

  function showDrawer() {
    const drawer = document.querySelector('[data-patient-drawer]');
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => drawer.classList.add('is-open'));
  }

  function hideDrawer() {
    const drawer = document.querySelector('[data-patient-drawer]');
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { drawer.hidden = true; }, 240);
  }

  function populateDrawer(p, plans) {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) el.value = val == null ? '' : val;
    };
    set('#dr-name', p.name);
    set('#dr-age', p.age);
    set('#dr-weight', p.weight);
    set('#dr-weight-target', p.weight_target);
    set('#dr-height', p.height);
    set('#dr-conditions', p.conditions);
    set('#dr-notes', p.notes);
    set('#dr-email', p.email);
    set('#dr-phone', p.phone);
    set('#dr-seca', p.seca_link);
    set('#dr-next', p.next_appointment ? p.next_appointment.slice(0, 10) : '');
    if (p.sex) {
      const r = document.querySelector(`input[name="sex"][value="${p.sex}"]`);
      if (r) r.checked = true;
    } else {
      document.querySelector('input[name="sex"][value="f"]').checked = true;
    }
    if (p.activity) set('#dr-activity', p.activity);
    if (p.goal) set('#dr-goal', p.goal);

    // Antropométricos del último plan
    const last = plans && plans[0];
    set('#dr-cita', last ? last.cita_num : '');
    set('#dr-muslo', last ? last.muslo : '');
    set('#dr-pierna', last ? last.pierna : '');
    set('#dr-bicep', last ? last.bicep : '');
    set('#dr-bicep-flex', last ? last.bicep_flex : '');
    set('#dr-cintura', last ? last.cintura : '');
    set('#dr-cadera', last ? last.cadera : '');
    set('#dr-ombligo', last ? last.ombligo : '');
    if (last && last.mode) set('#dr-mode', last.mode);

    // Acciones rápidas
    const wa = document.querySelector('[data-drawer-wa]');
    const mail = document.querySelector('[data-drawer-mail]');
    const seca = document.querySelector('[data-drawer-seca]');
    const reminderMsg = `Hola ${p.name || ''}! Soy Hugo. ¿Cómo te ha ido?`;
    if (p.phone) { wa.href = whatsappLink(p.phone, reminderMsg); wa.hidden = false; } else { wa.hidden = true; }
    if (p.email) { mail.href = `mailto:${p.email}?subject=Hola%20de%20Hugo%20Prado&body=${encodeURIComponent(reminderMsg)}`; mail.hidden = false; } else { mail.hidden = true; }
    if (p.seca_link) { seca.href = p.seca_link; seca.hidden = false; } else { seca.hidden = true; }

    // Plan SMAE
    if (state.drawer.plan && state.drawer.plan.equivalencias) {
      document.querySelector('[data-drawer-plan]').hidden = false;
      document.querySelector('[data-drawer-recalc]').hidden = false;
      renderDrawerPlan();
    } else {
      document.querySelector('[data-drawer-plan]').hidden = true;
      document.querySelector('[data-drawer-recalc]').hidden = true;
    }

    // Histórico
    renderDrawerHistorial(plans);
  }

  function readDrawerPatientForm() {
    const fd = new FormData(document.querySelector('[data-patient-form]'));
    const num = (k) => { const n = parseFloat(fd.get(k)); return Number.isFinite(n) ? n : null; };
    const str = (k) => (fd.get(k) || '').toString().trim() || null;
    return {
      name: (fd.get('name') || '').toString().trim(),
      sex: fd.get('sex') || 'f',
      age: num('age'),
      weight: num('weight'),
      weight_target: num('weight_target'),
      height: num('height'),
      activity: num('activity'),
      goal: num('goal'),
      conditions: str('conditions'),
      notes: str('notes'),
      email: str('email'),
      phone: str('phone'),
      seca_link: str('seca_link'),
      next_appointment: str('next_appointment'),
    };
  }

  function readDrawerMeasurements() {
    const fd = new FormData(document.querySelector('[data-patient-form]'));
    const num = (k) => { const n = parseFloat(fd.get(k)); return Number.isFinite(n) ? n : null; };
    return {
      cita_num: num('cita_num'),
      muslo: num('muslo'),
      pierna: num('pierna'),
      bicep: num('bicep'),
      bicep_flex: num('bicep_flex'),
      cintura: num('cintura'),
      cadera: num('cadera'),
      ombligo: num('ombligo'),
    };
  }

  // ---------- Drawer SMAE plan -------------------------------------------

  function getDrawerMeals() {
    return MEAL_PRESETS[state.drawer.mealsPreset] || MEAL_PRESETS['estandar-5'];
  }

  function calcDrawerPlan() {
    const data = readDrawerPatientForm();
    if (!data.name) { alert('Captura el nombre del paciente.'); return; }
    let macros = autoMacros(data);
    if (!macros) {
      // Fallback: pedir macros directos
      const km = parseFloat(prompt('No hay datos suficientes para auto-calcular. Captura kcal:'));
      if (!km) return;
      macros = {
        kcal: km,
        protein: parseFloat(prompt('Proteína (g):')) || Math.round((data.weight || 65) * 1.8),
        carb: parseFloat(prompt('Carbohidratos (g):')) || Math.round((km * 0.5) / 4),
        fat: parseFloat(prompt('Grasa (g):')) || Math.round((km * 0.25) / 9),
      };
    }
    const fd = new FormData(document.querySelector('[data-patient-form]'));
    const mode = fd.get('mode') || 'normal';
    state.drawer.plan = {
      patientId: state.drawer.patient ? state.drawer.patient.id : null,
      name: data.name,
      macros,
      mode,
      equivalencias: calculateBase(macros, mode),
      examples: state.drawer.plan ? state.drawer.plan.examples : {},
      menu_options: state.drawer.plan ? state.drawer.plan.menu_options : {},
    };
    state.drawer.plan.meals = distributeMeals(state.drawer.plan.equivalencias, getDrawerMeals());
    document.querySelector('[data-drawer-plan]').hidden = false;
    document.querySelector('[data-drawer-recalc]').hidden = false;
    renderDrawerPlan();
  }

  function renderDrawerPlan() {
    if (!state.drawer.plan) return;
    renderDrawerGroups();
    renderDrawerTotals();
    renderDrawerMeals();
  }

  function renderDrawerGroups() {
    const c = document.querySelector('[data-drawer-groups]');
    c.innerHTML = '';
    GROUPS.forEach(g => {
      const value = state.drawer.plan.equivalencias[g.key] || 0;
      const examples = (state.drawer.plan.examples && state.drawer.plan.examples[g.key]) || [];
      const row = document.createElement('div');
      row.className = 'smae-group';
      row.dataset.group = g.key;
      row.innerHTML = `
        <div class="smae-group-head">
          <span class="smae-group-abbr">[ ${g.abbr} ]</span>
          <span class="smae-group-label">${g.label}</span>
        </div>
        <div class="smae-group-stepper">
          <button type="button" class="smae-step" data-step="-1">−</button>
          <input type="number" class="smae-input" min="0" max="30" step="1" value="${value}" data-group-input>
          <button type="button" class="smae-step" data-step="+1">+</button>
        </div>
        <div class="smae-group-meta label">${g.kcal} kcal · ${g.p}P · ${g.c}C · ${g.g}G</div>
        <div class="smae-group-examples">${renderExamplesPicker(g.key, examples)}</div>
      `;
      c.appendChild(row);
    });
    c.querySelectorAll('.smae-group').forEach(row => {
      const key = row.dataset.group;
      const input = row.querySelector('[data-group-input]');
      input.addEventListener('input', () => {
        const v = Math.max(0, Math.ceil(parseFloat(input.value) || 0));
        input.value = v;
        state.drawer.plan.equivalencias[key] = v;
        state.drawer.plan.meals = distributeMeals(state.drawer.plan.equivalencias, getDrawerMeals());
        renderDrawerTotals();
        renderDrawerMeals();
      });
      row.querySelectorAll('.smae-step').forEach(btn => {
        btn.addEventListener('click', () => {
          const delta = parseFloat(btn.dataset.step);
          const v = Math.max(0, Math.ceil((parseFloat(input.value) || 0) + delta));
          input.value = v;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
      const exC = row.querySelector('.smae-group-examples');
      exC.addEventListener('change', e => {
        if (!e.target.matches('[data-food]')) return;
        if (!state.drawer.plan.examples) state.drawer.plan.examples = {};
        if (!state.drawer.plan.examples[key]) state.drawer.plan.examples[key] = [];
        const arr = state.drawer.plan.examples[key];
        if (e.target.checked && !arr.includes(e.target.value)) arr.push(e.target.value);
        if (!e.target.checked) state.drawer.plan.examples[key] = arr.filter(x => x !== e.target.value);
      });
    });
  }

  function renderExamplesPicker(groupKey, selected) {
    const items = state.foods.filter(f => f.group_key === groupKey);
    if (items.length === 0) return '';
    return `
      <details class="smae-examples-toggle">
        <summary><span class="label">[ ${selected.length} ejemplos ]${selected.length ? ' ✓' : ''}</span></summary>
        <ul class="smae-examples-list">
          ${items.map(f => `
            <li><label>
              <input type="checkbox" data-food value="${f.id}" ${selected.includes(f.id) ? 'checked' : ''}>
              <span>${f.name}</span><span class="label">${f.portion}</span>
            </label></li>
          `).join('')}
        </ul>
      </details>
    `;
  }

  function renderDrawerTotals() {
    if (!state.drawer.plan) return;
    const t = sumEq(state.drawer.plan.equivalencias);
    const target = state.drawer.plan.macros;
    const set = (sel, val) => {
      const el = document.querySelector(`[data-patient-drawer] ${sel}`);
      if (el) el.textContent = val;
    };
    set('[data-total="kcal"]', Math.round(t.kcal));
    set('[data-total="protein"]', Math.round(t.p) + ' g');
    set('[data-total="carb"]', Math.round(t.c) + ' g');
    set('[data-total="fat"]', Math.round(t.g) + ' g');
    set('[data-target="kcal"]', '/ ' + target.kcal);
    set('[data-target="protein"]', '/ ' + target.protein + ' g');
    set('[data-target="carb"]', '/ ' + target.carb + ' g');
    set('[data-target="fat"]', '/ ' + target.fat + ' g');
    const dev = target.kcal > 0 ? Math.abs(t.kcal - target.kcal) / target.kcal : 0;
    const aside = document.querySelector('[data-drawer-totals]');
    if (aside) {
      aside.classList.toggle('is-on-target', dev < 0.05);
      aside.classList.toggle('is-off-target', dev > 0.10);
    }
    const devEl = document.querySelector('[data-drawer-deviation]');
    if (devEl) devEl.textContent = `± ${Math.round(dev * 100)}% kcal vs target`;
  }

  function renderDrawerMeals() {
    if (!state.drawer.plan) return;
    const c = document.querySelector('[data-drawer-meals]');
    c.innerHTML = '';
    if (!state.drawer.plan.menu_options) state.drawer.plan.menu_options = {};
    const meals = getDrawerMeals();
    meals.forEach(m => {
      const eqList = GROUPS
        .filter(g => (state.drawer.plan.meals[m.key] && state.drawer.plan.meals[m.key][g.key] || 0) > 0)
        .map(g => `<li><span class="label">[ ${g.abbr} ]</span><span class="smae-meal-name">${g.label}</span><strong>${formatN(state.drawer.plan.meals[m.key][g.key])}</strong></li>`).join('');
      const opts = state.drawer.plan.menu_options[m.key] || ['', '', ''];
      const card = document.createElement('div');
      card.className = 'smae-meal';
      card.innerHTML = `
        <div class="smae-meal-head">
          <span class="label">[ ${m.label} ]</span>
          <span class="label smae-meal-pct">${Math.round(m.pct * 100)}%</span>
        </div>
        ${eqList ? `<ul class="smae-meal-list">${eqList}</ul>` : '<p class="smae-empty label">[ vacío ]</p>'}
        <div class="smae-meal-options">
          <div class="smae-meal-options-head">
            <span class="label">[ 3 opciones ]</span>
            <button type="button" class="smae-meal-autofill label" data-meal="${m.key}">Auto-llenar →</button>
          </div>
          <div class="smae-meal-options-grid">
            <textarea data-meal-opt="${m.key}" data-opt-idx="0" placeholder="Opción 1" rows="3">${escapeHTML(opts[0] || '')}</textarea>
            <textarea data-meal-opt="${m.key}" data-opt-idx="1" placeholder="Opción 2" rows="3">${escapeHTML(opts[1] || '')}</textarea>
            <textarea data-meal-opt="${m.key}" data-opt-idx="2" placeholder="Opción 3" rows="3">${escapeHTML(opts[2] || '')}</textarea>
          </div>
        </div>
      `;
      c.appendChild(card);
    });
    c.querySelectorAll('textarea[data-meal-opt]').forEach(ta => {
      ta.addEventListener('input', () => {
        const k = ta.dataset.mealOpt;
        const i = parseInt(ta.dataset.optIdx, 10);
        if (!state.drawer.plan.menu_options[k]) state.drawer.plan.menu_options[k] = ['', '', ''];
        state.drawer.plan.menu_options[k][i] = ta.value;
      });
    });
    c.querySelectorAll('.smae-meal-autofill').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.meal;
        state.drawer.plan.menu_options[k] = generarSugerenciasMenu(k);
        renderDrawerMeals();
      });
    });
  }

  function generarSugerenciasMenu(mealKey) {
    if (!state.drawer.plan) return ['', '', ''];
    const groupsWithEq = GROUPS.filter(g =>
      (state.drawer.plan.meals[mealKey] && state.drawer.plan.meals[mealKey][g.key] || 0) > 0
    );
    if (groupsWithEq.length === 0) return ['', '', ''];
    return [0, 1, 2].map(i => groupsWithEq.map(g => {
      const eqAmount = state.drawer.plan.meals[mealKey][g.key];
      const selectedIds = (state.drawer.plan.examples && state.drawer.plan.examples[g.key]) || [];
      let pool = state.foods.filter(f => selectedIds.includes(f.id));
      if (pool.length === 0) pool = state.foods.filter(f => f.group_key === g.key);
      if (pool.length === 0) return `${formatN(eqAmount)} ${g.label}`;
      const food = pool[i % pool.length];
      return `${formatN(eqAmount)} ${g.label.toLowerCase()}: ${food.name} (${food.portion}${eqAmount > 1 ? ' x ' + formatN(eqAmount) : ''})`;
    }).join('\n'));
  }

  function applyKcalDelta(pct) {
    if (!state.drawer.plan) return;
    state.drawer.plan.macros.kcal = Math.round(state.drawer.plan.macros.kcal * (1 + pct));
    state.drawer.plan.macros.protein = Math.round(state.drawer.plan.macros.protein * (1 + pct));
    state.drawer.plan.macros.carb = Math.round(state.drawer.plan.macros.carb * (1 + pct));
    state.drawer.plan.macros.fat = Math.round(state.drawer.plan.macros.fat * (1 + pct));
    state.drawer.plan.equivalencias = calculateBase(state.drawer.plan.macros, state.drawer.plan.mode || 'normal');
    state.drawer.plan.meals = distributeMeals(state.drawer.plan.equivalencias, getDrawerMeals());
    renderDrawerPlan();
  }

  function renderDrawerHistorial(plans) {
    const c = document.querySelector('[data-drawer-historial]');
    if (!c) return;
    const count = (plans && plans.length) || 0;
    const tierBar = tierProgressBar(count);
    if (count === 0) {
      c.innerHTML = `${tierBar}<p class="smae-empty label">[ Sin planes guardados aún ]</p>`;
      return;
    }
    c.innerHTML = `
      ${tierBar}
      <ul class="drawer-historial-list">
        ${plans.map(p => `
          <li>
            <span class="label">${formatDate(p.date)}</span>
            <span>${p.macros && p.macros.kcal ? p.macros.kcal + ' kcal' : ''}</span>
            <span class="label">${p.weight_at_plan ? p.weight_at_plan + ' kg' : ''}</span>
            <span class="label">${p.cita_num ? 'Cita ' + p.cita_num : ''}</span>
          </li>
        `).join('')}
      </ul>
    `;
  }

  // ---------- Save / Delete ----------------------------------------------

  async function savePatientFromDrawer() {
    const data = readDrawerPatientForm();
    if (!data.name) { alert('Captura el nombre.'); return; }
    if (state.drawer.patient && state.drawer.patient.id) data.id = state.drawer.patient.id;
    try {
      const { id } = await api('/patients', { method: 'POST', body: data });
      if (!state.drawer.patient) state.drawer.patient = { ...data, id };
      else Object.assign(state.drawer.patient, data, { id });
      flashBtn('[data-drawer-save-patient]', 'Guardado ✓');
      await loadAll();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function savePlanFromDrawer() {
    if (!state.drawer.plan || !state.drawer.patient) {
      alert('Primero guarda los datos del paciente y calcula plan.');
      return;
    }
    const meals = getDrawerMeals();
    try {
      const meas = readDrawerMeasurements();
      const patientData = readDrawerPatientForm();
      patientData.id = state.drawer.patient.id;
      await api('/patients', { method: 'POST', body: patientData });
      await api(`/patients/${state.drawer.patient.id}/plans`, {
        method: 'POST',
        body: {
          date: new Date().toISOString(),
          macros: state.drawer.plan.macros,
          equivalencias: state.drawer.plan.equivalencias,
          meals: state.drawer.plan.meals,
          meals_distribution: meals.map(m => ({ key: m.key, pct: m.pct, label: m.label })),
          mode: state.drawer.plan.mode || 'normal',
          examples: state.drawer.plan.examples || {},
          menu_options: state.drawer.plan.menu_options || {},
          weight_at_plan: patientData.weight || null,
          notes: patientData.notes || null,
          ...meas,
        },
      });
      flashBtn('[data-drawer-save-plan]', 'Guardado ✓');
      await loadAll();
      // Recargar histórico del drawer
      const { plans } = await api('/patients/' + state.drawer.patient.id);
      state.drawer.historial = plans;
      renderDrawerHistorial(plans);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function deletePatientFromDrawer() {
    if (!state.drawer.patient || !state.drawer.patient.id) return;
    if (!confirm(`¿Eliminar a ${state.drawer.patient.name} y todos sus planes? No se puede deshacer.`)) return;
    try {
      await api('/patients/' + state.drawer.patient.id, { method: 'DELETE' });
      hideDrawer();
      await loadAll();
    } catch (e) { alert('Error: ' + e.message); }
  }

  function flashBtn(sel, msg) {
    const btn = document.querySelector(sel);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }

  // ---------- Print PDF (drawer) ----------------------------------------

  function printDrawerPlan() {
    if (!state.drawer.plan || !state.drawer.patient) return;
    preparePrintData();
    window.print();
  }

  function preparePrintData() {
    const root = document.querySelector('[data-smae-print-area]');
    if (!root) return;
    const meals = getDrawerMeals();
    const target = state.drawer.plan.macros;
    const meas = readDrawerMeasurements();
    const totalKcal = target.kcal;
    const ptKcal = target.protein * 4;
    const lpKcal = target.fat * 9;
    const hcKcal = target.carb * 4;
    const ptPct = totalKcal > 0 ? (ptKcal / totalKcal * 100).toFixed(2) : 0;
    const lpPct = totalKcal > 0 ? (lpKcal / totalKcal * 100).toFixed(2) : 0;
    const hcPct = totalKcal > 0 ? (hcKcal / totalKcal * 100).toFixed(2) : 0;

    const RECOMENDACIONES = [
      'Cocina a la plancha, al vapor, al carbón, hervido, al horno o en caldo.',
      'Prepara tus comidas por adelantado para evitar romper el plan.',
      'En ocasiones especiales mide y controla lo que consumas, o lleva un snack del plan.',
      'Evita malos hábitos: desvelarte, fumar, alcohol o drogas.',
      'Duerme 7-8 horas con el cuarto oscuro a 18-21°C.',
      'Hábitos para reducir estrés: respiración, meditación, introspección.',
      'Tomate fotos 1 vez por semana. Observa digestión y energía.',
      'La terapia psicológica brinda un pilar fuerte para tu éxito.',
    ];
    const LIBRES = ['Especias en general', 'Café negro 2 tazas/día', 'Refresco light 1 taza/día', 'Tés/infusiones 2 tazas/día', 'Stevia, Splenda o Monk Fruit'];
    const EVITAR = ['Agregar grasas o aceite para cocinar', 'Cualquier alimento que no esté en el menú', 'Aceite de girasol, maíz, soya, canola, uva, cáñamo o cártamo'];
    const ERRORES = [
      ['No medir las porciones', 'Apégate a las gramos, tazas, cucharas indicadas.'],
      ['No tomar suficiente agua', 'Te mantiene hidratado y satisfecho.'],
      ['No terminarse la comida', 'Comer menos sube tu apetito después.'],
      ['Pesarte constantemente', 'El peso no lo es todo; aumenta masa muscular.'],
      ['Agregar aceite/sazonadores/aderezos sin recomendación', 'Suman calorías sin avisar.'],
      ['Comprar producto distinto', 'Cambian el valor calórico. Pregúntame.'],
      ['Productos extras "saludables"', 'Todo es calórico. La fama engaña.'],
      ['Confiar en etiquetado light', 'La publicidad engaña. Avísame.'],
    ];

    const measRow = (key) => {
      const v = meas[key];
      return v != null ? `<td><strong>${v}</strong></td>` : '<td>-</td>';
    };
    const citaNum = meas.cita_num ? `${meas.cita_num}ª Cita` : 'Cita actual';
    const fecha = formatDate(new Date().toISOString());
    const menuOpts = state.drawer.plan.menu_options || {};
    const mealRows = meals.map(m => {
      const eqAbbrs = GROUPS
        .filter(g => (state.drawer.plan.meals[m.key] && state.drawer.plan.meals[m.key][g.key] || 0) > 0)
        .map(g => `${g.abbr} ${formatN(state.drawer.plan.meals[m.key][g.key])}`)
        .join(' · ');
      const opts = menuOpts[m.key] || ['', '', ''];
      const escapeMl = s => s ? escapeHTML(s).replace(/\n/g, '<br/>') : '<span class="print-empty">-</span>';
      return `
        <tr>
          <td class="print-meal-name">
            <strong>${m.label.toUpperCase()}</strong>
            <div class="print-meal-eqs">${eqAbbrs}</div>
          </td>
          <td>${escapeMl(opts[0])}</td>
          <td>${escapeMl(opts[1])}</td>
          <td>${escapeMl(opts[2])}</td>
        </tr>
      `;
    }).join('');

    root.innerHTML = `
      <section class="print-page print-cover">
        <div class="print-cover-mark"><span class="print-bracket">[</span><span class="print-prado">PRADO</span><span class="print-bracket">]</span></div>
        <div class="print-cover-x">x</div>
        <div class="print-cover-name">${escapeHTML(state.drawer.patient.name).toUpperCase()}</div>
        ${meas.cita_num ? `<div class="print-cover-cita">${citaNum}</div>` : ''}
      </section>
      <section class="print-page">
        <h2 class="print-h2">[ Macronutrientes ]</h2>
        <table class="print-macros-tbl">
          <thead><tr><th></th><th>%</th><th>GR</th><th>KCAL</th></tr></thead>
          <tbody>
            <tr><th>PT</th><td>${ptPct}</td><td>${target.protein}</td><td>${ptKcal}</td></tr>
            <tr><th>LP</th><td>${lpPct}</td><td>${target.fat}</td><td>${lpKcal}</td></tr>
            <tr><th>HC</th><td>${hcPct}</td><td>${target.carb}</td><td>${hcKcal}</td></tr>
            <tr class="print-total"><th>TOTAL</th><td>100</td><td></td><td>${totalKcal}</td></tr>
          </tbody>
        </table>
        <h2 class="print-h2">[ Tabla de resultados antropométricos ]</h2>
        <table class="print-antro">
          <thead><tr><th>Datos</th><th>${citaNum}<br/><span class="print-fecha">${fecha}</span></th></tr></thead>
          <tbody>
            <tr><th>Muslo</th>${measRow('muslo')}</tr>
            <tr><th>Pierna</th>${measRow('pierna')}</tr>
            <tr><th>Bícep</th>${measRow('bicep')}</tr>
            <tr><th>Bícep flex</th>${measRow('bicep_flex')}</tr>
            <tr><th>Cintura</th>${measRow('cintura')}</tr>
            <tr><th>Cadera</th>${measRow('cadera')}</tr>
            <tr><th>Ombligo</th>${measRow('ombligo')}</tr>
          </tbody>
        </table>
      </section>
      <section class="print-page"><h2 class="print-h2">[ Recomendaciones ]</h2><ul class="print-list">${RECOMENDACIONES.map(r => `<li>${r}</li>`).join('')}</ul></section>
      <section class="print-page"><h2 class="print-h2">[ Alimentos libres ]</h2><ul class="print-list">${LIBRES.map(r => `<li>${r}</li>`).join('')}</ul><h2 class="print-h2">[ Alimentos a evitar ]</h2><ul class="print-list">${EVITAR.map(r => `<li>${r}</li>`).join('')}</ul></section>
      <section class="print-page"><h2 class="print-h2">[ Errores frecuentes ]</h2><ul class="print-list">${ERRORES.map(([t, d]) => `<li><strong>${t}.</strong> ${d}</li>`).join('')}</ul></section>
      <section class="print-page print-menu-page">
        <h2 class="print-h2">[ Menú semanal ]</h2>
        <p class="print-leyenda">Pza: pieza · c: cdita · C: cda · T: taza · gr: gramos · reb: rebanada</p>
        <table class="print-menu">
          <thead><tr><th>Tiempo</th><th>Opción 1</th><th>Opción 2</th><th>Opción 3</th></tr></thead>
          <tbody>${mealRows}</tbody>
        </table>
        <p class="print-leyenda print-leyenda-foot">Verduras: ejotes, nopales, espinacas, acelgas, coliflor, brócoli, zanahoria, chayote, espárragos, champiñones, lechuga, cebolla, jitomate, pimiento morrón.</p>
      </section>
      <section class="print-page print-close">
        <p class="print-close-msg">¡Recuerda que es un proceso, y el proceso no es lineal! Habrá días buenos y malos, todo gran esfuerzo traerá un gran resultado.</p>
        <div class="print-close-pillars"><div>PACIENCIA</div><div>PERSEVERANCIA</div><div>DISCIPLINA</div></div>
        <p class="print-close-wish">¡Te deseo muchísimo éxito!</p>
        <div class="print-cover-mark print-close-mark"><span class="print-bracket">[</span><span class="print-prado">PRADO</span><span class="print-bracket">]</span></div>
      </section>
    `;
  }

  // ---------- Routing -----------------------------------------------------

  // Mapa de paths a tabs/acciones del panel
  const PATH_MAP = {
    '/': { view: 'home' },
    '/inicio': { view: 'home' },
    '/admin': { view: 'panel', tab: 'pacientes' },
    '/panel': { view: 'panel', tab: 'pacientes' },
    '/dashboard': { view: 'panel', tab: 'pacientes' },
    '/pacientes': { view: 'panel', tab: 'pacientes' },
    '/atencion': { view: 'panel', tab: 'atencion' },
    '/agenda': { view: 'panel', tab: 'agenda' },
    '/cohortes': { view: 'panel', tab: 'cohortes' },
    '/finanzas': { view: 'panel', tab: 'finanzas' },
    '/mensajes': { view: 'panel', tab: 'mensajes' },
    '/recompensas': { view: 'panel', tab: 'recompensas' },
    '/nuevo': { view: 'panel', tab: 'pacientes', action: 'new' },
  };

  function resolveRoute() {
    const pathname = window.location.pathname;
    const hash = window.location.hash.replace('#', '');
    let route = PATH_MAP[pathname] || { view: 'panel', tab: 'pacientes' };
    if (pathname === '/' || pathname === '/inicio') {
      route = { view: 'home' };
      if (hash === 'nuevo') route = { view: 'panel', tab: 'pacientes', action: 'new' };
      else if (hash) route = { view: 'panel', tab: hash };
    } else if (hash === 'nuevo') {
      route.action = 'new';
    } else if (hash) {
      route.tab = hash;
    }
    return route;
  }

  function applyRoute(route) {
    if (route.view === 'home') {
      showHome();
    } else {
      showPanel();
      if (route.tab) setTab(route.tab);
      if (route.action === 'new') openNewDrawer();
    }
  }

  function navigate(href) {
    const url = new URL(href, window.location.origin);
    if (url.pathname !== window.location.pathname || url.hash !== window.location.hash) {
      window.history.pushState({}, '', url.pathname + url.hash);
    }
    applyRoute(resolveRoute());
  }

  function showHome() {
    document.querySelector('[data-admin-home]').hidden = false;
    document.querySelector('[data-admin-panel]').hidden = true;
    document.body.classList.remove('admin-panel-active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function showPanel() {
    document.querySelector('[data-admin-home]').hidden = true;
    document.querySelector('[data-admin-panel]').hidden = false;
    document.body.classList.add('admin-panel-active');
  }

  function init() {
    // Limpiar flag legacy de versiones anteriores
    try { localStorage.removeItem('admin-skip-home'); } catch (e) {}
    applyRoute(resolveRoute());

    window.addEventListener('popstate', () => applyRoute(resolveRoute()));

    // Interceptar clicks en links internos para SPA navigation
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href) return;
      // Solo internos del mismo origin que sean paths admin
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || a.target === '_blank') return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      // Solo si el path es uno de los del PATH_MAP
      if (!PATH_MAP[url.pathname]) return;
      e.preventDefault();
      navigate(href);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideDrawer();
    });
    document.querySelector('[data-admin-home-btn]').addEventListener('click', () => navigate('/'));

    // Tabs
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      navigate('/panel#' + b.dataset.tab);
    }));

    // Search & filter
    const search = document.querySelector('[data-admin-search]');
    if (search) search.addEventListener('input', () => { state.searchTerm = search.value.trim(); renderTabContent(); });
    document.querySelectorAll('[data-admin-filter]').forEach(b => {
      b.addEventListener('click', () => {
        state.activeFilter = b.dataset.adminFilter;
        document.querySelectorAll('[data-admin-filter]').forEach(x => x.classList.toggle('is-active', x === b));
        renderTabContent();
      });
    });

    // Nuevo paciente
    document.querySelector('[data-admin-new]').addEventListener('click', openNewDrawer);

    // Drawer
    document.querySelectorAll('[data-drawer-close]').forEach(b => b.addEventListener('click', hideDrawer));
    document.querySelector('[data-drawer-save-patient]').addEventListener('click', savePatientFromDrawer);
    document.querySelector('[data-drawer-save-plan]').addEventListener('click', savePlanFromDrawer);
    document.querySelector('[data-drawer-delete]').addEventListener('click', deletePatientFromDrawer);
    document.querySelector('[data-drawer-calc]').addEventListener('click', calcDrawerPlan);
    document.querySelector('[data-drawer-recalc]').addEventListener('click', () => {
      if (!state.drawer.plan) return;
      const fd = new FormData(document.querySelector('[data-patient-form]'));
      const mode = fd.get('mode') || 'normal';
      state.drawer.plan.mode = mode;
      state.drawer.plan.equivalencias = calculateBase(state.drawer.plan.macros, mode);
      state.drawer.plan.meals = distributeMeals(state.drawer.plan.equivalencias, getDrawerMeals());
      renderDrawerPlan();
    });
    document.querySelector('[data-drawer-print]').addEventListener('click', printDrawerPlan);
    document.querySelectorAll('[data-kcal-delta]').forEach(b => {
      b.addEventListener('click', () => applyKcalDelta(parseFloat(b.dataset.kcalDelta)));
    });
    const presetSel = document.querySelector('#dr-meals-preset');
    if (presetSel) presetSel.addEventListener('change', () => {
      state.drawer.mealsPreset = presetSel.value;
      if (state.drawer.plan) {
        state.drawer.plan.meals = distributeMeals(state.drawer.plan.equivalencias, getDrawerMeals());
        renderDrawerMeals();
      }
    });

    // Templates copy
    document.querySelectorAll('[data-copy-tpl]').forEach(b => {
      b.addEventListener('click', async () => {
        const ta = document.querySelector(`[data-tpl="${b.dataset.copyTpl}"]`);
        if (!ta) return;
        try {
          await navigator.clipboard.writeText(ta.value);
          const orig = b.textContent;
          b.textContent = 'Copiado ✓';
          setTimeout(() => { b.textContent = orig; }, 1400);
        } catch (e) { alert('No se pudo copiar.'); }
      });
    });

    // Theme toggle (reuse del scroll.js no aplica aquí)
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.addEventListener('click', () => {
        const dark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('prado-theme', dark ? 'dark' : 'light'); } catch (e) {}
        document.querySelectorAll('[data-theme-label]').forEach(l => l.textContent = dark ? 'Light' : 'Dark');
      });
    });

    loadAll();
    setInterval(loadAll, 120000);
  }

  // ---------- FINANZAS (tracker ingresos/egresos) -----------------------

  let finState = {
    month: new Date().toISOString().slice(0, 7),
    filter: 'todos',
    transactions: [],
    categories: [],
  };

  async function loadFinanzas() {
    try {
      const monthInput = document.querySelector('[data-fin-month-input]');
      if (monthInput && !monthInput.value) monthInput.value = finState.month;
      const [{ transactions }, summary, { categories }] = await Promise.all([
        api('/transactions?month=' + finState.month),
        api('/transactions/summary?month=' + finState.month),
        api('/tx-categories'),
      ]);
      finState.transactions = transactions || [];
      finState.categories = categories || [];
      renderFinKPIs(summary);
      renderFinTable();
      renderFinCategoriesSelect();
    } catch (e) {
      const tbody = document.querySelector('[data-fin-tbody]');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="smae-empty label" style="text-align: center; padding: 40px;">[ Error: ${escapeHTML(e.message)} ]</td></tr>`;
    }
  }

  function renderFinKPIs(s) {
    const fmt = (cents) => '$' + (cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    document.querySelector('[data-fin-month]').textContent = monthLabel(s.month);
    const ml = document.querySelector('[data-fin-month-label]');
    if (ml) ml.textContent = 'período';
    document.querySelector('[data-fin-income]').textContent = fmt(s.income || 0);
    document.querySelector('[data-fin-expense]').textContent = fmt(s.expense || 0);
    const net = (s.income || 0) - (s.expense || 0);
    const netEl = document.querySelector('[data-fin-net]');
    netEl.textContent = (net >= 0 ? '' : '-') + fmt(Math.abs(net));
    netEl.style.color = net >= 0 ? 'var(--fg)' : 'var(--gray)';
  }

  function monthLabel(yyyymm) {
    if (!yyyymm) return '—';
    const [y, m] = yyyymm.split('-');
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${months[parseInt(m, 10) - 1] || ''} ${y}`;
  }

  function renderFinTable() {
    const tbody = document.querySelector('[data-fin-tbody]');
    if (!tbody) return;
    let tx = [...finState.transactions];
    if (finState.filter !== 'todos') tx = tx.filter(t => t.type === finState.filter);
    if (tx.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="smae-empty label" style="text-align: center; padding: 40px;">[ Sin movimientos ]</td></tr>`;
      return;
    }
    const fmt = (cents) => '$' + (cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 });
    tbody.innerHTML = tx.map(t => {
      const cat = finState.categories.find(c => c.id === t.category);
      const isIncome = t.type === 'income';
      const subjectName = t.patient_name || t.subscriber_name || '';
      return `
        <tr>
          <td>${escapeHTML(t.date)}</td>
          <td>${isIncome ? '<span class="fin-tag fin-tag--in">Ingreso</span>' : '<span class="fin-tag fin-tag--out">Egreso</span>'}</td>
          <td>${cat ? escapeHTML((cat.emoji || '') + ' ' + cat.name) : '<span class="label">—</span>'}</td>
          <td>${escapeHTML(t.notes || '')}${subjectName ? `<div class="label admin-cell-sub">${escapeHTML(subjectName)}</div>` : ''}</td>
          <td><span class="label">${escapeHTML(t.source || 'manual')}</span></td>
          <td style="text-align: right; font-family: var(--font-mono); font-size: 14px;">${isIncome ? '+' : '-'}${fmt(t.amount)}</td>
          <td class="admin-cell-actions">
            <a href="#" data-fin-delete="${escapeHTML(t.id)}">×</a>
          </td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('[data-fin-delete]').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('¿Eliminar transacción?')) return;
        try {
          await api('/transactions/' + a.dataset.finDelete, { method: 'DELETE' });
          await loadFinanzas();
        } catch (err) { alert('Error: ' + err.message); }
      });
    });
  }

  function renderFinCategoriesSelect() {
    const sel = document.querySelector('[data-fin-category-select]');
    if (!sel) return;
    const typeInput = document.querySelector('[data-fin-modal] input[name="type"]:checked');
    const type = typeInput ? typeInput.value : 'income';
    const cats = finState.categories.filter(c => c.type === type);
    sel.innerHTML = cats.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML((c.emoji || '') + ' ' + c.name)}</option>`).join('');
  }

  function openFinModal() {
    const modal = document.querySelector('[data-fin-modal]');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    const today = new Date().toISOString().slice(0, 10);
    document.querySelector('#fin-date').value = today;
    document.querySelector('#fin-amount').value = '';
    document.querySelector('#fin-notes').value = '';
    renderFinCategoriesSelect();
  }
  function closeFinModal() {
    const modal = document.querySelector('[data-fin-modal]');
    modal.classList.remove('is-open');
    setTimeout(() => { modal.hidden = true; }, 200);
  }

  async function submitFinForm(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const amount = parseFloat(fd.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) { alert('Monto inválido'); return; }
    try {
      await api('/transactions', {
        method: 'POST',
        body: {
          date: fd.get('date'),
          type: fd.get('type'),
          category: fd.get('category'),
          amount: Math.round(amount * 100), // a centavos
          notes: (fd.get('notes') || '').toString().trim() || null,
          source: 'manual',
          created_by: 'hugo',
        },
      });
      closeFinModal();
      await loadFinanzas();
    } catch (err) { alert('Error: ' + err.message); }
  }

  // Listeners de finanzas se montan en init() — se agrega aquí abajo

  function initFinanzas() {
    const newBtn = document.querySelector('[data-fin-new]');
    if (newBtn) newBtn.addEventListener('click', openFinModal);
    document.querySelectorAll('[data-fin-modal-close]').forEach(b => b.addEventListener('click', closeFinModal));
    const form = document.querySelector('[data-fin-form]');
    if (form) {
      form.addEventListener('submit', submitFinForm);
      form.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', renderFinCategoriesSelect));
    }
    const monthInput = document.querySelector('[data-fin-month-input]');
    if (monthInput) monthInput.addEventListener('change', () => {
      finState.month = monthInput.value;
      loadFinanzas();
    });
    document.querySelectorAll('[data-fin-filter]').forEach(b => {
      b.addEventListener('click', () => {
        finState.filter = b.dataset.finFilter;
        document.querySelectorAll('[data-fin-filter]').forEach(x => x.classList.toggle('is-active', x === b));
        renderFinTable();
      });
    });
  }

  // ---------- COHORTES (Protocolo 12) -----------------------------------

  let cohortsState = { cohorts: [], editing: null };

  async function loadCohortes() {
    try {
      const { cohorts } = await api('/cohorts');
      cohortsState.cohorts = cohorts || [];
      const countEl = document.querySelector('[data-tab-count="cohortes"]');
      if (countEl) countEl.textContent = cohortsState.cohorts.length;
      renderCohortsList();
    } catch (e) {
      const c = document.querySelector('[data-admin-cohorts]');
      if (c) c.innerHTML = `<p class="smae-empty label">[ Error: ${escapeHTML(e.message)} ]</p>`;
    }
  }

  function renderCohortsList() {
    const c = document.querySelector('[data-admin-cohorts]');
    if (!c) return;
    if (cohortsState.cohorts.length === 0) {
      c.innerHTML = '<p class="smae-empty label">[ Sin cohortes. Crea la primera para empezar a vender Protocolo 12. ]</p>';
      return;
    }
    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const statusLabels = {
      planned: 'Planeada',
      enrollment: 'Inscripción abierta',
      active: 'En curso',
      ended: 'Terminada',
    };
    c.innerHTML = cohortsState.cohorts.map(co => {
      const fillPct = co.capacity > 0 ? Math.round((co.sold / co.capacity) * 100) : 0;
      const revenue = (co.sold * co.price_cents) / 100;
      return `
        <article class="patient-card" data-cohort-id="${escapeHTML(co.id)}">
          <div class="patient-card-head">
            <div class="patient-avatar" style="font-size: 14px;">${escapeHTML((co.name || '').slice(0, 2).toUpperCase())}</div>
            <div class="patient-card-id">
              <h3>${escapeHTML(co.name)}</h3>
              <p class="label">[ ${statusLabels[co.status] || co.status} ] · ${fmtDate(co.start_date)} → ${fmtDate(co.end_date)}</p>
            </div>
          </div>
          <div class="patient-card-meta">
            <div><span class="label">Plazas</span><strong>${co.sold} / ${co.capacity}</strong></div>
            <div><span class="label">Ingresos</span><strong>$${revenue.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</strong></div>
          </div>
          <pre class="tier-progress-bar" style="margin: 0;">[${'#'.repeat(Math.round(fillPct/4))}${'.'.repeat(25 - Math.round(fillPct/4))}] ${fillPct}%</pre>
          <div class="patient-card-actions">
            <button type="button" class="closing-cta-btn closing-cta-btn--ghost" data-cohort-edit="${escapeHTML(co.id)}" onclick="event.stopPropagation()">Editar</button>
            <button type="button" class="closing-cta-btn closing-cta-btn--ghost" data-cohort-members="${escapeHTML(co.id)}" onclick="event.stopPropagation()">Ver miembros</button>
            <button type="button" class="closing-cta-btn closing-cta-btn--ghost smae-danger" data-cohort-delete="${escapeHTML(co.id)}" onclick="event.stopPropagation()">×</button>
          </div>
        </article>
      `;
    }).join('');

    c.querySelectorAll('[data-cohort-edit]').forEach(b => b.addEventListener('click', () => openCohortModal(b.dataset.cohortEdit)));
    c.querySelectorAll('[data-cohort-members]').forEach(b => b.addEventListener('click', () => showCohortMembers(b.dataset.cohortMembers)));
    c.querySelectorAll('[data-cohort-delete]').forEach(b => b.addEventListener('click', () => deleteCohort(b.dataset.cohortDelete)));
  }

  function openCohortModal(id) {
    const modal = document.querySelector('[data-cohort-modal]');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    const title = document.querySelector('[data-cohort-modal-title]');
    if (id) {
      const co = cohortsState.cohorts.find(c => c.id === id);
      if (!co) return;
      cohortsState.editing = id;
      if (title) title.textContent = 'Editar cohorte';
      document.querySelector('#cohort-name').value = co.name || '';
      document.querySelector('#cohort-start').value = co.start_date ? co.start_date.slice(0, 10) : '';
      document.querySelector('#cohort-end').value = co.end_date ? co.end_date.slice(0, 10) : '';
      document.querySelector('#cohort-capacity').value = co.capacity;
      document.querySelector('#cohort-price').value = Math.round(co.price_cents / 100);
      document.querySelector('#cohort-status').value = co.status;
      document.querySelector('#cohort-enroll-opens').value = co.enrollment_opens_at ? co.enrollment_opens_at.slice(0, 10) : '';
      document.querySelector('#cohort-enroll-closes').value = co.enrollment_closes_at ? co.enrollment_closes_at.slice(0, 10) : '';
      document.querySelector('#cohort-wa').value = co.whatsapp_group_link || '';
      document.querySelector('#cohort-notes').value = co.notes || '';
    } else {
      cohortsState.editing = null;
      if (title) title.textContent = 'Nueva cohorte';
      document.querySelector('[data-cohort-form]').reset();
      document.querySelector('#cohort-capacity').value = 30;
      document.querySelector('#cohort-price').value = 2999;
      document.querySelector('#cohort-status').value = 'planned';
    }
  }
  function closeCohortModal() {
    const m = document.querySelector('[data-cohort-modal]');
    m.classList.remove('is-open');
    setTimeout(() => { m.hidden = true; }, 200);
  }
  async function submitCohortForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    fd.forEach((v, k) => { data[k] = v || null; });
    data.capacity = parseInt(data.capacity, 10);
    data.price_mxn = parseInt(data.price_mxn, 10);
    try {
      if (cohortsState.editing) {
        await api('/cohorts/' + cohortsState.editing, { method: 'PATCH', body: data });
      } else {
        await api('/cohorts', { method: 'POST', body: data });
      }
      closeCohortModal();
      await loadCohortes();
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function deleteCohort(id) {
    if (!confirm('¿Eliminar cohorte? Solo se puede si no tiene miembros.')) return;
    try {
      await api('/cohorts/' + id, { method: 'DELETE' });
      await loadCohortes();
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function showCohortMembers(id) {
    try {
      const { members } = await api('/cohorts/' + id + '/members');
      if (!members.length) { alert('No hay miembros en esta cohorte aún.'); return; }
      const lines = members.map(m => `• ${m.name || m.email} — ${m.enrolled_at ? new Date(m.enrolled_at).toLocaleDateString('es-MX') : 'sin fecha'} — ${m.plan_count || 0} planes`);
      alert(`Miembros (${members.length}):\n\n` + lines.join('\n'));
    } catch (e) { alert('Error: ' + e.message); }
  }

  function initCohortes() {
    const newBtn = document.querySelector('[data-cohort-new]');
    if (newBtn) newBtn.addEventListener('click', () => openCohortModal(null));
    document.querySelectorAll('[data-cohort-modal-close]').forEach(b => b.addEventListener('click', closeCohortModal));
    const form = document.querySelector('[data-cohort-form]');
    if (form) form.addEventListener('submit', submitCohortForm);
  }

  // Bootstrap del IIFE: init principal + initFinanzas
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      initFinanzas();
      initCohortes();
    });
  } else {
    init();
    initFinanzas();
    initCohortes();
  }

})();
