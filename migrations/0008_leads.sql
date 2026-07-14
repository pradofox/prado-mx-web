-- Migration 0008: leads
-- Captura de contactos ANTES de que exista el checkout (Stripe pendiente).
-- Sirve para la lista de espera de Protocolo 12 y para futuras campañas
-- de IG (source distingue el origen, campaign la campaña específica).

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'p12-v1',   -- p12-v1, guia, macros...
  campaign TEXT,                            -- ?c= de la URL (reel/campaña)
  created_at TEXT NOT NULL,
  notified_at TEXT,                         -- cuándo se le avisó (post-Resend)
  UNIQUE(email, source)
);

CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source, created_at);
