require('dotenv').config();

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { pool } = require('../db');

const LEGACY_FILE = path.join(__dirname, '..', '..', 'legacy', 'CLUES_IMB.xlsx');
const SHEET_NAME = 'BD_IMS_Final';

// TIPO_UNIDAD, CONDICION_UNIDAD y OBSERVACIONES vienen vacios en el Excel legacy
// y se llenan solo desde la app, por lo que NO se siembran aqui: si el seed se
// vuelve a correr no debe pisar la captura que ya hicieron los usuarios.
const COLUMN_MAP = {
  ESTADO: 'estado',
  CLUES: 'clues',
  'NIVEL ATENCION': 'nivel_atencion',
  'NOMBRE TIPO ESTABLECIMIENTO': 'nombre_tipo_establecimiento',
  'PROPIEDAD DEL INMUEBLE': 'propiedad_inmueble',
  'NOMBRE DE TIPOLOGIA': 'nombre_tipologia',
  'NOMBRE DE LA UNIDAD': 'nombre_unidad',
  MUNICIPIO: 'municipio',
  LOCALIDAD: 'localidad',
  ASENTAMIENTO: 'asentamiento',
  'TIPO DE VIALIDAD': 'tipo_vialidad',
  VIALIDAD: 'vialidad',
  'NUMERO EXTERIOR': 'numero_exterior',
  'NUMERO INTERIOR': 'numero_interior',
  'CODIGO POSTAL': 'codigo_postal',
};

function cell(row, idx) {
  if (!idx) return null;
  const value = row.getCell(idx).value;
  if (value === null || value === undefined) return null;
  const str = typeof value === 'object' && value.text !== undefined ? String(value.text) : String(value);
  const trimmed = str.trim();
  return trimmed === '' ? null : trimmed;
}

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(LEGACY_FILE);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`No se encontro la hoja "${SHEET_NAME}" en ${LEGACY_FILE}`);
  }

  const colIndexByField = {};
  sheet.getRow(1).eachCell((headerCell, colNumber) => {
    const header = String(headerCell.value || '').trim();
    if (COLUMN_MAP[header]) {
      colIndexByField[COLUMN_MAP[header]] = colNumber;
    }
  });

  for (const field of ['estado', 'clues']) {
    if (!colIndexByField[field]) {
      throw new Error(`No se encontro la columna requerida para "${field}" en el Excel`);
    }
  }

  let processed = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      const clues = cell(row, colIndexByField.clues);
      const estado = cell(row, colIndexByField.estado);
      if (!clues || !estado) {
        skipped++;
        continue;
      }

      const values = [
        clues,
        estado,
        cell(row, colIndexByField.nivel_atencion),
        cell(row, colIndexByField.nombre_tipo_establecimiento),
        cell(row, colIndexByField.propiedad_inmueble),
        cell(row, colIndexByField.nombre_tipologia),
        cell(row, colIndexByField.nombre_unidad),
        cell(row, colIndexByField.municipio),
        cell(row, colIndexByField.localidad),
        cell(row, colIndexByField.asentamiento),
        cell(row, colIndexByField.tipo_vialidad),
        cell(row, colIndexByField.vialidad),
        cell(row, colIndexByField.numero_exterior),
        cell(row, colIndexByField.numero_interior),
        cell(row, colIndexByField.codigo_postal),
      ];

      await client.query(
        `INSERT INTO unidades (
           clues, estado, nivel_atencion, nombre_tipo_establecimiento, propiedad_inmueble,
           nombre_tipologia, nombre_unidad, municipio, localidad, asentamiento,
           tipo_vialidad, vialidad, numero_exterior, numero_interior, codigo_postal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (clues) DO UPDATE SET
           estado = EXCLUDED.estado,
           nivel_atencion = EXCLUDED.nivel_atencion,
           nombre_tipo_establecimiento = EXCLUDED.nombre_tipo_establecimiento,
           propiedad_inmueble = EXCLUDED.propiedad_inmueble,
           nombre_tipologia = EXCLUDED.nombre_tipologia,
           nombre_unidad = EXCLUDED.nombre_unidad,
           municipio = EXCLUDED.municipio,
           localidad = EXCLUDED.localidad,
           asentamiento = EXCLUDED.asentamiento,
           tipo_vialidad = EXCLUDED.tipo_vialidad,
           vialidad = EXCLUDED.vialidad,
           numero_exterior = EXCLUDED.numero_exterior,
           numero_interior = EXCLUDED.numero_interior,
           codigo_postal = EXCLUDED.codigo_postal`,
        values
      );
      processed++;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`Listo. Filas cargadas/actualizadas: ${processed}. Omitidas (sin CLUES/ESTADO): ${skipped}.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
