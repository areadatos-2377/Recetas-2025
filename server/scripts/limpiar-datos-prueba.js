require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

// Borra los datos de prueba para dejar la base lista para captura real:
//   - Unidades agregadas manualmente durante pruebas: se BORRAN por completo.
//   - Unidades del padron oficial con cantidades de surtimiento o campos de
//     captura antiguos: se les LIMPIA la captura, pero la
//     unidad en si (CLUES, nombre, direccion, etc.) NO se toca ni se borra.
//   - Historial de envios (submissions): se BORRA por completo.
//   - entidades_auth (las 25 contrasenas reales): NUNCA se toca.
//
// Por defecto corre en modo simulacion (dry-run): solo muestra cuantas filas
// se verian afectadas, sin cambiar nada. Para ejecutar de verdad:
//
//   node server/scripts/limpiar-datos-prueba.js --ejecutar
//
// En modo ejecucion, primero guarda un respaldo completo de "unidades" y
// "submissions" en backups/ (carpeta local, fuera de git) antes de borrar
// nada.
const EXECUTE = process.argv.includes('--ejecutar');

async function run() {
  console.log(
    EXECUTE
      ? '=== MODO EJECUCION: esto va a borrar/resetear datos de verdad ==='
      : '=== MODO SIMULACION (dry-run): no se cambia nada, solo se muestra que pasaria ==='
  );
  if (!EXECUTE) {
    console.log('Para ejecutar de verdad: node server/scripts/limpiar-datos-prueba.js --ejecutar\n');
  }

  const totalUnidades = await pool.query('SELECT COUNT(*)::int AS n FROM unidades');
  const manuales = await pool.query('SELECT COUNT(*)::int AS n FROM unidades WHERE origen_manual = true');
  const conCaptura = await pool.query(
    `SELECT COUNT(*)::int AS n FROM unidades
     WHERE tipo_unidad IS NOT NULL OR condicion_unidad IS NOT NULL OR observaciones IS NOT NULL
        OR recetas_completas IS NOT NULL OR recetas_incompletas IS NOT NULL
        OR recetas_no_surtidas IS NOT NULL
        OR capturado_en IS NOT NULL OR enviado_en IS NOT NULL OR submission_id IS NOT NULL`
  );
  const totalSubmissions = await pool.query('SELECT COUNT(*)::int AS n FROM submissions');
  const totalEntidades = await pool.query('SELECT COUNT(*)::int AS n FROM entidades_auth');

  console.log('Estado actual de la base:');
  console.log('  unidades totales:', totalUnidades.rows[0].n);
  console.log('  unidades agregadas manualmente (se BORRARAN por completo):', manuales.rows[0].n);
  console.log('  unidades con algo capturado (se LIMPIARAN, no se borran):', conCaptura.rows[0].n);
  console.log('  registros en submissions (se BORRARAN):', totalSubmissions.rows[0].n);
  console.log('  contrasenas en entidades_auth (NO se tocan):', totalEntidades.rows[0].n);

  if (!EXECUTE) {
    console.log('\nEsto fue solo una simulacion. No se modifico nada en la base de datos.');
    await pool.end();
    return;
  }

  const backupDir = path.join(__dirname, '..', '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `respaldo_antes_de_limpiar_${stamp}.json`);

  const unidadesRows = await pool.query('SELECT * FROM unidades ORDER BY id');
  const submissionsRows = await pool.query('SELECT * FROM submissions ORDER BY id');
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ unidades: unidadesRows.rows, submissions: submissionsRows.rows }, null, 2),
    'utf8'
  );
  console.log('\nRespaldo guardado en:', backupFile);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deletedManuales = await client.query('DELETE FROM unidades WHERE origen_manual = true');
    console.log('Unidades manuales borradas:', deletedManuales.rowCount);

    const reset = await client.query(
      `UPDATE unidades
       SET tipo_unidad = NULL,
           condicion_unidad = NULL,
           observaciones = NULL,
       recetas_completas = NULL,
       recetas_incompletas = NULL,
       recetas_no_surtidas = NULL,
       capturado_en = NULL,
           enviado_en = NULL,
           submission_id = NULL
       WHERE tipo_unidad IS NOT NULL OR condicion_unidad IS NOT NULL OR observaciones IS NOT NULL
          OR recetas_completas IS NOT NULL OR recetas_incompletas IS NOT NULL
          OR recetas_no_surtidas IS NOT NULL
          OR capturado_en IS NOT NULL OR enviado_en IS NOT NULL OR submission_id IS NOT NULL`
    );
    console.log('Unidades con captura de prueba limpiadas:', reset.rowCount);

    const deletedSubmissions = await client.query('DELETE FROM submissions');
    console.log('Registros de submissions borrados:', deletedSubmissions.rowCount);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('\nListo. La tabla entidades_auth (contrasenas reales) no se toco.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
