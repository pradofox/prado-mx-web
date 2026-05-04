/* SMAE - Sistema Mexicano de Alimentos Equivalentes
   Herramienta interna para Hugo Prado.
   - Calcula reparto macros -> 16 grupos SMAE
   - Plan editable en vivo, totales recalculados al instante
   - Distribución en 5 tiempos (desayuno, colación 1, comida, colación 2, cena)
   - Persistencia en localStorage por paciente, con historial de planes */
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

  const MEALS = [
    { key: 'desayuno', label: 'Desayuno',     pct: 0.25 },
    { key: 'col1',     label: 'Colación 1',   pct: 0.10 },
    { key: 'comida',   label: 'Comida',       pct: 0.30 },
    { key: 'col2',     label: 'Colación 2',   pct: 0.10 },
    { key: 'cena',     label: 'Cena',         pct: 0.25 },
  ];

  const STORAGE_KEY = 'prado-smae-v1';

  // ---------- Estado -------------------------------------------------------

  let currentPlan = null; // { patientId, name, date, macros, equivalencias, meals }
  let editingPatientId = null;

  // ---------- Algoritmo macros -> equivalencias ---------------------------

  // Estrategia: empezar con base mínima nutricional (verduras, frutas, leche,
  // leguminosas), llenar AOA hasta proteína target, llenar cereales hasta carb
  // target, llenar aceites hasta grasa target. Iteración simple para que los
  // residuos queden cerca del objetivo.
  function calculateBase(macros) {
    const eq = {};
    GROUPS.forEach(g => eq[g.key] = 0);

    // Pisos nutricionales razonables (Hugo ajusta a mano si quiere)
    eq['verduras'] = Math.max(3, Math.round(macros.kcal / 600));   // 3 a ~5
    eq['frutas']   = Math.max(2, Math.round(macros.kcal / 500));   // 2 a ~5
    eq['leguminosas'] = 1;
    eq['leche-s']  = 1;

    // Lo que ya cubrimos
    let covered = sum(eq);

    // Faltante por macro
    let restP = macros.protein - covered.p;
    let restC = macros.carb    - covered.c;
    let restG = macros.fat     - covered.g;

    // Proteína: AOA bajo en grasa como default
    if (restP > 0) {
      const aoa = Math.max(0, Math.round(restP / 7));
      eq['aoa-b'] = aoa;
    }

    // Recalcular tras AOA
    covered = sum(eq);
    restC = macros.carb - covered.c;
    restG = macros.fat  - covered.g;

    // Carbohidratos: cereales s/grasa
    if (restC > 0) {
      const cer = Math.max(0, Math.round(restC / 15));
      eq['cereales-sg'] = cer;
    }

    // Grasa: aceites sin proteína
    covered = sum(eq);
    restG = macros.fat - covered.g;
    if (restG > 0) {
      const ac = Math.max(0, Math.round(restG / 5));
      eq['aceites-sp'] = ac;
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

  // ---------- Distribución en tiempos -------------------------------------

  function distributeMeals(eq) {
    // Reparte cada grupo entre los 5 tiempos según pct (con redondeo).
    // Quien quede con sobrante se acomoda en comida o desayuno.
    const meals = {};
    MEALS.forEach(m => {
      meals[m.key] = {};
      GROUPS.forEach(g => meals[m.key][g.key] = 0);
    });

    GROUPS.forEach(g => {
      const total = eq[g.key] || 0;
      if (total === 0) return;
      let assigned = 0;
      MEALS.forEach((m, idx) => {
        const portion = idx === MEALS.length - 1
          ? total - assigned
          : Math.round(total * m.pct);
        meals[m.key][g.key] = Math.max(0, portion);
        assigned += meals[m.key][g.key];
      });
    });

    return meals;
  }

  // ---------- Render: grupos --------------------------------------------

  function renderGroups() {
    const container = document.querySelector('[data-smae-groups]');
    container.innerHTML = '';
    GROUPS.forEach(g => {
      const row = document.createElement('div');
      row.className = 'smae-group';
      row.dataset.group = g.key;
      const value = currentPlan.equivalencias[g.key] || 0;
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
      `;
      container.appendChild(row);
    });

    // Listeners
    container.querySelectorAll('.smae-group').forEach(row => {
      const key = row.dataset.group;
      const input = row.querySelector('[data-group-input]');
      input.addEventListener('input', () => {
        const v = Math.max(0, parseFloat(input.value) || 0);
        currentPlan.equivalencias[key] = v;
        currentPlan.meals = distributeMeals(currentPlan.equivalencias);
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
    });
  }

  function renderTotals() {
    const t = sum(currentPlan.equivalencias);
    const target = currentPlan.macros;
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

    // Color coding por desviación de kcal
    const dev = target.kcal > 0 ? Math.abs(t.kcal - target.kcal) / target.kcal : 0;
    const aside = document.querySelector('[data-smae-totals]');
    aside.classList.toggle('is-on-target', dev < 0.05);
    aside.classList.toggle('is-off-target', dev > 0.10);
    const devEl = document.querySelector('[data-smae-deviation]');
    if (devEl) devEl.textContent = `± ${Math.round(dev * 100)}% kcal vs target`;
  }

  function renderMeals() {
    const container = document.querySelector('[data-smae-meals]');
    container.innerHTML = '';
    MEALS.forEach(m => {
      const card = document.createElement('div');
      card.className = 'smae-meal';
      const items = GROUPS
        .filter(g => (currentPlan.meals[m.key][g.key] || 0) > 0)
        .map(g => `
          <li>
            <span class="label">[ ${g.abbr} ]</span>
            <span class="smae-meal-name">${g.label}</span>
            <strong>${formatN(currentPlan.meals[m.key][g.key])}</strong>
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

  // ---------- Persistencia -----------------------------------------------

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { patients: [] };
      return JSON.parse(raw);
    } catch (e) {
      return { patients: [] };
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      alert('No se pudo guardar (localStorage lleno o bloqueado).');
    }
  }

  function savePlan() {
    if (!currentPlan) return;
    const store = loadStore();
    let patient = store.patients.find(p => p.id === currentPlan.patientId);
    if (!patient) {
      patient = {
        id: currentPlan.patientId,
        name: currentPlan.name,
        plans: [],
      };
      store.patients.push(patient);
    }
    patient.name = currentPlan.name;
    patient.plans.push({
      date: new Date().toISOString(),
      macros: { ...currentPlan.macros },
      equivalencias: { ...currentPlan.equivalencias },
      meals: JSON.parse(JSON.stringify(currentPlan.meals)),
    });
    saveStore(store);
    renderPatients();
    flashSaved();
  }

  function flashSaved() {
    const btn = document.querySelector('[data-smae-save]');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Guardado ✓';
    setTimeout(() => { btn.textContent = original; }, 1600);
  }

  function renderPatients() {
    const store = loadStore();
    const container = document.querySelector('[data-smae-patients]');
    const countEl = document.querySelector('[data-smae-count]');
    if (countEl) countEl.textContent = `[ ${store.patients.length} ]`;

    if (store.patients.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Aún no hay pacientes guardados ]</p>';
      return;
    }
    container.innerHTML = '';
    [...store.patients].sort((a, b) => {
      const aDate = a.plans[a.plans.length - 1]?.date || '';
      const bDate = b.plans[b.plans.length - 1]?.date || '';
      return bDate.localeCompare(aDate);
    }).forEach(p => {
      const last = p.plans[p.plans.length - 1];
      const card = document.createElement('div');
      card.className = 'smae-patient';
      card.innerHTML = `
        <div class="smae-patient-head">
          <span class="label">[ ${p.plans.length} plan${p.plans.length !== 1 ? 'es' : ''} ]</span>
          <h3>${escapeHTML(p.name)}</h3>
          <p class="label">Última: ${last ? formatDate(last.date) : '-'} · ${last ? last.macros.kcal + ' kcal' : ''}</p>
        </div>
        <div class="smae-patient-actions">
          <button type="button" class="closing-cta-btn closing-cta-btn--ghost" data-action="open" data-id="${p.id}">Abrir último →</button>
          <button type="button" class="closing-cta-btn closing-cta-btn--ghost" data-action="export" data-id="${p.id}">Export</button>
          <button type="button" class="closing-cta-btn closing-cta-btn--ghost smae-danger" data-action="delete" data-id="${p.id}">Eliminar</button>
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
        else if (action === 'export') exportPatient(id);
      });
    });
  }

  function openPatient(id) {
    const store = loadStore();
    const p = store.patients.find(x => x.id === id);
    if (!p) return;
    const last = p.plans[p.plans.length - 1];
    if (!last) return;
    editingPatientId = id;
    currentPlan = {
      patientId: id,
      name: p.name,
      macros: { ...last.macros },
      equivalencias: { ...last.equivalencias },
      meals: JSON.parse(JSON.stringify(last.meals)),
    };
    // Repopular form
    document.querySelector('#patient-name').value = p.name;
    document.querySelector('#kcal').value = last.macros.kcal;
    document.querySelector('#protein').value = last.macros.protein;
    document.querySelector('#carb').value = last.macros.carb;
    document.querySelector('#fat').value = last.macros.fat;
    showPlanSection();
    renderGroups();
    renderTotals();
    renderMeals();
    document.querySelector('[data-smae-plan-label]').textContent = `[ Editando: ${p.name} ]`;
    window.scrollTo({ top: document.querySelector('#plan').offsetTop - 80, behavior: 'smooth' });
  }

  function deletePatient(id) {
    if (!confirm('¿Eliminar paciente y todos sus planes? No se puede deshacer.')) return;
    const store = loadStore();
    store.patients = store.patients.filter(p => p.id !== id);
    saveStore(store);
    renderPatients();
  }

  function exportPatient(id) {
    const store = loadStore();
    const p = store.patients.find(x => x.id === id);
    if (!p) return;
    download(`smae-${slug(p.name)}.json`, JSON.stringify(p, null, 2));
  }

  function exportAll() {
    const store = loadStore();
    download(`smae-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store, null, 2));
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const store = loadStore();
        // Acepta { patients: [...] } o un solo paciente { id, name, plans }
        const incoming = data.patients ? data.patients : [data];
        incoming.forEach(p => {
          const existing = store.patients.find(x => x.id === p.id);
          if (existing) {
            existing.plans = mergeUnique([...existing.plans, ...(p.plans || [])], 'date');
            existing.name = p.name || existing.name;
          } else {
            store.patients.push(p);
          }
        });
        saveStore(store);
        renderPatients();
        alert('Importado.');
      } catch (e) {
        alert('Archivo inválido.');
      }
    };
    reader.readAsText(file);
  }

  function mergeUnique(arr, key) {
    const seen = new Set();
    const out = [];
    arr.forEach(item => {
      if (seen.has(item[key])) return;
      seen.add(item[key]);
      out.push(item);
    });
    return out;
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function slug(s) {
    return (s || 'paciente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return iso; }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------- Form & flujo principal -------------------------------------

  function showPlanSection() {
    const sec = document.querySelector('[data-smae-plan-section]');
    if (sec) sec.hidden = false;
  }

  function fromMacros() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('kcal')) {
      alert('Para importar, abre /macros y comparte el link con tus datos. Luego pégalo aquí.');
      return;
    }
    document.querySelector('#kcal').value    = params.get('kcal') || '';
    document.querySelector('#protein').value = params.get('protein') || '';
    document.querySelector('#carb').value    = params.get('carb') || '';
    document.querySelector('#fat').value     = params.get('fat') || '';
  }

  function autofillFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('kcal'))    document.querySelector('#kcal').value    = params.get('kcal');
    if (params.has('protein')) document.querySelector('#protein').value = params.get('protein');
    if (params.has('carb'))    document.querySelector('#carb').value    = params.get('carb');
    if (params.has('fat'))     document.querySelector('#fat').value     = params.get('fat');
    if (params.has('name'))    document.querySelector('#patient-name').value = params.get('name');
  }

  function init() {
    const form = document.querySelector('[data-smae-form]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const num = (k) => parseFloat(data.get(k)) || 0;
      const macros = {
        kcal: num('kcal'),
        protein: num('protein'),
        carb: num('carb'),
        fat: num('fat'),
      };
      const name = (data.get('name') || '').toString().trim();
      if (!name || !macros.kcal) return;
      currentPlan = {
        patientId: editingPatientId || ('p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        name,
        macros,
        equivalencias: calculateBase(macros),
      };
      currentPlan.meals = distributeMeals(currentPlan.equivalencias);
      editingPatientId = null;
      showPlanSection();
      renderGroups();
      renderTotals();
      renderMeals();
      document.querySelector('[data-smae-plan-label]').textContent = `[ Editable · ${name} ]`;
      window.scrollTo({ top: document.querySelector('#plan').offsetTop - 80, behavior: 'smooth' });
    });

    document.querySelector('[data-smae-from-macros]').addEventListener('click', fromMacros);
    document.querySelector('[data-smae-save]').addEventListener('click', savePlan);
    document.querySelector('[data-smae-recalc]').addEventListener('click', () => {
      if (!currentPlan) return;
      currentPlan.equivalencias = calculateBase(currentPlan.macros);
      currentPlan.meals = distributeMeals(currentPlan.equivalencias);
      renderGroups();
      renderTotals();
      renderMeals();
    });
    document.querySelector('[data-smae-export]').addEventListener('click', () => {
      if (!currentPlan) return;
      download(`smae-${slug(currentPlan.name)}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(currentPlan, null, 2));
    });
    document.querySelector('[data-smae-export-all]').addEventListener('click', exportAll);
    document.querySelector('[data-smae-import]').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importJSON(file);
      e.target.value = '';
    });

    autofillFromQuery();
    renderPatients();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
