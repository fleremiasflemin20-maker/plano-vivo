-- Shared projects: a copy of the project (without the plan image) behind a random link.
-- Only what the user decides to share is stored.
CREATE TABLE IF NOT EXISTS compartidos (
  id TEXT PRIMARY KEY,
  creado TEXT NOT NULL,
  datos TEXT NOT NULL
);
