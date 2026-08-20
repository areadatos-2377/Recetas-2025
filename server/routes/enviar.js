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
      `SELECT clues, estado, tipo_unidad, condicion_unidad, nivel_atencion,
              nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
              nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
              vialidad, numero_exterior, numero_interior, codigo_postal, observaciones,
              estatus_operacion, latitud, longitud
       FROM unidades WHERE estado = $1 ORDER BY nombre_unidad, clues`,
      [req.estado]
    );

    if (unidades.length === 0) {
      return res.status(404).json({ error: 'No hay unidades registradas para esta entidad' });
    }

    const total = unidades.length;
    const incluidas = unidades.filter((u) => u.condicion_unidad === 'SE_INCLUYE').length;
    const excluidas = unidades.filter((u) => u.condicion_unidad === 'SE_EXCLUYE').length;
    const ratificadas = unidades.filter((u) => u.condicion_unidad === 'SE_RATIFICA').length;

    const buffer = await buildUnidadesWorkbook(req.estado, unidades);
    const fileName = buildFileName(req.estado);

    let uploadResult;
    try {
      uploadResult = await uploadToDrive(fileName, buffer);
    } catch (err) {
      // El detalle tecnico queda en los logs del servidor para diagnostico;
      // al usuario se le da un mensaje simple y accionable, sin jerga.
      console.error('Error al subir a Drive:', err);
      return res.status(502).json({ error: 'No se pudo subir el archivo a Google Drive. Intenta de nuevo en unos segundos.' });
    }

    const { rows: submissionRows } = await pool.query(
      `INSERT INTO submissions (estado, archivo_nombre, drive_file_id, drive_file_url, total_unidades, incluidas, excluidas, ratificadas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, creado_en`,
      [req.estado, fileName, uploadResult.fileId, uploadResult.fileUrl, total, incluidas, excluidas, ratificadas]
    );

    const submission = submissionRows[0];

    await pool.query(
      'UPDATE unidades SET enviado_en = now(), submission_id = $1 WHERE estado = $2',
      [submission.id, req.estado]
    );

    res.json({
      ok: true,
      fileName,
      fileUrl: uploadResult.fileUrl,
      total,
      incluidas,
      excluidas,
      ratificadas,
      pendientes: total - incluidas - excluidas - ratificadas,
      creadoEn: submission.creado_en,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
