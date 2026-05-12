-- Migration 0007: qa_sessions
-- Calendario de Q&As en vivo del Protocolo 12. Una cohorte típica tiene
-- 3 sesiones (una por mes). Hugo las agenda desde admin, los usuarios
-- las ven en su dashboard.

CREATE TABLE IF NOT EXISTS qa_sessions (
  id TEXT PRIMARY KEY,
  cohort_id TEXT,                    -- NULL = aplica a todas, o específica
  scheduled_at TEXT NOT NULL,        -- ISO datetime UTC
  duration_min INTEGER DEFAULT 60,
  topic TEXT,                         -- "Ajuste de macros" / "Comer fuera"
  meeting_link TEXT,                  -- Zoom/Meet/Whereby
  recording_link TEXT,                -- post-Q&A
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled, live, done, canceled
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qa_cohort ON qa_sessions(cohort_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_qa_status ON qa_sessions(status, scheduled_at);
