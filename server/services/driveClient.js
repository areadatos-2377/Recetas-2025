async function uploadToDrive(fileName, buffer) {
  const url = process.env.DRIVE_WEBHOOK_URL;
  const token = process.env.DRIVE_WEBHOOK_TOKEN;

  if (!url || !token) {
    throw new Error('DRIVE_WEBHOOK_URL o DRIVE_WEBHOOK_TOKEN no configurados');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      filename: fileName,
      fileBase64: buffer.toString('base64'),
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Respuesta inesperada del webhook de Drive: ${text.slice(0, 200)}`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'No se pudo subir el archivo a Drive');
  }

  return { fileId: data.fileId, fileUrl: data.url };
}

module.exports = { uploadToDrive };
