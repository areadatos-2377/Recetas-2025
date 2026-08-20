require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

// Cuentas de acceso limitadas a una sola unidad (login por CLUES en vez de
// por entidad). "estado" es la clave real a la que pertenece la unidad en
// la tabla "unidades" (para filtrar); "clave" es lo que se usa para
// iniciar sesion (el CLUES) y queda como PK de entidades_auth.
const UNIDADES = [
  { clave: 'TSIMB002865', estado: 'TAMAULIPAS', nombre: 'HOSPITAL REGIONAL DE ALTA ESPECIALIDAD DE CIUDAD VICTORIA "BICENTENARIO 2010"' },
  { clave: 'OCIMB006826', estado: 'OAXACA', nombre: 'HOSPITAL REGIONAL DE ALTA ESPECIALIDAD DE OAXACA' },
  { clave: 'GTIMB000015', estado: 'GUANAJUATO', nombre: 'HOSPITAL REGIONAL DE ALTA ESPECIALIDAD DEL BAJIO' },
  { clave: 'YNIMB000012', estado: 'YUCATAN', nombre: 'HOSPITAL REGIONAL DE ALTA ESPECIALIDAD DE LA PENINSULA DE YUCATAN' },
  { clave: 'MCIMB012295', estado: 'MEXICO', nombre: 'HOSPITAL REGIONAL DE ALTA ESPECIALIDAD IXTAPALUCA' },
  { clave: 'CSIMB003511', estado: 'CHIAPAS', nombre: 'HOSPITAL DE ESPECIALIDADES PEDIATRICAS EN TUXTLA GUTIERREZ' },
  { clave: 'CSIMB003506', estado: 'CHIAPAS', nombre: 'HOSPITAL REGIONAL DE ALTA ESPECIALIDAD CIUDAD SALUD' },
];

const WORDS = ['Sol', 'Rio', 'Luna', 'Cielo', 'Mar', 'Valle', 'Monte', 'Flor', 'Estrella', 'Bosque'];

function generatePassword() {
  const word = WORDS[crypto.randomInt(WORDS.length)];
  const digits = crypto.randomInt(1000, 9999);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${word}${digits}${suffix}`;
}

async function run() {
  // La unidad debe existir ya en el padron oficial bajo ese estado+clues;
  // si no existe, algo esta mal (CLUES equivocado o padron desactualizado)
  // y es mejor detenerse antes de crear un acceso que no sirve para nada.
  for (const u of UNIDADES) {
    const { rows } = await pool.query(
      'SELECT 1 FROM unidades WHERE estado = $1 AND clues = $2',
      [u.estado, u.clave]
    );
    if (rows.length === 0) {
      throw new Error(`No se encontro la unidad ${u.clave} en el estado ${u.estado} dentro de "unidades". Verifica el CLUES antes de continuar.`);
    }
  }

  const plain = [];

  for (const u of UNIDADES) {
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO entidades_auth (estado, password_hash, estado_real, clues, nombre)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (estado) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         estado_real = EXCLUDED.estado_real,
         clues = EXCLUDED.clues,
         nombre = EXCLUDED.nombre`,
      [u.clave, hash, u.estado, u.clave, u.nombre]
    );
    plain.push({ clave: u.clave, nombre: u.nombre, estado: u.estado, password });
  }

  const outDir = path.join(__dirname, '..', '..', 'secrets');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'contrasenas_por_unidad.txt');
  const lines = plain.map((p) => `${p.nombre} (${p.clave}, ${p.estado})\t${p.password}`);
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');

  console.log(`Se generaron/actualizaron ${plain.length} contrasenas de unidad.`);
  console.log(`Lista en texto plano guardada en: ${outFile}`);
  console.log('Ese archivo esta en .gitignore (carpeta secrets/) y NO debe subirse al repositorio.');

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
