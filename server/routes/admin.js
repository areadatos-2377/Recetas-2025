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
          WHERE recetas_completas IS NOT NULL
            AND recetas_incompletas IS NOT NULL
            AND recetas_no_surtidas IS NOT NULL
        )::int AS capturadas,
        COALESCE(SUM(recetas_completas), 0)::bigint AS recetas_completas,
        COALESCE(SUM(recetas_incompletas), 0)::bigint AS recetas_incompletas,
        COALESCE(SUM(recetas_no_surtidas), 0)::bigint AS recetas_no_surtidas
      FROM unidades
      WHERE archivado_en IS NULL
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
      recetasCompletas: Number(row.recetas_completas),
      recetasIncompletas: Number(row.recetas_incompletas),
      recetasNoSurtidas: Number(row.recetas_no_surtidas),
      ultimoEnvio: ultimoPorEstado[row.estado] || null,
    }));

    res.json({ resumen });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
