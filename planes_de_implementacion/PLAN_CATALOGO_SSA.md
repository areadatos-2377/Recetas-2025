# Plan de implementación — Catálogo SSA para autocompletar "Agregar unidad"

Fecha del plan: 2026-08-05

## 1. Resumen

Cuando una entidad agrega una unidad manual (sin CLUES del padrón oficial), en vez de escribir todos los datos a mano, va a poder **buscar la unidad en el catálogo nacional de SSA** (`legacy/CLUES_SSA.xlsx`) y, al elegirla, se le llenan automáticamente los campos correspondientes — incluido el CLUES que trae ese catálogo. Si no la encuentra ahí, sigue pudiendo llenar todo a mano como ya funciona hoy.

## 2. Hallazgos sobre el archivo fuente

`legacy/CLUES_SSA.xlsx`, hoja `BD_IMS_Final`: **20,419 filas, 21 columnas** (18 iguales al padrón original + 3 nuevas: `ESTATUS DE OPERACION`, `LATITUD`, `LONGITUD`).

- **Nombres duplicados**: 1,210 nombres de unidad se repiten (18,466 nombres únicos). **908 de esos duplicados ocurren dentro de la misma entidad** (ej. "EMILIANO ZAPATA" aparece 9 veces solo en Chiapas). Un match exacto de texto no alcanza — el buscador tiene que mostrar contexto (municipio/localidad) para que el usuario elija la correcta.
- **Nombres de entidad no coinciden con los nuestros** en 3 casos: `CIUDAD DE MEXICO` (nosotros: `CDMX`), `MICHOACAN DE OCAMPO` (nosotros: `MICHOACAN`), `VERACRUZ DE IGNACIO DE LA LLAVE` (nosotros: `VERACRUZ`). Se normalizan al cargar los datos.
- El catálogo trae **32 entidades**, pero nuestro sistema solo maneja 25 (las del programa IMSS-Bienestar). Las 7 extra (Aguascalientes, Chihuahua, Coahuila, Durango, Jalisco, Nuevo León, Querétaro) simplemente nunca van a aparecer en ninguna búsqueda, porque siempre se filtra por la entidad de la sesión activa.
- `ESTATUS DE OPERACION` tiene 4 valores: `EN OPERACION` (5,082), `FUERA DE OPERACION` (15,304), `EN PROCESO DE CONSTRUCCION` (28), `PENDIENTE DE ENTRAR EN OPERACION` (5).

## 3. Decisiones confirmadas contigo

| Pregunta | Decisión |
|---|---|
| ¿El CLUES del catálogo SSA se copia al crear la unidad? | **Sí**, se copia al campo CLUES de la nueva unidad. |
| ¿Dónde van Estatus de operación / Latitud / Longitud? | **Se guardan como parte del registro de la unidad** — nuevas columnas en la base de datos y en el Excel final. |

## 4. Cambios en base de datos

### 4.1 Tabla nueva: catálogo de referencia (no se mezcla con `unidades`)

```sql
CREATE TABLE IF NOT EXISTS catalogo_ssa (
  id                              SERIAL PRIMARY KEY,
  estado                          TEXT NOT NULL,  -- ya normalizado a nuestros 25 nombres
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
```

Es una tabla de **solo lectura de referencia** — se vuelve a cargar completa cada vez que se corre el seed (no hay upsert por fila, no hay datos de usuario que proteger aquí, a diferencia de `unidades`).

### 4.2 Columnas nuevas en `unidades`

```sql
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS estatus_operacion TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS latitud TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS longitud TEXT;
```

Nulas para todo lo que ya existe (padrón oficial y unidades manuales previas); solo se llenan cuando una unidad manual nueva se crea a partir de una selección del catálogo.

### 4.3 Script de seed nuevo

`server/scripts/seed-catalogo-ssa.js`, mismo patrón de carga **por lotes** que ya usamos para el padrón principal (lección aprendida: nada de insertar fila por fila sobre el proxy público de Railway). Normaliza los 3 nombres de entidad antes de insertar. Trunca la tabla y recarga completa en cada corrida.

## 5. Cambios en backend

- **`GET /api/catalogo-ssa?buscar=texto`** (requiere sesión de entidad): busca en `catalogo_ssa` con `estado = req.estado AND nombre_unidad ILIKE '%texto%'`, límite ~20 resultados, devuelve todos los campos necesarios para autocompletar (incluye CLUES, estatus, lat/long). Nunca busca fuera de la entidad de la sesión.
- **`POST /api/unidades`**: acepta los 3 campos nuevos (`estatus_operacion`, `latitud`, `longitud`) igual que los demás campos de unidad manual; y ahora si **acepta `clues`** en el body de creación cuando viene de una selección de catálogo (ya lo hacía para el caso de CLUES libre escrito a mano — mismo camino, misma validación de unicidad por entidad).
- **`PUT /api/unidades/:id`**: se agregan `estatus_operacion`, `latitud`, `longitud` a `MANUAL_ONLY_FIELDS`, para que sigan siendo editables después si hace falta corregir algo.
- **`server/services/excelBuilder.js`**: 3 columnas nuevas al final (`ESTATUS DE OPERACION`, `LATITUD`, `LONGITUD`).
- **`GET /api/unidades`** y el `SELECT` de `enviar.js`: incluyen los 3 campos nuevos.

## 6. Cambios en frontend

En el formulario "Agregar unidad" (`public/app.html` + `public/js/app.js`):

- El campo "Nombre de la unidad" se convierte en un **buscador con autocompletar**: al escribir (con debounce), consulta `GET /api/catalogo-ssa?buscar=...` y muestra una lista desplegable con cada candidato mostrando nombre + municipio + localidad + tipo de establecimiento (para distinguir entre duplicados).
- Al elegir un resultado: se llenan automáticamente todos los campos del formulario, incluido CLUES, Estatus de operación, Latitud y Longitud.
- Si no encuentra nada o el usuario prefiere no usar el catálogo, puede seguir escribiendo todo a mano exactamente como funciona hoy (nada se bloquea).
- El panel de detalle de una unidad manual (donde ya se pueden editar sus campos después de creada) agrega los 3 campos nuevos a la lista de campos editables, igual que los demás.

## 7. Plan de pruebas antes de producción

1. Cargar el catálogo en una base local (Docker) y confirmar: 20,419 filas cargadas, los 3 nombres de entidad normalizados correctamente, búsqueda por entidad no cruza datos de otra.
2. Probar la búsqueda con un nombre duplicado dentro de la misma entidad (ej. "EMILIANO ZAPATA" en Chiapas) y confirmar que aparecen todos los candidatos con contexto suficiente para distinguirlos.
3. Crear una unidad manual eligiendo un resultado del catálogo, confirmar que se guardan todos los campos (incluido CLUES, estatus, lat/long).
4. Confirmar que el Excel generado incluye las 3 columnas nuevas.
5. Confirmar que un CLUES de catálogo duplicado (poco probable, pero por si acaso) se maneja igual que cualquier otro conflicto de unicidad (409, mensaje claro).
6. Solo después, cargar el catálogo y correr las migraciones de columnas nuevas contra producción.

## 8. Orden de despliegue

1. Migraciones de base de datos en producción (columnas nuevas en `unidades`, tabla `catalogo_ssa`).
2. Seed del catálogo SSA en producción.
3. Subir el código nuevo.

## 9. Fuera de alcance (por ahora)

- No se valida ni se hace nada especial si el catálogo marca una unidad como `FUERA DE OPERACION` — el estatus solo se guarda como referencia, la decisión de incluir/excluir/ratificar la sigue tomando la entidad.
- No se reemplaza ni se compara este catálogo contra el padrón oficial (`CLUES_IMB2025.xlsx`) — son dos fuentes independientes, cada una para su propio propósito.
