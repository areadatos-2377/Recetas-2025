# Plan de implementación — Mejoras a "Agregar unidad sin CLUES"

Fecha del plan: 2026-08-04
Continúa sobre lo ya implementado en `PLAN_IMPLEMENTACION.md` (la app ya está en producción con `id` como llave primaria, `clues` opcional, y el botón "Agregar unidad sin CLUES").

## 1. Resumen de los cambios pedidos

1. El formulario de alta de unidad manual debe incluir **OBSERVACIONES**.
2. El formulario de alta debe incluir **TIPO_UNIDAD** (Fija/Móvil) y **CONDICION_UNIDAD** (Se incluye/Se excluye) — se agregó después en la conversación.
3. Al crear una unidad manual, se debe poder escribir un **CLUES de formato libre** (no el formato oficial), de una vez, en lugar de solo poder agregarlo después.
4. Las unidades agregadas a mano deben verse en **un apartado separado, después de la tabla principal**, no mezcladas con el padrón oficial.

## 2. Decisiones confirmadas contigo

| Pregunta | Decisión |
|---|---|
| Unicidad del CLUES libre | **Único por entidad** (`estado + clues`), no global. Dos entidades pueden usar el mismo código informal sin chocar entre sí. |
| Criterio para el apartado separado | **Todas las unidades con `origen_manual = true`**, de forma permanente — aunque después le escriban un CLUES, se queda en el apartado (no se mueve a la tabla principal). Se distingue por su origen, no por si tiene CLUES en este momento. |

## 3. Qué ya existe vs. qué falta

| Campo | Backend (`POST /api/unidades`) | Formulario actual |
|---|---|---|
| `nombre_unidad` y demás datos descriptivos | Ya lo acepta y valida | Ya está en el formulario |
| `observaciones` | **Ya lo acepta y guarda** (nunca se expuso en el formulario) | Falta agregarlo |
| `tipo_unidad` / `condicion_unidad` | **Ya lo acepta y valida** (mismo check que en `PUT`) | Falta agregarlo |
| `clues` | El endpoint **fuerza `NULL`** al crear, ignora cualquier valor recibido | Falta agregarlo, y falta que el backend lo acepte |

Es decir: los puntos 1 y 2 de la lista son, en el fondo, **el mismo tipo de cambio** (exponer en el formulario campos que el backend ya soporta) — no tocan la base de datos. El punto 3 (CLUES libre) sí requiere un cambio de backend y de la restricción de unicidad en la base de datos. El punto 4 es un cambio de frontend (cómo se organiza la tabla).

## 4. Cambios en base de datos

La restricción actual (de la migración anterior) es:

```sql
ALTER TABLE unidades ADD CONSTRAINT unidades_clues_key UNIQUE (clues);
```

Esto es una unicidad **global**: ningún CLUES se puede repetir entre absolutamente ninguna entidad. Hay que cambiarla a una unicidad **compuesta** por entidad:

```sql
ALTER TABLE unidades DROP CONSTRAINT IF EXISTS unidades_clues_key;
ALTER TABLE unidades ADD CONSTRAINT unidades_estado_clues_key UNIQUE (estado, clues);
```

Esto sigue funcionando igual de bien para los CLUES oficiales (que ya son únicos globalmente porque el propio código incluye el estado), y además permite que un CLUES libre como `"TEMP-01"` exista una vez en Colima y otra vez en Tlaxcala sin conflicto. Postgres trata cada fila con `clues = NULL` como no conflictiva entre sí, así que varias unidades sin CLUES en la misma entidad siguen conviviendo sin problema (esto no cambia).

- Se actualiza `server/schema.sql` para que una base de datos nueva ya nazca con la restricción compuesta.
- Se agrega `server/scripts/migrate-clues-unique-por-estado.js`, un script de migración nuevo (siguiendo el mismo patrón que `migrate-clues-optional.js`: revisa el estado actual antes de aplicar, seguro de correr más de una vez) para la base de datos que ya está en Railway.
- Se prueba primero en una base local (Docker) con datos de ejemplo, incluyendo un caso que debe fallar (mismo CLUES libre repetido en la misma entidad) y uno que debe funcionar (mismo CLUES libre en dos entidades distintas), antes de tocar producción.

## 5. Cambios en backend

En `server/routes/unidades.js`, dentro de `POST /api/unidades`:

- Aceptar `body.clues` (opcional). Si viene, usar `trimmedOrNull` (misma función que ya se usa para los demás campos) y validar longitud máxima (misma constante `TEXT_FIELD_MAX_LEN`). **Sin validar formato** — cualquier texto no vacío es válido (formato libre, tal como se pidió).
- Ya no forzar `NULL` en el `INSERT`; usar el valor recibido (o `NULL` si no se mandó).
- Igual que en `PUT /api/unidades/:id`, envolver el `INSERT` en un `try/catch` y, si la base de datos rechaza por duplicado (`error.code === '23505'`), responder `409` con un mensaje claro ("Ese CLUES ya está registrado en otra unidad de tu entidad").
- `tipo_unidad`, `condicion_unidad` y `observaciones` **no requieren cambios** — el endpoint ya los valida y guarda correctamente; el trabajo aquí es puramente de formulario (sección 6).

## 6. Cambios en frontend

### 6.1 Formulario "Agregar unidad sin CLUES" (`public/app.html` + `public/js/app.js`)

Se agregan al formulario, todos opcionales (nada de esto bloquea el alta salvo el nombre de la unidad, que ya es obligatorio):

- **CLUES**: campo de texto libre, con una nota tipo *"Opcional. Puedes usar un identificador provisional; no tiene que seguir el formato oficial."*
- **Tipo de unidad**: mismo grupo de radios "Fija" / "Móvil" que ya se usa en el panel de detalle de cualquier unidad.
- **Condición de la unidad**: mismo grupo de radios "Se incluye" / "Se excluye".
- **Observaciones**: `<textarea>` igual al que ya existe en el panel de detalle.

El envío del formulario (`app.js`) manda estos cuatro campos adicionales en el `POST /api/unidades`, junto con los que ya se mandan hoy.

### 6.2 Apartado separado para unidades manuales

Estructura nueva en `app.html`, dentro de `<main>`, después de la tabla principal:

```html
<section class="manual-units-section">
  <h2>Unidades agregadas manualmente</h2>
  <p class="section-subtitle">Unidades sin CLUES del padrón oficial, agregadas por tu entidad.</p>
  <table class="unidades-table" id="unidades-manual-table">
    <thead>...</thead>
    <tbody id="unidades-manual-tbody"></tbody>
  </table>
</section>
```

En `app.js`:

- `renderTable` se generaliza para poder pintar dos tablas: la principal solo con `origen_manual = false`, la nueva solo con `origen_manual = true` (ambas ya salen del mismo `GET /api/unidades`, no hay llamada nueva al servidor).
- Los manejadores de eventos (clic para expandir, cambios de radio, autoguardado de texto) hoy están enganchados a un único `tbody`. Se mueven a un contenedor común que envuelve ambas tablas, y las búsquedas puntuales (por ejemplo, "cerrar el panel de detalle abierto") dejan de asumir un único `tbody` fijo y buscan dentro de ese contenedor común — así una sola función de código sirve para las dos secciones, sin duplicar lógica.
- El buscador (`applyFilter`) sigue filtrando sobre la lista completa; el resultado filtrado simplemente se reparte entre las dos tablas al renderizar.
- Si una entidad no ha agregado ninguna unidad manual todavía, el apartado igual aparece, con un mensaje tipo *"Aún no has agregado unidades sin CLUES."* (se mantiene visible siempre, para que el botón de agregar sea fácil de encontrar).
- La barra de progreso general sigue contando todas las unidades (oficiales + manuales) juntas, sin cambios — el apartado es solo una cuestión de dónde se listan, no de qué cuenta para el avance.

## 7. Plan de pruebas antes de producción

1. Migración de unicidad: probar en Docker local con datos de ejemplo — mismo CLUES libre repetido en la misma entidad (debe fallar 409), mismo CLUES libre en dos entidades distintas (debe funcionar), CLUES oficiales existentes sin cambios.
2. Crear una unidad manual con CLUES libre + tipo_unidad + condicion_unidad + observaciones desde el formulario nuevo, vía API directamente (curl/node), confirmar que se guarda todo en un solo paso.
3. Confirmar que la tabla principal ya no incluye unidades con `origen_manual = true`, y que el apartado nuevo sí las incluye.
4. Confirmar que buscar por texto encuentra unidades en ambas secciones.
5. Probar la tercera opción "Se ratifica": guardarla en una unidad de prueba, confirmar que aparece correcto en el Excel generado (`SE RATIFICA`) y que el resumen antes de enviar ya no la cuenta como pendiente.
6. Confirmar que el nombre del archivo generado trae la hora de Ciudad de México (comparar contra la hora real al momento de la prueba, no contra la hora UTC del contenedor).
7. Solo después de todo esto, correr las migraciones contra la base de producción de Railway (con la misma foto de "antes/después" que se hizo la vez pasada, para verificar que no se pierde nada de lo ya capturado).

## 8. Orden de despliegue

Igual que la vez pasada: primero las migraciones de base de datos contra producción (unicidad por entidad, tercera opción en el `CHECK` de `condicion_unidad`, columna `ratificadas` en `submissions`), **después** subir el código nuevo — así no hay una ventana donde el código ya espera lo nuevo pero la base de datos todavía tiene lo viejo.

## 9. Cambio adicional: observaciones obligatorias para contar como "capturado"

Esto aplica a **todas** las unidades (oficiales y manuales, no solo a las nuevas): OBSERVACIONES debe explicar la razón de por qué se incluye o se excluye, y una unidad ya no cuenta como "Capturada" (ni en la insignia de estatus, ni en la barra de progreso) si le falta ese texto, aunque ya tenga TIPO_UNIDAD y CONDICION_UNIDAD marcados.

**No es un bloqueo duro**: seguirá siendo posible marcar Fija/Móvil y Se incluye/Se excluye sin observaciones (se guardan igual, el autoguardado no cambia), pero la unidad se queda como "Pendiente" hasta que también se escriba la razón. Esto mantiene la misma filosofía que ya se usó para "Enviar información" (advierte, no bloquea).

### Cambios necesarios

- **Backend** (`server/routes/unidades.js`, endpoint `GET /api/progreso`): la condición `WHERE tipo_unidad IS NOT NULL AND condicion_unidad IS NOT NULL` pasa a exigir también `observaciones IS NOT NULL AND btrim(observaciones) <> ''`.
- **Frontend** (`public/js/app.js`, función `isCapturada`): mismo criterio agregado, para que la insignia de cada renglón y el recálculo local de progreso coincidan con lo que dice el servidor.
- Se agrega una nota visible junto al campo de Observaciones en el panel de detalle (de cualquier unidad, no solo las manuales): *"Explica brevemente la razón de la inclusión o exclusión — se necesita para que la unidad cuente como capturada."*
- El resumen que se muestra antes de "Enviar información" (incluidas/excluidas/pendientes) sigue basado únicamente en CONDICION_UNIDAD, sin cambios — sigue sin bloquear el envío aunque falten observaciones, igual que hoy no bloquea aunque falten unidades por capturar.

## 10. Hora de Ciudad de México en el nombre del archivo

`buildFileName` (en `server/services/excelBuilder.js`) arma la fecha/hora con `new Date().getHours()`/`getMinutes()`, que usan la hora del sistema del servidor — en Railway eso es UTC, no la de México. Como México (excepto zona fronteriza) ya no usa horario de verano desde 2022, es un desfase fijo de 6 horas, pero en vez de restar 6 a mano se usa `Intl.DateTimeFormat` con `timeZone: 'America/Mexico_City'` (ya viene incluido en Node, sin librerías nuevas) para que el cálculo sea correcto aunque cambie la política de horario de verano en el futuro.

Solo afecta el nombre del archivo (`ESTADO_2026-08-04_1930.xlsx` con la hora ya correcta de CDMX). No toca `submissions.creado_en` en la base de datos (que se guarda como `TIMESTAMPTZ`, ya sin ambigüedad de zona horaria).

## 11. Nueva etiqueta y tercera opción para "Condición de la unidad"

Dos cambios distintos que llegan juntos:

**a) Solo la etiqueta visible cambia** (frontend, sin tocar nombres de columnas/campos): donde hoy se lee "Condición de la unidad" (en el panel de detalle de cada unidad, y en el formulario nuevo de alta manual), pasa a decir **"Acción a realizar en el anexo 1"**. El nombre interno del campo (`condicion_unidad`), el encabezado de esa columna en el Excel exportado (`CONDICION_UNIDAD`) y la ruta del API no cambian.

**b) Se agrega una tercera opción: "Se ratifica"**. Esto sí es un cambio real de datos, no solo de texto — hoy la base de datos solo acepta `SE_INCLUYE` o `SE_EXCLUYE` (hay un `CHECK` en la tabla). Las opciones visibles, en el orden pedido, quedan: **Se ratifica, Se incluye, Se excluye**.

Como el valor `condicion_unidad` ya existe en varios lugares del sistema, agregar una tercera opción real (no solo de etiqueta) toca cada uno de ellos:

| Lugar | Cambio |
|---|---|
| `server/schema.sql` / migración | El `CHECK (condicion_unidad IN ('SE_INCLUYE','SE_EXCLUYE'))` pasa a incluir `'SE_RATIFICA'`. Migración nueva contra producción (quitar el `CHECK` viejo, poner el nuevo), sin afectar las filas ya capturadas. |
| `server/routes/unidades.js` | La lista `CONDICION_UNIDAD_VALUES` (usada tanto en `PUT` como en `POST /api/unidades`) agrega `'SE_RATIFICA'`. |
| `server/services/excelBuilder.js` | El mapeo de etiquetas para el Excel agrega `SE_RATIFICA: 'SE RATIFICA'`. |
| `public/js/app.js` — panel de detalle de cada unidad | El grupo de radios de condición agrega la tercera opción, y la etiqueta del grupo cambia a "Acción a realizar en el anexo 1". |
| `public/app.html` + `public/js/app.js` — formulario de alta manual (sección 6.1 de este plan) | Mismo grupo de tres opciones, misma etiqueta nueva, desde que se agregó en la sección 6.1. |
| `public/js/app.js` — resumen antes de "Enviar información" | `computeSendSummary()` hoy solo cuenta incluidas/excluidas y calcula pendientes como el resto; hay que sumar un contador de "ratificadas" para que esas unidades no se cuenten incorrectamente como pendientes en el resumen. |
| `server/routes/enviar.js` + tabla `submissions` | El conteo de incluidas/excluidas al generar el Excel se le suma "ratificadas"; se agrega una columna `ratificadas` a `submissions` (migración chica) para que el historial de envíos quede completo. |

## 12. Cambiar el texto del botón "Agregar unidad sin CLUES"

El botón pasa a decir **"Agregar unidad"**. Cambio de una sola línea en `public/app.html`.

## 13. Fuera de alcance (por ahora)

- No se agrega manera de **borrar** una unidad agregada por error (si se necesita, sería un cambio aparte).
- No se valida el formato del CLUES libre de ninguna forma (ni longitud mínima, ni estructura) — cualquier texto no vacío se acepta, tal como se pidió.
