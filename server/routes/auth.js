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

// Lista publica de entidades para poblar el selector de la pantalla de login.
router.get('/estados', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT estado FROM entidades_auth ORDER BY estado');
    res.json({ estados: rows.map((r) => r.estado) });
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
      'SELECT estado, password_hash FROM entidades_auth WHERE estado = $1',
      [estado]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Entidad o contrasena incorrecta' });
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Entidad o contrasena incorrecta' });
    }

    const token = jwt.sign({ estado: rows[0].estado }, process.env.JWT_SECRET, {
      expiresIn: `${SESSION_HOURS}h`,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    });

    res.json({ ok: true, estado: rows[0].estado });
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
    res.json({ estado: payload.estado });
  } catch (err) {
    res.status(401).json({ error: 'Sesion invalida o expirada' });
  }
});

module.exports = router;
