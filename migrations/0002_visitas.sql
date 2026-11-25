-- Anonymous usage statistics for the admin panel. No IP address, cookie or account is
-- stored: "visitante" is a one-way hash that changes every day, so a person cannot be
-- followed from one day to the next.
CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dia TEXT NOT NULL,          -- YYYY-MM-DD, hora de Ecuador (UTC-5)
  hora INTEGER NOT NULL,      -- 0..23, hora de Ecuador
  visitante TEXT NOT NULL,    -- hash diario anónimo
  evento TEXT NOT NULL,       -- visita, subir, construir, dibujar, recorrido, pro, exportar, sugerencia, video, guia, guia_saltada
  nuevo INTEGER NOT NULL DEFAULT 0, -- 1 = primera visita desde ese navegador
  sitio TEXT,                 -- cloudflare | github
  origen TEXT,                -- dominio de donde llegó (o "directo")
  campana TEXT,               -- utm_source, si el enlace la trae
  pais TEXT,
  dispositivo TEXT,           -- movil | tableta | computadora
  navegador TEXT
);
CREATE INDEX IF NOT EXISTS visitas_dia ON visitas (dia, evento);
