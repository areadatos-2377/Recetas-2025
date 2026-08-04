# Plan de implementación — Captura de unidades médicas (CLUES) por entidad

Fecha del plan: 2026-08-04

## 1. Resumen del proyecto

Aplicación web para que cada entidad federativa capture, sobre el padrón de unidades médicas (`legacy/CLUES_IMB.xlsx`, hoja `BD_IMS_Final`), dos datos por unidad — **TIPO_UNIDAD** (Fija / Móvil) y **CONDICION_UNIDAD** (Se incluye / Se excluye) — más un campo de **OBSERVACIONES** libre. Al terminar, el estado envía la información y se genera un Excel que se sube a una carpeta de Google Drive.

Acceso mediante una pantalla de login con **una contraseña por entidad federativa** (25 contraseñas en total, sin cuentas de usuario individuales).

## 2. Datos de origen (ya verificados)

- Archivo: `legacy/CLUES_IMB.xlsx`, hoja **`BD_IMS_Final`**.
- 10,573 filas de datos, 18 columnas (todas usadas, ninguna se descarta).
- 25 entidades federativas distintas en la columna `ESTADO`. Rango de tamaño: de 1 unidad (Guanajuato) hasta 1,248 (México). *Nota: Guanajuato (2), Yucatán (3) y Guerrero (1,056) tienen conteos que llaman la atención frente al resto — vale la pena que alguien de tu equipo confirme que el padrón está completo antes de publicar, no es algo que yo pueda corregir sin más contexto.*
- `TIPO_UNIDAD`, `CONDICION_UNIDAD` y `OBSERVACIONES` vienen vacíos en el archivo — son exactamente los campos que la app debe llenar.
- La codificación del archivo es UTF-8 correcto (acentos, "Ó", "Í", etc. se leen bien); no se requiere limpieza de texto.

## 3. Decisiones de arquitectura (confirmadas contigo)

| Decisión | Elegido |
|---|---|
| Conexión con Google Drive | **Google Apps Script Web App** ligado a tu cuenta de Google (no cuenta de servicio de GCP) |
| Contraseñas por entidad | **Las genero yo** y te entrego la lista para distribuir |
| Persistencia del avance mientras capturan | **Base de datos en servidor (Postgres en Railway)** — progreso compartido y visible en tiempo real entre quienes usan la misma contraseña |
| Archivo(s) al enviar | **Un Excel por entidad** (todas sus unidades), nombrado con la entidad + fecha/hora del envío |

## 4. Stack tecnológico

- **Backend:** Node.js + Express (encaja bien con Railway, fácil generación de `.xlsx` con `exceljs`, cliente HTTP simple hacia el Apps Script).
- **Base de datos:** PostgreSQL (plugin de Railway).
- **Frontend:** HTML + CSS + JavaScript plano (sin framework), servido como estáticos por el mismo backend. Dos páginas: `login.html` y `app.html`.
- **Puente a Google Drive:** Google Apps Script publicado como Web App (`doPost`), recibe el Excel en base64 y lo guarda en la carpeta que compartiste.
- **Autenticación:** cookie httpOnly firmada (JWT) con la entidad como claim, expira a las horas de inactividad. Sin base de usuarios individual.
- **Despliegue:** Railway (servicio Node + plugin Postgres).

## 5. Modelo de datos (Postgres)

```sql
-- Catálogo de acceso por entidad (contraseñas con hash bcrypt, nunca en texto plano)
CREATE TABLE entidades_auth (
  estado         TEXT PRIMARY KEY,
  password_hash  TEXT NOT NULL
);

-- Padrón de unidades, precargado desde el Excel legacy
CREATE TABLE unidades (
  clues                          TEXT PRIMARY KEY,
  estado                         TEXT NOT NULL,
  tipo_unidad                    TEXT,             -- 'FIJA' | 'MOVIL' | NULL
  condicion_unidad               TEXT,             -- 'SE_INCLUYE' | 'SE_EXCLUYE' | NULL
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
CREATE INDEX idx_unidades_estado ON unidades(estado);

-- Historial de envíos (uno por cada vez que una entidad da "Enviar información")
CREATE TABLE submissions (
  id                SERIAL PRIMARY KEY,
  estado            TEXT NOT NULL,
  archivo_nombre    TEXT NOT NULL,
  drive_file_id     TEXT,
  drive_file_url    TEXT,
  total_unidades    INTEGER,
  incluidas         INTEGER,
  excluidas         INTEGER,
  creado_en         TIMESTAMPTZ DEFAULT now()
);
```

## 6. Flujo de usuario

1. **Login** (`login.html`): selecciona su entidad de un desplegable + escribe la contraseña. El backend valida contra `entidades_auth`, y si es correcta emite la cookie de sesión con la entidad codificada.
2. **Tabla principal** (`app.html`): trae del backend únicamente las unidades de su entidad. Se muestra una tabla con solo **CLUES** y **NOMBRE TIPO ESTABLECIMIENTO**, más una columna de estatus (Pendiente / Capturado), y una barra de progreso ("342 de 1,248 capturadas"). Incluye buscador para filtrar por CLUES o nombre.
3. **Clic en un renglón**: se despliega un panel/modal con el resto de columnas de esa unidad en modo lectura (nivel de atención, propiedad del inmueble, dirección completa, etc.) y el formulario de captura:
   - **TIPO_UNIDAD**: Fija / Móvil (radio o select).
   - **CONDICION_UNIDAD**: Se incluye / Se excluye (radio o select).
   - **OBSERVACIONES**: textarea libre.
   - Autoguardado al cambiar cualquier campo (llamada `PUT` inmediata), con confirmación visual ("Guardado").
4. **Enviar información**: botón visible siempre, con un resumen antes de confirmar (cuántas incluidas/excluidas/pendientes). Si quedan unidades sin capturar, se advierte pero **no se bloquea** el envío (asunción, ver sección 10). Al confirmar:
   - El backend arma el Excel de esa entidad (todas las columnas originales + los 3 campos nuevos llenos).
   - Lo sube vía el Apps Script a la carpeta de Drive.
   - Guarda el registro en `submissions` y marca las unidades como enviadas.
   - Muestra al usuario un enlace de confirmación.
5. **Reenvíos**: si después del primer envío se sigue corrigiendo información, un nuevo "Enviar información" genera **otro** archivo con fecha/hora distinta (versionado natural), sin sobrescribir el anterior.

## 7. Endpoints del API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/login` | `{estado, password}` → valida y setea cookie de sesión |
| POST | `/api/logout` | Cierra sesión |
| GET | `/api/unidades` | Devuelve todas las unidades de la entidad de la cookie activa |
| PUT | `/api/unidades/:clues` | Actualiza `tipo_unidad` / `condicion_unidad` / `observaciones` de una unidad (autoguardado) |
| GET | `/api/progreso` | Conteos para la barra de avance |
| POST | `/api/enviar` | Genera el Excel, lo sube a Drive, registra el envío |

Toda ruta (excepto `/api/login`) exige la cookie válida y **siempre filtra por la entidad del token**, nunca por un valor que mande el navegador — así una entidad no puede ver ni tocar datos de otra aunque manipule las peticiones.

## 8. Integración con Google Drive (Apps Script)

Carpeta destino (de tu enlace): ID `1qUePwlC-0QyJmF_e0wWsUVFl51ixdkf_`.

Pasos que tendrás que hacer tú (te doy el código listo cuando implementemos):

1. Entra a [script.google.com](https://script.google.com) con la cuenta dueña (o con acceso de editor) de esa carpeta de Drive.
2. Crea un proyecto nuevo y pega el código `Code.gs` que incluiré en `apps-script/Code.gs` del repo (recibe `{token, filename, fileBase64}` por POST, valida el token secreto, y guarda el archivo en la carpeta con `DriveApp.getFolderById(...)`).
3. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como "Yo", acceso "Cualquier usuario" (el token secreto es la protección, no el acceso público de Apps Script).
4. Copiar la URL de la implementación y dármela para configurarla como variable de entorno (`DRIVE_WEBHOOK_URL`) en Railway, junto con un token secreto (`DRIVE_WEBHOOK_TOKEN`) que generamos y colocamos también dentro del propio script.

## 9. Contraseñas por entidad

- Genero 25 contraseñas robustas pero fáciles de dictar por teléfono (formato tipo `Sonora-4Kq7`), una por entidad.
- Se guardan **hasheadas** (bcrypt) en la tabla `entidades_auth`; el texto plano nunca se sube al repositorio.
- Te entrego la lista completa en un archivo aparte (fuera del repo, o en un `.txt`/`.xlsx` que tú resguardes) para que se la distribuyas a cada entidad por el canal que prefieras.

## 10. Supuestos que estoy asumiendo (avísame si alguno no aplica)

- El envío final **no bloquea** aunque falten unidades por capturar (solo advierte). Si prefieres que sea obligatorio capturar el 100% antes de poder enviar, lo cambiamos.
- Se permite reenviar más de una vez por entidad (genera un nuevo archivo versionado cada vez) en lugar de permitir un único envío definitivo.
- Las opciones de `TIPO_UNIDAD` se guardan como `FIJA` / `MOVIL` y `CONDICION_UNIDAD` como `SE_INCLUYE` / `SE_EXCLUYE` (valores internos), mostrando en pantalla "Fija", "Móvil", "Se incluye", "Se excluye".
- No se requiere edición de las demás columnas (dirección, nivel de atención, etc.) — son solo lectura, tal como pediste.
- Una sola sesión de captura por entidad a la vez conceptualmente, pero como la contraseña es compartida, el diseño soporta varias personas capturando simultáneamente sin pisarse (cada `PUT` es por CLUES individual).

## 11. Seguridad

- Contraseñas con hash bcrypt, nunca en texto plano en base de datos ni en el repo.
- Cookie de sesión `httpOnly`, `Secure`, `SameSite=strict`, firmada con `JWT_SECRET` (variable de entorno de Railway).
- Límite de intentos de login (`express-rate-limit`) para dificultar fuerza bruta sobre las 25 contraseñas.
- Todas las consultas de datos filtran server-side por la entidad de la sesión, ignorando cualquier valor de "estado" que llegue del cliente.
- El token compartido con el Apps Script (`DRIVE_WEBHOOK_TOKEN`) vive solo como variable de entorno en Railway y dentro del propio script — nunca en el HTML/JS público.

## 12. Estructura de carpetas propuesta

```
/
├── legacy/CLUES_IMB.xlsx
├── planes_de_implementacion/PLAN_IMPLEMENTACION.md
├── apps-script/Code.gs
├── server/
│   ├── index.js
│   ├── db.js
│   ├── middleware/requireAuth.js
│   ├── routes/ (auth.js, unidades.js, enviar.js)
│   ├── services/ (driveClient.js, excelBuilder.js)
│   └── scripts/ (seed.js, generate-passwords.js)
├── public/
│   ├── login.html
│   ├── app.html
│   ├── css/styles.css
│   └── js/ (login.js, app.js)
├── package.json
├── .env.example
└── .gitignore
```

## 13. Despliegue en Railway

1. Crear proyecto en Railway, conectar el repo.
2. Añadir plugin de **PostgreSQL** (genera `DATABASE_URL` automáticamente).
3. Variables de entorno del servicio Node: `DATABASE_URL` (automática), `JWT_SECRET`, `DRIVE_WEBHOOK_URL`, `DRIVE_WEBHOOK_TOKEN`, `NODE_ENV=production`.
4. Ejecutar una sola vez `node server/scripts/seed.js` contra la base de producción (carga las 10,573 unidades desde el Excel legacy + los hashes de las 25 contraseñas).
5. Railway detecta el `package.json` y corre `npm start`.
6. (Opcional) dominio personalizado.

## 14. Fases de implementación

1. **Base de datos y seed**: esquema Postgres + script que lee `CLUES_IMB.xlsx` y carga `unidades`; script que genera y hashea las 25 contraseñas.
2. **Backend**: login con cookie JWT, endpoints de unidades (listar/actualizar), endpoint de progreso.
3. **Frontend**: pantalla de login, tabla principal con expansión de renglón y formulario de captura con autoguardado.
4. **Generación de Excel + integración Drive**: `excelBuilder.js` + Apps Script (`Code.gs`) + endpoint `/api/enviar`.
5. **Pruebas end-to-end**: login por entidad, captura, envío, verificación del archivo en Drive.
6. **Despliegue en Railway** + entrega de la lista de 25 contraseñas.

## 15. Siguientes pasos inmediatos

1. Confirmas (o ajustas) los supuestos de la sección 10.
2. Empiezo por la fase 1 (base de datos + seed) y la fase 4 en paralelo (necesito que configures el Apps Script con el código que te entregue, para tener la URL antes de las pruebas de envío).
3. Te comparto la lista de contraseñas cuando el seed esté listo.
