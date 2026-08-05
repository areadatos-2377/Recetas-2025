require('dotenv').config();

const { pool } = require('../db');

// Migracion unica: la restriccion de unicidad sobre "clues" era global
// (UNIQUE (clues)), impidiendo que dos entidades usaran el mismo CLUES
// libre/provisional por coincidencia. Pasa a ser unica solo dentro de la
// misma entidad (UNIQUE (estado, clues)). Los CLUES oficiales no se ven
// afectados (ya son unicos globalmente porque el codigo incluye el estado).
//
// Seguro de correr mas de una vez.
async function run() {
  const oldConstraint = await pool.query(`
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'unidades' AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
    HAVING COUNT(*) = 1 AND bool_and(kcu.column_name = 'clues')
  `);

  for (const row of oldConstraint.rows) {
    console.log(`Quitando restriccion antigua "${row.constraint_name}" (unicidad global de clues)...`);
    await pool.query(`ALTER TABLE unidades DROP CONSTRAINT ${row.constraint_name}`);
  }

  const newConstraint = await pool.query(`
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'unidades' AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
    HAVING COUNT(*) = 2
       AND bool_or(kcu.column_name = 'estado')
       AND bool_or(kcu.column_name = 'clues')
  `);

  if (newConstraint.rows.length === 0) {
    console.log('Agregando restriccion nueva UNIQUE (estado, clues)...');
    await pool.query('ALTER TABLE unidades ADD CONSTRAINT unidades_estado_clues_key UNIQUE (estado, clues)');
  } else {
    console.log('La restriccion UNIQUE (estado, clues) ya existe, no se toca.');
  }

  console.log('Migracion completa.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
