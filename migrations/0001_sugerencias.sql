-- Suggestions sent from the in-app form.
CREATE TABLE IF NOT EXISTS sugerencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creada TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('idea', 'error', 'opinion')),
  valoracion INTEGER CHECK (valoracion BETWEEN 1 AND 5),
  mensaje TEXT NOT NULL,
  contacto TEXT,
  version TEXT
);
CREATE INDEX IF NOT EXISTS sugerencias_creada ON sugerencias (creada);
