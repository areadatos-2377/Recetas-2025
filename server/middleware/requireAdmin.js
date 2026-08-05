const jwt = require('jsonwebtoken');

const ADMIN_COOKIE_NAME = 'admin_session';

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[ADMIN_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(401).json({ error: 'Sesion invalida' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }
}

module.exports = { requireAdmin, ADMIN_COOKIE_NAME };
