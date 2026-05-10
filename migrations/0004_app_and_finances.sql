-- Migration 0004: app B2C (subscribers, subscriptions) + finanzas (transactions)

-- Subscribers: usuarios de app.prado-mx.com (no son pacientes de Hugo en
-- consulta, son usuarios self-service de la app de suscripción)
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  -- Datos del cuestionario / perfil del usuario
  sex TEXT,
  age INTEGER,
  weight REAL,
  height INTEGER,
  weight_target REAL,
  activity REAL,
  goal REAL,
  mode TEXT DEFAULT 'normal',
  conditions TEXT,
  preferences TEXT,        -- JSON: alergias, dislikes, presupuesto, etc
  -- Macros calculados
  kcal_target INTEGER,
  protein_target INTEGER,
  carb_target INTEGER,
  fat_target INTEGER,
  -- Stripe
  stripe_customer_id TEXT,
  -- Estado actual de suscripción (denormalizado para queries rápidas)
  subscription_status TEXT DEFAULT 'none',  -- none, trialing, active, past_due, canceled
  trial_ends_at TEXT,
  current_period_end TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(subscription_status);

-- Subscriptions: histórico de eventos de suscripción (auditable)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  plan TEXT,                -- 'mensual', 'anual'
  amount INTEGER,           -- en centavos MXN
  currency TEXT DEFAULT 'mxn',
  status TEXT,
  trial_start TEXT,
  trial_end TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subs_subscriber ON subscriptions(subscriber_id, created_at DESC);

-- Planes generados para subscribers (separado de pacientes-de-consulta)
CREATE TABLE IF NOT EXISTS subscriber_plans (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  date TEXT NOT NULL,
  macros TEXT NOT NULL,
  equivalencias TEXT NOT NULL,
  meals TEXT NOT NULL,
  meals_distribution TEXT,
  mode TEXT DEFAULT 'normal',
  examples TEXT,
  menu_options TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sub_plans ON subscriber_plans(subscriber_id, date DESC);

-- Magic links para auth passwordless
CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_links(email, expires_at);

-- Sessions (cookie HttpOnly token → subscriber)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_subscriber ON sessions(subscriber_id);

-- Transactions: ingresos/egresos del negocio. Tracker financiero del admin.
-- Hugo puede meter manuales (consulta privada, gasto operativo) y la app
-- auto-mete los cobros de Stripe como income.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'income' o 'expense'
  category TEXT,             -- 'consulta', 'app', 'collab', 'renta', 'marketing', 'otro', etc
  amount INTEGER NOT NULL,   -- centavos MXN (positivo siempre)
  currency TEXT DEFAULT 'mxn',
  source TEXT,               -- 'manual', 'stripe', 'consulta', etc
  notes TEXT,
  patient_id TEXT,           -- si es ingreso de un paciente de consulta
  subscriber_id TEXT,        -- si es ingreso de un subscriber de la app
  stripe_event_id TEXT,      -- idempotencia para webhooks
  created_at TEXT NOT NULL,
  created_by TEXT,           -- 'hugo' o 'app' o 'stripe-webhook'
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_stripe ON transactions(stripe_event_id);

-- Categorías sugeridas (Hugo puede editar después en UI)
CREATE TABLE IF NOT EXISTS tx_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'income' o 'expense'
  emoji TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO tx_categories (id, name, type, emoji) VALUES
  ('cat-consulta', 'Consulta nutricional', 'income', '🥗'),
  ('cat-app', 'App PRADO Plan', 'income', '📱'),
  ('cat-collab', 'Collab de marca', 'income', '🤝'),
  ('cat-clase', 'Clase grupal', 'income', '💪'),
  ('cat-otro-in', 'Otro ingreso', 'income', '➕'),
  ('cat-renta', 'Renta / espacio', 'expense', '🏢'),
  ('cat-marketing', 'Marketing / pauta', 'expense', '📢'),
  ('cat-software', 'Software / SaaS', 'expense', '💻'),
  ('cat-stripe', 'Comisiones Stripe', 'expense', '💳'),
  ('cat-impuestos', 'Impuestos / contador', 'expense', '🧾'),
  ('cat-otro-out', 'Otro gasto', 'expense', '➖');
