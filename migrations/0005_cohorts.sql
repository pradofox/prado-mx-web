-- Migration 0005: cohorts (Protocolo 12)

CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,        -- 'cohorte-junio-2026'
  name TEXT NOT NULL,                -- 'Cohorte Junio 2026'
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 30,
  sold INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL,       -- ej. 299900 ($2,999 MXN)
  currency TEXT DEFAULT 'mxn',
  enrollment_opens_at TEXT,
  enrollment_closes_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned',  -- planned, enrollment, active, ended
  whatsapp_group_link TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts(status, start_date);
CREATE INDEX IF NOT EXISTS idx_cohorts_slug ON cohorts(slug);

-- Subscribers: pertenecen a una cohorte específica, no a una suscripción
ALTER TABLE subscribers ADD COLUMN cohort_id TEXT;
ALTER TABLE subscribers ADD COLUMN enrolled_at TEXT;
ALTER TABLE subscribers ADD COLUMN access_until TEXT;
ALTER TABLE subscribers ADD COLUMN payment_status TEXT DEFAULT 'pending'; -- pending, paid, refunded

CREATE INDEX IF NOT EXISTS idx_subscribers_cohort ON subscribers(cohort_id);

-- Seed: una cohorte inicial planeada (Hugo/Roberto editan la fecha desde admin)
INSERT OR IGNORE INTO cohorts (
  id, slug, name, start_date, end_date, capacity, sold, price_cents,
  enrollment_opens_at, enrollment_closes_at, status, created_at, updated_at
) VALUES (
  'cohort-2026-junio',
  'cohorte-junio-2026',
  'Cohorte Junio 2026',
  '2026-06-01',
  '2026-08-23',
  30,
  0,
  299900,
  '2026-05-12',
  '2026-05-29',
  'planned',
  datetime('now'),
  datetime('now')
);
