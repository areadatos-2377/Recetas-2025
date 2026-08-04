require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const WORDS = ['Sol', 'Rio', 'Luna', 'Cielo', 'Mar', 'Valle', 'Monte', 'Flor', 'Estrella', 'Bosque'];

function generatePassword() {
  const word = WORDS[crypto.randomInt(WORDS.length)];
  const digits = crypto.randomInt(1000, 9999);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${word}${digits}${suffix}`;
}

async function run() {
  const { rows } = await pool.query('SELECT DISTINCT estado FROM unidades ORDER BY estado');
  if (rows.length === 0) {
    throw new Error('No hay entidades en la tabla "unidades". Corre primero "npm run seed".');
  }

  const plainByEstado = [];

  for (const { estado } of rows) {
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO entidades_auth (estado, password_hash) VALUES ($1, $2)
       ON CONFLICT (estado) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [estado, hash]
    );
    plainByEstado.push({ estado, password });
  }

  const outDir = path.join(__dirname, '..', '..', 'secrets');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'contrasenas_por_entidad.txt');
  const lines = plainByEstado.map(({ estado, password }) => `${estado}\t${password}`);
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');

  console.log(`Se generaron/actualizaron ${plainByEstado.length} contrasenas.`);
  console.log(`Lista en texto plano guardada en: ${outFile}`);
  console.log('Ese archivo esta en .gitignore (carpeta secrets/) y NO debe subirse al repositorio.');

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
