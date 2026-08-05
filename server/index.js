require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Falta la variable de entorno ${key}`);
    process.exit(1);
  }
}

const authRoutes = require('./routes/auth');
const unidadesRoutes = require('./routes/unidades');
const enviarRoutes = require('./routes/enviar');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// No hay public/index.html: la raiz manda directo al login.
app.get('/', (req, res) => res.redirect('/login.html'));

app.use('/api', authRoutes);
app.use('/api', unidadesRoutes);
app.use('/api', enviarRoutes);
app.use('/api', adminRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
