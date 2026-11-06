# Limpiar los datos de prueba antes de la captura real

Script: `server/scripts/limpiar-datos-prueba.js` (ya está en el repo, rama `main`).

## Qué hace

| Dato | Qué pasa |
|---|---|
| Unidades agregadas a mano (`origen_manual = true`) | **Se borran por completo** |
| Unidades del padrón con algo capturado (cantidades A/B/C, tipo, condición, observaciones, fechas de captura y envío) | Se **limpian** esos campos. La unidad (CLUES, nombre, dirección) no se toca |
| Historial de envíos (`submissions`) | **Se borra por completo** |
| `entidades_auth` (contraseñas de las entidades) | No se toca |
| Unidades archivadas (`archivado_en`) | No se tocan |

Antes de borrar, guarda un respaldo JSON en la carpeta `backups/` (fuera de git), en la máquina donde se ejecute.

## Antes de empezar

- Hace falta acceso al proyecto en Railway y Node instalado, con `npm install` ya hecho en el repo.
- Conviene que nadie esté capturando mientras se limpia.
- **Atención con las unidades manuales:** el script borra todas las `origen_manual = true`. Si alguna entidad ya agregó una unidad real, se pierde (queda solo en el respaldo). La simulación del paso 2 dice cuántas son.

## Paso 1. Apuntar el script a la base de Railway

El script usa la variable `DATABASE_URL`. Desde tu computadora la URL interna de Railway (`*.railway.internal`) no funciona; hay que usar la **URL pública** del Postgres (variable `DATABASE_PUBLIC_URL` en el servicio de Postgres, pestaña *Variables* o *Connect*).

En PowerShell, dentro de la carpeta del repo:

```powershell
$env:DATABASE_URL = "PEGA_AQUI_LA_DATABASE_PUBLIC_URL"
# Solo si la conexión falla por SSL:
# $env:PGSSL = "true"
```

(Con la CLI de Railway también sirve `railway run node server/scripts/limpiar-datos-prueba.js`, siempre que `DATABASE_URL` en ese entorno sea la pública.)

## Paso 2. Simulación (no cambia nada)

```powershell
node server/scripts/limpiar-datos-prueba.js
```

Muestra el conteo, por ejemplo:

```
unidades totales: ...
unidades agregadas manualmente (se BORRARAN por completo): ...
unidades con algo capturado (se LIMPIARAN, no se borran): ...
registros en submissions (se BORRARAN): ...
contrasenas en entidades_auth (NO se tocan): ...
```

Revisa que:
- `entidades_auth` tenga todas las contraseñas (no debe cambiar).
- Las unidades manuales a borrar sean realmente de prueba.

## Paso 3. Ejecutar de verdad

```powershell
node server/scripts/limpiar-datos-prueba.js --ejecutar
```

Guarda el respaldo en `backups/respaldo_antes_de_limpiar_<fecha>.json` y hace todo dentro de una transacción (si algo falla, no se aplica nada). **Guarda ese archivo** aunque esté en tu máquina.

## Paso 4. Verificar

Vuelve a correr la simulación (paso 2): los conteos de "con algo capturado" y de `submissions` deben salir en 0.

Después entra a la app con una entidad y confirma que las cantidades A, B y C aparecen vacías, y revisa el panel de control: debe mostrar 0 % de avance y ninguna entidad con envío.

## Paso 5. Limpiar Google Drive (a mano)

El script no toca Drive. Entra a la carpeta de destino y borra los Excel de prueba:

https://drive.google.com/drive/folders/1mE_J2V971iRlGLqxtCxDLs9Q6YC-YDvI

Los archivos de prueba conocidos son `prueba_conexion.xlsx` y `prueba_avance_3.xlsx`, además de los que hayan generado las pruebas de envío de cada entidad.

## Cómo revertir

Si hubo un error, el respaldo JSON contiene las tablas `unidades` y `submissions` completas, tal como estaban antes de ejecutar.
