(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Estado global en memoria
  // ---------------------------------------------------------------------
  var state = {
    estado: null,
    unidades: [],       // lista completa devuelta por /api/unidades
    filtered: [],        // subconjunto visible según el buscador
    total: 0,
    capturadas: 0,
  };

  var obsTimers = Object.create(null); // clues -> timeoutId, para el debounce de observaciones
  var searchTimer = null;

  // ---------------------------------------------------------------------
  // Referencias al DOM
  // ---------------------------------------------------------------------
  var estadoNombreEl = document.getElementById('estado-nombre');
  var logoutBtn = document.getElementById('logout-btn');
  var progressTextEl = document.getElementById('progress-text');
  var progressBarFillEl = document.getElementById('progress-bar-fill');
  var progressBarTrackEl = document.getElementById('progress-bar-track');
  var searchInput = document.getElementById('search-input');
  var tableStatusEl = document.getElementById('table-status');
  var tbody = document.getElementById('unidades-tbody');
  var enviarBtn = document.getElementById('enviar-btn');

  var confirmModal = document.getElementById('confirm-modal');
  var confirmModalBody = document.getElementById('confirm-modal-body');
  var confirmModalResult = document.getElementById('confirm-modal-result');
  var confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  var confirmSendBtn = document.getElementById('confirm-send-btn');

  // ---------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    // Fallback simple para navegadores muy antiguos.
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function formatNumber(n) {
    try {
      return n.toLocaleString('es-MX');
    } catch (e) {
      return String(n);
    }
  }

  function isCapturada(u) {
    return !!(u.tipo_unidad && u.condicion_unidad);
  }

  function findUnidad(clues) {
    for (var i = 0; i < state.unidades.length; i++) {
      if (state.unidades[i].clues === clues) return state.unidades[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------------------
  function goToLogin() {
    window.location.href = 'login.html';
  }

  function checkSession() {
    return fetch('/api/me', { credentials: 'same-origin' }).then(function (res) {
      if (res.status === 401) {
        goToLogin();
        return Promise.reject(new Error('no-session'));
      }
      if (!res.ok) {
        return Promise.reject(new Error('Error al verificar la sesión.'));
      }
      return res.json();
    });
  }

  logoutBtn.addEventListener('click', function () {
    logoutBtn.disabled = true;
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .then(function () {
        goToLogin();
      });
  });

  // ---------------------------------------------------------------------
  // Progreso
  // ---------------------------------------------------------------------
  function updateProgressUI(total, capturadas) {
    state.total = total;
    state.capturadas = capturadas;
    var pct = total > 0 ? Math.round((capturadas / total) * 100) : 0;
    progressTextEl.textContent = formatNumber(capturadas) + ' de ' + formatNumber(total) + ' unidades capturadas (' + pct + '%)';
    progressBarFillEl.style.width = pct + '%';
    progressBarTrackEl.setAttribute('aria-valuenow', String(pct));
  }

  function loadProgreso() {
    return fetch('/api/progreso', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('No se pudo cargar el progreso.');
        return res.json();
      })
      .then(function (data) {
        updateProgressUI(data.total || 0, data.capturadas || 0);
      })
      .catch(function () {
        progressTextEl.textContent = 'No se pudo cargar el progreso.';
      });
  }

  function recomputeProgresoLocal() {
    var total = state.unidades.length;
    var capturadas = 0;
    for (var i = 0; i < state.unidades.length; i++) {
      if (isCapturada(state.unidades[i])) capturadas++;
    }
    updateProgressUI(total, capturadas);
  }

  // ---------------------------------------------------------------------
  // Tabla: render
  // ---------------------------------------------------------------------
  var TIPO_UNIDAD_LABELS = { FIJA: 'Fija', MOVIL: 'Móvil' };
  var CONDICION_LABELS = { SE_INCLUYE: 'Se incluye', SE_EXCLUYE: 'Se excluye' };

  function statusBadgeHtml(u) {
    if (isCapturada(u)) {
      return '<span class="status-badge status-capturado">Capturado</span>';
    }
    return '<span class="status-badge status-pendiente">Pendiente</span>';
  }

  function rowHtml(u) {
    var clues = escapeHtml(u.clues);
    return (
      '<tr class="unidad-row" data-clues="' + clues + '" tabindex="0">' +
      '<td class="col-clues">' + clues + '</td>' +
      '<td class="col-nombre">' + escapeHtml(u.nombre_tipo_establecimiento || '') + '</td>' +
      '<td class="col-estatus">' + statusBadgeHtml(u) + '</td>' +
      '</tr>'
    );
  }

  function renderTable(list) {
    if (list.length === 0) {
      tbody.innerHTML = '';
      tableStatusEl.hidden = false;
      tableStatusEl.textContent = 'No se encontraron unidades con ese criterio de búsqueda.';
      return;
    }
    tableStatusEl.hidden = true;
    tableStatusEl.textContent = '';
    var html = new Array(list.length);
    for (var i = 0; i < list.length; i++) {
      html[i] = rowHtml(list[i]);
    }
    tbody.innerHTML = html.join('');
  }

  function detailField(label, value) {
    return (
      '<div class="detail-field">' +
      '<span class="detail-label">' + escapeHtml(label) + '</span>' +
      '<span class="detail-value">' + (value ? escapeHtml(value) : '<em>—</em>') + '</span>' +
      '</div>'
    );
  }

  function radioGroupHtml(name, field, clues, options, currentValue) {
    var html = '<div class="radio-group" role="radiogroup">';
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var id = field + '-' + opt.value + '-' + cssEscape(clues);
      var checked = currentValue === opt.value ? ' checked' : '';
      html +=
        '<label class="radio-option" for="' + id + '">' +
        '<input type="radio" id="' + id + '" name="' + name + '" value="' + opt.value + '" ' +
        'data-field="' + field + '" data-clues="' + escapeHtml(clues) + '"' + checked + '>' +
        '<span>' + escapeHtml(opt.label) + '</span>' +
        '</label>';
    }
    html += '</div>';
    return html;
  }

  function buildDetailRowHtml(u) {
    var clues = u.clues;
    var groupSuffix = cssEscape(clues);

    var infoFields =
      detailField('Nivel de atención', u.nivel_atencion) +
      detailField('Propiedad del inmueble', u.propiedad_inmueble) +
      detailField('Tipología', u.nombre_tipologia) +
      detailField('Nombre de la unidad', u.nombre_unidad) +
      detailField('Municipio', u.municipio) +
      detailField('Localidad', u.localidad) +
      detailField('Asentamiento', u.asentamiento) +
      detailField('Tipo de vialidad', u.tipo_vialidad) +
      detailField('Vialidad', u.vialidad) +
      detailField('Número exterior', u.numero_exterior) +
      detailField('Número interior', u.numero_interior) +
      detailField('Código postal', u.codigo_postal);

    var tipoUnidadRadios = radioGroupHtml(
      'tipo_unidad-' + groupSuffix,
      'tipo_unidad',
      clues,
      [
        { value: 'FIJA', label: 'Fija' },
        { value: 'MOVIL', label: 'Móvil' },
      ],
      u.tipo_unidad
    );

    var condicionRadios = radioGroupHtml(
      'condicion_unidad-' + groupSuffix,
      'condicion_unidad',
      clues,
      [
        { value: 'SE_INCLUYE', label: 'Se incluye' },
        { value: 'SE_EXCLUYE', label: 'Se excluye' },
      ],
      u.condicion_unidad
    );

    return (
      '<tr class="detail-row" data-clues="' + escapeHtml(clues) + '">' +
      '<td colspan="3">' +
      '<div class="detail-panel">' +
      '<div class="detail-grid">' + infoFields + '</div>' +
      '<div class="capture-form">' +
      '<div class="form-group">' +
      '<span class="form-label">Tipo de unidad</span>' +
      tipoUnidadRadios +
      '</div>' +
      '<div class="form-group">' +
      '<span class="form-label">Condición de la unidad</span>' +
      condicionRadios +
      '</div>' +
      '<div class="form-group form-group-wide">' +
      '<label class="form-label" for="obs-' + groupSuffix + '">Observaciones</label>' +
      '<textarea id="obs-' + groupSuffix + '" class="observaciones-textarea" rows="3" ' +
      'data-field="observaciones" data-clues="' + escapeHtml(clues) + '" ' +
      'placeholder="Observaciones opcionales…">' + escapeHtml(u.observaciones || '') + '</textarea>' +
      '</div>' +
      '<div class="save-feedback" data-feedback-for="' + escapeHtml(clues) + '"></div>' +
      '</div>' +
      '</div>' +
      '</td>' +
      '</tr>'
    );
  }

  function closeOpenDetail() {
    var openDetail = tbody.querySelector('.detail-row');
    if (openDetail) {
      var prev = openDetail.previousElementSibling;
      if (prev) prev.classList.remove('row-expanded');
      openDetail.parentNode.removeChild(openDetail);
    }
  }

  function toggleRow(tr, clues) {
    var next = tr.nextElementSibling;
    if (next && next.classList.contains('detail-row') && next.getAttribute('data-clues') === clues) {
      next.parentNode.removeChild(next);
      tr.classList.remove('row-expanded');
      return;
    }
    closeOpenDetail();
    var unidad = findUnidad(clues);
    if (!unidad) return;
    tr.insertAdjacentHTML('afterend', buildDetailRowHtml(unidad));
    tr.classList.add('row-expanded');
  }

  tbody.addEventListener('click', function (event) {
    var tr = event.target.closest('tr.unidad-row');
    if (!tr) return;
    var clues = tr.getAttribute('data-clues');
    toggleRow(tr, clues);
  });

  tbody.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var tr = event.target.closest('tr.unidad-row');
    if (!tr) return;
    event.preventDefault();
    toggleRow(tr, tr.getAttribute('data-clues'));
  });

  // ---------------------------------------------------------------------
  // Autoguardado
  // ---------------------------------------------------------------------
  function setFeedback(clues, message, type) {
    var el = tbody.querySelector('.save-feedback[data-feedback-for="' + cssEscape(clues) + '"]');
    if (!el) return;
    el.textContent = message;
    el.className = 'save-feedback' + (type ? ' save-feedback-' + type : '');
  }

  function updateRowStatusBadge(clues) {
    var unidad = findUnidad(clues);
    if (!unidad) return;
    var row = tbody.querySelector('tr.unidad-row[data-clues="' + cssEscape(clues) + '"]');
    if (!row) return;
    var cell = row.querySelector('.col-estatus');
    if (cell) cell.innerHTML = statusBadgeHtml(unidad);
  }

  function saveField(clues, field, value) {
    setFeedback(clues, 'Guardando…', 'saving');
    var body = {};
    body[field] = value;

    return fetch('/api/unidades/' + encodeURIComponent(clues), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.data && result.data.error) || 'No se pudo guardar.');
        }
        var unidad = findUnidad(clues);
        if (unidad) {
          unidad[field] = value;
        }
        setFeedback(clues, 'Guardado', 'success');
        if (field === 'tipo_unidad' || field === 'condicion_unidad') {
          updateRowStatusBadge(clues);
          recomputeProgresoLocal();
        }
      })
      .catch(function (err) {
        setFeedback(clues, err.message || 'Error al guardar.', 'error');
      });
  }

  tbody.addEventListener('change', function (event) {
    var el = event.target;
    if (el.matches('input[type="radio"][data-field="tipo_unidad"]')) {
      saveField(el.getAttribute('data-clues'), 'tipo_unidad', el.value);
    } else if (el.matches('input[type="radio"][data-field="condicion_unidad"]')) {
      saveField(el.getAttribute('data-clues'), 'condicion_unidad', el.value);
    }
  });

  function scheduleObservacionesSave(el) {
    var clues = el.getAttribute('data-clues');
    var value = el.value;
    if (obsTimers[clues]) {
      clearTimeout(obsTimers[clues]);
    }
    setFeedback(clues, 'Escribiendo…', 'saving');
    obsTimers[clues] = setTimeout(function () {
      delete obsTimers[clues];
      saveField(clues, 'observaciones', value);
    }, 700);
  }

  function flushObservacionesSave(el) {
    var clues = el.getAttribute('data-clues');
    if (obsTimers[clues]) {
      clearTimeout(obsTimers[clues]);
      delete obsTimers[clues];
      saveField(clues, 'observaciones', el.value);
    }
  }

  tbody.addEventListener('input', function (event) {
    var el = event.target;
    if (el.matches('textarea[data-field="observaciones"]')) {
      scheduleObservacionesSave(el);
    }
  });

  tbody.addEventListener('focusout', function (event) {
    var el = event.target;
    if (el.matches('textarea[data-field="observaciones"]')) {
      flushObservacionesSave(el);
    }
  });

  // ---------------------------------------------------------------------
  // Buscador
  // ---------------------------------------------------------------------
  function applyFilter(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      state.filtered = state.unidades;
    } else {
      state.filtered = state.unidades.filter(function (u) {
        return (
          (u.clues && u.clues.toLowerCase().indexOf(q) !== -1) ||
          (u.nombre_tipo_establecimiento && u.nombre_tipo_establecimiento.toLowerCase().indexOf(q) !== -1) ||
          (u.nombre_unidad && u.nombre_unidad.toLowerCase().indexOf(q) !== -1)
        );
      });
    }
    renderTable(state.filtered);
  }

  searchInput.addEventListener('input', function () {
    var value = searchInput.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      applyFilter(value);
    }, 150);
  });

  // ---------------------------------------------------------------------
  // Carga inicial de unidades
  // ---------------------------------------------------------------------
  function loadUnidades() {
    tableStatusEl.hidden = false;
    tableStatusEl.textContent = 'Cargando unidades…';
    return fetch('/api/unidades', { credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) {
          goToLogin();
          return Promise.reject(new Error('no-session'));
        }
        if (!res.ok) throw new Error('No se pudo cargar la lista de unidades.');
        return res.json();
      })
      .then(function (data) {
        state.estado = data.estado;
        state.unidades = data.unidades || [];
        state.filtered = state.unidades;
        estadoNombreEl.textContent = state.estado || '—';
        renderTable(state.filtered);
      })
      .catch(function (err) {
        if (err.message === 'no-session') return;
        tableStatusEl.hidden = false;
        tableStatusEl.textContent = err.message || 'Ocurrió un error al cargar las unidades.';
      });
  }

  // ---------------------------------------------------------------------
  // Envío final
  // ---------------------------------------------------------------------
  function computeSendSummary() {
    var total = state.unidades.length;
    var incluidas = 0;
    var excluidas = 0;
    for (var i = 0; i < state.unidades.length; i++) {
      var c = state.unidades[i].condicion_unidad;
      if (c === 'SE_INCLUYE') incluidas++;
      else if (c === 'SE_EXCLUYE') excluidas++;
    }
    var pendientes = total - incluidas - excluidas;
    return { total: total, incluidas: incluidas, excluidas: excluidas, pendientes: pendientes };
  }

  function openConfirmModal() {
    var summary = computeSendSummary();
    confirmModalBody.innerHTML =
      '<p>Estás a punto de generar y subir el archivo de captura para <strong>' + escapeHtml(state.estado || '') + '</strong>.</p>' +
      '<ul class="summary-list">' +
      '<li><strong>' + formatNumber(summary.total) + '</strong> unidades en total</li>' +
      '<li><strong>' + formatNumber(summary.incluidas) + '</strong> se incluyen</li>' +
      '<li><strong>' + formatNumber(summary.excluidas) + '</strong> se excluyen</li>' +
      '<li><strong>' + formatNumber(summary.pendientes) + '</strong> pendientes de captura</li>' +
      '</ul>' +
      '<p>Puedes enviar más de una vez; cada envío genera un nuevo archivo.</p>';
    confirmModalResult.hidden = true;
    confirmModalResult.innerHTML = '';
    confirmModalResult.className = 'modal-result';
    confirmSendBtn.hidden = false;
    confirmSendBtn.disabled = false;
    confirmSendBtn.textContent = 'Confirmar y enviar';
    confirmCancelBtn.textContent = 'Cancelar';
    confirmModal.hidden = false;
  }

  function closeConfirmModal() {
    confirmModal.hidden = true;
  }

  enviarBtn.addEventListener('click', openConfirmModal);
  confirmCancelBtn.addEventListener('click', closeConfirmModal);
  confirmModal.addEventListener('click', function (event) {
    if (event.target === confirmModal) closeConfirmModal();
  });

  confirmSendBtn.addEventListener('click', function () {
    confirmSendBtn.disabled = true;
    confirmSendBtn.textContent = 'Enviando…';
    confirmModalResult.hidden = true;

    fetch('/api/enviar', { method: 'POST', credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.data && result.data.error) || 'No se pudo enviar la información.');
        }
        var data = result.data;
        confirmModalResult.hidden = false;
        confirmModalResult.className = 'modal-result modal-result-success';
        confirmModalResult.innerHTML =
          '<p>Archivo generado correctamente: <strong>' + escapeHtml(data.fileName || '') + '</strong></p>' +
          '<p><a href="' + escapeHtml(data.fileUrl || '#') + '" target="_blank" rel="noopener noreferrer">Abrir archivo en Google Drive</a></p>';
        confirmSendBtn.hidden = true;
        confirmCancelBtn.textContent = 'Cerrar';
      })
      .catch(function (err) {
        confirmModalResult.hidden = false;
        confirmModalResult.className = 'modal-result modal-result-error';
        confirmModalResult.textContent = err.message || 'Ocurrió un error al enviar la información.';
        confirmSendBtn.disabled = false;
        confirmSendBtn.textContent = 'Reintentar';
      });
  });

  // ---------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------
  checkSession()
    .then(function (me) {
      if (me && me.estado) {
        estadoNombreEl.textContent = me.estado;
      }
      return Promise.all([loadUnidades(), loadProgreso()]);
    })
    .catch(function (err) {
      if (err.message === 'no-session') return;
    });
})();
