-- Catalogo de acceso por entidad. Una fila por entidad federativa, contrasena
-- guardada como hash bcrypt (nunca en texto plano).
CREATE TABLE IF NOT EXISTS entidades_auth (
  estado         TEXT PRIMARY KEY,
  password_hash  TEXT NOT NULL
);

-- Historial de envios: una fila por cada vez que una entidad da "Enviar informacion".
CREATE TABLE IF NOT EXISTS submissions (
  id                SERIAL PRIMARY KEY,
  estado            TEXT NOT NULL,
  archivo_nombre    TEXT NOT NULL,
  drive_file_id     TEXT,
  drive_file_url    TEXT,
  total_unidades    INTEGER,
  incluidas         INTEGER,
  excluidas         INTEGER,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Padron de unidades, precargado desde legacy/CLUES_IMB.xlsx (hoja BD_IMS_Final).
CREATE TABLE IF NOT EXISTS unidades (
  clues                          TEXT PRIMARY KEY,
  estado                         TEXT NOT NULL,
  tipo_unidad                    TEXT CHECK (tipo_unidad IN ('FIJA', 'MOVIL')),
  condicion_unidad               TEXT CHECK (condicion_unidad IN ('SE_INCLUYE', 'SE_EXCLUYE')),
  nivel_atencion                 TEXT,
  nombre_tipo_establecimiento    TEXT,
  propiedad_inmueble             TEXT,
  nombre_tipologia               TEXT,
  nombre_unidad                  TEXT,
  municipio                      TEXT,
  localidad                      TEXT,
  asentamiento                   TEXT,
  tipo_vialidad                  TEXT,
  vialidad                       TEXT,
  numero_exterior                TEXT,
  numero_interior                TEXT,
  codigo_postal                  TEXT,
  observaciones                  TEXT,
  capturado_en                   TIMESTAMPTZ,
  enviado_en                     TIMESTAMPTZ,
  submission_id                  INTEGER REFERENCES submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_unidades_estado ON unidades(estado);
