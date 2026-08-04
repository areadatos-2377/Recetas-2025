const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const TIPO_UNIDAD_VALUES = ['FIJA', 'MOVIL'];
const CONDICION_UNIDAD_VALUES = ['SE_INCLUYE', 'SE_EXCLUYE'];
const OBSERVACIONES_MAX_LEN = 5000;

router.get('/unidades', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT clues, estado, tipo_unidad, condicion_unidad, nivel_atencion,
              nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
              nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
              vialidad, numero_exterior, numero_interior, codigo_postal, observaciones,
              capturado_en, enviado_en
       FROM unidades WHERE estado = $1 ORDER BY nombre_unidad, clues`,
      [req.estado]
    );
    res.json({ estado: req.estado, unidades: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/progreso', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE tipo_unidad IS NOT NULL AND condicion_unidad IS NOT NULL)::int AS capturadas
       FROM unidades WHERE estado = $1`,
      [req.estado]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/unidades/:clues', requireAuth, async (req, res, next) => {
  try {
    const { clues } = req.params;
    const { tipo_unidad, condicion_unidad, observaciones } = req.body || {};

    if (tipo_unidad !== undefined && tipo_unidad !== null && !TIPO_UNIDAD_VALUES.includes(tipo_unidad)) {
      return res.status(400).json({ error: 'TIPO_UNIDAD invalido' });
    }
    if (
      condicion_unidad !== undefined &&
      condicion_unidad !== null &&
      !CONDICION_UNIDAD_VALUES.includes(condicion_unidad)
    ) {
      return res.status(400).json({ error: 'CONDICION_UNIDAD invalido' });
    }
    if (observaciones !== undefined && observaciones !== null && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'OBSERVACIONES invalido' });
    }
    if (typeof observaciones === 'string' && observaciones.length > OBSERVACIONES_MAX_LEN) {
      return res.status(400).json({ error: `OBSERVACIONES demasiado largo (max. ${OBSERVACIONES_MAX_LEN} caracteres)` });
    }

    // COALESCE conserva el valor previo cuando el frontend no manda ese campo
    // en la peticion (autoguardado por campo individual).
    const { rows } = await pool.query(
      `UPDATE unidades
       SET tipo_unidad = COALESCE($1, tipo_unidad),
           condicion_unidad = COALESCE($2, condicion_unidad),
           observaciones = COALESCE($3, observaciones),
           capturado_en = now()
       WHERE clues = $4 AND estado = $5
       RETURNING clues`,
      [tipo_unidad ?? null, condicion_unidad ?? null, observaciones ?? null, clues, req.estado]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Unidad no encontrada para esta entidad' });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
