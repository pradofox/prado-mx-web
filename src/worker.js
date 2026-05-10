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
        return jsonResponse({ error: e.message || 'internal' }, 500, request);
      }
    }

    if (url.pathname.startsWith('/api/app/')) {
      try {
        return await handleAppApi(request, env, url);
      } catch (e) {
        return jsonResponse({ error: e.message || 'internal' }, 500, request);
      }
    }

    // Subdominio app: cualquier path "lindo" sirve app.html (cliente SPA).
    if (url.hostname === 'app.prado-mx.com') {
      const isAssetPath = /\.[a-z0-9]{2,5}$/i.test(url.pathname);
      if (!isAssetPath) {
        try { await caches.default.delete(request); } catch (e) {}
        const appUrl = new URL('/app.html', request.url);
        const appReq = new Request(appUrl, { method: 'GET', headers: request.headers });
        const r = await env.ASSETS.fetch(appReq);
        const headers = new Headers(r.headers);
        headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0, private');
        headers.set('cdn-cache-control', 'no-store');
        headers.set('cf-cache-control', 'no-store');
        headers.delete('etag');
        headers.delete('last-modified');
        headers.delete('expires');
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
      }
    }

    // Subdominio admin: cualquier path "lindo" sirve admin.html.
    // El JS del cliente lee window.location.pathname para decidir qué vista
    // mostrar (landing o panel). Los assets concretos (style.css, admin.js,
    // fuentes, etc.) caen al else normal.
    if (url.hostname === 'admin.prado-mx.com') {
      // Bloquear paths "públicos" que solo deben vivir en prado-mx.com
      const publicPaths = ['/index.html', '/hugo.html', '/consulting.html', '/macros.html', '/smae.html'];
      if (publicPaths.includes(url.pathname) || url.pathname === '/hugo' || url.pathname === '/consulting' || url.pathname === '/macros') {
        return Response.redirect('https://prado-mx.com' + url.pathname, 302);
      }

      // Cualquier path "lindo" (sin extensión) sirve admin.html.
      // El cliente decide qué renderizar via window.location.pathname.
      // Assets concretos (.css, .js, .png, .svg, .jpg, .ico, .json, etc.)
      // pasan al else normal.
      const isAssetPath = /\.[a-z0-9]{2,5}$/i.test(url.pathname);
      if (!isAssetPath) {
        try { await caches.default.delete(request); } catch (e) {}
        const adminUrl = new URL('/admin.html', request.url);
        const adminReq = new Request(adminUrl, { method: 'GET', headers: request.headers });
        const r = await env.ASSETS.fetch(adminReq);
        const headers = new Headers(r.headers);
        headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0, private');
        headers.set('cdn-cache-control', 'no-store');
        headers.set('cf-cache-control', 'no-store');
        headers.delete('etag');
        headers.delete('last-modified');
        headers.delete('expires');
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

// ----- API ---------------------------------------------------------------

async function handleApi(request, env, url) {
  const path = url.pathname.replace('/api/smae', '');

  // Preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // Auth deshabilitado: todos los endpoints son abiertos.
  // Stubs que mantienen compatibilidad con el frontend viejo si quedó cache.
  if (path === '/auth' && request.method === 'POST') {
    return jsonResponse({ ok: true, token: 'open' }, 200, request);
  }
  if (path === '/auth' && request.method === 'GET') {
    return jsonResponse({ authed: true }, 200, request);
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    return jsonResponse({ ok: true }, 200, request);
  }

  if (path === '/patients' && request.method === 'GET') return listPatients(env, request);
  if (path === '/patients' && request.method === 'POST') return upsertPatient(request, env);

  const patientMatch = path.match(/^\/patients\/([^/]+)$/);
  if (patientMatch) {
    const id = patientMatch[1];
    if (request.method === 'GET') return getPatient(env, id, request);
    if (request.method === 'DELETE') return deletePatient(env, id, request);
    if (request.method === 'PATCH') return updatePatient(request, env, id);
  }

  const plansMatch = path.match(/^\/patients\/([^/]+)\/plans$/);
  if (plansMatch) {
    const patientId = plansMatch[1];
    if (request.method === 'GET') return listPlans(env, patientId, request);
    if (request.method === 'POST') return savePlan(request, env, patientId);
  }

  if (path === '/foods' && request.method === 'GET') return listFoods(env, url, request);

  // ----- Transactions (finanzas) ---
  if (path === '/transactions' && request.method === 'GET') return listTransactions(env, url, request);
  if (path === '/transactions' && request.method === 'POST') return createTransaction(request, env);
  const txMatch = path.match(/^\/transactions\/([^/]+)$/);
  if (txMatch) {
    const id = txMatch[1];
    if (request.method === 'PATCH') return updateTransaction(request, env, id);
    if (request.method === 'DELETE') return deleteTransaction(env, id, request);
  }
  if (path === '/transactions/summary' && request.method === 'GET') return summaryTransactions(env, url, request);
  if (path === '/tx-categories' && request.method === 'GET') return listTxCategories(env, request);

  return jsonResponse({ error: 'not found', path }, 404, request);
}

// ----- Transactions (ingresos / egresos del negocio) -------------------

async function listTransactions(env, url, request) {
  const month = url.searchParams.get('month'); // YYYY-MM
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);
  let q = `SELECT t.*, p.name AS patient_name, s.name AS subscriber_name
           FROM transactions t
           LEFT JOIN patients p ON t.patient_id = p.id
           LEFT JOIN subscribers s ON t.subscriber_id = s.id
           WHERE 1=1`;
  const args = [];
  if (month) { q += ` AND t.date LIKE ?`; args.push(month + '%'); }
  if (type) { q += ` AND t.type = ?`; args.push(type); }
  q += ` ORDER BY t.date DESC, t.created_at DESC LIMIT ?`;
  args.push(limit);
  const { results } = await env.DB.prepare(q).bind(...args).all();
  return jsonResponse({ transactions: results || [] }, 200, request);
}

async function summaryTransactions(env, url, request) {
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const { results } = await env.DB.prepare(
    `SELECT type, category, SUM(amount) AS total, COUNT(*) AS count
     FROM transactions
     WHERE date LIKE ?
     GROUP BY type, category`
  ).bind(month + '%').all();
  let income = 0, expense = 0;
  const by_category = { income: {}, expense: {} };
  (results || []).forEach(r => {
    if (r.type === 'income') {
      income += r.total;
      by_category.income[r.category || 'sin categoría'] = r.total;
    } else if (r.type === 'expense') {
      expense += r.total;
      by_category.expense[r.category || 'sin categoría'] = r.total;
    }
  });
  return jsonResponse({
    month,
    income,
    expense,
    net: income - expense,
    by_category,
  }, 200, request);
}

async function createTransaction(request, env) {
  const data = await request.json();
  const id = data.id || newId('tx');
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO transactions (id, date, type, category, amount, currency, source,
     notes, patient_id, subscriber_id, stripe_event_id, created_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id,
    data.date || now.slice(0, 10),
    data.type,
    data.category || null,
    Math.round(data.amount || 0),
    data.currency || 'mxn',
    data.source || 'manual',
    data.notes || null,
    data.patient_id || null,
    data.subscriber_id || null,
    data.stripe_event_id || null,
    now,
    data.created_by || 'hugo',
  ).run();
  return jsonResponse({ id }, 200, request);
}

async function updateTransaction(request, env, id) {
  const data = await request.json();
  await env.DB.prepare(
    `UPDATE transactions SET date=?, type=?, category=?, amount=?, notes=? WHERE id=?`
  ).bind(
    data.date,
    data.type,
    data.category || null,
    Math.round(data.amount || 0),
    data.notes || null,
    id,
  ).run();
  return jsonResponse({ id }, 200, request);
}

async function deleteTransaction(env, id, request) {
  await env.DB.prepare(`DELETE FROM transactions WHERE id = ?`).bind(id).run();
  return jsonResponse({ ok: true }, 200, request);
}

async function listTxCategories(env, request) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM tx_categories ORDER BY type, name`
  ).all();
  return jsonResponse({ categories: results || [] }, 200, request);
}

// ----- Auth --------------------------------------------------------------

async function handleAuth(request, env, url) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const { password } = body || {};
  if (!password || password !== env.SMAE_PASSWORD) {
    return jsonResponse({ error: 'wrong password' }, 401, request);
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

async function listPatients(env, request) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, sex, age, weight, height, weight_target, activity, goal,
            conditions, notes, email, phone, seca_link,
            last_appointment, next_appointment, start_date,
            created_at, updated_at,
            (SELECT COUNT(*) FROM plans WHERE plans.patient_id = patients.id) AS plan_count,
            (SELECT MAX(date) FROM plans WHERE plans.patient_id = patients.id) AS last_plan_date
     FROM patients ORDER BY updated_at DESC`
  ).all();
  return jsonResponse({ patients: results || [] }, 200, request);
}

async function getPatient(env, id, request) {
  const patient = await env.DB.prepare(
    `SELECT * FROM patients WHERE id = ?`
  ).bind(id).first();
  if (!patient) return jsonResponse({ error: 'not found' }, 404, request);
  const plans = await env.DB.prepare(
    `SELECT * FROM plans WHERE patient_id = ? ORDER BY date DESC`
  ).bind(id).all();
  return jsonResponse({
    patient,
    plans: (plans.results || []).map(parsePlanRow),
  }, 200, request);
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
  return jsonResponse({ id }, 200, request);
}

async function updatePatient(request, env, id) {
  const data = await request.json();
  data.id = id;
  // Reusar upsertPatient pasándole el request original para CORS
  const proxy = { json: () => Promise.resolve(data), headers: request.headers };
  return upsertPatient(proxy, env);
}

async function deletePatient(env, id, request) {
  await env.DB.prepare(`DELETE FROM plans WHERE patient_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM patients WHERE id = ?`).bind(id).run();
  return jsonResponse({ ok: true }, 200, request);
}

// ----- Plans -------------------------------------------------------------

async function listPlans(env, patientId, request) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM plans WHERE patient_id = ? ORDER BY date DESC`
  ).bind(patientId).all();
  return jsonResponse({ plans: (results || []).map(parsePlanRow) }, 200, request);
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
  return jsonResponse({ id }, 200, request);
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

async function listFoods(env, url, request) {
  const group = url.searchParams.get('group');
  let q = `SELECT id, group_key, name, portion FROM foods`;
  const args = [];
  if (group) {
    q += ` WHERE group_key = ?`;
    args.push(group);
  }
  q += ` ORDER BY group_key, name`;
  const { results } = await env.DB.prepare(q).bind(...args).all();
  return jsonResponse({ foods: results || [] }, 200, request);
}

// ----- Helpers -----------------------------------------------------------

function jsonResponse(body, status = 200, request = null) {
  const headers = { 'content-type': 'application/json' };
  if (request) Object.assign(headers, corsHeaders(request));
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = (
    origin === 'https://admin.prado-mx.com' ||
    origin === 'https://prado-mx.com' ||
    origin === 'https://app.prado-mx.com'
  ) ? origin : '';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-credentials': 'true',
    'vary': 'origin',
  };
}

// ============ APP API (B2C / app.prado-mx.com) ===========================

const APP_COOKIE_NAME = 'prado_app_sess';
const APP_SESSION_DAYS = 30;

async function handleAppApi(request, env, url) {
  const path = url.pathname.replace('/api/app', '');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // Sign up / magic link request
  if (path === '/signup' && request.method === 'POST') return appSignup(request, env);
  if (path === '/login' && request.method === 'POST') return appLogin(request, env);
  if (path === '/verify' && request.method === 'GET') return appVerifyMagic(request, env, url);
  if (path === '/logout' && request.method === 'POST') return appLogout(request, env);
  if (path === '/me' && request.method === 'GET') return appMe(request, env);
  if (path === '/profile' && request.method === 'PATCH') return appUpdateProfile(request, env);
  if (path === '/plan/generate' && request.method === 'POST') return appGeneratePlan(request, env);
  if (path === '/plans' && request.method === 'GET') return appListPlans(request, env);
  if (path === '/checkout' && request.method === 'POST') return appCreateCheckout(request, env);
  if (path === '/webhook/stripe' && request.method === 'POST') return appStripeWebhook(request, env);

  return jsonResponse({ error: 'not found', path }, 404, request);
}

async function appSignup(request, env) {
  const data = await request.json();
  const email = (data.email || '').toString().trim().toLowerCase();
  const name = (data.name || '').toString().trim() || null;
  if (!email || !email.includes('@')) {
    return jsonResponse({ error: 'email inválido' }, 400, request);
  }
  // Upsert subscriber
  const existing = await env.DB.prepare(`SELECT id FROM subscribers WHERE email = ?`).bind(email).first();
  let subscriberId;
  if (existing) {
    subscriberId = existing.id;
  } else {
    subscriberId = newId('sub');
    await env.DB.prepare(
      `INSERT INTO subscribers (id, email, name, created_at, updated_at) VALUES (?,?,?,?,?)`
    ).bind(subscriberId, email, name, new Date().toISOString(), new Date().toISOString()).run();
  }
  // Crear magic link
  const token = crypto.randomUUID().replace(/-/g, '');
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO magic_links (token, email, expires_at) VALUES (?,?,?)`
  ).bind(token, email, expires).run();

  // Enviar email via Resend si está configurado
  const verifyUrl = `https://app.prado-mx.com/verify?token=${token}`;
  if (env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'PRADO Plan <hola@prado-mx.com>',
          to: [email],
          subject: 'Tu link para entrar a PRADO Plan',
          html: `<div style="font-family: Geist, system-ui, sans-serif; line-height:1.5; color:#000;">
            <p>Hola${name ? ' ' + name : ''},</p>
            <p>Da click aquí para entrar a tu cuenta de PRADO Plan:</p>
            <p><a href="${verifyUrl}" style="display:inline-block;padding:14px 22px;background:#000;color:#fff;text-decoration:none;font-family:'Geist Mono',monospace;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Entrar →</a></p>
            <p style="font-family:'Geist Mono',monospace;font-size:12px;color:#666;">El link expira en 15 minutos.</p>
            <p style="font-family:'Geist Mono',monospace;font-size:11px;color:#999;">Hugo Prado · prado-mx.com</p>
          </div>`,
        }),
      });
    } catch (e) {
      console.error('Resend error', e);
    }
  }

  // Modo dev: si no hay Resend, devolver el link en la respuesta (solo para testing)
  const debug = env.APP_DEBUG === '1' || !env.RESEND_API_KEY;
  return jsonResponse({
    ok: true,
    message: 'Te mandé un correo con tu link de acceso. Revisa también tu spam.',
    ...(debug ? { debug_link: verifyUrl } : {}),
  }, 200, request);
}

async function appLogin(request, env) {
  return appSignup(request, env); // same flow
}

async function appVerifyMagic(request, env, url) {
  const token = url.searchParams.get('token');
  if (!token) return jsonResponse({ error: 'token requerido' }, 400, request);
  const link = await env.DB.prepare(
    `SELECT email, expires_at, used FROM magic_links WHERE token = ?`
  ).bind(token).first();
  if (!link) return jsonResponse({ error: 'link inválido' }, 400, request);
  if (link.used) return jsonResponse({ error: 'link ya usado' }, 400, request);
  if (new Date(link.expires_at) < new Date()) {
    return jsonResponse({ error: 'link expirado' }, 400, request);
  }
  // Marcar usado
  await env.DB.prepare(`UPDATE magic_links SET used = 1 WHERE token = ?`).bind(token).run();
  // Buscar subscriber
  const sub = await env.DB.prepare(`SELECT id FROM subscribers WHERE email = ?`).bind(link.email).first();
  if (!sub) return jsonResponse({ error: 'subscriber no existe' }, 400, request);
  // Crear sesión
  const sessionToken = crypto.randomUUID().replace(/-/g, '');
  const expiresIn = APP_SESSION_DAYS * 24 * 60 * 60;
  const expires = new Date(Date.now() + expiresIn * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (token, subscriber_id, expires_at) VALUES (?,?,?)`
  ).bind(sessionToken, sub.id, expires).run();

  // Redirect a app con cookie
  return new Response(null, {
    status: 302,
    headers: {
      'location': 'https://app.prado-mx.com/dashboard',
      'set-cookie': `${APP_COOKIE_NAME}=${sessionToken}; Path=/; Max-Age=${expiresIn}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function appLogout(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`${APP_COOKIE_NAME}=([^;]+)`));
  if (m) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(m[1]).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `${APP_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      ...corsHeaders(request),
    },
  });
}

async function getSubscriberFromSession(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`${APP_COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const session = await env.DB.prepare(
    `SELECT s.subscriber_id, s.expires_at FROM sessions s WHERE s.token = ?`
  ).bind(m[1]).first();
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  const sub = await env.DB.prepare(
    `SELECT * FROM subscribers WHERE id = ?`
  ).bind(session.subscriber_id).first();
  return sub;
}

async function appMe(request, env) {
  const sub = await getSubscriberFromSession(request, env);
  if (!sub) return jsonResponse({ error: 'unauthorized' }, 401, request);
  // Cargar último plan
  const lastPlan = await env.DB.prepare(
    `SELECT * FROM subscriber_plans WHERE subscriber_id = ? ORDER BY date DESC LIMIT 1`
  ).bind(sub.id).first();
  return jsonResponse({
    subscriber: { ...sub, preferences: safeParse(sub.preferences) },
    plan: lastPlan ? {
      ...lastPlan,
      macros: safeParse(lastPlan.macros),
      equivalencias: safeParse(lastPlan.equivalencias),
      meals: safeParse(lastPlan.meals),
      meals_distribution: safeParse(lastPlan.meals_distribution),
      examples: safeParse(lastPlan.examples),
      menu_options: safeParse(lastPlan.menu_options),
    } : null,
  }, 200, request);
}

async function appUpdateProfile(request, env) {
  const sub = await getSubscriberFromSession(request, env);
  if (!sub) return jsonResponse({ error: 'unauthorized' }, 401, request);
  const data = await request.json();
  const num = (k) => (Number.isFinite(parseFloat(data[k])) ? parseFloat(data[k]) : null);
  await env.DB.prepare(
    `UPDATE subscribers SET
       name = COALESCE(?, name),
       sex = ?, age = ?, weight = ?, height = ?, weight_target = ?,
       activity = ?, goal = ?, mode = ?, conditions = ?, preferences = ?,
       kcal_target = ?, protein_target = ?, carb_target = ?, fat_target = ?,
       updated_at = ?
     WHERE id = ?`
  ).bind(
    data.name || null,
    data.sex || null,
    num('age'),
    num('weight'),
    num('height') ? Math.round(num('height')) : null,
    num('weight_target'),
    num('activity'),
    num('goal'),
    data.mode || 'normal',
    data.conditions || null,
    data.preferences ? JSON.stringify(data.preferences) : null,
    num('kcal_target') ? Math.round(num('kcal_target')) : null,
    num('protein_target') ? Math.round(num('protein_target')) : null,
    num('carb_target') ? Math.round(num('carb_target')) : null,
    num('fat_target') ? Math.round(num('fat_target')) : null,
    new Date().toISOString(),
    sub.id,
  ).run();
  return jsonResponse({ ok: true }, 200, request);
}

async function appGeneratePlan(request, env) {
  const sub = await getSubscriberFromSession(request, env);
  if (!sub) return jsonResponse({ error: 'unauthorized' }, 401, request);
  const data = await request.json();
  const planId = newId('spl');
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO subscriber_plans (id, subscriber_id, date, macros, equivalencias,
     meals, meals_distribution, mode, examples, menu_options, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    planId, sub.id, now,
    JSON.stringify(data.macros || {}),
    JSON.stringify(data.equivalencias || {}),
    JSON.stringify(data.meals || {}),
    JSON.stringify(data.meals_distribution || null),
    data.mode || sub.mode || 'normal',
    JSON.stringify(data.examples || {}),
    JSON.stringify(data.menu_options || {}),
    data.notes || null,
    now,
  ).run();
  return jsonResponse({ id: planId }, 200, request);
}

async function appListPlans(request, env) {
  const sub = await getSubscriberFromSession(request, env);
  if (!sub) return jsonResponse({ error: 'unauthorized' }, 401, request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM subscriber_plans WHERE subscriber_id = ? ORDER BY date DESC LIMIT 20`
  ).bind(sub.id).all();
  return jsonResponse({
    plans: (results || []).map(r => ({
      ...r,
      macros: safeParse(r.macros),
      equivalencias: safeParse(r.equivalencias),
      meals: safeParse(r.meals),
      examples: safeParse(r.examples),
      menu_options: safeParse(r.menu_options),
    })),
  }, 200, request);
}

async function appCreateCheckout(request, env) {
  const sub = await getSubscriberFromSession(request, env);
  if (!sub) return jsonResponse({ error: 'unauthorized' }, 401, request);
  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Stripe no configurado todavía', stub: true }, 503, request);
  }
  const data = await request.json();
  const plan = data.plan || 'mensual'; // 'mensual' o 'anual'
  const priceId = plan === 'anual' ? env.STRIPE_PRICE_ANUAL : env.STRIPE_PRICE_MENSUAL;
  if (!priceId) {
    return jsonResponse({ error: 'price_id no configurado' }, 503, request);
  }
  const body = new URLSearchParams();
  body.append('mode', 'subscription');
  body.append('line_items[0][price]', priceId);
  body.append('line_items[0][quantity]', '1');
  body.append('subscription_data[trial_period_days]', '7');
  body.append('customer_email', sub.email);
  body.append('success_url', `https://app.prado-mx.com/dashboard?subscribed=1`);
  body.append('cancel_url', `https://app.prado-mx.com/checkout?cancelled=1`);
  body.append('metadata[subscriber_id]', sub.id);
  body.append('metadata[plan]', plan);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const session = await r.json();
  if (!r.ok) return jsonResponse({ error: session.error?.message || 'stripe error' }, 500, request);
  return jsonResponse({ url: session.url }, 200, request);
}

async function appStripeWebhook(request, env) {
  // TODO: validar firma Stripe con env.STRIPE_WEBHOOK_SECRET (constant time HMAC)
  const event = await request.json();
  const type = event.type;
  // Eventos clave: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted
  if (type === 'checkout.session.completed') {
    const session = event.data.object;
    const subscriberId = session.metadata && session.metadata.subscriber_id;
    if (subscriberId) {
      await env.DB.prepare(
        `UPDATE subscribers SET stripe_customer_id = ?, subscription_status = 'trialing', updated_at = ? WHERE id = ?`
      ).bind(session.customer, new Date().toISOString(), subscriberId).run();
      // Registrar transacción income
      await env.DB.prepare(
        `INSERT OR IGNORE INTO transactions (id, date, type, category, amount, currency, source, notes, subscriber_id, stripe_event_id, created_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        newId('tx'),
        new Date().toISOString().slice(0, 10),
        'income', 'cat-app',
        Math.round((session.amount_total || 0)),
        (session.currency || 'mxn').toLowerCase(),
        'stripe', 'Checkout completado',
        subscriberId,
        event.id,
        new Date().toISOString(),
        'stripe-webhook',
      ).run();
    }
  } else if (type === 'invoice.paid') {
    const invoice = event.data.object;
    const customerId = invoice.customer;
    const sub = await env.DB.prepare(
      `SELECT id FROM subscribers WHERE stripe_customer_id = ?`
    ).bind(customerId).first();
    if (sub) {
      await env.DB.prepare(
        `UPDATE subscribers SET subscription_status = 'active', updated_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), sub.id).run();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO transactions (id, date, type, category, amount, currency, source, notes, subscriber_id, stripe_event_id, created_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        newId('tx'),
        new Date().toISOString().slice(0, 10),
        'income', 'cat-app',
        Math.round((invoice.amount_paid || 0)),
        (invoice.currency || 'mxn').toLowerCase(),
        'stripe', 'Invoice pagado',
        sub.id,
        event.id,
        new Date().toISOString(),
        'stripe-webhook',
      ).run();
    }
  } else if (type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    await env.DB.prepare(
      `UPDATE subscribers SET subscription_status = 'canceled', updated_at = ? WHERE stripe_customer_id = ?`
    ).bind(new Date().toISOString(), customerId).run();
  }
  return jsonResponse({ received: true }, 200, request);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
