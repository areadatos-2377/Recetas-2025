const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { buildUnidadesWorkbook, buildFileName } = require('../services/excelBuilder');
const { uploadToDrive } = require('../services/driveClient');

const router = express.Router();

router.post('/enviar', requireAuth, async (req, res, next) => {
  try {
    if (req.clues) {
      return res.status(403).json({ error: 'Tu acceso esta limitado a tu propia unidad; el envio final lo hace tu entidad federativa.' });
    }

    const { rows: unidades } = await pool.query(
      `SELECT clues, estado, tipo_unidad,
              recetas_completas, recetas_incompletas, recetas_no_surtidas, nivel_atencion,
              nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
              nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
              vialidad, numero_exterior, numero_interior, codigo_postal,
              estatus_operacion, latitud, longitud
       FROM unidades WHERE estado = $1 AND archivado_en IS NULL ORDER BY nombre_unidad, clues`,
      [req.estado]
    );

    if (unidades.length === 0) {
      return res.status(404).json({ error: 'No hay unidades registradas para esta entidad' });
    }

    // Se permite enviar avances parciales: las unidades sin capturar van con
    // las celdas de cantidades vacias y no suman a los totales.
    const total = unidades.length;
    const sumar = (campo) => unidades.reduce((sum, u) => sum + (Number.isInteger(u[campo]) ? u[campo] : 0), 0);
    const recetasCompletas = sumar('recetas_completas');
    const recetasIncompletas = sumar('recetas_incompletas');
    const recetasNoSurtidas = sumar('recetas_no_surtidas');

    // Cada envio reemplaza al anterior en Drive: se manda el id del ultimo
    // archivo de esta entidad para que el Apps Script lo mande a la papelera.
    const { rows: previos } = await pool.query(
      `SELECT drive_file_id FROM submissions
       WHERE estado = $1 AND drive_file_id IS NOT NULL
       ORDER BY creado_en DESC, id DESC LIMIT 1`,
      [req.estado]
    );
    const replaceFileId = previos.length > 0 ? previos[0].drive_file_id : null;

    const buffer = await buildUnidadesWorkbook(req.estado, unidades);
    const fileName = buildFileName(req.estado);

    let uploadResult;
    try {
      uploadResult = await uploadToDrive(fileName, buffer, replaceFileId);
    } catch (err) {
      // El detalle tecnico queda en los logs del servidor para diagnostico;
      // al usuario se le da un mensaje simple y accionable, sin jerga.
      console.error('Error al subir a Drive:', err);
      return res.status(502).json({ error: 'No se pudo subir el archivo a Google Drive. Intenta de nuevo en unos segundos.' });
    }

    const { rows: submissionRows } = await pool.query(
      `INSERT INTO submissions (
         estado, archivo_nombre, drive_file_id, drive_file_url, total_unidades,
         recetas_completas, recetas_incompletas, recetas_no_surtidas
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, creado_en`,
      [req.estado, fileName, uploadResult.fileId, uploadResult.fileUrl, total, recetasCompletas, recetasIncompletas, recetasNoSurtidas]
    );

    const submission = submissionRows[0];

    await pool.query(
      'UPDATE unidades SET enviado_en = now(), submission_id = $1 WHERE estado = $2 AND archivado_en IS NULL',
      [submission.id, req.estado]
    );

    res.json({
      ok: true,
      fileName,
      fileUrl: uploadResult.fileUrl,
      total,
      recetasCompletas,
      recetasIncompletas,
      recetasNoSurtidas,
      creadoEn: submission.creado_en,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
