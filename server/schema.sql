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
  ratificadas       INTEGER,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Padron de unidades, precargado desde legacy/CLUES_IMB.xlsx (hoja BD_IMS_Final),
-- mas las que cada entidad agregue a mano cuando aun no tienen CLUES asignado.
-- La llave primaria es "id" (no CLUES): puede haber varias unidades sin CLUES
-- todavia (clues = NULL), y CLUES es unico solo dentro de la misma entidad
-- (para que un CLUES libre/provisional no choque entre dos entidades distintas).
CREATE TABLE IF NOT EXISTS unidades (
  id                              SERIAL PRIMARY KEY,
  clues                           TEXT,
  estado                         TEXT NOT NULL,
  tipo_unidad                    TEXT CHECK (tipo_unidad IN ('FIJA', 'MOVIL')),
  condicion_unidad               TEXT CHECK (condicion_unidad IN ('SE_INCLUYE', 'SE_EXCLUYE', 'SE_RATIFICA')),
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
  -- true solo para unidades agregadas a mano (sin CLUES original). Las que
  -- vienen del padron oficial nunca deben poder editar su CLUES.
  origen_manual                   BOOLEAN NOT NULL DEFAULT false,
  capturado_en                   TIMESTAMPTZ,
  enviado_en                     TIMESTAMPTZ,
  submission_id                  INTEGER REFERENCES submissions(id),
  UNIQUE (estado, clues)
);

CREATE INDEX IF NOT EXISTS idx_unidades_estado ON unidades(estado);
