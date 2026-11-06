(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Estado global en memoria
  // ---------------------------------------------------------------------
  var state = {
    estado: null,
    clues: null,         // si no es null, la sesion esta limitada a una sola unidad
    label: null,
    unidades: [],       // lista completa devuelta por /api/unidades
    filtered: [],        // subconjunto visible según el buscador
    total: 0,
    capturadas: 0,
  };

  var fieldTimers = Object.create(null); // "id:campo" -> timeoutId, para el debounce de texto
  var searchTimer = null;

  var SURTIMIENTO_FIELDS = [
    { field: 'recetas_completas', label: 'A. Completas' },
    { field: 'recetas_incompletas', label: 'B. Incompletas' },
    { field: 'recetas_no_surtidas', label: 'C. No surtidas' },
  ];

  // Campos que solo existen/editan en unidades agregadas a mano (sin CLUES
  // original). Debe coincidir con MANUAL_ONLY_FIELDS del backend.
  var MANUAL_FIELDS = [
    { field: 'clues', label: 'CLUES' },
    { field: 'nombre_unidad', label: 'Nombre de la unidad' },
    { field: 'nombre_tipo_establecimiento', label: 'Nombre tipo establecimiento' },
    { field: 'nivel_atencion', label: 'Nivel de atención' },
    { field: 'propiedad_inmueble', label: 'Propiedad del inmueble' },
    { field: 'nombre_tipologia', label: 'Tipología' },
    { field: 'municipio', label: 'Municipio' },
    { field: 'localidad', label: 'Localidad' },
    { field: 'asentamiento', label: 'Asentamiento' },
    { field: 'tipo_vialidad', label: 'Tipo de vialidad' },
    { field: 'vialidad', label: 'Vialidad' },
    { field: 'numero_exterior', label: 'Número exterior' },
    { field: 'numero_interior', label: 'Número interior' },
    { field: 'codigo_postal', label: 'Código postal' },
    { field: 'estatus_operacion', label: 'Estatus de operación (catálogo)' },
    { field: 'latitud', label: 'Latitud' },
    { field: 'longitud', label: 'Longitud' },
  ];

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
  var tablesContainer = document.getElementById('tables-container');
  var tbody = document.getElementById('unidades-tbody');
  var manualTbody = document.getElementById('unidades-manual-tbody');
  var enviarBtn = document.getElementById('enviar-btn');
  var addUnitBtn = document.getElementById('add-unit-btn');
  var captureNoticeEl = document.getElementById('capture-notice');
  var manualUnitsSectionEl = document.getElementById('manual-units-section');

  var confirmModal = document.getElementById('confirm-modal');
  var confirmModalBody = document.getElementById('confirm-modal-body');
  var confirmModalResult = document.getElementById('confirm-modal-result');
  var confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  var confirmSendBtn = document.getElementById('confirm-send-btn');

  var addUnitModal = document.getElementById('add-unit-modal');
  var addUnitForm = document.getElementById('add-unit-form');
  var addUnitError = document.getElementById('add-unit-error');
  var addUnitCancelBtn = document.getElementById('add-unit-cancel-btn');
  var addUnitSubmitBtn = document.getElementById('add-unit-submit-btn');
  var catalogNombreInput = document.getElementById('add-nombre_unidad');
  var catalogSuggestionsEl = document.getElementById('catalog-suggestions');

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

  function formatNumber(n) {
    try {
      return n.toLocaleString('es-MX');
    } catch (e) {
      return String(n);
    }
  }

  function hasAmount(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
  }

  function isCapturada(u) {
    return SURTIMIENTO_FIELDS.every(function (field) {
      return hasAmount(u[field.field]);
    });
  }

  function findUnidad(id) {
    for (var i = 0; i < state.unidades.length; i++) {
      if (state.unidades[i].id === id) return state.unidades[i];
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

  // Las cuentas de una sola unidad (login por CLUES) solo pueden capturar
  // su propia unidad: no agregan unidades nuevas ni hacen el envio final,
  // eso lo sigue haciendo la entidad federativa completa.
  function applyScopeRestrictions(clues) {
    if (!clues) return;
    addUnitBtn.hidden = true;
    enviarBtn.hidden = true;
    if (manualUnitsSectionEl) manualUnitsSectionEl.hidden = true;
    if (captureNoticeEl) {
      captureNoticeEl.innerHTML = 'Tu acceso está limitado a tu propia unidad. Lo que captures se guarda automáticamente; tu entidad federativa se encarga del envío final ante la autoridad.';
    }
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
  function statusBadgeHtml(u) {
    if (isCapturada(u)) {
      return '<span class="status-badge status-capturado">Capturado</span>';
    }
    return '<span class="status-badge status-pendiente">Pendiente</span>';
  }

  function rowHtml(u) {
    var cluesHtml = u.clues
      ? escapeHtml(u.clues)
      : '<em class="clues-pendiente">Sin CLUES</em>';
    return (
      '<tr class="unidad-row" data-id="' + u.id + '" tabindex="0">' +
      '<td class="col-clues">' + cluesHtml + '</td>' +
      '<td class="col-nombre">' + escapeHtml(u.nombre_tipo_establecimiento || '') + '</td>' +
      '<td class="col-nombre-unidad">' + escapeHtml(u.nombre_unidad || '') + '</td>' +
      '<td class="col-estatus">' + statusBadgeHtml(u) + '</td>' +
      '</tr>'
    );
  }

  function renderInto(targetTbody, list, emptyMessage) {
    if (list.length === 0) {
      targetTbody.innerHTML = '<tr class="table-empty-row"><td colspan="4" class="table-empty-note">' + escapeHtml(emptyMessage) + '</td></tr>';
      return;
    }
    var html = new Array(list.length);
    for (var i = 0; i < list.length; i++) {
      html[i] = rowHtml(list[i]);
    }
    targetTbody.innerHTML = html.join('');
  }

  function renderAll() {
    var oficiales = [];
    var manuales = [];
    for (var i = 0; i < state.filtered.length; i++) {
      if (state.filtered[i].origen_manual) manuales.push(state.filtered[i]);
      else oficiales.push(state.filtered[i]);
    }

    tableStatusEl.hidden = true;
    renderInto(tbody, oficiales, 'No se encontraron unidades con ese criterio de búsqueda.');

    var totalManuales = state.unidades.filter(function (u) { return u.origen_manual; }).length;
    var emptyManualMessage = totalManuales === 0
      ? 'Aún no has agregado unidades sin CLUES del padrón oficial.'
      : 'No se encontraron unidades con ese criterio de búsqueda.';
    renderInto(manualTbody, manuales, emptyManualMessage);
  }

  function detailField(label, value) {
    return (
      '<div class="detail-field">' +
      '<span class="detail-label">' + escapeHtml(label) + '</span>' +
      '<span class="detail-value">' + (value ? escapeHtml(value) : '<em>—</em>') + '</span>' +
      '</div>'
    );
  }

  function editableFieldHtml(label, field, id, value) {
    var inputId = 'field-' + field + '-' + id;
    var maxlengthAttr = field === 'clues' ? ' maxlength="11"' : '';
    return (
      '<div class="field detail-editable-field">' +
      '<label for="' + inputId + '">' + escapeHtml(label) + '</label>' +
      '<input type="text" id="' + inputId + '" data-field="' + field + '" data-id="' + id + '"' + maxlengthAttr + ' ' +
      'value="' + escapeHtml(value || '') + '">' +
      '</div>'
    );
  }

  function quantityFieldHtml(field, id, value) {
    var inputId = field.field + '-' + id;
    var inputValue = value === null || value === undefined ? '' : String(value);
    return (
      '<div class="field detail-editable-field">' +
      '<label for="' + inputId + '">' + escapeHtml(field.label) + ' – Cantidad</label>' +
      '<input type="number" id="' + inputId + '" min="0" max="2147483647" step="1" required ' +
      'data-field="' + field.field + '" data-id="' + id + '" value="' + escapeHtml(inputValue) + '">' +
      '</div>'
    );
  }

  function buildDetailRowHtml(u) {
    var id = u.id;
    var infoHtml;

    if (u.origen_manual) {
      var editableFields = '';
      for (var i = 0; i < MANUAL_FIELDS.length; i++) {
        var f = MANUAL_FIELDS[i];
        editableFields += editableFieldHtml(f.label, f.field, id, u[f.field]);
      }
      infoHtml =
        '<p class="manual-unit-note">Unidad agregada manualmente. Puedes corregir estos datos cuando haga falta.</p>' +
        '<div class="detail-grid">' + editableFields + '</div>' +
        '<div class="detail-actions">' +
        '<button type="button" class="btn btn-danger btn-delete-unit" data-id="' + id + '">Eliminar unidad</button>' +
        '</div>';
    } else {
      var infoFields =
        detailField('Nivel de atención', u.nivel_atencion) +
        detailField('Propiedad del inmueble', u.propiedad_inmueble) +
        detailField('Tipología', u.nombre_tipologia) +
        detailField('Municipio', u.municipio) +
        detailField('Localidad', u.localidad) +
        detailField('Asentamiento', u.asentamiento) +
        detailField('Tipo de vialidad', u.tipo_vialidad) +
        detailField('Vialidad', u.vialidad) +
        detailField('Número exterior', u.numero_exterior) +
        detailField('Número interior', u.numero_interior) +
        detailField('Código postal', u.codigo_postal) +
        detailField('Estatus de operación', u.estatus_operacion) +
        detailField('Latitud', u.latitud) +
        detailField('Longitud', u.longitud);
      infoHtml = '<div class="detail-grid">' + infoFields + '</div>';
    }

    var quantitiesHtml = '';
    for (var j = 0; j < SURTIMIENTO_FIELDS.length; j++) {
      var field = SURTIMIENTO_FIELDS[j];
      quantitiesHtml += quantityFieldHtml(field, id, u[field.field]);
    }

    return (
      '<tr class="detail-row" data-id="' + id + '">' +
      '<td colspan="4">' +
      '<div class="detail-panel">' +
      infoHtml +
      '<div class="capture-form">' +
      '<div class="form-group">' +
      '<span class="form-label">Surtimiento de recetas por CLUES, 2025</span>' +
      '<span class="form-label">Cantidad de Recetas:</span>' +
      '<p class="field-hint">Captura una cantidad entera (0 o mayor) en los tres campos para cada CLUES. Todos los campos son obligatorios para completar el envío.</p>' +
      '<div class="detail-grid">' + quantitiesHtml + '</div>' +
      '</div>' +
      '<div class="save-feedback" data-feedback-for="' + id + '"></div>' +
      '</div>' +
      '</div>' +
      '</td>' +
      '</tr>'
    );
  }

  function closeOpenDetail() {
    var openDetail = tablesContainer.querySelector('.detail-row');
    if (openDetail) {
      var prev = openDetail.previousElementSibling;
      if (prev) prev.classList.remove('row-expanded');
      openDetail.parentNode.removeChild(openDetail);
    }
  }

  function toggleRow(tr, idStr) {
    var next = tr.nextElementSibling;
    if (next && next.classList.contains('detail-row') && next.getAttribute('data-id') === idStr) {
      next.parentNode.removeChild(next);
      tr.classList.remove('row-expanded');
      return;
    }
    closeOpenDetail();
    var unidad = findUnidad(Number(idStr));
    if (!unidad) return;
    tr.insertAdjacentHTML('afterend', buildDetailRowHtml(unidad));
    tr.classList.add('row-expanded');
  }

  function handleDeleteUnit(id) {
    var unidad = findUnidad(id);
    if (!unidad) return;
    var nombre = unidad.nombre_unidad || 'esta unidad';
    if (!window.confirm('¿Seguro que quieres eliminar "' + nombre + '"? Esta acción no se puede deshacer.')) {
      return;
    }
    var btn = tablesContainer.querySelector('.btn-delete-unit[data-id="' + id + '"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Eliminando…';
    }
    fetch('/api/unidades/' + id, { method: 'DELETE', credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.data && result.data.error) || 'No se pudo eliminar la unidad.');
        }
        closeOpenDetail();
        state.unidades = state.unidades.filter(function (u) { return u.id !== id; });
        applyFilter(searchInput.value);
        recomputeProgresoLocal();
      })
      .catch(function (err) {
        setFeedback(id, err.message || 'Error al eliminar.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Eliminar unidad';
        }
      });
  }

  tablesContainer.addEventListener('click', function (event) {
    var deleteBtn = event.target.closest('.btn-delete-unit');
    if (deleteBtn) {
      handleDeleteUnit(Number(deleteBtn.getAttribute('data-id')));
      return;
    }
    var tr = event.target.closest('tr.unidad-row');
    if (!tr) return;
    toggleRow(tr, tr.getAttribute('data-id'));
  });

  tablesContainer.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var tr = event.target.closest('tr.unidad-row');
    if (!tr) return;
    event.preventDefault();
    toggleRow(tr, tr.getAttribute('data-id'));
  });

  // ---------------------------------------------------------------------
  // Autoguardado
  // ---------------------------------------------------------------------
  function setFeedback(id, message, type) {
    var el = tablesContainer.querySelector('.save-feedback[data-feedback-for="' + id + '"]');
    if (!el) return;
    el.textContent = message;
    el.className = 'save-feedback' + (type ? ' save-feedback-' + type : '');
  }

  function updateRowVisualsAfterSave(id, field, value) {
    var row = tablesContainer.querySelector('tr.unidad-row[data-id="' + id + '"]');
    if (!row) return;
    if (SURTIMIENTO_FIELDS.some(function (item) { return item.field === field; })) {
      var unidad = findUnidad(id);
      var cell = row.querySelector('.col-estatus');
      if (cell && unidad) cell.innerHTML = statusBadgeHtml(unidad);
      recomputeProgresoLocal();
    }
    if (field === 'clues') {
      var cluesCell = row.querySelector('.col-clues');
      if (cluesCell) {
        cluesCell.innerHTML = value ? escapeHtml(value) : '<em class="clues-pendiente">Sin CLUES</em>';
      }
    } else if (field === 'nombre_tipo_establecimiento') {
      var nombreCell = row.querySelector('.col-nombre');
      if (nombreCell) nombreCell.textContent = value || '';
    } else if (field === 'nombre_unidad') {
      var nombreUnidadCell = row.querySelector('.col-nombre-unidad');
      if (nombreUnidadCell) nombreUnidadCell.textContent = value || '';
    }
  }

  function saveField(id, field, value) {
    setFeedback(id, 'Guardando…', 'saving');
    var body = {};
    body[field] = value;

    return fetch('/api/unidades/' + id, {
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
        var unidad = findUnidad(id);
        if (unidad) {
          unidad[field] = value;
        }
        setFeedback(id, 'Guardado', 'success');
        updateRowVisualsAfterSave(id, field, value);
      })
      .catch(function (err) {
        setFeedback(id, err.message || 'Error al guardar.', 'error');
      });
  }

  function scheduleFieldSave(el) {
    var id = Number(el.getAttribute('data-id'));
    var field = el.getAttribute('data-field');
    var value = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    var key = id + ':' + field;
    if (fieldTimers[key]) {
      clearTimeout(fieldTimers[key]);
    }
    setFeedback(id, 'Escribiendo…', 'saving');
    fieldTimers[key] = setTimeout(function () {
      delete fieldTimers[key];
      saveField(id, field, value);
    }, 700);
  }

  function flushFieldSave(el) {
    var id = Number(el.getAttribute('data-id'));
    var field = el.getAttribute('data-field');
    var key = id + ':' + field;
    if (fieldTimers[key]) {
      clearTimeout(fieldTimers[key]);
      delete fieldTimers[key];
      var value = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
      saveField(id, field, value);
    }
  }

  tablesContainer.addEventListener('input', function (event) {
    var el = event.target;
    if (el.matches('input[type="number"][data-field]') || el.matches('input[type="text"][data-field]')) {
      scheduleFieldSave(el);
    }
  });

  tablesContainer.addEventListener('focusout', function (event) {
    var el = event.target;
    if (el.matches('input[type="number"][data-field]') || el.matches('input[type="text"][data-field]')) {
      flushFieldSave(el);
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
    renderAll();
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
        state.clues = data.clues || null;
        state.unidades = data.unidades || [];
        state.filtered = state.unidades;
        renderAll();
      })
      .catch(function (err) {
        if (err.message === 'no-session') return;
        tableStatusEl.hidden = false;
        tableStatusEl.textContent = err.message || 'Ocurrió un error al cargar las unidades.';
      });
  }

  // ---------------------------------------------------------------------
  // Agregar unidad sin CLUES
  // ---------------------------------------------------------------------
  function openAddUnitModal() {
    addUnitForm.reset();
    addUnitError.hidden = true;
    addUnitError.textContent = '';
    addUnitSubmitBtn.disabled = false;
    addUnitSubmitBtn.textContent = 'Agregar unidad';
    hideCatalogSuggestions();
    addUnitModal.hidden = false;
    var firstInput = addUnitForm.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  function closeAddUnitModal() {
    addUnitModal.hidden = true;
  }

  // ---------------------------------------------------------------------
  // Buscador del catalogo SSA (autocompletar "Agregar unidad")
  // ---------------------------------------------------------------------
  var catalogSearchTimer = null;

  function hideCatalogSuggestions() {
    catalogSuggestionsEl.hidden = true;
    catalogSuggestionsEl.innerHTML = '';
  }

  function catalogResultLine(r) {
    var partes = [r.municipio, r.localidad].filter(Boolean).join(', ');
    if (r.nombre_tipo_establecimiento) {
      partes = partes ? partes + ' · ' + r.nombre_tipo_establecimiento : r.nombre_tipo_establecimiento;
    }
    return partes;
  }

  function renderCatalogSuggestions(resultados, query) {
    if (resultados.length === 0) {
      catalogSuggestionsEl.innerHTML =
        '<div class="catalog-suggestion-empty">Sin coincidencias en el catálogo para "' + escapeHtml(query) + '". Puedes seguir llenando los datos a mano.</div>';
      catalogSuggestionsEl.hidden = false;
      return;
    }

    catalogSuggestionsEl.innerHTML = resultados
      .map(function (r, i) {
        return (
          '<button type="button" class="catalog-suggestion-item" data-index="' + i + '">' +
          '<span class="catalog-suggestion-name">' + escapeHtml(r.nombre_unidad) + '</span>' +
          '<span class="catalog-suggestion-meta">' + escapeHtml(catalogResultLine(r)) + '</span>' +
          '</button>'
        );
      })
      .join('');
    catalogSuggestionsEl.hidden = false;

    catalogSuggestionsEl.querySelectorAll('.catalog-suggestion-item').forEach(function (btn) {
      // mousedown (no click) para que dispare antes del blur del input.
      btn.addEventListener('mousedown', function (event) {
        event.preventDefault();
        var idx = Number(btn.getAttribute('data-index'));
        applyCatalogResult(resultados[idx]);
      });
    });
  }

  function applyCatalogResult(r) {
    var fieldsToFill = [
      'clues', 'nombre_unidad', 'nombre_tipo_establecimiento', 'nivel_atencion',
      'propiedad_inmueble', 'nombre_tipologia', 'municipio', 'localidad',
      'asentamiento', 'tipo_vialidad', 'vialidad', 'numero_exterior',
      'numero_interior', 'codigo_postal', 'estatus_operacion', 'latitud', 'longitud',
    ];
    fieldsToFill.forEach(function (field) {
      var input = addUnitForm.querySelector('[name="' + field + '"]');
      if (input) input.value = r[field] || '';
    });
    hideCatalogSuggestions();
  }

  function searchCatalog(query) {
    fetch('/api/catalogo-ssa?buscar=' + encodeURIComponent(query), { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('busqueda fallida');
        return res.json();
      })
      .then(function (data) {
        if (catalogNombreInput.value.trim() !== query) return; // el usuario ya siguio escribiendo
        renderCatalogSuggestions(data.resultados || [], query);
      })
      .catch(function () {
        hideCatalogSuggestions();
      });
  }

  catalogNombreInput.addEventListener('input', function () {
    var query = catalogNombreInput.value.trim();
    if (catalogSearchTimer) clearTimeout(catalogSearchTimer);
    if (query.length < 2) {
      hideCatalogSuggestions();
      return;
    }
    catalogSearchTimer = setTimeout(function () {
      searchCatalog(query);
    }, 300);
  });

  catalogNombreInput.addEventListener('blur', function () {
    setTimeout(hideCatalogSuggestions, 150);
  });

  addUnitBtn.addEventListener('click', openAddUnitModal);
  addUnitCancelBtn.addEventListener('click', closeAddUnitModal);
  addUnitModal.addEventListener('click', function (event) {
    if (event.target === addUnitModal) closeAddUnitModal();
  });

  addUnitForm.addEventListener('submit', function (event) {
    event.preventDefault();
    addUnitError.hidden = true;
    addUnitError.textContent = '';

    var payload = {};
    for (var i = 0; i < MANUAL_FIELDS.length; i++) {
      var field = MANUAL_FIELDS[i].field;
      var input = addUnitForm.querySelector('[name="' + field + '"]');
      payload[field] = input ? input.value : '';
    }

    if (!payload.nombre_unidad || !payload.nombre_unidad.trim()) {
      addUnitError.hidden = false;
      addUnitError.textContent = 'El nombre de la unidad es obligatorio.';
      return;
    }

    addUnitSubmitBtn.disabled = true;
    addUnitSubmitBtn.textContent = 'Agregando…';

    fetch('/api/unidades', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.data && result.data.error) || 'No se pudo agregar la unidad.');
        }
        closeAddUnitModal();
        return loadUnidades().then(function () {
          applyFilter(searchInput.value);
          recomputeProgresoLocal();
        });
      })
      .catch(function (err) {
        addUnitError.hidden = false;
        addUnitError.textContent = err.message || 'Ocurrió un error al agregar la unidad.';
      })
      .finally(function () {
        addUnitSubmitBtn.disabled = false;
        addUnitSubmitBtn.textContent = 'Agregar unidad';
      });
  });

  // ---------------------------------------------------------------------
  // Envío final
  // ---------------------------------------------------------------------
  function computeSendSummary() {
    var total = state.unidades.length;
    var recetasCompletas = 0;
    var recetasIncompletas = 0;
    var recetasNoSurtidas = 0;
    var pendientes = 0;
    for (var i = 0; i < state.unidades.length; i++) {
      var unidad = state.unidades[i];
      if (hasAmount(unidad.recetas_completas)) recetasCompletas += unidad.recetas_completas;
      if (hasAmount(unidad.recetas_incompletas)) recetasIncompletas += unidad.recetas_incompletas;
      if (hasAmount(unidad.recetas_no_surtidas)) recetasNoSurtidas += unidad.recetas_no_surtidas;
      if (!isCapturada(unidad)) pendientes++;
    }
    return {
      total: total,
      recetasCompletas: recetasCompletas,
      recetasIncompletas: recetasIncompletas,
      recetasNoSurtidas: recetasNoSurtidas,
      pendientes: pendientes,
    };
  }

  function openConfirmModal() {
    var summary = computeSendSummary();
    confirmModalBody.innerHTML =
      '<p>Estás a punto de generar y subir el archivo de captura para <strong>' + escapeHtml(state.estado || '') + '</strong>.</p>' +
      '<ul class="summary-list">' +
      '<li><strong>' + formatNumber(summary.total) + '</strong> unidades en total</li>' +
      '<li><strong>' + formatNumber(summary.recetasCompletas) + '</strong> recetas completas</li>' +
      '<li><strong>' + formatNumber(summary.recetasIncompletas) + '</strong> recetas incompletas</li>' +
      '<li><strong>' + formatNumber(summary.recetasNoSurtidas) + '</strong> recetas no surtidas</li>' +
      '<li><strong>' + formatNumber(summary.total - summary.pendientes) + '</strong> unidades con las tres cantidades capturadas</li>' +
      '<li><strong>' + formatNumber(summary.pendientes) + '</strong> unidades pendientes de completar las tres cantidades</li>' +
      '</ul>' +
      (summary.pendientes > 0
        ? '<p>Puedes enviar tu avance ahora y continuar después. Las unidades pendientes se enviarán con las cantidades vacías.</p>'
        : '<p>Todas las unidades tienen sus cantidades capturadas.</p>') +
      '<p>Puedes enviar las veces que necesites: cada envío reemplaza al anterior y en Drive solo queda la última versión.</p>';
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
        state.label = me.label || me.estado;
        state.clues = me.clues || null;
        estadoNombreEl.textContent = state.label;
        applyScopeRestrictions(state.clues);
      }
      return Promise.all([loadUnidades(), loadProgreso()]);
    })
    .catch(function (err) {
      if (err.message === 'no-session') return;
    });
})();
