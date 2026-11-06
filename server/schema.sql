-- Catalogo de acceso. Una fila por entidad federativa (acceso a todas sus
-- unidades) o por unidad especifica (acceso solo a esa unidad dentro de su
-- entidad). Contrasena guardada como hash bcrypt (nunca en texto plano).
--
--   estado         clave de acceso (lo que se manda al hacer login): el
--                  nombre de la entidad para cuentas de entidad completa, o
--                  el CLUES de la unidad para cuentas de una sola unidad.
--   estado_real    entidad real a la que pertenecen las unidades visibles
--                  (para filtrar unidades.estado). NULL en cuentas de
--                  entidad completa: en ese caso "estado" ya es la entidad
--                  real.
--   clues          si no es NULL, el acceso se limita a esa sola unidad
--                  (estado_real + clues). NULL = acceso a toda la entidad.
--   nombre         etiqueta a mostrar en el selector de login. NULL = usar
--                  "estado" tal cual (asi se comportan las 25 entidades).
CREATE TABLE IF NOT EXISTS entidades_auth (
  estado         TEXT PRIMARY KEY,
  password_hash  TEXT NOT NULL,
  estado_real    TEXT,
  clues          TEXT,
  nombre         TEXT
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
  recetas_completas BIGINT,
  recetas_incompletas BIGINT,
  recetas_no_surtidas BIGINT,
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
  recetas_completas              INTEGER CHECK (recetas_completas >= 0),
  recetas_incompletas            INTEGER CHECK (recetas_incompletas >= 0),
  recetas_no_surtidas            INTEGER CHECK (recetas_no_surtidas >= 0),
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
  -- Solo se llenan cuando la unidad se crea eligiendo un resultado del
  -- catalogo_ssa (ver mas abajo); nulas para todo lo demas.
  estatus_operacion               TEXT,
  latitud                          TEXT,
  longitud                         TEXT,
  -- true solo para unidades agregadas a mano (sin CLUES original). Las que
  -- vienen del padron oficial nunca deben poder editar su CLUES.
  origen_manual                   BOOLEAN NOT NULL DEFAULT false,
  capturado_en                   TIMESTAMPTZ,
  enviado_en                     TIMESTAMPTZ,
  submission_id                  INTEGER REFERENCES submissions(id),
  UNIQUE (estado, clues)
);

CREATE INDEX IF NOT EXISTS idx_unidades_estado ON unidades(estado);

-- Catalogo nacional de referencia (legacy/CLUES_SSA.xlsx), usado solo para
-- autocompletar el formulario de "Agregar unidad". Es de solo lectura desde
-- la app: se recarga completa cada vez que se corre el seed, no tiene datos
-- de usuario que proteger.
CREATE TABLE IF NOT EXISTS catalogo_ssa (
  id                              SERIAL PRIMARY KEY,
  estado                          TEXT NOT NULL,
  clues                           TEXT NOT NULL,
  nivel_atencion                  TEXT,
  nombre_tipo_establecimiento     TEXT,
  propiedad_inmueble              TEXT,
  nombre_tipologia                TEXT,
  nombre_unidad                   TEXT NOT NULL,
  municipio                       TEXT,
  localidad                       TEXT,
  asentamiento                    TEXT,
  tipo_vialidad                   TEXT,
  vialidad                        TEXT,
  numero_exterior                 TEXT,
  numero_interior                 TEXT,
  codigo_postal                   TEXT,
  estatus_operacion               TEXT,
  latitud                         TEXT,
  longitud                        TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalogo_ssa_estado_nombre ON catalogo_ssa (estado, nombre_unidad);
