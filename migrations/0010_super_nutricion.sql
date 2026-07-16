-- Migration 0010: información nutrimental en /super
--
-- La data se jala de los retailers (Soriana como primaria, HEB como
-- verificación cruzada) y entra SIEMPRE como borrador: nunca se publica
-- sin que Hugo la confirme. Se guarda de dónde salió y qué producto hizo
-- match, porque el modo de falla de estos buscadores no es "no encontré"
-- sino devolver otro producto con toda confianza.
--
-- nutri_status: draft (sin revisar) | ok (Hugo confirmó) | rejected
-- nutri_confidence: alta (2 fuentes coinciden) | media (1 fuente, match
--                   fuerte) | baja (match dudoso, urge revisión)

ALTER TABLE super_products ADD COLUMN nutrition TEXT;
ALTER TABLE super_products ADD COLUMN nutri_source TEXT;
ALTER TABLE super_products ADD COLUMN nutri_match TEXT;
ALTER TABLE super_products ADD COLUMN nutri_confidence TEXT;
ALTER TABLE super_products ADD COLUMN nutri_status TEXT NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_super_nutri ON super_products(nutri_status);
