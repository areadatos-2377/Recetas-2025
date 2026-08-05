require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

// Migracion unica: agrega estatus_operacion/latitud/longitud a "unidades"
// (para las unidades creadas desde el catalogo SSA) y crea la tabla
// "catalogo_ssa" si no existe todavia. Segura de correr mas de una vez.
async function run() {
  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS estatus_operacion TEXT');
  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS latitud TEXT');
  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS longitud TEXT');
  console.log('Columnas estatus_operacion/latitud/longitud listas en "unidades".');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Tabla "catalogo_ssa" lista (creada si no existia).');

  console.log('Migracion completa.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
