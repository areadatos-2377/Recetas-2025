const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const TIPO_UNIDAD_VALUES = ['FIJA', 'MOVIL'];
const SURTIMIENTO_FIELDS = ['recetas_completas', 'recetas_incompletas', 'recetas_no_surtidas'];
const MAX_CANTIDAD_RECETAS = 2147483647;
const TEXT_FIELD_MAX_LEN = 300;
const CLUES_MAX_LEN = 11;

// Editables en cualquier unidad, venga o no del padron oficial.
const UNIVERSAL_FIELDS = ['tipo_unidad', ...SURTIMIENTO_FIELDS];

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
  'estatus_operacion',
  'latitud',
  'longitud',
];

const CATALOGO_BUSQUEDA_MAX_LEN = 200;

function trimmedOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined; // marca de tipo invalido
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

router.get('/unidades', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, clues, estado, tipo_unidad, condicion_unidad,
              recetas_completas, recetas_incompletas, recetas_no_surtidas, nivel_atencion,
              nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
              nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
              vialidad, numero_exterior, numero_interior, codigo_postal, observaciones,
              estatus_operacion, latitud, longitud,
              origen_manual, capturado_en, enviado_en
       FROM unidades WHERE estado = $1 AND ($2::text IS NULL OR clues = $2) ORDER BY nombre_unidad, clues`,
      [req.estado, req.clues]
    );
    res.json({ estado: req.estado, clues: req.clues, unidades: rows });
  } catch (err) {
    next(err);
  }
});

// Busca en el catalogo nacional SSA (solo dentro de la entidad de la sesion)
// para autocompletar el formulario de "Agregar unidad".
router.get('/catalogo-ssa', requireAuth, async (req, res, next) => {
  try {
    const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
    if (!buscar) {
      return res.json({ resultados: [] });
    }
    if (buscar.length > CATALOGO_BUSQUEDA_MAX_LEN) {
      return res.status(400).json({ error: 'Busqueda demasiado larga' });
    }

    const { rows } = await pool.query(
      `SELECT clues, nivel_atencion, nombre_tipo_establecimiento, propiedad_inmueble,
              nombre_tipologia, nombre_unidad, municipio, localidad, asentamiento,
              tipo_vialidad, vialidad, numero_exterior, numero_interior, codigo_postal,
              estatus_operacion, latitud, longitud
       FROM catalogo_ssa
       WHERE estado = $1 AND nombre_unidad ILIKE $2
       ORDER BY nombre_unidad
       LIMIT 20`,
      [req.estado, `%${buscar}%`]
    );
    res.json({ resultados: rows });
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
           WHERE recetas_completas IS NOT NULL
             AND recetas_incompletas IS NOT NULL
             AND recetas_no_surtidas IS NOT NULL
         )::int AS capturadas
       FROM unidades WHERE estado = $1 AND ($2::text IS NULL OR clues = $2)`,
      [req.estado, req.clues]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Crea una unidad a mano (todavia sin CLUES asignado por la autoridad).
router.post('/unidades', requireAuth, async (req, res, next) => {
  try {
    if (req.clues) {
      return res.status(403).json({ error: 'Tu acceso esta limitado a tu propia unidad; no puedes agregar unidades nuevas' });
    }

    const body = req.body || {};

    const nombreUnidad = trimmedOrNull(body.nombre_unidad);
    if (!nombreUnidad) {
      return res.status(400).json({ error: 'El nombre de la unidad es obligatorio' });
    }

    if (body.tipo_unidad !== undefined && body.tipo_unidad !== null && !TIPO_UNIDAD_VALUES.includes(body.tipo_unidad)) {
      return res.status(400).json({ error: 'TIPO_UNIDAD invalido' });
    }
    const textFields = {};
    for (const field of MANUAL_ONLY_FIELDS) {
      const value = trimmedOrNull(body[field]);
      if (value === undefined) {
        return res.status(400).json({ error: `${field} invalido` });
      }
      const maxLen = field === 'clues' ? CLUES_MAX_LEN : TEXT_FIELD_MAX_LEN;
      if (value && value.length > maxLen) {
        return res.status(400).json({ error: `${field} demasiado largo (max. ${maxLen} caracteres)` });
      }
      textFields[field] = value;
    }
    textFields.nombre_unidad = nombreUnidad;

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO unidades (
           estado, clues, origen_manual, tipo_unidad,
           nivel_atencion, nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
           nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad, vialidad,
           numero_exterior, numero_interior, codigo_postal,
           estatus_operacion, latitud, longitud, capturado_en
         ) VALUES (
           $1, $2, true, $3,
           $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13,
           $14, $15, $16,
           $17, $18, $19, now()
         )
         RETURNING id, clues, estado, tipo_unidad, condicion_unidad,
                   recetas_completas, recetas_incompletas, recetas_no_surtidas, nivel_atencion,
                   nombre_tipo_establecimiento, propiedad_inmueble, nombre_tipologia,
                   nombre_unidad, municipio, localidad, asentamiento, tipo_vialidad,
                   vialidad, numero_exterior, numero_interior, codigo_postal, observaciones,
                   estatus_operacion, latitud, longitud,
                   origen_manual, capturado_en, enviado_en`,
        [
          req.estado,
          textFields.clues,
          body.tipo_unidad ?? null,
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
          textFields.estatus_operacion,
          textFields.latitud,
          textFields.longitud,
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

    const existing = await pool.query(
      'SELECT origen_manual FROM unidades WHERE id = $1 AND estado = $2 AND ($3::text IS NULL OR clues = $3)',
      [id, req.estado, req.clues]
    );
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
          : `Esta unidad viene del padron oficial; solo se puede editar tipo_unidad y cantidades de recetas (intentaste: ${rejectedFields.join(', ')})`,
      });
    }

    if (body.tipo_unidad !== undefined && body.tipo_unidad !== null && !TIPO_UNIDAD_VALUES.includes(body.tipo_unidad)) {
      return res.status(400).json({ error: 'TIPO_UNIDAD invalido' });
    }
    for (const field of SURTIMIENTO_FIELDS) {
      const value = body[field];
      if (value !== undefined && value !== null &&
          (!Number.isSafeInteger(value) || value < 0 || value > MAX_CANTIDAD_RECETAS)) {
        return res.status(400).json({ error: `${field} debe ser un entero entre 0 y ${MAX_CANTIDAD_RECETAS}` });
      }
    }

    const setClauses = [];
    const params = [];

    if (body.tipo_unidad !== undefined) {
      params.push(body.tipo_unidad);
      setClauses.push(`tipo_unidad = $${params.length}`);
    }
    for (const field of SURTIMIENTO_FIELDS) {
      if (body[field] === undefined) continue;
      params.push(body[field]);
      setClauses.push(`${field} = $${params.length}`);
    }

    if (origenManual) {
      for (const field of MANUAL_ONLY_FIELDS) {
        if (body[field] === undefined) continue;
        const value = trimmedOrNull(body[field]);
        if (value === undefined) {
          return res.status(400).json({ error: `${field} invalido` });
        }
        const maxLen = field === 'clues' ? CLUES_MAX_LEN : TEXT_FIELD_MAX_LEN;
        if (value && value.length > maxLen) {
          return res.status(400).json({ error: `${field} demasiado largo (max. ${maxLen} caracteres)` });
        }
        params.push(value);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.json({ ok: true });
    }

    setClauses.push('capturado_en = now()');
    params.push(id, req.estado, req.clues);

    try {
      await pool.query(
        `UPDATE unidades SET ${setClauses.join(', ')}
         WHERE id = $${params.length - 2} AND estado = $${params.length - 1}
           AND ($${params.length}::text IS NULL OR clues = $${params.length})`,
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

// Solo se pueden eliminar unidades agregadas a mano (origen_manual = true):
// las del padron oficial nunca se borran desde la app.
router.delete('/unidades/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id invalido' });
    }

    const existing = await pool.query(
      'SELECT origen_manual FROM unidades WHERE id = $1 AND estado = $2 AND ($3::text IS NULL OR clues = $3)',
      [id, req.estado, req.clues]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Unidad no encontrada para esta entidad' });
    }
    if (!existing.rows[0].origen_manual) {
      return res.status(400).json({ error: 'Solo se pueden eliminar unidades agregadas manualmente' });
    }

    await pool.query(
      'DELETE FROM unidades WHERE id = $1 AND estado = $2 AND ($3::text IS NULL OR clues = $3)',
      [id, req.estado, req.clues]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
