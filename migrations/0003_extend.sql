-- Migration 0003: ampliar patients y plans con datos para PDF de Hugo.

-- Patients: contacto + link al seca + próxima cita
ALTER TABLE patients ADD COLUMN email TEXT;
ALTER TABLE patients ADD COLUMN phone TEXT;
ALTER TABLE patients ADD COLUMN seca_link TEXT;
ALTER TABLE patients ADD COLUMN last_appointment TEXT;
ALTER TABLE patients ADD COLUMN next_appointment TEXT;
ALTER TABLE patients ADD COLUMN start_date TEXT;

-- Plans: antropométricos + número de cita + opciones de menú por tiempo
ALTER TABLE plans ADD COLUMN cita_num INTEGER;
ALTER TABLE plans ADD COLUMN muslo REAL;
ALTER TABLE plans ADD COLUMN pierna REAL;
ALTER TABLE plans ADD COLUMN bicep REAL;
ALTER TABLE plans ADD COLUMN bicep_flex REAL;
ALTER TABLE plans ADD COLUMN cintura REAL;
ALTER TABLE plans ADD COLUMN cadera REAL;
ALTER TABLE plans ADD COLUMN ombligo REAL;
ALTER TABLE plans ADD COLUMN menu_options TEXT; -- JSON: { "desayuno": ["opc1", "opc2", "opc3"], ... }
