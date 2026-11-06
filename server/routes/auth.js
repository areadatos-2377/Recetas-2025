const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');

const router = express.Router();

const COOKIE_NAME = 'session';
const SESSION_HOURS = 12;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo mas tarde.' },
});

// Lista publica de entidades/unidades para poblar el selector de login.
router.get('/estados', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ea.estado AS clave, COALESCE(ea.nombre, ea.estado) AS nombre,
              CASE WHEN ea.clues IS NOT NULL THEN 'unidad' ELSE 'estado' END AS tipo
       FROM entidades_auth ea
       WHERE EXISTS (
         SELECT 1 FROM unidades u
         WHERE u.estado = COALESCE(ea.estado_real, ea.estado)
           AND u.archivado_en IS NULL
           AND (ea.clues IS NULL OR u.clues = ea.clues)
       )
       ORDER BY tipo, nombre`
    );
    res.json({ estados: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { estado, password } = req.body || {};
    if (!estado || !password) {
      return res.status(400).json({ error: 'Falta entidad o contrasena' });
    }

    const { rows } = await pool.query(
      `SELECT ea.estado, ea.password_hash, ea.estado_real, ea.clues, ea.nombre
       FROM entidades_auth ea
       WHERE ea.estado = $1
         AND EXISTS (
           SELECT 1 FROM unidades u
           WHERE u.estado = COALESCE(ea.estado_real, ea.estado)
             AND u.archivado_en IS NULL
             AND (ea.clues IS NULL OR u.clues = ea.clues)
         )`,
      [estado]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Entidad o contrasena incorrecta' });
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Entidad o contrasena incorrecta' });
    }

    const estadoReal = rows[0].estado_real || rows[0].estado;
    const clues = rows[0].clues || null;
    const label = rows[0].nombre || rows[0].estado;

    const token = jwt.sign({ estado: estadoReal, clues, label }, process.env.JWT_SECRET, {
      expiresIn: `${SESSION_HOURS}h`,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    });

    res.json({ ok: true, estado: estadoReal, clues, label });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ estado: payload.estado, clues: payload.clues || null, label: payload.label || payload.estado });
  } catch (err) {
    res.status(401).json({ error: 'Sesion invalida o expirada' });
  }
});

module.exports = router;
