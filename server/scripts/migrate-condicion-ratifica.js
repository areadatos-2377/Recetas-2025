require('dotenv').config();

const { pool } = require('../db');

// Migracion unica: agrega 'SE_RATIFICA' como tercer valor valido de
// condicion_unidad (antes solo aceptaba SE_INCLUYE / SE_EXCLUYE), y agrega
// la columna "ratificadas" a submissions para que el historial de envios
// cuente las tres categorias.
//
// Seguro de correr mas de una vez.
async function run() {
  const checkConstraint = await pool.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS definicion
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'unidades' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%condicion_unidad%'
  `);

  for (const row of checkConstraint.rows) {
    if (row.definicion.includes('SE_RATIFICA')) {
      console.log('El CHECK de condicion_unidad ya incluye SE_RATIFICA, no se toca.');
    } else {
      console.log(`Actualizando CHECK "${row.conname}" para incluir SE_RATIFICA...`);
      await pool.query(`ALTER TABLE unidades DROP CONSTRAINT ${row.conname}`);
      await pool.query(
        "ALTER TABLE unidades ADD CONSTRAINT unidades_condicion_unidad_check CHECK (condicion_unidad IN ('SE_INCLUYE', 'SE_EXCLUYE', 'SE_RATIFICA'))"
      );
    }
  }

  await pool.query('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ratificadas INTEGER');

  console.log('Migracion completa.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
