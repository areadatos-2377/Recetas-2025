# Plan de implementación — Quitar TIPO_UNIDAD (Fija/Móvil) de la captura

Fecha del plan: 2026-08-05

## 1. Resumen

`TIPO_UNIDAD` (Fija/Móvil) deja de pedirse al usuario. Deja de ser:
- Un campo visible en el formulario de captura de cualquier unidad (oficial o manual).
- Un campo que se pida al agregar una unidad nueva.
- Un requisito para que una unidad cuente como "Capturada" (ni en la barra de progreso de cada entidad, ni en el informe nacional).

## 2. Decisión confirmada contigo

| Pregunta | Decisión |
|---|---|
| ¿La columna TIPO_UNIDAD sigue en el Excel que se sube a Drive? | **Sí, se mantiene la columna, vacía** para toda captura nueva (por si el formato oficial del Anexo 1 la exige). Las pocas unidades que ya tienen Fija/Móvil capturado de antes conservan su valor en el Excel. |

## 3. Qué NO cambia (importante)

- **No se borra la columna `tipo_unidad` de la base de datos.** Ya es opcional hoy (no tiene `NOT NULL`), así que no hace falta ninguna migración.
- **No se toca el dato histórico.** Las unidades que ya tienen Fija/Móvil capturado (de antes de este cambio) conservan ese valor tal cual — no se limpia ni se resetea nada.
- El backend sigue pudiendo *aceptar* `tipo_unidad` si algún día se manda explícitamente por la API (por ejemplo, para corregir un dato viejo a mano) — lo que cambia es que **la interfaz ya nunca lo pide ni lo manda**, y que **ya no es requisito** para que algo cuente como capturado.
- El script `server/scripts/limpiar-datos-prueba.js` no cambia: sigue limpiando `tipo_unidad` como parte de "cualquier cosa capturada" cuando se resetean datos de prueba, lo cual sigue siendo correcto (esa columna sigue existiendo y pudiendo tener datos viejos).

## 4. Inventario completo de cambios

### Backend

| Archivo | Cambio |
|---|---|
| `server/routes/unidades.js` — `GET /api/progreso` | La condición para contar una unidad como "capturada" deja de exigir `tipo_unidad IS NOT NULL`. Queda: `condicion_unidad IS NOT NULL AND observaciones IS NOT NULL AND btrim(observaciones) <> ''`. |
| `server/routes/admin.js` — `GET /api/admin/resumen` | Mismo cambio que arriba, en la consulta que arma el informe nacional (esto es lo que hace que el % de avance y "Capturadas" del panel de control ya no dependan de Fija/Móvil). |
| `server/routes/unidades.js` — todo lo demás (`POST`/`PUT`, `UNIVERSAL_FIELDS`, `TIPO_UNIDAD_VALUES`, los `SELECT`) | **Sin cambios.** Se deja tal cual, por compatibilidad y porque no estorba: como la interfaz ya no lo va a mandar, esos campos simplemente dejan de usarse en la práctica, sin necesidad de bloquear nada a propósito. |
| `server/services/excelBuilder.js` | **Sin cambios** (decisión de la sección 2: la columna se queda). |
| `server/routes/enviar.js` | **Sin cambios** (el `SELECT` ya incluye `tipo_unidad`, se sigue exportando tal cual esté en la base). |
| `server/schema.sql` | **Sin cambios.** No hace falta migración. |

### Frontend

| Archivo | Cambio |
|---|---|
| `public/app.html` | Se quita el bloque "Tipo de unidad" (los radios Fija/Móvil) del formulario "Agregar unidad". |
| `public/js/app.js` — `isCapturada()` | Deja de exigir `u.tipo_unidad`. Queda: `condicion_unidad && observaciones`. |
| `public/js/app.js` — `buildDetailRowHtml()` | Se quita la generación del grupo de radios "Tipo de unidad" del panel de detalle de cada unidad (aplica igual a unidades oficiales y manuales, porque ese bloque es compartido entre ambas). |
| `public/js/app.js` — manejador de `change` en la tabla | Se quita la rama que guarda `tipo_unidad` cuando cambia un radio (ya no existen esos radios). |
| `public/js/app.js` — `updateRowVisualsAfterSave()` | Se quita `tipo_unidad` de la lista de campos que refrescan la insignia de estatus (limpieza, ya no aplica). |
| `public/js/app.js` — envío del formulario "Agregar unidad" | Se quita la lectura del radio `tipo_unidad` y su inclusión en el payload que se manda a `POST /api/unidades`. |
| `public/js/control-panel.js` | **Sin cambios directos.** Nunca mostró Fija/Móvil como columna; el efecto que sí tiene este cambio es que las cifras de "Capturadas" y "% avance" del informe nacional van a cambiar de significado (ver sección 5). |

## 5. Efecto en el informe nacional (panel de control)

Hoy una unidad cuenta como "capturada" si tiene **tipo_unidad + condicion_unidad + observaciones**. Después de este cambio, cuenta como capturada con **solo condicion_unidad + observaciones**. Esto quiere decir que:

- El % de avance nacional y por entidad va a **subir** de golpe en cuanto se despliegue este cambio (unidades que ya tenían condición + observaciones pero no tipo_unidad, que antes contaban como pendientes, ahora cuentan como capturadas).
- Esto es el comportamiento esperado de lo que pediste ("ya no será un limitante"), pero avisamos aquí para que no sorprenda ver el número saltar justo después del despliegue.

## 6. Plan de pruebas antes de producción

1. Confirmar en local que el formulario de "Agregar unidad" ya no muestra Fija/Móvil.
2. Confirmar que el panel de detalle de una unidad (oficial y manual) ya no muestra Fija/Móvil.
3. Capturar una unidad con solo condición + observaciones (sin tipo_unidad) y confirmar que aparece como "Capturado" en la tabla y en `/api/progreso`.
4. Confirmar lo mismo en `/api/admin/resumen` (panel de control).
5. Generar un Excel de prueba y confirmar que la columna TIPO_UNIDAD sigue presente (vacía para lo nuevo, con valor para lo viejo que ya lo tenía).
6. Confirmar que una unidad con `tipo_unidad` ya capturado de antes no pierde ese dato al guardar otro campo (por ejemplo, editar observaciones no debe borrar un tipo_unidad viejo).

## 7. Orden de despliegue

No hay migración de base de datos, así que es un despliegue simple: solo subir el código (backend + frontend) de una vez. No hay un orden especial que respetar.

## 8. Fuera de alcance (por ahora)

- No se borra el dato histórico de `tipo_unidad` de las unidades que ya lo tienen.
- No se quita la columna del Excel (por la decisión de la sección 2).
- No se quita `tipo_unidad` de la base de datos ni de la API — solo deja de pedirse desde la interfaz y de ser requisito para "capturado".
