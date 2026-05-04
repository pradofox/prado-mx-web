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

  async function api(path, options = {}) {
    const opts = {
      ...options,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    };
    if (options.body && typeof options.body !== 'string') opts.body = JSON.stringify(options.body);
    const r = await fetch('/api/smae' + path, opts);
    if (r.status === 401) {
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

  // ---------- Gate (password) ---------------------------------------------

  function showGate() {
    const gate = document.querySelector('[data-smae-gate]');
    if (gate) gate.hidden = false;
    const main = document.querySelector('[data-smae-main]');
    if (main) main.hidden = true;
  }

  function hideGate() {
    const gate = document.querySelector('[data-smae-gate]');
    if (gate) gate.hidden = true;
    const main = document.querySelector('[data-smae-main]');
    if (main) main.hidden = false;
  }

  async function checkAuth() {
    try {
      const r = await api('/auth', { method: 'GET' });
      return !!r.authed;
    } catch (e) {
      return false;
    }
  }

  async function tryLogin(password) {
    try {
      const r = await fetch('/api/smae/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: String(password).trim() }),
      });
      console.log('[smae] login status:', r.status);
      return r.ok;
    } catch (e) {
      console.error('[smae] login error:', e);
      return false;
    }
  }

  // ---------- Algoritmo macros -> equivalencias --------------------------

  function calculateBase(macros, mode) {
    const eq = {};
    GROUPS.forEach(g => eq[g.key] = 0);

    const isVeg   = (mode === 'vegetariano' || mode === 'vegano');
    const isVegan = (mode === 'vegano');
    const isRenal = (mode === 'renal');

    // Pisos nutricionales por kcal
    eq['verduras'] = Math.max(3, Math.round(macros.kcal / 600));
    eq['frutas']   = Math.max(2, Math.round(macros.kcal / 500));

    // Leche solo si no vegano
    if (!isVegan) {
      eq[isRenal ? 'leche-d' : 'leche-s'] = isRenal ? 0.5 : 1;
    }

    // Leguminosas: más en vegano/vegetariano para cubrir proteína
    eq['leguminosas'] = isVegan ? 3 : (isVeg ? 2 : 1);

    let covered = sum(eq);

    // Proteína restante
    let restP = macros.protein - covered.p;
    if (restP > 0) {
      if (isVegan) {
        // Sumar más leguminosas
        const extra = Math.max(0, Math.round(restP / 8));
        eq['leguminosas'] = (eq['leguminosas'] || 0) + extra;
      } else if (isVeg) {
        // AOA reemplazado por más leche + huevo (asumimos huevo en AOA moderado)
        eq['aoa-m'] = Math.max(0, Math.round(restP / 7));
      } else if (isRenal) {
        // AOA muy bajo en grasa, conservadora
        eq['aoa-mb'] = Math.max(0, Math.round(restP / 7));
      } else {
        eq['aoa-b'] = Math.max(0, Math.round(restP / 7));
      }
    }

    covered = sum(eq);
    let restC = macros.carb - covered.c;
    if (restC > 0) {
      eq['cereales-sg'] = Math.max(0, Math.round(restC / 15));
    }

    covered = sum(eq);
    let restG = macros.fat - covered.g;
    if (restG > 0) {
      eq['aceites-sp'] = Math.max(0, Math.round(restG / 5));
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
        const portion = idx === meals.length - 1
          ? total - assigned
          : Math.round(total * m.pct * 2) / 2;
        out[m.key][g.key] = Math.max(0, portion);
        assigned += out[m.key][g.key];
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
    meals.forEach(m => {
      const card = document.createElement('div');
      card.className = 'smae-meal';
      const items = GROUPS
        .filter(g => (state.currentPlan.meals[m.key] && state.currentPlan.meals[m.key][g.key] || 0) > 0)
        .map(g => `
          <li>
            <span class="label">[ ${g.abbr} ]</span>
            <span class="smae-meal-name">${g.label}</span>
            <strong>${formatN(state.currentPlan.meals[m.key][g.key])}</strong>
          </li>
        `).join('');
      card.innerHTML = `
        <div class="smae-meal-head">
          <span class="label">[ ${m.label} ]</span>
          <span class="label smae-meal-pct">${Math.round(m.pct * 100)}%</span>
        </div>
        ${items ? `<ul class="smae-meal-list">${items}</ul>` : '<p class="smae-empty label">[ vacío ]</p>'}
      `;
      container.appendChild(card);
    });
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
        };
        if (last.meals_distribution) {
          // No editing custom; keep preset for now
        }
      } else {
        state.currentPlan = null;
      }
      populatePatientForm(patient);
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
    if (p.sex) {
      const r = document.querySelector(`input[name="patient-sex"][value="${p.sex}"]`);
      if (r) r.checked = true;
    }
    if (p.activity) set('#patient-activity', p.activity);
    if (p.goal) set('#patient-goal', p.goal);
  }

  function readPatientForm() {
    const fd = new FormData(document.querySelector('[data-smae-patient-form]'));
    const num = (k) => {
      const v = fd.get(k);
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      name: (fd.get('name') || '').toString().trim(),
      sex: fd.get('patient-sex') || null,
      age: num('age'),
      weight: num('weight'),
      weight_target: num('weight_target'),
      height: num('height'),
      activity: num('activity'),
      goal: num('goal'),
      conditions: (fd.get('conditions') || '').toString().trim() || null,
      notes: (fd.get('notes') || '').toString().trim() || null,
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
      // Save patient
      const patientData = readPatientForm();
      patientData.id = state.currentPatient.id;
      const { id: patientId } = await api('/patients', { method: 'POST', body: patientData });
      // Save plan
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
          weight_at_plan: patientData.weight || null,
          notes: patientData.notes || null,
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
    // Setup gate
    const gateForm = document.querySelector('[data-smae-gate-form]');
    if (gateForm) {
      gateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.querySelector('#gate-password');
        const password = (input && input.value || '').trim();
        if (!password) return;
        const submitBtn = gateForm.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verificando...'; }
        const err = document.querySelector('[data-smae-gate-error]');
        if (err) err.hidden = true;
        const ok = await tryLogin(password);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar →'; }
        if (ok) {
          hideGate();
          await initApp();
        } else {
          if (err) err.hidden = false;
          if (input) { input.value = ''; input.focus(); }
        }
      });
    }

    const authed = await checkAuth();
    if (!authed) {
      showGate();
    } else {
      hideGate();
      await initApp();
    }
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

    // Logout
    const logoutBtn = document.querySelector('[data-smae-logout]');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      await fetch('/api/smae/auth/logout', { method: 'POST', credentials: 'include' });
      showGate();
    });

    // Auto-fill from URL params
    autofillFromQuery();
  }

  function preparePrintData() {
    if (!state.currentPlan || !state.currentPatient) return;
    const root = document.querySelector('[data-smae-print-area]');
    if (!root) return;
    const meals = getMeals();
    const t = sum(state.currentPlan.equivalencias);
    const target = state.currentPlan.macros;
    const exampleNames = (groupKey) => {
      const ids = (state.currentPlan.examples && state.currentPlan.examples[groupKey]) || [];
      return ids.map(id => {
        const f = state.foods.find(x => x.id === id);
        return f ? `${f.name} (${f.portion})` : null;
      }).filter(Boolean);
    };
    root.innerHTML = `
      <div class="print-letterhead">
        <div class="print-brand">PRADO · Hugo Prado</div>
        <div class="print-cred">Nutriólogo licenciado UANL</div>
        <div class="print-contact">contacto@prado-mx.com · prado-mx.com</div>
      </div>
      <h1 class="print-title">Plan de equivalencias</h1>
      <table class="print-meta">
        <tr><th>Paciente</th><td>${escapeHTML(state.currentPatient.name)}</td>
            <th>Fecha</th><td>${formatDate(new Date().toISOString())}</td></tr>
        ${state.currentPatient.weight ? `<tr><th>Peso</th><td>${state.currentPatient.weight} kg${state.currentPatient.weight_target ? ' → ' + state.currentPatient.weight_target + ' kg' : ''}</td>
            <th>Modo</th><td>${MODES[state.currentPlan.mode || 'normal']}</td></tr>` : ''}
      </table>
      <h2 class="print-h2">Macros objetivo</h2>
      <table class="print-macros">
        <tr>
          <th>Kcal</th><td>${target.kcal}</td>
          <th>Proteína</th><td>${target.protein} g</td>
          <th>Carbohidratos</th><td>${target.carb} g</td>
          <th>Grasa</th><td>${target.fat} g</td>
        </tr>
        <tr class="print-actual">
          <th>Calculado</th><td>${Math.round(t.kcal)}</td>
          <th></th><td>${Math.round(t.p)} g</td>
          <th></th><td>${Math.round(t.c)} g</td>
          <th></th><td>${Math.round(t.g)} g</td>
        </tr>
      </table>
      <h2 class="print-h2">Equivalencias por grupo</h2>
      <table class="print-eq">
        <thead><tr><th>Grupo</th><th>Eq.</th><th>Ejemplos</th></tr></thead>
        <tbody>
          ${GROUPS.filter(g => (state.currentPlan.equivalencias[g.key] || 0) > 0).map(g => `
            <tr>
              <td><strong>${g.label}</strong> <span class="label">${g.kcal} kcal</span></td>
              <td>${formatN(state.currentPlan.equivalencias[g.key])}</td>
              <td>${exampleNames(g.key).join(' · ') || '<span class="label">-</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <h2 class="print-h2">Distribución por tiempos</h2>
      <table class="print-meals">
        <thead><tr><th>Tiempo</th><th>%</th><th>Equivalencias</th></tr></thead>
        <tbody>
          ${meals.map(m => `
            <tr>
              <td><strong>${m.label}</strong></td>
              <td>${Math.round(m.pct * 100)}%</td>
              <td>
                ${GROUPS
                  .filter(g => (state.currentPlan.meals[m.key] && state.currentPlan.meals[m.key][g.key] || 0) > 0)
                  .map(g => `${formatN(state.currentPlan.meals[m.key][g.key])} ${g.label.toLowerCase()}`)
                  .join(' · ') || '<span class="label">-</span>'
                }
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${state.currentPatient.notes ? `<h2 class="print-h2">Notas</h2><p class="print-notes">${escapeHTML(state.currentPatient.notes)}</p>` : ''}
      <p class="print-footer">Plan generado con Sistema Mexicano de Equivalentes (SMAE). Sujeto a calibración profesional. Hugo Prado, nutriólogo licenciado UANL.</p>
    `;
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
