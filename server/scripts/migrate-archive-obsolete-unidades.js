require('dotenv').config();

const path = require('path');
const ExcelJS = require('exceljs');
const { pool } = require('../db');

const PADRON_FILE = path.join(__dirname, '..', '..', 'legacy', 'CLUES_IMB2025.xlsx');
const SHEET_NAME = 'BD_IMS_Final';
const EXPECTED_OBSOLETE_COUNT = 16;
const ESTADO_NORMALIZADO = {
  'CIUDAD DE MEXICO': 'CDMX',
  'MICHOACAN DE OCAMPO': 'MICHOACAN',
  'VERACRUZ DE IGNACIO DE LA LLAVE': 'VERACRUZ',
};

function cell(row, index) {
  if (!index) return null;
  const value = row.getCell(index).value;
  if (value === null || value === undefined) return null;
  const text = typeof value === 'object' && value.text !== undefined ? String(value.text) : String(value);
  return text.trim() || null;
}

async function loadCurrentCatalog() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(PADRON_FILE);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`No se encontro la hoja "${SHEET_NAME}" en ${PADRON_FILE}`);

  let estadoColumn;
  let cluesColumn;
  sheet.getRow(1).eachCell((header, column) => {
    const name = String(header.value || '').trim();
    if (name === 'ESTADO') estadoColumn = column;
    if (name === 'CLUES') cluesColumn = column;
  });
  if (!estadoColumn || !cluesColumn) {
    throw new Error('El padron debe incluir las columnas ESTADO y CLUES');
  }

  const current = new Set();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const clues = cell(row, cluesColumn);
    const estadoOriginal = cell(row, estadoColumn);
    if (!clues || !estadoOriginal) continue;
    const estado = ESTADO_NORMALIZADO[estadoOriginal] || estadoOriginal;
    current.add(`${estado}\u0000${clues}`);
  }
  return current;
}

async function run() {
  const currentCatalog = await loadCurrentCatalog();
  await pool.query('ALTER TABLE unidades ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ');

  const { rows } = await pool.query(
    `SELECT id, estado, clues, archivado_en
     FROM unidades
     WHERE origen_manual = false AND clues IS NOT NULL`
  );
  const obsolete = rows.filter((row) => !currentCatalog.has(`${row.estado}\u0000${row.clues}`));
  if (obsolete.length !== EXPECTED_OBSOLETE_COUNT) {
    throw new Error(
      `Se esperaban ${EXPECTED_OBSOLETE_COUNT} CLUES fuera del padron 2025 y se encontraron ${obsolete.length}; no se archivo ningun registro.`
    );
  }

  const ids = obsolete.map((row) => row.id);
  const alreadyArchived = obsolete.filter((row) => row.archivado_en !== null).length;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE unidades
       SET archivado_en = now()
       WHERE id = ANY($1::int[]) AND archivado_en IS NULL`,
      [ids]
    );
    if (updated.rowCount !== obsolete.length - alreadyArchived) {
      throw new Error('El numero de unidades archivadas cambio durante la migracion; se cancelo la transaccion.');
    }
    await client.query('COMMIT');
    console.log(
      `Archivado completado: ${updated.rowCount} unidades nuevas; ${alreadyArchived} ya estaban archivadas. Sin borrado de datos ni de historial.`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

run().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
