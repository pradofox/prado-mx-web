-- Migration 0001: SMAE schema inicial

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sex TEXT,
  age INTEGER,
  weight REAL,
  height INTEGER,
  weight_target REAL,
  activity REAL,
  goal REAL,
  conditions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at DESC);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  date TEXT NOT NULL,
  macros TEXT NOT NULL,
  equivalencias TEXT NOT NULL,
  meals TEXT NOT NULL,
  meals_distribution TEXT,
  mode TEXT DEFAULT 'normal',
  examples TEXT,
  weight_at_plan REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plans_patient ON plans(patient_id, date DESC);

CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY,
  group_key TEXT NOT NULL,
  name TEXT NOT NULL,
  portion TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_foods_group ON foods(group_key, name);
