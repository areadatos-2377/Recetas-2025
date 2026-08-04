require('dotenv').config();

const { pool } = require('../db');

// Migracion unica: la tabla "unidades" ya existe en produccion con "clues"
// como llave primaria (creada por schema.sql antes de este cambio). Este
// script la lleva al esquema nuevo (id como llave primaria, clues opcional
// y unico, columna origen_manual) SIN perder los datos ya capturados.
//
// Seguro de correr mas de una vez: cada paso revisa el estado actual antes
// de aplicar el cambio.
async function run() {
  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS id SERIAL');
  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS origen_manual BOOLEAN NOT NULL DEFAULT false');

  const pk = await pool.query(`
    SELECT tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'unidades' AND tc.constraint_type = 'PRIMARY KEY'
  `);

  const currentPk = pk.rows[0];
  if (currentPk && currentPk.column_name === 'clues') {
    console.log('Quitando PRIMARY KEY actual sobre "clues"...');
    await pool.query(`ALTER TABLE unidades DROP CONSTRAINT ${currentPk.constraint_name}`);
    await pool.query('ALTER TABLE unidades ALTER COLUMN clues DROP NOT NULL');
  } else if (currentPk && currentPk.column_name === 'id') {
    console.log('La tabla ya tiene "id" como PRIMARY KEY, no se toca.');
  }

  const uniqueClues = await pool.query(`
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'unidades' AND tc.constraint_type = 'UNIQUE' AND kcu.column_name = 'clues'
  `);
  if (uniqueClues.rows.length === 0) {
    console.log('Agregando UNIQUE sobre "clues"...');
    await pool.query('ALTER TABLE unidades ADD CONSTRAINT unidades_clues_key UNIQUE (clues)');
  }

  const idIsPk = await pool.query(`
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'unidades' AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = 'id'
  `);
  if (idIsPk.rows.length === 0) {
    console.log('Agregando PRIMARY KEY sobre "id"...');
    await pool.query('ALTER TABLE unidades ADD PRIMARY KEY (id)');
  }

  const check = await pool.query('SELECT COUNT(*)::int AS n, COUNT(id)::int AS con_id FROM unidades');
  console.log(`Verificacion: ${check.rows[0].n} filas totales, ${check.rows[0].con_id} con id asignado.`);
  console.log('Migracion completa.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
