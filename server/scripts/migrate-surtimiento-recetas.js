require('dotenv').config();

const { pool } = require('../db');

async function run() {
  await pool.query(`
    ALTER TABLE unidades
      ADD COLUMN IF NOT EXISTS recetas_completas INTEGER
        CHECK (recetas_completas >= 0),
      ADD COLUMN IF NOT EXISTS recetas_incompletas INTEGER
        CHECK (recetas_incompletas >= 0),
      ADD COLUMN IF NOT EXISTS recetas_no_surtidas INTEGER
        CHECK (recetas_no_surtidas >= 0)
  `);
  await pool.query(`
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS recetas_completas BIGINT,
      ADD COLUMN IF NOT EXISTS recetas_incompletas BIGINT,
      ADD COLUMN IF NOT EXISTS recetas_no_surtidas BIGINT
  `);

  console.log('Migracion de cantidades de surtimiento completada.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
