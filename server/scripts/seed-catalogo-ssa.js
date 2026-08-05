require('dotenv').config();

const path = require('path');
const ExcelJS = require('exceljs');
const { pool } = require('../db');

const LEGACY_FILE = path.join(__dirname, '..', '..', 'legacy', 'CLUES_SSA.xlsx');
const SHEET_NAME = 'BD_IMS_Final';
const BATCH_SIZE = 250;
const COLUMNS_PER_ROW = 18;

// El catalogo SSA nombra 3 entidades distinto a como las llama el resto del
// sistema (que usa los nombres del padron IMSS-Bienestar original). Sin esto,
// las busquedas de esas 3 entidades nunca encontrarian nada.
const ESTADO_NORMALIZADO = {
  'CIUDAD DE MEXICO': 'CDMX',
  'MICHOACAN DE OCAMPO': 'MICHOACAN',
  'VERACRUZ DE IGNACIO DE LA LLAVE': 'VERACRUZ',
};

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
  'ESTATUS DE OPERACION': 'estatus_operacion',
  LATITUD: 'latitud',
  LONGITUD: 'longitud',
};

const FIELD_ORDER = [
  'estado',
  'clues',
  'nivel_atencion',
  'nombre_tipo_establecimiento',
  'propiedad_inmueble',
  'nombre_tipologia',
  'nombre_unidad',
  'municipio',
  'localidad',
  'asentamiento',
  'tipo_vialidad',
  'vialidad',
  'numero_exterior',
  'numero_interior',
  'codigo_postal',
  'estatus_operacion',
  'latitud',
  'longitud',
];

function cell(row, idx) {
  if (!idx) return null;
  const value = row.getCell(idx).value;
  if (value === null || value === undefined) return null;
  const str = typeof value === 'object' && value.text !== undefined ? String(value.text) : String(value);
  const trimmed = str.trim();
  return trimmed === '' ? null : trimmed;
}

async function insertBatch(rows) {
  const valuesSql = [];
  const params = [];
  rows.forEach((row, i) => {
    const base = i * COLUMNS_PER_ROW;
    const placeholders = Array.from({ length: COLUMNS_PER_ROW }, (_, j) => `$${base + j + 1}`);
    valuesSql.push(`(${placeholders.join(',')})`);
    params.push(...row);
  });

  await pool.query(
    `INSERT INTO catalogo_ssa (${FIELD_ORDER.join(', ')}) VALUES ${valuesSql.join(',')}`,
    params
  );
}

async function run() {
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

  for (const field of ['estado', 'clues', 'nombre_unidad']) {
    if (!colIndexByField[field]) {
      throw new Error(`No se encontro la columna requerida para "${field}" en el Excel`);
    }
  }

  const allRows = [];
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;

    const estadoOriginal = cell(row, colIndexByField.estado);
    const nombreUnidad = cell(row, colIndexByField.nombre_unidad);
    const clues = cell(row, colIndexByField.clues);
    if (!estadoOriginal || !nombreUnidad || !clues) {
      skipped++;
      continue;
    }

    const estadoNormalizado = ESTADO_NORMALIZADO[estadoOriginal] || estadoOriginal;

    allRows.push(
      FIELD_ORDER.map((field) => {
        if (field === 'estado') return estadoNormalizado;
        return cell(row, colIndexByField[field]);
      })
    );
  }

  await pool.query('TRUNCATE TABLE catalogo_ssa RESTART IDENTITY');
  console.log('Tabla catalogo_ssa vaciada, recargando completa...');

  let processed = 0;
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    await insertBatch(batch);
    processed += batch.length;
    console.log(`Cargadas ${processed}/${allRows.length} (${Math.round((processed / allRows.length) * 100)}%)`);
  }

  console.log(`Listo. Filas cargadas: ${processed}. Omitidas (sin estado/CLUES/nombre): ${skipped}.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
