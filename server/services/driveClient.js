const https = require('https');
const { URL } = require('url');

function httpRequest(urlStr, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Apps Script siempre contesta un POST con un 302 hacia el contenido ya
// generado (el archivo ya se subio a Drive en ese momento, el redirect solo
// sirve para leer la respuesta). fetch() sigue ese redirect automaticamente,
// pero en la practica a veces termina golpeando /exec de nuevo en vez del
// contenido real y regresa la respuesta de doGet() ("Servicio activo. Usa
// POST.") en lugar del JSON esperado. Seguir el redirect a mano, con un GET
// simple al Location exacto que mando el servidor, evita ese problema.
async function requestFollowingRedirects(urlStr, options, maxRedirects) {
  let currentUrl = urlStr;
  let currentOptions = options;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await httpRequest(currentUrl, currentOptions);

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      currentUrl = res.headers.location;
      currentOptions = { method: 'GET', headers: {} };
      continue;
    }

    return res;
  }

  throw new Error('Demasiadas redirecciones al conectar con el webhook de Drive');
}

async function uploadToDrive(fileName, buffer) {
  const url = process.env.DRIVE_WEBHOOK_URL;
  const token = process.env.DRIVE_WEBHOOK_TOKEN;

  if (!url || !token) {
    throw new Error('DRIVE_WEBHOOK_URL o DRIVE_WEBHOOK_TOKEN no configurados');
  }

  const body = JSON.stringify({
    token,
    filename: fileName,
    fileBase64: buffer.toString('base64'),
  });

  const response = await requestFollowingRedirects(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      body,
    },
    5
  );

  let data;
  try {
    data = JSON.parse(response.body);
  } catch (err) {
    throw new Error(`Respuesta inesperada del webhook de Drive: ${response.body.slice(0, 200)}`);
  }

  if (response.status !== 200 || !data.ok) {
    throw new Error(data.error || 'No se pudo subir el archivo a Drive');
  }

  return { fileId: data.fileId, fileUrl: data.url };
}

module.exports = { uploadToDrive };
