const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'ESTADO', key: 'estado', width: 22 },
  { header: 'CLUES', key: 'clues', width: 14 },
  { header: 'TIPO_UNIDAD', key: 'tipo_unidad', width: 14 },
  { header: 'A. COMPLETAS - CANTIDAD', key: 'recetas_completas', width: 24 },
  { header: 'B. INCOMPLETAS - CANTIDAD', key: 'recetas_incompletas', width: 26 },
  { header: 'C. NO SURTIDAS - CANTIDAD', key: 'recetas_no_surtidas', width: 26 },
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
  { header: 'ESTATUS DE OPERACION', key: 'estatus_operacion', width: 20 },
  { header: 'LATITUD', key: 'latitud', width: 12 },
  { header: 'LONGITUD', key: 'longitud', width: 12 },
];

const TIPO_UNIDAD_LABELS = { FIJA: 'FIJA', MOVIL: 'MOVIL' };
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
    });
  }

  return workbook.xlsx.writeBuffer();
}

const DIACRITICS_PATTERN = new RegExp('[\\u0300-\\u036f]', 'g');

const MEXICO_CITY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// El servidor (Railway) corre en UTC; el nombre del archivo debe reflejar
// la hora de Ciudad de Mexico, por eso se usa Intl con la zona horaria en
// vez de las fechas locales del proceso (new Date().getHours(), etc.).
function mexicoCityStamp(date) {
  const parts = MEXICO_CITY_FORMATTER.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}_${hour}${parts.minute}`;
}

function buildFileName(estado) {
  const stamp = mexicoCityStamp(new Date());
  const safeEstado = estado
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .replace(/\s+/g, '_');
  return `${safeEstado}_${stamp}.xlsx`;
}

module.exports = { buildUnidadesWorkbook, buildFileName };
