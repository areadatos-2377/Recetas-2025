const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const TIPO_UNIDAD_VALUES = ['FIJA', 'MOVIL'];
const CONDICION_UNIDAD_VALUES = ['SE_RATIFICA', 'SE_INCLUYE', 'SE_EXCLUYE'];
const OBSERVACIONES_MAX_LEN = 5000;
const TEXT_FIELD_MAX_LEN = 300;

// Editables en cualquier unidad, venga o no del padron oficial.
const UNIVERSAL_FIELDS = ['tipo_unidad', 'condicion_unidad', 'observaciones'];

// Solo editables en unidades creadas a mano (origen_manual = true): una
// unidad del padron oficial (Excel legacy) no debe poder cambiar su CLUES
// ni sus datos descriptivos desde la app.
const MANUAL_ONLY_FIELDS = [
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
];

function trimmedOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined; // marca de tipo invalido
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

router.get('/unidades', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, clues, estado, tipo_unidad, condicion_unidad, nivel_atencion,
              nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
              nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
              vialidad, numero_exterior, numero_interior, codigo_postal, observaciones,
              origen_manual, capturado_en, enviado_en
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
         COUNT(*) FILTER (
           WHERE tipo_unidad IS NOT NULL
             AND condicion_unidad IS NOT NULL
             AND observaciones IS NOT NULL
             AND btrim(observaciones) <> ''
         )::int AS capturadas
       FROM unidades WHERE estado = $1`,
      [req.estado]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Crea una unidad a mano (todavia sin CLUES asignado por la autoridad).
router.post('/unidades', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};

    const nombreUnidad = trimmedOrNull(body.nombre_unidad);
    const observaciones = trimmedOrNull(body.observaciones);
    if (!nombreUnidad) {
      return res.status(400).json({ error: 'El nombre de la unidad es obligatorio' });
    }
    if (!observaciones) {
      return res.status(400).json({ error: 'Las observaciones son obligatorias' });
    }

    if (body.tipo_unidad !== undefined && body.tipo_unidad !== null && !TIPO_UNIDAD_VALUES.includes(body.tipo_unidad)) {
      return res.status(400).json({ error: 'TIPO_UNIDAD invalido' });
    }
    if (
      body.condicion_unidad !== undefined &&
      body.condicion_unidad !== null &&
      !CONDICION_UNIDAD_VALUES.includes(body.condicion_unidad)
    ) {
      return res.status(400).json({ error: 'CONDICION_UNIDAD invalido' });
    }
    if (typeof body.observaciones === 'string' && body.observaciones.length > OBSERVACIONES_MAX_LEN) {
      return res.status(400).json({ error: `OBSERVACIONES demasiado largo (max. ${OBSERVACIONES_MAX_LEN} caracteres)` });
    }

    const textFields = {};
    for (const field of MANUAL_ONLY_FIELDS) {
      const value = trimmedOrNull(body[field]);
      if (value === undefined) {
        return res.status(400).json({ error: `${field} invalido` });
      }
      if (value && value.length > TEXT_FIELD_MAX_LEN) {
        return res.status(400).json({ error: `${field} demasiado largo (max. ${TEXT_FIELD_MAX_LEN} caracteres)` });
      }
      textFields[field] = value;
    }
    textFields.nombre_unidad = nombreUnidad;

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO unidades (
           estado, clues, origen_manual, tipo_unidad, condicion_unidad, observaciones,
           nivel_atencion, nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
           nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad, vialidad,
           numero_exterior, numero_interior, codigo_postal, capturado_en
         ) VALUES (
           $1, $2, true, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15,
           $16, $17, $18, now()
         )
         RETURNING id, clues, estado, tipo_unidad, condicion_unidad, nivel_atencion,
                   nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
                   nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
                   vialidad, numero_exterior, numero_interior, codigo_postal, observaciones,
                   origen_manual, capturado_en, enviado_en`,
        [
          req.estado,
          textFields.clues,
          body.tipo_unidad ?? null,
          body.condicion_unidad ?? null,
          observaciones,
          textFields.nivel_atencion,
          textFields.nombre_tipo_establecimiento,
          textFields.propiedad_inmueble,
          textFields.nombre_tipologia,
          textFields.nombre_unidad,
          textFields.municipio,
          textFields.localidad,
          textFields.asentamiento,
          textFields.tipo_vialidad,
          textFields.vialidad,
          textFields.numero_exterior,
          textFields.numero_interior,
          textFields.codigo_postal,
        ]
      ));
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Ese CLUES ya esta registrado en otra unidad de tu entidad' });
      }
      throw err;
    }

    res.status(201).json({ unidad: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put('/unidades/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id invalido' });
    }

    const existing = await pool.query('SELECT origen_manual FROM unidades WHERE id = $1 AND estado = $2', [id, req.estado]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Unidad no encontrada para esta entidad' });
    }
    const { origen_manual: origenManual } = existing.rows[0];

    const body = req.body || {};
    const allowedFields = origenManual ? [...UNIVERSAL_FIELDS, ...MANUAL_ONLY_FIELDS] : UNIVERSAL_FIELDS;

    const rejectedFields = Object.keys(body).filter((key) => !allowedFields.includes(key));
    if (rejectedFields.length > 0) {
      return res.status(400).json({
        error: origenManual
          ? `Campo no editable: ${rejectedFields.join(', ')}`
          : `Esta unidad viene del padron oficial; solo se puede editar tipo_unidad, condicion_unidad y observaciones (intentaste: ${rejectedFields.join(', ')})`,
      });
    }

    if (body.tipo_unidad !== undefined && body.tipo_unidad !== null && !TIPO_UNIDAD_VALUES.includes(body.tipo_unidad)) {
      return res.status(400).json({ error: 'TIPO_UNIDAD invalido' });
    }
    if (
      body.condicion_unidad !== undefined &&
      body.condicion_unidad !== null &&
      !CONDICION_UNIDAD_VALUES.includes(body.condicion_unidad)
    ) {
      return res.status(400).json({ error: 'CONDICION_UNIDAD invalido' });
    }
    if (body.observaciones !== undefined && body.observaciones !== null && typeof body.observaciones !== 'string') {
      return res.status(400).json({ error: 'OBSERVACIONES invalido' });
    }
    if (typeof body.observaciones === 'string' && body.observaciones.length > OBSERVACIONES_MAX_LEN) {
      return res.status(400).json({ error: `OBSERVACIONES demasiado largo (max. ${OBSERVACIONES_MAX_LEN} caracteres)` });
    }

    const setClauses = [];
    const params = [];

    if (body.tipo_unidad !== undefined) {
      params.push(body.tipo_unidad);
      setClauses.push(`tipo_unidad = $${params.length}`);
    }
    if (body.condicion_unidad !== undefined) {
      params.push(body.condicion_unidad);
      setClauses.push(`condicion_unidad = $${params.length}`);
    }
    if (body.observaciones !== undefined) {
      params.push(body.observaciones);
      setClauses.push(`observaciones = $${params.length}`);
    }

    if (origenManual) {
      for (const field of MANUAL_ONLY_FIELDS) {
        if (body[field] === undefined) continue;
        const value = field === 'clues' ? trimmedOrNull(body[field]) : trimmedOrNull(body[field]);
        if (value === undefined) {
          return res.status(400).json({ error: `${field} invalido` });
        }
        if (value && value.length > TEXT_FIELD_MAX_LEN) {
          return res.status(400).json({ error: `${field} demasiado largo (max. ${TEXT_FIELD_MAX_LEN} caracteres)` });
        }
        params.push(value);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.json({ ok: true });
    }

    setClauses.push('capturado_en = now()');
    params.push(id, req.estado);

    try {
      await pool.query(
        `UPDATE unidades SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND estado = $${params.length}`,
        params
      );
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Ese CLUES ya esta registrado en otra unidad' });
      }
      throw err;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
