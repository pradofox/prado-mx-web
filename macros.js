// Macros Monterrey - calibrada por Hugo Prado (UANL).
// Mifflin-St Jeor para TMB, multiplicadores estándar de actividad y objetivo.
// Estado de entradas persistido en querystring (URL compartible).
(function () {
  const form = document.querySelector('[data-macros-form]');
  const result = document.querySelector('[data-macros-result]');
  const copyBtn = document.querySelector('[data-macros-copy]');
  if (!form || !result) return;

  function readState() {
    const params = new URLSearchParams(window.location.search);
    return {
      sex: params.get('sex'),
      age: params.get('age'),
      weight: params.get('weight'),
      height: params.get('height'),
      activity: params.get('activity'),
      goal: params.get('goal'),
    };
  }

  function applyState(s) {
    if (s.sex) {
      const r = form.querySelector(`input[name="sex"][value="${s.sex}"]`);
      if (r) r.checked = true;
    }
    if (s.age) form.elements.age.value = s.age;
    if (s.weight) form.elements.weight.value = s.weight;
    if (s.height) form.elements.height.value = s.height;
    if (s.activity) form.elements.activity.value = s.activity;
    if (s.goal) form.elements.goal.value = s.goal;
  }

  function pickState() {
    const fd = new FormData(form);
    const num = (v, fallback) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      sex: fd.get('sex') || 'f',
      age: num(fd.get('age'), 28),
      weight: num(fd.get('weight'), 65),
      height: num(fd.get('height'), 165),
      activity: num(fd.get('activity'), 1.375),
      goal: num(fd.get('goal'), 1.0),
    };
  }

  function compute(s) {
    if (!s.age || !s.weight || !s.height) return null;
    const base = 10 * s.weight + 6.25 * s.height - 5 * s.age + (s.sex === 'm' ? 5 : -161);
    const maintain = base * s.activity;
    const target = maintain * s.goal;
    const proteinG = Math.round(s.weight * 1.8);
    const fatG = Math.round((target * 0.25) / 9);
    const carbG = Math.round((target - proteinG * 4 - fatG * 9) / 4);
    return {
      tmb: Math.round(base),
      maintain: Math.round(maintain),
      kcal: Math.round(target),
      protein: proteinG,
      fat: fatG,
      carb: carbG,
    };
  }

  function render(s, r) {
    if (!r) { result.innerHTML = ''; return; }
    const goalLabel = s.goal < 1 ? 'Déficit' : s.goal > 1 ? 'Superávit' : 'Mantener';
    result.innerHTML = `
      <div class="macros-card">
        <div class="macros-card-head">
          <span class="label">[ Resultado ] ${goalLabel}</span>
          <span class="label">${r.kcal} kcal / día</span>
        </div>
        <div class="macros-grid">
          <div><span class="label">Proteína</span><strong>${r.protein}g</strong></div>
          <div><span class="label">Carbohidratos</span><strong>${r.carb}g</strong></div>
          <div><span class="label">Grasas</span><strong>${r.fat}g</strong></div>
        </div>
        <div class="macros-footnote">
          <span class="label">TMB ${r.tmb} kcal</span>
          <span class="label">Mantenimiento ${r.maintain} kcal</span>
        </div>
      </div>
    `;
  }

  function writeQueryString(s) {
    const params = new URLSearchParams();
    params.set('sex', s.sex);
    params.set('age', s.age);
    params.set('weight', s.weight);
    params.set('height', s.height);
    params.set('activity', s.activity);
    params.set('goal', s.goal);
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', url);
  }

  function recalc() {
    const s = pickState();
    const r = compute(s);
    render(s, r);
    if (r) writeQueryString(s);
  }

  applyState(readState());
  recalc();

  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copiado ✓';
        setTimeout(() => { copyBtn.textContent = original; }, 1600);
      } catch (e) {
        copyBtn.textContent = 'No se pudo copiar';
      }
    });
  }
})();
