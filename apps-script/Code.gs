/**
 * Web App que recibe un archivo .xlsx (en base64) desde el backend de Node
 * y lo guarda en una carpeta fija de Google Drive.
 *
 * Contrato con el backend (server/services/driveClient.js):
 *   POST body JSON: { token, filename, fileBase64 }
 *   Respuesta éxito:  {"ok": true,  "fileId": "...", "url": "..."}
 *   Respuesta error:  {"ok": false, "error": "mensaje legible"}
 */

// ID de la carpeta de Drive donde se guardan los Excel enviados por las entidades.
var FOLDER_ID = '1qUePwlC-0QyJmF_e0wWsUVFl51ixdkf_';

/**
 * Punto de entrada para peticiones POST (lo que usa el backend).
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'Petición sin cuerpo (postData) recibido' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse_({ ok: false, error: 'JSON inválido en el cuerpo de la petición' });
    }

    // El secreto se guarda en Script Properties (no en el código) para que
    // este archivo se pueda compartir/leer sin exponer el token real.
    var expectedToken = PropertiesService.getScriptProperties().getProperty('DRIVE_WEBHOOK_TOKEN');
    if (!expectedToken || payload.token !== expectedToken) {
      return jsonResponse_({ ok: false, error: 'Token inválido' });
    }

    if (!payload.fileBase64) {
      return jsonResponse_({ ok: false, error: 'Falta fileBase64 en la petición' });
    }

    var filename = sanitizeFilename_(payload.filename);

    var bytes = Utilities.base64Decode(payload.fileBase64);
    var blob = Utilities.newBlob(
      bytes,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename
    );

    var folder = DriveApp.getFolderById(FOLDER_ID);
    var file = folder.createFile(blob);

    return jsonResponse_({ ok: true, fileId: file.getId(), url: file.getUrl() });
  } catch (err) {
    // Cualquier excepción (Drive sin permisos, base64 corrupto, etc.) se
    // convierte en JSON en vez de dejar que Apps Script muestre su página
    // de error por defecto, que el backend no sabría interpretar.
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Punto de entrada para GET: solo sirve para confirmar que el servicio está
 * vivo si alguien abre la URL en el navegador. No requiere autenticación
 * porque no realiza ninguna acción sobre Drive.
 */
function doGet(e) {
  return ContentService
    .createTextOutput('Servicio activo. Usa POST.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Valida el nombre de archivo recibido. Si contiene separadores de ruta o
 * "..", o no termina en .xlsx, se descarta y se genera un nombre de
 * respaldo con timestamp para no fallar duro ni permitir nombres raros.
 */
function sanitizeFilename_(filename) {
  var fallback = 'archivo_' + new Date().getTime() + '.xlsx';

  if (!filename || typeof filename !== 'string') {
    return fallback;
  }

  var hasPathSeparators = filename.indexOf('/') !== -1 || filename.indexOf('\\') !== -1;
  var hasParentRef = filename.indexOf('..') !== -1;
  var endsWithXlsx = /\.xlsx$/i.test(filename);

  if (hasPathSeparators || hasParentRef || !endsWithXlsx) {
    return fallback;
  }

  return filename;
}

/**
 * Envuelve un objeto en una respuesta JSON, que es lo único que el backend
 * sabe interpretar (ver driveClient.js).
 */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
