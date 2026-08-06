const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAdmin, ADMIN_COOKIE_NAME } = require('../middleware/requireAdmin');

const router = express.Router();

const SESSION_HOURS = 12;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo mas tarde.' },
});

router.post('/admin/login', loginLimiter, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    const hash = process.env.ADMIN_PASSWORD_HASH;

    if (!password || !hash) {
      return res.status(401).json({ error: 'Contrasena incorrecta' });
    }

    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
      return res.status(401).json({ error: 'Contrasena incorrecta' });
    }

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: `${SESSION_HOURS}h`,
    });

    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

router.get('/admin/resumen', requireAdmin, async (req, res, next) => {
  try {
    const { rows: porEstado } = await pool.query(`
      SELECT
        estado,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE condicion_unidad IS NOT NULL
            AND observaciones IS NOT NULL
            AND btrim(observaciones) <> ''
        )::int AS capturadas,
        COUNT(*) FILTER (WHERE condicion_unidad = 'SE_INCLUYE')::int AS incluidas,
        COUNT(*) FILTER (WHERE condicion_unidad = 'SE_EXCLUYE')::int AS excluidas,
        COUNT(*) FILTER (WHERE condicion_unidad = 'SE_RATIFICA')::int AS ratificadas,
        COUNT(*) FILTER (WHERE origen_manual)::int AS manuales
      FROM unidades
      GROUP BY estado
      ORDER BY estado
    `);

    const { rows: ultimosEnvios } = await pool.query(`
      SELECT DISTINCT ON (estado) estado, archivo_nombre, drive_file_url, creado_en
      FROM submissions
      ORDER BY estado, creado_en DESC
    `);
    const ultimoPorEstado = {};
    ultimosEnvios.forEach((row) => {
      ultimoPorEstado[row.estado] = {
        archivoNombre: row.archivo_nombre,
        archivoUrl: row.drive_file_url,
        creadoEn: row.creado_en,
      };
    });

    const resumen = porEstado.map((row) => ({
      estado: row.estado,
      total: row.total,
      capturadas: row.capturadas,
      incluidas: row.incluidas,
      excluidas: row.excluidas,
      ratificadas: row.ratificadas,
      manuales: row.manuales,
      ultimoEnvio: ultimoPorEstado[row.estado] || null,
    }));

    res.json({ resumen });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
