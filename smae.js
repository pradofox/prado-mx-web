/* SMAE - Sistema Mexicano de Alimentos Equivalentes
   Herramienta interna privada para Hugo Prado.
   - Gate por password con cookie HttpOnly de 30 días
   - Backend D1 vía /api/smae/* (multi-device)
   - Calcula reparto macros -> 16 grupos SMAE (modos normal/veg/vegan/renal)
   - Plan editable en vivo + distribución de tiempos editable + ajustes ±%
   - Picker de alimentos prototipo por grupo (base SMAE)
   - Datos completos del paciente con notas e histórico de peso
   - Export PDF vía @media print */
(function () {
  'use strict';

  // ---------- Datos SMAE ---------------------------------------------------

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

  const GROUPS_BY_KEY = Object.fromEntries(GROUPS.map(g => [g.key, g]));

  const MEAL_PRESETS = {
    'estandar-5': { label: '5 tiempos', meals: [
      { key: 'desayuno', label: 'Desayuno', pct: 0.25 },
      { key: 'col1',     label: 'Colación AM', pct: 0.10 },
      { key: 'comida',   label: 'Comida', pct: 0.30 },
      { key: 'col2',     label: 'Colación PM', pct: 0.10 },
      { key: 'cena',     label: 'Cena', pct: 0.25 },
    ]},
    'tres-comidas': { label: '3 comidas', meals: [
      { key: 'desayuno', label: 'Desayuno', pct: 0.30 },
      { key: 'comida',   label: 'Comida', pct: 0.40 },
      { key: 'cena',     label: 'Cena', pct: 0.30 },
    ]},
    'pre-post-entreno': { label: 'Pre/Post entreno', meals: [
      { key: 'desayuno', label: 'Desayuno', pct: 0.20 },
      { key: 'pre',      label: 'Pre-entreno', pct: 0.15 },
      { key: 'post',     label: 'Post-entreno', pct: 0.20 },
      { key: 'comida',   label: 'Comida', pct: 0.25 },
      { key: 'cena',     label: 'Cena', pct: 0.20 },
    ]},
  };

  const MODES = {
    normal: 'Normal',
    vegetariano: 'Vegetariano',
    vegano: 'Vegano',
    renal: 'Renal',
  };

  // ---------- Estado -------------------------------------------------------

  let state = {
    foods: [],          // [{ id, group_key, name, portion }]
    patients: [],       // resumen de pacientes
    currentPatient: null, // datos completos
    currentPlan: null,    // plan en edición
    mealsPreset: 'estandar-5',
  };

  // ---------- API client --------------------------------------------------

  const TOKEN_KEY = 'prado-smae-token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['authorization'] = 'Bearer ' + token;
    const opts = {
      ...options,
      credentials: 'same-origin',
      headers,
    };
    if (options.body && typeof options.body !== 'string') opts.body = JSON.stringify(options.body);
    const r = await fetch('/api/smae' + path, opts);
    if (r.status === 401) {
      setToken(null);
      showGate();
      throw new Error('unauthorized');
    }
    if (!r.ok) {
      let msg = `error ${r.status}`;
      try { const j = await r.json(); msg = j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return r.json();
  }

  // ---------- Gate deshabilitado -----------------------------------------
  // Auth removido. Las funciones quedan como no-op por compatibilidad.
  function showGate() {}
  function hideGate() {
    const gate = document.querySelector('[data-smae-gate]');
    if (gate) gate.hidden = true;
    const main = document.querySelector('[data-smae-main]');
    if (main) main.hidden = false;
  }

  // ---------- Algoritmo macros -> equivalencias --------------------------

  function calculateBase(macros, mode) {
    const eq = {};
    GROUPS.forEach(g => eq[g.key] = 0);

    const isVeg   = (mode === 'vegetariano' || mode === 'vegano');
    const isVegan = (mode === 'vegano');
    const isRenal = (mode === 'renal');

    // Pisos nutricionales por kcal (siempre redondeado hacia arriba)
    eq['verduras'] = Math.max(3, Math.ceil(macros.kcal / 600));
    eq['frutas']   = Math.max(2, Math.ceil(macros.kcal / 500));

    // Leche: 1 eq si normal/veg, sin leche si vegano
    if (!isVegan) {
      eq[isRenal ? 'leche-d' : 'leche-s'] = 1;
    }

    eq['leguminosas'] = isVegan ? 3 : (isVeg ? 2 : 1);

    let covered = sum(eq);

    // Proteína restante (siempre redondeo hacia arriba)
    let restP = macros.protein - covered.p;
    if (restP > 0) {
      if (isVegan) {
        const extra = Math.max(0, Math.ceil(restP / 8));
        eq['leguminosas'] = (eq['leguminosas'] || 0) + extra;
      } else if (isVeg) {
        eq['aoa-m'] = Math.max(0, Math.ceil(restP / 7));
      } else if (isRenal) {
        eq['aoa-mb'] = Math.max(0, Math.ceil(restP / 7));
      } else {
        eq['aoa-b'] = Math.max(0, Math.ceil(restP / 7));
      }
    }

    covered = sum(eq);
    let restC = macros.carb - covered.c;
    if (restC > 0) {
      eq['cereales-sg'] = Math.max(0, Math.ceil(restC / 15));
    }

    covered = sum(eq);
    let restG = macros.fat - covered.g;
    if (restG > 0) {
      eq['aceites-sp'] = Math.max(0, Math.ceil(restG / 5));
    }

    return eq;
  }

  function sum(eq) {
    let kcal = 0, c = 0, p = 0, g = 0;
    GROUPS.forEach(grp => {
      const n = eq[grp.key] || 0;
      kcal += n * grp.kcal;
      c    += n * grp.c;
      p    += n * grp.p;
      g    += n * grp.g;
    });
    return { kcal, c, p, g };
  }

  function distributeMeals(eq, meals) {
    const out = {};
    meals.forEach(m => {
      out[m.key] = {};
      GROUPS.forEach(g => out[m.key][g.key] = 0);
    });
    GROUPS.forEach(g => {
      const total = eq[g.key] || 0;
      if (total === 0) return;
      let assigned = 0;
      meals.forEach((m, idx) => {
        // Redondea hacia arriba siempre (no medias equivalencias)
        const portion = idx === meals.length - 1
          ? Math.max(0, total - assigned)
          : Math.ceil(total * m.pct);
        // Si ya superamos el total, este tiempo va con 0
        const safe = Math.min(portion, Math.max(0, total - assigned));
        out[m.key][g.key] = safe;
        assigned += safe;
      });
    });
    return out;
  }

  function getMeals() {
    const preset = MEAL_PRESETS[state.mealsPreset];
    return preset ? preset.meals : MEAL_PRESETS['estandar-5'].meals;
  }

  // ---------- Render: plan -------------------------------------------------

  function renderGroups() {
    const container = document.querySelector('[data-smae-groups]');
    if (!container || !state.currentPlan) return;
    container.innerHTML = '';
    GROUPS.forEach(g => {
      const row = document.createElement('div');
      row.className = 'smae-group';
      row.dataset.group = g.key;
      const value = state.currentPlan.equivalencias[g.key] || 0;
      const examples = (state.currentPlan.examples && state.currentPlan.examples[g.key]) || [];
      row.innerHTML = `
        <div class="smae-group-head">
          <span class="smae-group-abbr">[ ${g.abbr} ]</span>
          <span class="smae-group-label">${g.label}</span>
        </div>
        <div class="smae-group-stepper">
          <button type="button" class="smae-step" data-step="-1" aria-label="Restar">−</button>
          <input type="number" class="smae-input" min="0" max="30" step="0.5" value="${value}" data-group-input>
          <button type="button" class="smae-step" data-step="+1" aria-label="Sumar">+</button>
        </div>
        <div class="smae-group-meta label">
          ${g.kcal} kcal · ${g.p}P · ${g.c}C · ${g.g}G
        </div>
        <div class="smae-group-examples" data-examples>
          ${renderExamplesPicker(g.key, examples)}
        </div>
      `;
      container.appendChild(row);
    });

    container.querySelectorAll('.smae-group').forEach(row => {
      const key = row.dataset.group;
      const input = row.querySelector('[data-group-input]');
      input.addEventListener('input', () => {
        const v = Math.max(0, parseFloat(input.value) || 0);
        state.currentPlan.equivalencias[key] = v;
        state.currentPlan.meals = distributeMeals(state.currentPlan.equivalencias, getMeals());
        renderTotals();
        renderMeals();
      });
      row.querySelectorAll('.smae-step').forEach(btn => {
        btn.addEventListener('click', () => {
          const delta = parseFloat(btn.dataset.step);
          const v = Math.max(0, (parseFloat(input.value) || 0) + delta);
          input.value = v;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
      // Examples picker
      const exContainer = row.querySelector('[data-examples]');
      exContainer.addEventListener('change', (e) => {
        if (!e.target.matches('[data-food]')) return;
        const id = e.target.value;
        const checked = e.target.checked;
        if (!state.currentPlan.examples) state.currentPlan.examples = {};
        if (!state.currentPlan.examples[key]) state.currentPlan.examples[key] = [];
        const arr = state.currentPlan.examples[key];
        if (checked && !arr.includes(id)) arr.push(id);
        if (!checked) state.currentPlan.examples[key] = arr.filter(x => x !== id);
      });
    });
  }

  function renderExamplesPicker(groupKey, selected) {
    const items = state.foods.filter(f => f.group_key === groupKey);
    if (items.length === 0) return '';
    return `
      <details class="smae-examples-toggle">
        <summary><span class="label">[ ${selected.length} ejemplos ] ${selected.length ? '✓' : ''}</span></summary>
        <ul class="smae-examples-list">
          ${items.map(f => `
            <li>
              <label>
                <input type="checkbox" data-food value="${f.id}" ${selected.includes(f.id) ? 'checked' : ''}>
                <span>${f.name}</span>
                <span class="label">${f.portion}</span>
              </label>
            </li>
          `).join('')}
        </ul>
      </details>
    `;
  }

  function renderTotals() {
    if (!state.currentPlan) return;
    const t = sum(state.currentPlan.equivalencias);
    const target = state.currentPlan.macros;
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = val;
    };
    set('[data-total="kcal"]',    Math.round(t.kcal));
    set('[data-total="protein"]', Math.round(t.p) + ' g');
    set('[data-total="carb"]',    Math.round(t.c) + ' g');
    set('[data-total="fat"]',     Math.round(t.g) + ' g');
    set('[data-target="kcal"]',    '/ ' + target.kcal);
    set('[data-target="protein"]', '/ ' + target.protein + ' g');
    set('[data-target="carb"]',    '/ ' + target.carb + ' g');
    set('[data-target="fat"]',     '/ ' + target.fat + ' g');

    const dev = target.kcal > 0 ? Math.abs(t.kcal - target.kcal) / target.kcal : 0;
    const aside = document.querySelector('[data-smae-totals]');
    if (aside) {
      aside.classList.toggle('is-on-target', dev < 0.05);
      aside.classList.toggle('is-off-target', dev > 0.10);
    }
    const devEl = document.querySelector('[data-smae-deviation]');
    if (devEl) devEl.textContent = `± ${Math.round(dev * 100)}% kcal vs target`;
  }

  function renderMeals() {
    const container = document.querySelector('[data-smae-meals]');
    if (!container || !state.currentPlan) return;
    container.innerHTML = '';
    const meals = getMeals();
    if (!state.currentPlan.menu_options) state.currentPlan.menu_options = {};
    meals.forEach(m => {
      const card = document.createElement('div');
      card.className = 'smae-meal';
      const eqList = GROUPS
        .filter(g => (state.currentPlan.meals[m.key] && state.currentPlan.meals[m.key][g.key] || 0) > 0)
        .map(g => `
          <li>
            <span class="label">[ ${g.abbr} ]</span>
            <span class="smae-meal-name">${g.label}</span>
            <strong>${formatN(state.currentPlan.meals[m.key][g.key])}</strong>
          </li>
        `).join('');
      const opts = state.currentPlan.menu_options[m.key] || ['', '', ''];
      card.innerHTML = `
        <div class="smae-meal-head">
          <span class="label">[ ${m.label} ]</span>
          <span class="label smae-meal-pct">${Math.round(m.pct * 100)}%</span>
        </div>
        ${eqList ? `<ul class="smae-meal-list">${eqList}</ul>` : '<p class="smae-empty label">[ vacío ]</p>'}
        <div class="smae-meal-options">
          <div class="smae-meal-options-head">
            <span class="label">[ 3 opciones de platillo ]</span>
            <button type="button" class="smae-meal-autofill label" data-meal="${m.key}">Auto-llenar →</button>
          </div>
          <div class="smae-meal-options-grid">
            <textarea data-meal-opt="${m.key}" data-opt-idx="0" placeholder="Opción 1: descripción del platillo con porciones" rows="3">${escapeHTML(opts[0] || '')}</textarea>
            <textarea data-meal-opt="${m.key}" data-opt-idx="1" placeholder="Opción 2" rows="3">${escapeHTML(opts[1] || '')}</textarea>
            <textarea data-meal-opt="${m.key}" data-opt-idx="2" placeholder="Opción 3" rows="3">${escapeHTML(opts[2] || '')}</textarea>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    // Listeners para textareas
    container.querySelectorAll('textarea[data-meal-opt]').forEach(ta => {
      ta.addEventListener('input', () => {
        const mealKey = ta.dataset.mealOpt;
        const idx = parseInt(ta.dataset.optIdx, 10);
        if (!state.currentPlan.menu_options[mealKey]) state.currentPlan.menu_options[mealKey] = ['', '', ''];
        state.currentPlan.menu_options[mealKey][idx] = ta.value;
      });
    });
    // Listeners para autofill
    container.querySelectorAll('.smae-meal-autofill').forEach(btn => {
      btn.addEventListener('click', () => {
        const mealKey = btn.dataset.meal;
        const sugerencias = generarSugerenciasMenu(mealKey);
        state.currentPlan.menu_options[mealKey] = sugerencias;
        renderMeals();
      });
    });
  }

  // Genera 3 opciones de platillo a partir de las equivalencias del tiempo +
  // los foods seleccionados por grupo. Cada opción rota entre los foods
  // disponibles para dar variación.
  function generarSugerenciasMenu(mealKey) {
    if (!state.currentPlan) return ['', '', ''];
    const groupsWithEq = GROUPS.filter(g =>
      (state.currentPlan.meals[mealKey] && state.currentPlan.meals[mealKey][g.key] || 0) > 0
    );
    if (groupsWithEq.length === 0) return ['', '', ''];

    const opciones = [0, 1, 2].map(optIdx => {
      const items = groupsWithEq.map(g => {
        const eqAmount = state.currentPlan.meals[mealKey][g.key];
        // Buscar foods seleccionados de este grupo
        const selectedIds = (state.currentPlan.examples && state.currentPlan.examples[g.key]) || [];
        let pool = state.foods.filter(f => selectedIds.includes(f.id));
        // Si no hay seleccionados, usar todos los del grupo
        if (pool.length === 0) pool = state.foods.filter(f => f.group_key === g.key);
        if (pool.length === 0) return `${formatN(eqAmount)} ${g.label}`;
        const food = pool[optIdx % pool.length];
        return `${formatN(eqAmount)} ${g.label.toLowerCase()}: ${food.name} (${food.portion}${eqAmount > 1 ? ' x ' + formatN(eqAmount) : ''})`;
      });
      return items.join('\n');
    });
    return opciones;
  }

  function formatN(n) {
    if (Math.abs(n - Math.round(n)) < 0.01) return Math.round(n);
    return n.toFixed(1);
  }

  // ---------- Render: pacientes -------------------------------------------

  async function loadPatients() {
    try {
      const { patients } = await api('/patients');
      state.patients = patients || [];
      renderPatients();
    } catch (e) {
      console.warn('No se pudo cargar pacientes:', e.message);
    }
  }

  function renderPatients() {
    const container = document.querySelector('[data-smae-patients]');
    const countEl = document.querySelector('[data-smae-count]');
    if (!container) return;
    if (countEl) countEl.textContent = `[ ${state.patients.length} ]`;

    if (state.patients.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Aún no hay pacientes guardados ]</p>';
      return;
    }
    container.innerHTML = '';
    state.patients.forEach(p => {
      const card = document.createElement('div');
      card.className = 'smae-patient';
      const lastDate = p.last_plan_date || p.updated_at;
      card.innerHTML = `
        <div class="smae-patient-head">
          <span class="label">[ ${p.plan_count || 0} plan${p.plan_count === 1 ? '' : 'es'} ]</span>
          <h3>${escapeHTML(p.name)}</h3>
          <p class="label">Última: ${lastDate ? formatDate(lastDate) : '-'}${p.weight ? ' · ' + p.weight + ' kg' : ''}</p>
        </div>
        <div class="smae-patient-actions">
          <button type="button" class="closing-cta-btn closing-cta-btn--ghost" data-action="open" data-id="${p.id}">Abrir →</button>
          <button type="button" class="closing-cta-btn closing-cta-btn--ghost smae-danger" data-action="delete" data-id="${p.id}">×</button>
        </div>
      `;
      container.appendChild(card);
    });
    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'open') openPatient(id);
        else if (action === 'delete') deletePatient(id);
      });
    });
  }

  async function openPatient(id) {
    try {
      const { patient, plans } = await api('/patients/' + id);
      state.currentPatient = patient;
      const last = plans[0];
      if (last) {
        state.currentPlan = {
          patientId: id,
          name: patient.name,
          macros: last.macros,
          equivalencias: last.equivalencias,
          meals: last.meals,
          mode: last.mode || 'normal',
          examples: last.examples || {},
          menu_options: last.menu_options || {},
        };
      } else {
        state.currentPlan = null;
      }
      populatePatientForm(patient);
      populateMeasurements(last);
      if (state.currentPlan) {
        showPlanSection();
        renderGroups();
        renderTotals();
        renderMeals();
        document.querySelector('[data-smae-plan-label]').textContent = `[ Editando: ${patient.name} ]`;
      }
      renderHistorial(plans);
      window.scrollTo({ top: document.querySelector('#datos').offsetTop - 80, behavior: 'smooth' });
    } catch (e) {
      alert('No se pudo abrir paciente: ' + e.message);
    }
  }

  async function deletePatient(id) {
    if (!confirm('¿Eliminar paciente y todos sus planes? No se puede deshacer.')) return;
    try {
      await api('/patients/' + id, { method: 'DELETE' });
      await loadPatients();
    } catch (e) {
      alert('No se pudo eliminar: ' + e.message);
    }
  }

  function populatePatientForm(p) {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) el.value = val == null ? '' : val;
    };
    set('#patient-name', p.name);
    set('#patient-age', p.age);
    set('#patient-weight', p.weight);
    set('#patient-weight-target', p.weight_target);
    set('#patient-height', p.height);
    set('#patient-conditions', p.conditions);
    set('#patient-notes', p.notes);
    set('#patient-email', p.email);
    set('#patient-phone', p.phone);
    set('#patient-seca', p.seca_link);
    set('#patient-next-appt', p.next_appointment);
    if (p.sex) {
      const r = document.querySelector(`input[name="patient-sex"][value="${p.sex}"]`);
      if (r) r.checked = true;
    }
    if (p.activity) set('#patient-activity', p.activity);
    if (p.goal) set('#patient-goal', p.goal);
  }

  function populateMeasurements(plan) {
    if (!plan) return;
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) el.value = val == null ? '' : val;
    };
    set('#meas-cita', plan.cita_num);
    set('#meas-muslo', plan.muslo);
    set('#meas-pierna', plan.pierna);
    set('#meas-bicep', plan.bicep);
    set('#meas-bicep-flex', plan.bicep_flex);
    set('#meas-cintura', plan.cintura);
    set('#meas-cadera', plan.cadera);
    set('#meas-ombligo', plan.ombligo);
  }

  function readPatientForm() {
    const fd = new FormData(document.querySelector('[data-smae-patient-form]'));
    const num = (k) => {
      const v = fd.get(k);
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (k) => (fd.get(k) || '').toString().trim() || null;
    return {
      name: (fd.get('name') || '').toString().trim(),
      sex: fd.get('patient-sex') || null,
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

  function readMeasurements() {
    const fd = new FormData(document.querySelector('[data-smae-patient-form]'));
    const num = (k) => {
      const v = fd.get(k);
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
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

  // ---------- Cálculo de macros desde datos del paciente ------------------

  function autoCalcMacros() {
    const p = readPatientForm();
    if (!p.weight || !p.height || !p.age || !p.activity || !p.goal) return null;
    const sex = p.sex || 'f';
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age + (sex === 'm' ? 5 : -161);
    const target = base * p.activity * p.goal;
    const protein = Math.round(p.weight * 1.8);
    const fat = Math.round((target * 0.25) / 9);
    const carb = Math.round((target - protein * 4 - fat * 9) / 4);
    return { kcal: Math.round(target), protein, carb, fat };
  }

  // ---------- Histórico de peso ------------------------------------------

  function renderHistorial(plans) {
    const container = document.querySelector('[data-smae-historial]');
    if (!container) return;
    if (!plans || plans.length === 0) {
      container.innerHTML = '';
      return;
    }
    const points = plans
      .filter(p => p.weight_at_plan)
      .map(p => ({ date: p.date, weight: p.weight_at_plan }))
      .reverse();
    if (points.length < 2) {
      container.innerHTML = `<p class="label smae-empty">[ ${plans.length} plan(es) guardado(s); sin histórico de peso suficiente ]</p>`;
      return;
    }
    const minW = Math.min(...points.map(p => p.weight));
    const maxW = Math.max(...points.map(p => p.weight));
    const range = (maxW - minW) || 1;
    const W = 60;
    const rows = [];
    points.forEach((pt, idx) => {
      const norm = (pt.weight - minW) / range;
      const bar = '#'.repeat(Math.round(norm * W));
      rows.push(`${formatDate(pt.date).padEnd(14)} ${pt.weight.toString().padStart(5)} kg │${bar}`);
    });
    container.innerHTML = `
      <pre class="smae-sparkline">${rows.join('\n')}</pre>
      <p class="label">Rango: ${minW} kg → ${maxW} kg · ${plans.length} planes</p>
    `;
  }

  // ---------- Foods --------------------------------------------------------

  async function loadFoods() {
    try {
      const { foods } = await api('/foods');
      state.foods = foods || [];
    } catch (e) {
      console.warn('No se pudieron cargar foods:', e.message);
    }
  }

  // ---------- Save plan ---------------------------------------------------

  async function saveCurrentPlan() {
    if (!state.currentPlan || !state.currentPatient) {
      alert('Primero captura datos del paciente y calcula plan.');
      return;
    }
    const meals = getMeals();
    try {
      // Save patient (incluyendo nuevos campos contacto/seca/next appt)
      const patientData = readPatientForm();
      patientData.id = state.currentPatient.id;
      const { id: patientId } = await api('/patients', { method: 'POST', body: patientData });
      // Save plan con antropométricos + menu_options
      const meas = readMeasurements();
      await api(`/patients/${patientId}/plans`, {
        method: 'POST',
        body: {
          date: new Date().toISOString(),
          macros: state.currentPlan.macros,
          equivalencias: state.currentPlan.equivalencias,
          meals: state.currentPlan.meals,
          meals_distribution: meals.map(m => ({ key: m.key, pct: m.pct, label: m.label })),
          mode: state.currentPlan.mode || 'normal',
          examples: state.currentPlan.examples || {},
          menu_options: state.currentPlan.menu_options || {},
          weight_at_plan: patientData.weight || null,
          notes: patientData.notes || null,
          ...meas,
        },
      });
      flashSaved();
      await loadPatients();
    } catch (e) {
      alert('No se pudo guardar: ' + e.message);
    }
  }

  function flashSaved() {
    const btn = document.querySelector('[data-smae-save]');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Guardado ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }

  // ---------- Form & flujo principal --------------------------------------

  function showPlanSection() {
    const sec = document.querySelector('[data-smae-plan-section]');
    if (sec) sec.hidden = false;
    const printBtn = document.querySelector('[data-smae-print]');
    if (printBtn) printBtn.hidden = false;
  }

  async function newPatient() {
    const data = readPatientForm();
    if (!data.name) { alert('Captura el nombre del paciente.'); return; }
    try {
      const { id } = await api('/patients', { method: 'POST', body: data });
      state.currentPatient = { ...data, id };
      // Auto-cálculo si los datos están
      let macros = autoCalcMacros();
      if (!macros) {
        // Permitir captura manual de macros si el paciente no tiene todos los datos
        const km = parseFloat(prompt('Captura kcal objetivo:'));
        if (!km) return;
        macros = {
          kcal: km,
          protein: parseFloat(prompt('Proteína (g):')) || Math.round((data.weight || 65) * 1.8),
          carb: parseFloat(prompt('Carbohidratos (g):')) || Math.round((km * 0.5) / 4),
          fat: parseFloat(prompt('Grasa (g):')) || Math.round((km * 0.25) / 9),
        };
      }
      const mode = document.querySelector('#plan-mode')?.value || 'normal';
      state.currentPlan = {
        patientId: id,
        name: data.name,
        macros,
        mode,
        equivalencias: calculateBase(macros, mode),
        examples: {},
      };
      state.currentPlan.meals = distributeMeals(state.currentPlan.equivalencias, getMeals());
      showPlanSection();
      renderGroups();
      renderTotals();
      renderMeals();
      document.querySelector('[data-smae-plan-label]').textContent = `[ ${MODES[mode]} · ${data.name} ]`;
      window.scrollTo({ top: document.querySelector('#plan').offsetTop - 80, behavior: 'smooth' });
      await loadPatients();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  function applyKcalDelta(pct) {
    if (!state.currentPlan) return;
    state.currentPlan.macros.kcal = Math.round(state.currentPlan.macros.kcal * (1 + pct));
    state.currentPlan.macros.protein = Math.round(state.currentPlan.macros.protein * (1 + pct));
    state.currentPlan.macros.carb = Math.round(state.currentPlan.macros.carb * (1 + pct));
    state.currentPlan.macros.fat = Math.round(state.currentPlan.macros.fat * (1 + pct));
    state.currentPlan.equivalencias = calculateBase(state.currentPlan.macros, state.currentPlan.mode || 'normal');
    state.currentPlan.meals = distributeMeals(state.currentPlan.equivalencias, getMeals());
    renderGroups();
    renderTotals();
    renderMeals();
  }

  // ---------- Init ---------------------------------------------------------

  async function bootstrap() {
    // Sin gate: muestra el main directo.
    hideGate();
    await initApp();
  }

  async function initApp() {
    await Promise.all([loadPatients(), loadFoods()]);

    const newBtn = document.querySelector('[data-smae-new-patient]');
    if (newBtn) newBtn.addEventListener('click', newPatient);

    const saveBtn = document.querySelector('[data-smae-save]');
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentPlan);

    const recalcBtn = document.querySelector('[data-smae-recalc]');
    if (recalcBtn) recalcBtn.addEventListener('click', () => {
      if (!state.currentPlan) return;
      const mode = document.querySelector('#plan-mode')?.value || 'normal';
      state.currentPlan.mode = mode;
      state.currentPlan.equivalencias = calculateBase(state.currentPlan.macros, mode);
      state.currentPlan.meals = distributeMeals(state.currentPlan.equivalencias, getMeals());
      renderGroups();
      renderTotals();
      renderMeals();
    });

    const printBtn = document.querySelector('[data-smae-print]');
    if (printBtn) printBtn.addEventListener('click', () => {
      if (!state.currentPlan) return;
      preparePrintData();
      window.print();
    });

    // Mode selector
    const modeSel = document.querySelector('#plan-mode');
    if (modeSel) modeSel.addEventListener('change', () => {
      if (!state.currentPlan) return;
      state.currentPlan.mode = modeSel.value;
      state.currentPlan.equivalencias = calculateBase(state.currentPlan.macros, modeSel.value);
      state.currentPlan.meals = distributeMeals(state.currentPlan.equivalencias, getMeals());
      renderGroups();
      renderTotals();
      renderMeals();
      const label = document.querySelector('[data-smae-plan-label]');
      if (label && state.currentPlan) label.textContent = `[ ${MODES[modeSel.value]} · ${state.currentPlan.name} ]`;
    });

    // Meals preset
    const presetSel = document.querySelector('#meals-preset');
    if (presetSel) presetSel.addEventListener('change', () => {
      state.mealsPreset = presetSel.value;
      if (state.currentPlan) {
        state.currentPlan.meals = distributeMeals(state.currentPlan.equivalencias, getMeals());
        renderMeals();
      }
    });

    // Kcal delta buttons
    document.querySelectorAll('[data-kcal-delta]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = parseFloat(btn.dataset.kcalDelta);
        applyKcalDelta(pct);
      });
    });

    // Logout button removido (auth deshabilitado)
    const logoutBtn = document.querySelector('[data-smae-logout]');
    if (logoutBtn) logoutBtn.hidden = true;

    // Auto-fill from URL params
    autofillFromQuery();
  }

  function preparePrintData() {
    if (!state.currentPlan || !state.currentPatient) return;
    const root = document.querySelector('[data-smae-print-area]');
    if (!root) return;
    const meals = getMeals();
    const target = state.currentPlan.macros;
    const meas = readMeasurements();

    // Macronutrientes en formato Hugo: %, GR, KCAL
    const totalKcal = target.kcal;
    const ptKcal = target.protein * 4;
    const lpKcal = target.fat * 9;
    const hcKcal = target.carb * 4;
    const ptPct = totalKcal > 0 ? (ptKcal / totalKcal * 100).toFixed(2) : 0;
    const lpPct = totalKcal > 0 ? (lpKcal / totalKcal * 100).toFixed(2) : 0;
    const hcPct = totalKcal > 0 ? (hcKcal / totalKcal * 100).toFixed(2) : 0;

    const RECOMENDACIONES = [
      'Cocina a la plancha, al vapor, al carbón, hervido, al horno o en caldo. Te permite tener diferentes texturas y sabores sin necesidad de agregar aceite.',
      'Prepara tus comidas por adelantado. Cocinar dos o tres platillos en una ocasión te ayuda a evitar romper tu plan.',
      'En ocasiones especiales donde no puedas evitar romper la dieta, mide y controla lo que consumas, o ve preparado con algún snack o colación de los que tengas en tu plan.',
      'Evita malos hábitos como desvelarte, fumar e ingerir bebidas alcohólicas o cualquier tipo de drogas. Interrumpen las señales de preservación de masa muscular o impiden que crezca.',
      'Duerme 7-8 horas por lo menos. Apaga las luces u oscurece tu cuarto antes de dormir. Temperatura promedio de 18-21° C dentro del cuarto.',
      'Busca hábitos que disminuyan tu estrés: respirar profundo, meditar, momentos de relajación, introspección constante.',
      'Tomate fotos 1 vez por semana. Observa tu digestión, niveles de energía, rendimiento laboral y escolar.',
      'La terapia psicológica y el manejo correcto de las emociones te brindarán un pilar fuerte para que tengas éxito.',
    ];

    const LIBRES = [
      'Especias en general (laurel, orégano, comino, pimienta, paprika, curry, jengibre, cebolla en polvo, ajo en polvo, clavo, tomillo, etc.)',
      'Café negro 2 tazas al día',
      'Refresco light 1 taza al día',
      'Tés o infusiones de hojas naturales 2 tazas al día',
      'Stevia, Splenda o Monk Fruit',
    ];

    const EVITAR = [
      'Agregar grasas o aceite para cocinar tus alimentos',
      'Cualquier alimento que no se mencione en el menú',
      'Aceite de girasol, maíz, soya, canola, uva, cáñamo o cártamo',
    ];

    const ERRORES = [
      ['No medir o pesar las porciones que te indique', 'Si no mides la comida, no sabes cuánto estás comiendo. Apégate a las porciones y gramos, medidas de tazas, cucharas o cucharaditas.'],
      ['No tomar la cantidad recomendada de agua', 'No siempre es fácil consumir agua si no tienes el hábito, pero te mantiene hidratado y satisfecho.'],
      ['No terminarse la comida', 'Si consumes menos calorías de las indicadas, podrías hacer que tu apetito aumente después.'],
      ['Pesarte constantemente', 'El peso no lo es todo. Como estás haciendo ejercicio, también aumenta tu masa muscular y disminuye la grasa, así que el peso puede mantenerse igual.'],
      ['Agregar aceite, sazonadores, salsa o aderezos sin mi recomendación', 'Estos alimentos suman calorías y arruinan el plan. Pregúntame antes de utilizarlos.'],
      ['Comprar un producto diferente al recomendado', 'Cambiar productos puede cambiar la calidad nutricional y su valor calórico. Pregúntame por sustitutos.'],
      ['Consumir productos o alimentos extras', 'Todo alimento es calórico. Productos con fama de saludables no siempre lo son.'],
      ['Confiar en el etiquetado de productos light', 'La publicidad suele ser engañosa. Avísame antes de consumirlos.'],
    ];

    // Histórico antropométrico (para columnas en tabla): juntar todos los planes con mediciones
    // se construye después con datos cargados; por ahora solo muestra el actual
    const measRow = (label, key) => {
      const v = meas[key];
      return v != null ? `<td><strong>${v}</strong></td>` : '<td>-</td>';
    };

    const citaNum = meas.cita_num ? `${meas.cita_num}ª Cita` : 'Cita actual';
    const fecha = formatDate(new Date().toISOString());

    // Menú semanal con 3 opciones por tiempo
    const menuOpts = state.currentPlan.menu_options || {};
    const mealRows = meals.map(m => {
      const eqAbbrs = GROUPS
        .filter(g => (state.currentPlan.meals[m.key] && state.currentPlan.meals[m.key][g.key] || 0) > 0)
        .map(g => `${g.abbr} ${formatN(state.currentPlan.meals[m.key][g.key])}`)
        .join(' · ');
      const opts = menuOpts[m.key] || ['', '', ''];
      return `
        <tr>
          <td class="print-meal-name">
            <strong>${m.label.toUpperCase()}</strong>
            <div class="print-meal-eqs">${eqAbbrs}</div>
          </td>
          <td>${escapeMultiline(opts[0])}</td>
          <td>${escapeMultiline(opts[1])}</td>
          <td>${escapeMultiline(opts[2])}</td>
        </tr>
      `;
    }).join('');

    root.innerHTML = `
      <!-- Página 1: portada -->
      <section class="print-page print-cover">
        <div class="print-cover-mark">
          <span class="print-bracket">[</span>
          <span class="print-prado">PRADO</span>
          <span class="print-bracket">]</span>
        </div>
        <div class="print-cover-x">x</div>
        <div class="print-cover-name">${escapeHTML(state.currentPatient.name).toUpperCase()}</div>
        ${meas.cita_num ? `<div class="print-cover-cita">${citaNum}</div>` : ''}
      </section>

      <!-- Página 2: macros + antropométricos -->
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
          <thead>
            <tr>
              <th>Datos</th>
              <th>${citaNum}<br/><span class="print-fecha">${fecha}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr><th>Muslo</th>${measRow('Muslo', 'muslo')}</tr>
            <tr><th>Pierna</th>${measRow('Pierna', 'pierna')}</tr>
            <tr><th>Bícep</th>${measRow('Bícep', 'bicep')}</tr>
            <tr><th>Bícep flex</th>${measRow('Bícep flex', 'bicep_flex')}</tr>
            <tr><th>Cintura</th>${measRow('Cintura', 'cintura')}</tr>
            <tr><th>Cadera</th>${measRow('Cadera', 'cadera')}</tr>
            <tr><th>Ombligo</th>${measRow('Ombligo', 'ombligo')}</tr>
          </tbody>
        </table>
      </section>

      <!-- Página 3: recomendaciones -->
      <section class="print-page">
        <h2 class="print-h2">[ Recomendaciones ]</h2>
        <ul class="print-list">
          ${RECOMENDACIONES.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </section>

      <!-- Página 4: alimentos libres y a evitar -->
      <section class="print-page">
        <h2 class="print-h2">[ Alimentos libres ]</h2>
        <ul class="print-list">${LIBRES.map(r => `<li>${r}</li>`).join('')}</ul>
        <h2 class="print-h2">[ Alimentos que debes evitar ]</h2>
        <ul class="print-list">${EVITAR.map(r => `<li>${r}</li>`).join('')}</ul>
      </section>

      <!-- Página 5: errores frecuentes -->
      <section class="print-page">
        <h2 class="print-h2">[ Errores frecuentes que pueden provocar que abandones el plan ]</h2>
        <ul class="print-list">
          ${ERRORES.map(([t, d]) => `<li><strong>${t}.</strong> ${d}</li>`).join('')}
        </ul>
      </section>

      <!-- Página 6: menú semanal -->
      <section class="print-page print-menu-page">
        <h2 class="print-h2">[ Menú semanal ]</h2>
        <p class="print-leyenda">Pza: pieza · c: cucharadita · C: cucharada · T: taza · gr: gramos · reb: rebanada</p>
        <table class="print-menu">
          <thead>
            <tr>
              <th>Tiempo</th>
              <th>Opción 1</th>
              <th>Opción 2</th>
              <th>Opción 3</th>
            </tr>
          </thead>
          <tbody>${mealRows}</tbody>
        </table>
        <p class="print-leyenda print-leyenda-foot">
          Verduras: ejotes, nopales, espinacas, acelgas, coliflor, brócoli, zanahoria, chayote, espárragos, champiñones, lechuga, cebolla, jitomate, pimiento morrón.
        </p>
      </section>

      <!-- Página 7: cierre -->
      <section class="print-page print-close">
        <p class="print-close-msg">¡Recuerda que es un proceso, y el proceso no es lineal! Habrá días buenos y días malos, todo gran esfuerzo traerá un gran resultado.</p>
        <div class="print-close-pillars">
          <div>PACIENCIA</div>
          <div>PERSEVERANCIA</div>
          <div>DISCIPLINA</div>
        </div>
        <p class="print-close-wish">¡Te deseo muchísimo éxito!</p>
        <div class="print-cover-mark print-close-mark">
          <span class="print-bracket">[</span>
          <span class="print-prado">PRADO</span>
          <span class="print-bracket">]</span>
        </div>
      </section>
    `;
  }

  function escapeMultiline(s) {
    if (!s) return '<span class="print-empty">-</span>';
    return escapeHTML(s).replace(/\n/g, '<br/>');
  }

  function autofillFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('kcal') && !params.has('weight')) return;
    if (params.has('name')) document.querySelector('#patient-name').value = params.get('name');
    if (params.has('age')) document.querySelector('#patient-age').value = params.get('age');
    if (params.has('weight')) document.querySelector('#patient-weight').value = params.get('weight');
    if (params.has('height')) document.querySelector('#patient-height').value = params.get('height');
    if (params.has('activity')) document.querySelector('#patient-activity').value = params.get('activity');
    if (params.has('goal')) document.querySelector('#patient-goal').value = params.get('goal');
    if (params.has('sex')) {
      const r = document.querySelector(`input[name="patient-sex"][value="${params.get('sex')}"]`);
      if (r) r.checked = true;
    }
  }

  // ---------- Utils --------------------------------------------------------

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return iso; }
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
