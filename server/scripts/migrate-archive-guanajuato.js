require('dotenv').config();

// Saca GUANAJUATO del proyecto sin borrar datos: archiva todas sus unidades
// (archivado_en = now()). Con eso la entidad (y las cuentas de unidad que
// dependen de ella) dejan de aparecer en el selector de login y en el panel
// de control, y ya no se pueden capturar ni enviar. El historial de envios
// (submissions) y las unidades se conservan por si hay que revertirlo.
//
// Uso:
//   node server/scripts/migrate-archive-guanajuato.js            (solo muestra que haria)
//   node server/scripts/migrate-archive-guanajuato.js --aplicar  (archiva)
//
// Para revertir:
//   UPDATE unidades SET archivado_en = NULL WHERE estado = 'GUANAJUATO';

const { pool } = require('../db');

const ESTADO = 'GUANAJUATO';

async function run() {
  const aplicar = process.argv.includes('--aplicar');

  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ');

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE archivado_en IS NULL)::int AS activas
     FROM unidades WHERE estado = $1`,
    [ESTADO]
  );
  const { total, activas } = rows[0];
  console.log(`${ESTADO}: ${total} unidades en total, ${activas} activas (sin archivar).`);

  if (total === 0) {
    console.log('No hay unidades de esta entidad; nada que archivar.');
  } else if (!aplicar) {
    console.log('Modo de revision: no se cambio nada. Ejecuta con --aplicar para archivar.');
  } else {
    const updated = await pool.query(
      'UPDATE unidades SET archivado_en = now() WHERE estado = $1 AND archivado_en IS NULL',
      [ESTADO]
    );
    console.log(`Archivadas ${updated.rowCount} unidades. Sin borrado de datos ni de historial.`);
  }

  await pool.end();
}

run().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
