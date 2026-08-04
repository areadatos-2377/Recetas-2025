const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'ESTADO', key: 'estado', width: 22 },
  { header: 'CLUES', key: 'clues', width: 14 },
  { header: 'TIPO_UNIDAD', key: 'tipo_unidad', width: 14 },
  { header: 'CONDICION_UNIDAD', key: 'condicion_unidad', width: 16 },
  { header: 'NIVEL ATENCION', key: 'nivel_atencion', width: 16 },
  { header: 'NOMBRE TIPO ESTABLECIMIENTO', key: 'nombre_tipo_establecimiento', width: 28 },
  { header: 'PROPIEDAD DEL INMUEBLE', key: 'propiedad_inmueble', width: 20 },
  { header: 'NOMBRE DE TIPOLOGIA', key: 'nombre_tipologia', width: 22 },
  { header: 'NOMBRE DE LA UNIDAD', key: 'nombre_unidad', width: 32 },
  { header: 'MUNICIPIO', key: 'municipio', width: 18 },
  { header: 'LOCALIDAD', key: 'localidad', width: 18 },
  { header: 'ASENTAMIENTO', key: 'asentamiento', width: 20 },
  { header: 'TIPO DE VIALIDAD', key: 'tipo_vialidad', width: 16 },
  { header: 'VIALIDAD', key: 'vialidad', width: 22 },
  { header: 'NUMERO EXTERIOR', key: 'numero_exterior', width: 14 },
  { header: 'NUMERO INTERIOR', key: 'numero_interior', width: 14 },
  { header: 'CODIGO POSTAL', key: 'codigo_postal', width: 12 },
  { header: 'OBSERVACIONES', key: 'observaciones', width: 40 },
];

const TIPO_UNIDAD_LABELS = { FIJA: 'FIJA', MOVIL: 'MOVIL' };
const CONDICION_UNIDAD_LABELS = { SE_INCLUYE: 'SE INCLUYE', SE_EXCLUYE: 'SE EXCLUYE' };

async function buildUnidadesWorkbook(estado, unidades) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = estado.substring(0, 31) || 'Unidades';
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };

  for (const unidad of unidades) {
    sheet.addRow({
      ...unidad,
      tipo_unidad: TIPO_UNIDAD_LABELS[unidad.tipo_unidad] || '',
      condicion_unidad: CONDICION_UNIDAD_LABELS[unidad.condicion_unidad] || '',
    });
  }

  return workbook.xlsx.writeBuffer();
}

const DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

function buildFileName(estado) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safeEstado = estado
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .replace(/\s+/g, '_');
  return `${safeEstado}_${stamp}.xlsx`;
}

module.exports = { buildUnidadesWorkbook, buildFileName };
