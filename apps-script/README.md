# Google Apps Script: subir Excel a Drive

Este script recibe el archivo Excel que genera la app cada vez que una
entidad federativa da clic en "Enviar información" y lo guarda en una
carpeta específica de Google Drive. Estas instrucciones no requieren
saber programar, solo seguir los pasos con calma.

## 1. Crear el proyecto en script.google.com

1. Entra a https://script.google.com con la cuenta de Google que va a ser
   "dueña" del script (idealmente la misma cuenta dueña de la carpeta de
   Drive de destino).
2. Clic en **Nuevo proyecto**.
3. Ponle un nombre reconocible, por ejemplo `Webhook Drive - Censo SAM`
   (clic en el título "Proyecto sin título" arriba a la izquierda).

## 2. Pegar el código

1. En el editor verás un archivo `Código.gs` (o `Code.gs`) con contenido
   de ejemplo. Bórralo todo.
2. Abre el archivo `Code.gs` de esta carpeta (`apps-script/Code.gs`),
   copia **todo** su contenido y pégalo en el editor de script.google.com.
3. Guarda con el ícono de disquete o `Ctrl+S`.

## 3. Configurar el secreto (token)

El script solo acepta peticiones que incluyan una "contraseña" secreta
compartida. Esa contraseña **no** va escrita en el código (para que el
archivo se pueda compartir sin revelarla), sino guardada por separado:

1. En el editor, clic en el ícono de engrane ⚙️ **Configuración del
   proyecto** (a la izquierda).
2. Baja hasta **Propiedades del script** ("Script Properties").
3. Clic en **Añadir propiedad de script**.
4. En "Propiedad" escribe exactamente: `DRIVE_WEBHOOK_TOKEN`
5. En "Valor" inventa una cadena larga y aleatoria (por ejemplo, mezcla de
   letras y números de al menos 32 caracteres). Puedes generar una en
   https://1password.com/password-generator/ o similar, o simplemente
   escribir algo largo y difícil de adivinar.
6. Guarda.
7. **Copia ese mismo valor** — lo vas a necesitar en el paso de Railway
   (variable de entorno `DRIVE_WEBHOOK_TOKEN`). Debe ser idéntico en los
   dos lugares.

## 4. Confirmar acceso a la carpeta de Drive

El script guarda los archivos en la carpeta con este enlace:
https://drive.google.com/drive/folders/1mE_J2V971iRlGLqxtCxDLs9Q6YC-YDvI

- Si la cuenta de Google con la que creaste el script (paso 1) es la misma
  cuenta dueña de esa carpeta, no tienes que hacer nada más: ya tiene
  acceso.
- Si es una cuenta distinta, entra a esa carpeta en Drive con la cuenta
  dueña, clic derecho → **Compartir** → añade la cuenta del script con
  permiso de **Editor**.

## 5. Publicar como "Aplicación web"

1. En script.google.com, arriba a la derecha, clic en **Implementar**
   ("Deploy") → **Nueva implementación** ("New deployment").
2. Si te pide elegir un tipo, clic en el ícono de engrane junto a "Tipo" y
   selecciona **Aplicación web** ("Web app").
3. Configura:
   - **Ejecutar como**: Yo (tu cuenta).
   - **Quién tiene acceso**: Cualquier usuario ("Anyone").
4. Clic en **Implementar** ("Deploy").
5. Es posible que te pida autorizar permisos (acceso a Drive) — acepta y
   sigue el flujo, incluyendo el paso de "Ir a [nombre del proyecto]
   (no seguro)" si Google lo marca como app no verificada; es normal para
   scripts propios.

## 6. Copiar la URL

Al terminar la implementación aparece una URL que termina en `/exec`,
algo como:

```
https://script.google.com/macros/s/AKfycbx.../exec
```

Copia esa URL completa. Esa es la que va como variable de entorno
`DRIVE_WEBHOOK_URL` en Railway (junto con `DRIVE_WEBHOOK_TOKEN` del paso 3).

## 7. Probar que funciona con curl

Antes de conectar todo el sistema, puedes probar el script solo, desde una
terminal (por ejemplo Git Bash o PowerShell), con este comando. Sustituye
`TU_URL_AQUI` por la URL del paso 6 y `TU_TOKEN_AQUI` por el valor del
paso 3:

```bash
curl -X POST "TU_URL_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TU_TOKEN_AQUI",
    "filename": "prueba.xlsx",
    "fileBase64": "UEsDBBQAAAAIAA=="
  }'
```

El `fileBase64` de ejemplo de arriba no es un Excel real y es válido para
comprobar que el flujo responde `{"ok":true,...}`, pero el archivo que se
cree en Drive podría no abrirse correctamente en Excel (por no ser un
.xlsx completo). Si quieres una prueba con un archivo que sí abra, puedes
convertir cualquier `.xlsx` pequeño a base64 y usar ese valor en su lugar,
por ejemplo con:

```bash
base64 -w0 mi_archivo.xlsx
```

y pegar el resultado en el campo `fileBase64`.

Si todo está bien configurado, la respuesta debe verse así:

```json
{"ok":true,"fileId":"1AbC...","url":"https://drive.google.com/..."}
```

Si el token no coincide, verás:

```json
{"ok":false,"error":"Token inválido"}
```

## 8. Si cambias el código después

Guardar el archivo en script.google.com (`Ctrl+S`) **no** actualiza la
URL ya publicada — la implementación publicada queda "congelada" con el
código de cuando se implementó. Para que los cambios nuevos se reflejen
en la misma URL:

1. Clic en **Implementar** → **Gestionar implementaciones**
   ("Manage deployments").
2. Selecciona la implementación activa (la que tiene la URL que ya está
   en Railway) y clic en el ícono de lápiz (editar).
3. En "Versión", elige **Nueva versión** ("New version").
4. Clic en **Implementar**.

Esto mantiene la misma URL `/exec`, así que no hace falta cambiar nada en
Railway. Si en vez de esto creas una **Nueva implementación** desde cero,
se genera una URL distinta y tendrías que actualizar `DRIVE_WEBHOOK_URL`
en Railway también — por eso conviene usar "editar implementación
existente" cuando solo cambia el código.
