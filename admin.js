/* PRADO Admin / CRM
   Vista de seguimiento y marketing para Hugo Prado.
   Reusa la API de SMAE en prado-mx.com (cross-origin con CORS-friendly).
   - KPIs (total, activos, atención, próxima semana)
   - Pacientes que necesitan atención (30+ días sin venir)
   - Agenda próxima
   - Tabla completa con filtros y búsqueda
   - WhatsApp recordatorio con templates pre-armados
   - Tier de recompensas por número de consultas */
(function () {
  'use strict';

  // El admin vive en admin.prado-mx.com pero la API vive en prado-mx.com.
  // Usamos URL absoluta para que CORS sea explícito.
  const API_BASE = 'https://prado-mx.com/api/smae';

  let allPatients = [];
  let activeFilter = 'todos';
  let searchTerm = '';

  // ---------- API ---------------------------------------------------------

  async function api(path) {
    const r = await fetch(API_BASE + path, { credentials: 'omit' });
    if (!r.ok) throw new Error('API error ' + r.status);
    return r.json();
  }

  // ---------- Utils -------------------------------------------------------

  function daysSince(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return '—'; }
  }

  function tierFor(planCount) {
    const n = planCount || 0;
    if (n >= 31) return { label: 'Platino', icon: '◆', cls: 'tier-platino' };
    if (n >= 16) return { label: 'Oro', icon: '◇', cls: 'tier-oro' };
    if (n >= 6)  return { label: 'Plata', icon: '○', cls: 'tier-plata' };
    if (n >= 1)  return { label: 'Bronce', icon: '·', cls: 'tier-bronce' };
    return { label: '—', icon: '', cls: '' };
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function whatsappLink(phone, msg) {
    const num = (phone || '').replace(/[^0-9]/g, '');
    if (!num) return null;
    return `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`;
  }

  function emailLink(email, subject, body) {
    if (!email) return null;
    return `mailto:${email}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
  }

  // ---------- Carga inicial -----------------------------------------------

  async function load() {
    try {
      const { patients } = await api('/patients');
      allPatients = patients || [];
      renderAll();
    } catch (e) {
      console.error('No se pudo cargar:', e);
      const tbody = document.querySelector('[data-admin-tbody]');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="smae-empty label" style="text-align: center; padding: 40px; color: var(--gray);">[ Error: ${escapeHTML(e.message)} ]</td></tr>`;
    }
  }

  // ---------- Render ------------------------------------------------------

  function renderAll() {
    renderKPIs();
    renderAtencion();
    renderAgenda();
    renderTable();
  }

  function renderKPIs() {
    const total = allPatients.length;
    let activos = 0, perdidos = 0, proximos = 0;
    allPatients.forEach(p => {
      const since = daysSince(p.last_plan_date || p.last_appointment);
      if (since != null && since <= 30) activos++;
      if (since != null && since > 30) perdidos++;
      const until = daysUntil(p.next_appointment);
      if (until != null && until >= 0 && until <= 7) proximos++;
    });
    const set = (k, v) => {
      const el = document.querySelector(`[data-kpi="${k}"]`);
      if (el) el.textContent = v;
    };
    set('total', total);
    set('activos', activos);
    set('perdidos', perdidos);
    set('proximos', proximos);
  }

  function renderAtencion() {
    const container = document.querySelector('[data-admin-atencion]');
    const countEl = document.querySelector('[data-admin-atencion-count]');
    if (!container) return;

    const enRiesgo = allPatients
      .map(p => {
        const since = daysSince(p.last_plan_date || p.last_appointment);
        return { ...p, days_since: since };
      })
      .filter(p => p.days_since != null && p.days_since > 30)
      .sort((a, b) => b.days_since - a.days_since);

    if (countEl) countEl.textContent = `[ ${enRiesgo.length} ]`;

    if (enRiesgo.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Todos al día ]</p>';
      return;
    }
    container.innerHTML = enRiesgo.map(p => `
      <div class="admin-atencion-card">
        <div class="admin-atencion-info">
          <h3>${escapeHTML(p.name)}</h3>
          <p class="label">Última: ${formatDate(p.last_plan_date || p.last_appointment)} · <strong>${p.days_since} días</strong></p>
          ${p.phone ? `<p class="label">${escapeHTML(p.phone)}</p>` : ''}
        </div>
        <div class="admin-atencion-actions">
          ${p.phone ? `<a href="${whatsappLink(p.phone, buildReminderMessage(p))}" target="_blank" rel="noopener" class="closing-cta-btn">WhatsApp →</a>` : '<span class="label">[ sin teléfono ]</span>'}
          ${p.email ? `<a href="${emailLink(p.email, 'Hola desde PRADO', buildReminderMessage(p))}" class="closing-cta-btn closing-cta-btn--ghost">Correo</a>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderAgenda() {
    const container = document.querySelector('[data-admin-agenda]');
    const countEl = document.querySelector('[data-admin-agenda-count]');
    if (!container) return;
    const upcoming = allPatients
      .map(p => ({ ...p, days_until: daysUntil(p.next_appointment) }))
      .filter(p => p.days_until != null && p.days_until >= 0 && p.days_until <= 14)
      .sort((a, b) => a.days_until - b.days_until);

    if (countEl) countEl.textContent = `[ ${upcoming.length} ]`;

    if (upcoming.length === 0) {
      container.innerHTML = '<p class="smae-empty label">[ Sin citas próximas en 2 semanas ]</p>';
      return;
    }
    container.innerHTML = upcoming.map(p => `
      <div class="admin-agenda-card">
        <div class="admin-agenda-when">
          <span class="label">${formatDate(p.next_appointment)}</span>
          <strong class="admin-agenda-days">${p.days_until === 0 ? 'Hoy' : p.days_until === 1 ? 'Mañana' : `En ${p.days_until} días`}</strong>
        </div>
        <div class="admin-agenda-info">
          <h3>${escapeHTML(p.name)}</h3>
          ${p.phone ? `<p class="label">${escapeHTML(p.phone)}</p>` : ''}
          ${p.email ? `<p class="label">${escapeHTML(p.email)}</p>` : ''}
        </div>
        <div class="admin-agenda-actions">
          ${p.seca_link ? `<a href="${escapeHTML(p.seca_link)}" target="_blank" rel="noopener" class="closing-cta-btn closing-cta-btn--ghost">Seca →</a>` : ''}
          ${p.phone ? `<a href="${whatsappLink(p.phone, buildUpcomingMessage(p))}" target="_blank" rel="noopener" class="closing-cta-btn">Confirmar →</a>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderTable() {
    const tbody = document.querySelector('[data-admin-tbody]');
    const totalEl = document.querySelector('[data-admin-total]');
    if (!tbody) return;

    let filtered = [...allPatients];

    // Filtros
    if (activeFilter === 'activos') {
      filtered = filtered.filter(p => {
        const since = daysSince(p.last_plan_date || p.last_appointment);
        return since != null && since <= 30;
      });
    } else if (activeFilter === 'atencion') {
      filtered = filtered.filter(p => {
        const since = daysSince(p.last_plan_date || p.last_appointment);
        return since != null && since > 30;
      });
    } else if (activeFilter === 'con-cita') {
      filtered = filtered.filter(p => {
        const until = daysUntil(p.next_appointment);
        return until != null && until >= 0;
      });
    }

    // Búsqueda
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      );
    }

    if (totalEl) totalEl.textContent = `[ ${filtered.length} de ${allPatients.length} ]`;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="smae-empty label" style="text-align: center; padding: 40px;">[ Sin resultados ]</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const since = daysSince(p.last_plan_date || p.last_appointment);
      const sinceLabel = since == null ? '—' : (since === 0 ? 'Hoy' : `${since} días`);
      const sinceCls = since != null && since > 30 ? 'admin-cell-warn' : '';
      const until = daysUntil(p.next_appointment);
      const untilLabel = until == null ? '—' : (until === 0 ? 'Hoy' : until === 1 ? 'Mañana' : `${until} días`);
      const tier = tierFor(p.plan_count);
      return `
        <tr>
          <td>
            <strong>${escapeHTML(p.name)}</strong>
            <div class="label admin-cell-sub">${p.plan_count || 0} plan${p.plan_count === 1 ? '' : 'es'}</div>
          </td>
          <td>
            ${p.phone ? `<div>${escapeHTML(p.phone)}</div>` : ''}
            ${p.email ? `<div class="label">${escapeHTML(p.email)}</div>` : ''}
            ${!p.phone && !p.email ? '<span class="label">—</span>' : ''}
          </td>
          <td class="${sinceCls}">
            ${formatDate(p.last_plan_date || p.last_appointment)}
            <div class="label admin-cell-sub">${sinceLabel}</div>
          </td>
          <td>
            ${p.next_appointment ? `${formatDate(p.next_appointment)}<div class="label admin-cell-sub">${untilLabel}</div>` : '<span class="label">—</span>'}
          </td>
          <td>
            <span class="admin-tier-badge ${tier.cls}">${tier.icon} ${tier.label}</span>
          </td>
          <td class="admin-cell-actions">
            ${p.seca_link ? `<a href="${escapeHTML(p.seca_link)}" target="_blank" rel="noopener" title="Ver en seca">Seca</a>` : ''}
            ${p.phone ? `<a href="${whatsappLink(p.phone, buildReminderMessage(p))}" target="_blank" rel="noopener" title="WhatsApp">WA</a>` : ''}
            ${p.email ? `<a href="${emailLink(p.email, 'Hola desde PRADO', buildReminderMessage(p))}" title="Correo">Mail</a>` : ''}
            <a href="https://prado-mx.com/smae?patient_id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="SMAE">SMAE</a>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ---------- Templates ---------------------------------------------------

  function getTemplate(kind) {
    const ta = document.querySelector(`[data-tpl="${kind}"]`);
    return ta ? ta.value : '';
  }

  function fillTemplate(text, p) {
    return text
      .replace(/\{nombre\}/g, p.name || '')
      .replace(/\{fecha\}/g, formatDate(p.next_appointment));
  }

  function buildReminderMessage(p) {
    return fillTemplate(getTemplate('reminder') || `Hola ${p.name}! Soy Hugo. ¿Cómo te ha ido? ¿Quieres agendar una consulta para ver cómo vas?`, p);
  }

  function buildUpcomingMessage(p) {
    return fillTemplate(getTemplate('upcoming') || `Hola ${p.name}! Te recuerdo que tenemos consulta el ${formatDate(p.next_appointment)}.`, p);
  }

  // ---------- Init --------------------------------------------------------

  function init() {
    // Search
    const search = document.querySelector('[data-admin-search]');
    if (search) {
      search.addEventListener('input', () => {
        searchTerm = search.value.trim();
        renderTable();
      });
    }

    // Filters
    document.querySelectorAll('[data-admin-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.adminFilter;
        document.querySelectorAll('[data-admin-filter]').forEach(b => b.classList.toggle('is-active', b === btn));
        renderTable();
      });
    });

    // Copy template buttons
    document.querySelectorAll('[data-copy-tpl]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const kind = btn.dataset.copyTpl;
        const text = getTemplate(kind);
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = 'Copiado ✓';
          setTimeout(() => { btn.textContent = orig; }, 1400);
        } catch (e) {
          alert('No se pudo copiar.');
        }
      });
    });

    load();
    // Refrescar cada 2 minutos por si cambia algo desde /smae
    setInterval(load, 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
