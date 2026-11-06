require('dotenv').config();

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { pool } = require('../db');

const PADRON_FILE = path.join(__dirname, '..', '..', 'legacy', 'CLUES_IMB2025.xlsx');
const SHEET_NAME = 'BD_IMS_Final';

// El Excel a veces trae el nombre de la entidad en el formato "oficial"
// largo (igual que el catalogo SSA) en vez del nombre corto que usa el
// resto del sistema. Sin esto, una entidad con el nombre distinto se trata
// como una entidad nueva (filas duplicadas) en vez de actualizar la ya
// existente.
const ESTADO_NORMALIZADO = {
  'CIUDAD DE MEXICO': 'CDMX',
  'MICHOACAN DE OCAMPO': 'MICHOACAN',
  'VERACRUZ DE IGNACIO DE LA LLAVE': 'VERACRUZ',
};

// Los campos de captura se llenan solo desde la app y no se siembran aqui,
// para que volver a correr el seed no pise la informacion de los usuarios.
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

function cell(row, idx) {
  if (!idx) return null;
  const value = row.getCell(idx).value;
  if (value === null || value === undefined) return null;
  const str = typeof value === 'object' && value.text !== undefined ? String(value.text) : String(value);
  const trimmed = str.trim();
  return trimmed === '' ? null : trimmed;
}

const BATCH_SIZE = 250;
const COLUMNS_PER_ROW = 18;

// Inserta un lote en un solo INSERT multi-fila (una sola conexion redonda),
// en vez de una fila a la vez: sobre una conexion remota (proxy publico de
// Railway) cientos de idas y vueltas individuales son lentas y se pueden
// quedar "pensando"; unas pocas decenas de lotes son mucho mas confiables
// y ademas permiten ver el avance en vivo.
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
    `INSERT INTO unidades (
       clues, estado, nivel_atencion, nombre_tipo_establecimiento, propiedad_inmueble,
       nombre_tipologia, nombre_unidad, municipio, localidad, asentamiento,
       tipo_vialidad, vialidad, numero_exterior, numero_interior, codigo_postal,
       estatus_operacion, latitud, longitud
     ) VALUES ${valuesSql.join(',')}
     ON CONFLICT (estado, clues) DO UPDATE SET
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
       codigo_postal = EXCLUDED.codigo_postal,
       estatus_operacion = EXCLUDED.estatus_operacion,
       latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud`,
    params
  );
}

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(PADRON_FILE);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`No se encontro la hoja "${SHEET_NAME}" en ${PADRON_FILE}`);
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

  // Primero se lee todo el Excel a memoria (rapido, sin tocar la base),
  // y ya con la lista completa se manda a Postgres en lotes.
  const allRows = [];
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;

    const clues = cell(row, colIndexByField.clues);
    const estadoOriginal = cell(row, colIndexByField.estado);
    if (!clues || !estadoOriginal) {
      skipped++;
      continue;
    }
    const estado = ESTADO_NORMALIZADO[estadoOriginal] || estadoOriginal;

    allRows.push([
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
      cell(row, colIndexByField.estatus_operacion),
      cell(row, colIndexByField.latitud),
      cell(row, colIndexByField.longitud),
    ]);
  }

  let processed = 0;
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    await insertBatch(batch);
    processed += batch.length;
    console.log(`Cargadas ${processed}/${allRows.length} (${Math.round((processed / allRows.length) * 100)}%)`);
  }

  console.log(`Listo. Filas cargadas/actualizadas: ${processed}. Omitidas (sin CLUES/ESTADO): ${skipped}.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
