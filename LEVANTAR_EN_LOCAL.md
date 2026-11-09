# Levantar el proyecto en local

Guía para correr la plataforma en tu computadora, sin tocar producción (Railway) ni la carpeta de Google Drive.

## ¿Hace falta Docker?

**No.** El proyecto es una app de Node.js que solo necesita una base de datos **PostgreSQL**. Cómo consigas ese Postgres es lo de menos:

- **Opción A:** Postgres en Docker (un solo comando, sin instalar nada más).
- **Opción B:** Postgres instalado directamente en tu equipo.

Elige una; el resto de los pasos es igual.

## Requisitos

- **Node.js 20 o superior** (`node --version`).
- **Git**.
- **PostgreSQL** (probado con la versión 16) por la opción A o B.

## 1. Clonar e instalar dependencias

```bash
git clone https://github.com/areadatos-2377/Recetas-2025.git
cd Recetas-2025
npm install
```

## 2. Crear la base de datos

### Opción A: con Docker

```bash
docker run -d --name recetas-pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=captura_unidades -p 55432:5432 postgres:16
```

Cadena de conexión resultante:

```
postgres://postgres:local@localhost:55432/captura_unidades
```

Si el puerto `55432` está ocupado, cambia el número de la izquierda en `-p` (y el de la cadena de conexión). Para detenerla: `docker stop recetas-pg`; para volver a iniciarla: `docker start recetas-pg`; para borrarla por completo: `docker rm -f recetas-pg`.

### Opción B: Postgres instalado en tu equipo

Crea una base vacía, por ejemplo:

```bash
createdb -U postgres captura_unidades
```

La cadena de conexión dependerá de tu usuario, contraseña y puerto, por ejemplo:

```
postgres://postgres:TU_PASSWORD@localhost:5432/captura_unidades
```

## 3. Crear el archivo `.env`

Copia la plantilla y edítala:

```bash
cp .env.example .env        # en PowerShell: Copy-Item .env.example .env
```

Valores mínimos para correr en local:

```env
DATABASE_URL=postgres://postgres:local@localhost:55432/captura_unidades
PGSSL=false
JWT_SECRET=una-cadena-larga-y-aleatoria
COOKIE_SECURE=false
ADMIN_PASSWORD_HASH='PEGA_AQUI_EL_HASH'
PORT=3000
```

- **`JWT_SECRET`**: cualquier cadena larga; solo sirve para firmar la sesión.
- **`PORT`**: si el 3000 ya está ocupado por otro programa, usa otro (por ejemplo `3100`).
- **`ADMIN_PASSWORD_HASH`**: hash de la contraseña del **panel de control**. Genéralo con tu contraseña:

  ```bash
  node -e "require('bcryptjs').hash('tu-contrasena', 12).then(console.log)"
  ```

  Pega el resultado entre comillas simples (el hash lleva signos `$`).
- **`DRIVE_WEBHOOK_URL` y `DRIVE_WEBHOOK_TOKEN`**: **déjalas fuera en local**. Sin ellas el botón "Enviar información" mostrará un error en vez de subir un archivo a la carpeta real de Drive, que es justo lo que queremos al probar.

> El archivo `.env` está en `.gitignore`: no se sube a GitHub. No pongas ahí credenciales de producción.

## 4. Cargar los datos

```bash
npm run seed
```

Crea las tablas (`server/schema.sql`) y carga el padrón de unidades desde `legacy/CLUES_IMB2025.xlsx`. Puedes volver a correrlo sin problema: no pisa lo que ya se haya capturado.

Después genera las contraseñas de acceso de cada entidad:

```bash
npm run gen:passwords
```

Esto crea una contraseña por entidad y las guarda en texto plano en `secrets/contrasenas_por_entidad.txt` (una línea `ENTIDAD<TAB>contraseña`). Esa carpeta está en `.gitignore`; no se sube. Son contraseñas **solo de tu base local**.

## 5. Arrancar el servidor

```bash
npm start
```

Debe imprimir `Servidor escuchando en el puerto 3000` (o el que hayas puesto en `PORT`). Comprueba que responde:

```bash
curl http://localhost:3000/api/health      # {"ok":true}
```

## 6. Usarlo

| Pantalla | URL | Acceso |
|---|---|---|
| Captura por entidad | `http://localhost:3000/login.html` | Elige la entidad y usa su contraseña de `secrets/contrasenas_por_entidad.txt` |
| Panel de control | `http://localhost:3000/control-login.html` | La contraseña con la que generaste `ADMIN_PASSWORD_HASH` |

## Problemas frecuentes

- **`Falta la variable de entorno DATABASE_URL`** o **`JWT_SECRET`**: no existe `.env` o está vacío; revisa el paso 3 y que lo corras desde la carpeta del repo.
- **`ECONNREFUSED` al sembrar o arrancar**: Postgres no está corriendo, o el puerto/usuario/contraseña de `DATABASE_URL` no coinciden. Con Docker, revisa `docker ps`.
- **`EADDRINUSE` / el puerto ya está en uso**: otro programa usa ese puerto. Cambia `PORT` en `.env`. Ojo: si otra app responde en ese puerto verás respuestas raras (por ejemplo `No encontrado`), porque no es este servidor.
- **No entra al panel de control**: el hash en `ADMIN_PASSWORD_HASH` debe ir entre comillas simples y completo.
- **"Enviar información" da error**: es lo esperado en local si no configuraste Drive.

## Empezar de cero

Para dejar la base limpia, borra la base y repite los pasos 2 y 4 (con Docker: `docker rm -f recetas-pg` y vuelve a crear el contenedor).
