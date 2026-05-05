/**
 * PRADO worker
 * - Sirve estáticos via env.ASSETS para todas las rutas no /api/*.
 * - Maneja /api/smae/* con auth por password (cookie de sesión 30 días).
 *
 * Password se configura como secret: `wrangler secret put SMAE_PASSWORD`.
 * Cookie: HMAC-SHA256(password) firmado con SMAE_PASSWORD como clave; el server
 * sólo confirma que el cliente conoce el password sin guardarlo en plano.
 */

const COOKIE_NAME = 'prado_smae_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/smae/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        return jsonResponse({ error: e.message || 'internal' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

// ----- API ---------------------------------------------------------------

async function handleApi(request, env, url) {
  const path = url.pathname.replace('/api/smae', '');

  // Auth deshabilitado: todos los endpoints son abiertos.
  // Stubs que mantienen compatibilidad con el frontend viejo si quedó cache.
  if (path === '/auth' && request.method === 'POST') {
    return jsonResponse({ ok: true, token: 'open' });
  }
  if (path === '/auth' && request.method === 'GET') {
    return jsonResponse({ authed: true });
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    return jsonResponse({ ok: true });
  }

  if (path === '/patients' && request.method === 'GET') return listPatients(env);
  if (path === '/patients' && request.method === 'POST') return upsertPatient(request, env);

  const patientMatch = path.match(/^\/patients\/([^/]+)$/);
  if (patientMatch) {
    const id = patientMatch[1];
    if (request.method === 'GET') return getPatient(env, id);
    if (request.method === 'DELETE') return deletePatient(env, id);
    if (request.method === 'PATCH') return updatePatient(request, env, id);
  }

  const plansMatch = path.match(/^\/patients\/([^/]+)\/plans$/);
  if (plansMatch) {
    const patientId = plansMatch[1];
    if (request.method === 'GET') return listPlans(env, patientId);
    if (request.method === 'POST') return savePlan(request, env, patientId);
  }

  if (path === '/foods' && request.method === 'GET') return listFoods(env, url);

  return jsonResponse({ error: 'not found', path }, 404);
}

// ----- Auth --------------------------------------------------------------

async function handleAuth(request, env, url) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const { password } = body || {};
  if (!password || password !== env.SMAE_PASSWORD) {
    return jsonResponse({ error: 'wrong password' }, 401);
  }
  const token = await signToken(env.SMAE_PASSWORD);
  // Devolver token en body Y en cookie (cinturón y tirantes — cualquiera funciona)
  return new Response(JSON.stringify({ ok: true, token }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`,
    },
  });
}

function clearAuthCookie() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

async function isAuthed(request, env) {
  // Acepta token vía Authorization header (preferido) o cookie (fallback)
  let token = '';
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookie = request.headers.get('cookie') || '';
    const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (match) token = match[1];
  }
  if (!token) return false;
  const expected = await signToken(env.SMAE_PASSWORD);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function signToken(secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'prado-smae-fallback'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('smae-session'));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ----- Patients ----------------------------------------------------------

async function listPatients(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, sex, age, weight, height, weight_target, activity, goal,
            conditions, notes, email, phone, seca_link,
            last_appointment, next_appointment, start_date,
            created_at, updated_at,
            (SELECT COUNT(*) FROM plans WHERE plans.patient_id = patients.id) AS plan_count,
            (SELECT MAX(date) FROM plans WHERE plans.patient_id = patients.id) AS last_plan_date
     FROM patients ORDER BY updated_at DESC`
  ).all();
  return jsonResponse({ patients: results || [] });
}

async function getPatient(env, id) {
  const patient = await env.DB.prepare(
    `SELECT * FROM patients WHERE id = ?`
  ).bind(id).first();
  if (!patient) return jsonResponse({ error: 'not found' }, 404);
  const plans = await env.DB.prepare(
    `SELECT * FROM plans WHERE patient_id = ? ORDER BY date DESC`
  ).bind(id).all();
  return jsonResponse({
    patient,
    plans: (plans.results || []).map(parsePlanRow),
  });
}

async function upsertPatient(request, env) {
  const data = await request.json();
  const id = data.id || newId('p');
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(`SELECT id FROM patients WHERE id = ?`).bind(id).first();
  if (existing) {
    await env.DB.prepare(
      `UPDATE patients SET name=?, sex=?, age=?, weight=?, height=?, weight_target=?,
       activity=?, goal=?, conditions=?, notes=?,
       email=?, phone=?, seca_link=?, last_appointment=?, next_appointment=?, start_date=?,
       updated_at=? WHERE id=?`
    ).bind(
      data.name, data.sex || null, data.age || null, data.weight || null,
      data.height || null, data.weight_target || null,
      data.activity || null, data.goal || null,
      data.conditions || null, data.notes || null,
      data.email || null, data.phone || null, data.seca_link || null,
      data.last_appointment || null, data.next_appointment || null, data.start_date || null,
      now, id
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO patients (id, name, sex, age, weight, height, weight_target,
       activity, goal, conditions, notes,
       email, phone, seca_link, last_appointment, next_appointment, start_date,
       created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, data.name, data.sex || null, data.age || null, data.weight || null,
      data.height || null, data.weight_target || null,
      data.activity || null, data.goal || null,
      data.conditions || null, data.notes || null,
      data.email || null, data.phone || null, data.seca_link || null,
      data.last_appointment || null, data.next_appointment || null, data.start_date || null,
      now, now
    ).run();
  }
  return jsonResponse({ id });
}

async function updatePatient(request, env, id) {
  const data = await request.json();
  data.id = id;
  return upsertPatient({ json: () => Promise.resolve(data) }, env);
}

async function deletePatient(env, id) {
  await env.DB.prepare(`DELETE FROM plans WHERE patient_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM patients WHERE id = ?`).bind(id).run();
  return jsonResponse({ ok: true });
}

// ----- Plans -------------------------------------------------------------

async function listPlans(env, patientId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM plans WHERE patient_id = ? ORDER BY date DESC`
  ).bind(patientId).all();
  return jsonResponse({ plans: (results || []).map(parsePlanRow) });
}

async function savePlan(request, env, patientId) {
  const data = await request.json();
  const id = data.id || newId('pl');
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO plans (id, patient_id, date, macros, equivalencias, meals,
     meals_distribution, mode, examples, menu_options, weight_at_plan, notes,
     cita_num, muslo, pierna, bicep, bicep_flex, cintura, cadera, ombligo,
     created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, patientId, data.date || now,
    JSON.stringify(data.macros || {}),
    JSON.stringify(data.equivalencias || {}),
    JSON.stringify(data.meals || {}),
    JSON.stringify(data.meals_distribution || null),
    data.mode || 'normal',
    JSON.stringify(data.examples || {}),
    JSON.stringify(data.menu_options || {}),
    data.weight_at_plan || null,
    data.notes || null,
    data.cita_num || null,
    data.muslo || null,
    data.pierna || null,
    data.bicep || null,
    data.bicep_flex || null,
    data.cintura || null,
    data.cadera || null,
    data.ombligo || null,
    now
  ).run();
  // Touch updated_at del paciente y last_appointment
  await env.DB.prepare(
    `UPDATE patients SET updated_at = ?, last_appointment = ? WHERE id = ?`
  ).bind(now, data.date || now, patientId).run();
  return jsonResponse({ id });
}

function parsePlanRow(row) {
  return {
    ...row,
    macros: safeParse(row.macros),
    equivalencias: safeParse(row.equivalencias),
    meals: safeParse(row.meals),
    meals_distribution: safeParse(row.meals_distribution),
    examples: safeParse(row.examples),
    menu_options: safeParse(row.menu_options),
  };
}

// ----- Foods -------------------------------------------------------------

async function listFoods(env, url) {
  const group = url.searchParams.get('group');
  let q = `SELECT id, group_key, name, portion FROM foods`;
  const args = [];
  if (group) {
    q += ` WHERE group_key = ?`;
    args.push(group);
  }
  q += ` ORDER BY group_key, name`;
  const { results } = await env.DB.prepare(q).bind(...args).all();
  return jsonResponse({ foods: results || [] });
}

// ----- Helpers -----------------------------------------------------------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
