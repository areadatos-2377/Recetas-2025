(function () {
  'use strict';

  var logoutBtn = document.getElementById('logout-btn');
  var nationalSummaryEl = document.getElementById('national-summary');
  var focusGridEl = document.getElementById('story-focus-grid');
  var tableStatusEl = document.getElementById('table-status');
  var tbody = document.getElementById('resumen-tbody');
  var table = document.getElementById('resumen-table');
  var quickFilters = document.getElementById('quick-filters');

  var rows = [];
  var sortKey = 'porcentaje';
  var sortDir = 'asc';
  var activeFilter = 'all';

  function goToLogin() {
    window.location.href = 'control-login.html';
  }

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

  function formatFecha(iso) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return iso;
    }
  }

  function progressPercent(row) {
    return row.total > 0 ? Math.round((row.capturadas / row.total) * 100) : 0;
  }

  function validationCount(row) {
    return (row.incluidas || 0) + (row.excluidas || 0) + (row.manuales || 0);
  }

  function getGlobalStatus(pct, enviaron, totalEntidades) {
    var participation = totalEntidades > 0 ? enviaron / totalEntidades : 0;
    if (pct >= 80 && participation >= 0.8) {
      return { label: 'Estado: En ruta', className: 'status-ok' };
    }
    if (pct >= 35 || participation >= 0.45) {
      return { label: 'Estado: Requiere impulso', className: 'status-watch' };
    }
    return { label: 'Estado: Critico', className: 'status-critical' };
  }

  function topRows(list, count, scoreFn) {
    return list
      .slice()
      .sort(function (a, b) {
        return scoreFn(b) - scoreFn(a);
      })
      .slice(0, count);
  }

  function latestSentRows(count) {
    return rows
      .filter(function (r) {
        return r.ultimoEnvio;
      })
      .slice()
      .sort(function (a, b) {
        return new Date(b.ultimoEnvio.creadoEn).getTime() - new Date(a.ultimoEnvio.creadoEn).getTime();
      })
      .slice(0, count);
  }

  function renderEntityList(list, valueFn, emptyText) {
    if (list.length === 0) {
      return '<p class="focus-empty">' + escapeHtml(emptyText) + '</p>';
    }
    return (
      '<ol class="focus-list">' +
      list
        .map(function (r) {
          return (
            '<li>' +
            '<span>' + escapeHtml(r.estado) + '</span>' +
            '<strong>' + escapeHtml(valueFn(r)) + '</strong>' +
            '</li>'
          );
        })
        .join('') +
      '</ol>'
    );
  }

  function renderFileChip(envio) {
    var fileName = envio.archivoNombre || 'Archivo enviado';
    var fileUrl = envio.archivoUrl || envio.descargaUrl || envio.url;
    if (fileUrl) {
      return '<a class="file-chip" href="' + escapeHtml(fileUrl) + '" title="Descargar ' + escapeHtml(fileName) + '" download>XLSX</a>';
    }
    return '<span class="file-chip file-chip-static" title="' + escapeHtml(fileName) + '">XLSX</span>';
  }

  logoutBtn.addEventListener('click', function () {
    logoutBtn.disabled = true;
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .then(goToLogin);
  });

  function checkSession() {
    return fetch('/api/admin/me', { credentials: 'same-origin' }).then(function (res) {
      if (res.status === 401) {
        goToLogin();
        return Promise.reject(new Error('no-session'));
      }
      if (!res.ok) return Promise.reject(new Error('Error al verificar la sesión.'));
      return res.json();
    });
  }

  function renderNationalSummary() {
    var total = 0;
    var capturadas = 0;
    var enviaron = 0;
    var observaciones = 0;
    rows.forEach(function (r) {
      total += r.total;
      capturadas += r.capturadas;
      observaciones += validationCount(r);
      if (r.ultimoEnvio) enviaron++;
    });
    var pct = total > 0 ? Math.round((capturadas / total) * 1000) / 10 : 0;
    var status = getGlobalStatus(pct, enviaron, rows.length);
    var pendientes = rows.length - enviaron;
    var pendingRows = rows.filter(function (r) {
      return !r.ultimoEnvio;
    });
    var riskRows = topRows(pendingRows, 3, function (r) {
      return r.total - r.capturadas;
    });
    var activeRows = latestSentRows(3);
    var observationRows = topRows(rows, 3, validationCount);
    var headline =
      enviaron === 0
        ? 'Ninguna entidad ha iniciado reporte'
        : 'Solo ' + enviaron + ' de ' + rows.length + ' entidades han iniciado reporte';
    var pctText = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);

    nationalSummaryEl.innerHTML =
      '<div class="story-hero-copy">' +
      '<span class="state-pill ' + status.className + '">' + status.label + '</span>' +
      '<h2>' + escapeHtml(headline) + '</h2>' +
      '<p>Se han capturado <strong>' + formatNumber(capturadas) + '</strong> de <strong>' + formatNumber(total) + '</strong> unidades a nivel nacional. El avance acumulado es de <strong>' + pctText + '%</strong>.</p>' +
      '</div>' +
      '<div class="story-hero-meter" aria-label="Avance nacional">' +
      '<div class="meter-value">' + pctText + '%</div>' +
      '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + Math.min(100, pct) + '%"></div></div>' +
      '<div class="meter-meta"><span>' + formatNumber(capturadas) + ' capturadas</span><span>' + formatNumber(total - capturadas) + ' pendientes</span></div>' +
      '</div>';

    focusGridEl.innerHTML =
      '<article class="focus-card focus-risk">' +
      '<div class="focus-card-head"><span>Zona de mayor riesgo</span><small>Requiere seguimiento</small></div>' +
      '<p class="focus-card-copy">' + pendientes + ' entidades siguen sin enviar. Prioridad por volumen pendiente:</p>' +
      renderEntityList(riskRows, function (r) { return formatNumber(r.total - r.capturadas) + ' pendientes'; }, 'No hay entidades pendientes.') +
      '</article>' +
      '<article class="focus-card focus-active">' +
      '<div class="focus-card-head"><span>Entidades activas</span><small>Cumplimiento reciente</small></div>' +
      '<p class="focus-card-copy">' + enviaron + ' entidades ya registraron al menos un envio.</p>' +
      renderEntityList(activeRows, function (r) { return formatFecha(r.ultimoEnvio.creadoEn); }, 'Todavia no hay envios confirmados.') +
      '</article>' +
      '<article class="focus-card focus-validation">' +
      '<div class="focus-card-head"><span>Hallazgos de validacion</span><small>Revision operativa</small></div>' +
      '<p class="focus-card-copy">' + formatNumber(observaciones) + ' registros requieren lectura por incluir, excluir o no contar con CLUES.</p>' +
      renderEntityList(observationRows, function (r) { return formatNumber(validationCount(r)) + ' hallazgos'; }, 'No hay hallazgos acumulados.') +
      '</article>';

    updateFilterLabels();
  }

  function updateFilterLabels() {
    var counts = {
      all: rows.length,
      pending: rows.filter(function (r) { return !r.ultimoEnvio; }).length,
      sent: rows.filter(function (r) { return !!r.ultimoEnvio; }).length,
      observations: rows.filter(function (r) { return validationCount(r) > 0; }).length,
    };
    quickFilters.querySelectorAll('[data-filter]').forEach(function (btn) {
      var filter = btn.getAttribute('data-filter');
      var base = btn.textContent.replace(/\s+\(\d+\)$/, '');
      btn.textContent = base + ' (' + counts[filter] + ')';
    });
  }

  function rowHtml(r) {
    var pct = progressPercent(r);
    var ultimo = r.ultimoEnvio
      ? '<span class="send-pill send-pill-ok">Enviado</span><span class="send-date">' + escapeHtml(formatFecha(r.ultimoEnvio.creadoEn)) + '</span>' +
        renderFileChip(r.ultimoEnvio)
      : '<span class="send-pill send-pill-pending">Sin enviar</span>';
    return (
      '<tr>' +
      '<td>' + escapeHtml(r.estado) + '</td>' +
      '<td>' + formatNumber(r.total) + '</td>' +
      '<td>' + formatNumber(r.capturadas) + '</td>' +
      '<td><div class="table-progress-cell"><span>' + pct + '%</span><div class="mini-progress-track"><div class="mini-progress-fill" style="width:' + pct + '%"></div></div></div></td>' +
      '<td>' + formatNumber(r.incluidas) + '</td>' +
      '<td>' + formatNumber(r.excluidas) + '</td>' +
      '<td>' + formatNumber(r.ratificadas) + '</td>' +
      '<td>' + formatNumber(r.manuales) + '</td>' +
      '<td>' + ultimo + '</td>' +
      '</tr>'
    );
  }

  function sortedRows() {
    var source = rows.filter(function (r) {
      if (activeFilter === 'pending') return !r.ultimoEnvio;
      if (activeFilter === 'sent') return !!r.ultimoEnvio;
      if (activeFilter === 'observations') return validationCount(r) > 0;
      return true;
    });
    var withPct = source.map(function (r) {
      return Object.assign({}, r, { porcentaje: r.total > 0 ? (r.capturadas / r.total) * 100 : 0 });
    });
    withPct.sort(function (a, b) {
      var av = sortKey === 'ultimoEnvio' ? (a.ultimoEnvio ? a.ultimoEnvio.creadoEn : '') : a[sortKey];
      var bv = sortKey === 'ultimoEnvio' ? (b.ultimoEnvio ? b.ultimoEnvio.creadoEn : '') : b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      av = av || 0;
      bv = bv || 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return withPct;
  }

  function render() {
    var list = sortedRows();
    if (list.length === 0) {
      tbody.innerHTML = '';
      tableStatusEl.hidden = false;
      tableStatusEl.textContent = rows.length === 0 ? 'No hay datos todavia.' : 'No hay entidades para este filtro.';
      return;
    }
    tableStatusEl.hidden = true;
    tbody.innerHTML = list.map(rowHtml).join('');
  }

  table.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = 'asc';
      }
      render();
    });
  });

  quickFilters.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.getAttribute('data-filter');
    quickFilters.querySelectorAll('[data-filter]').forEach(function (item) {
      item.classList.toggle('is-active', item === btn);
    });
    render();
  });

  function loadResumen() {
    tableStatusEl.hidden = false;
    tableStatusEl.textContent = 'Cargando…';
    return fetch('/api/admin/resumen', { credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) {
          goToLogin();
          return Promise.reject(new Error('no-session'));
        }
        if (!res.ok) throw new Error('No se pudo cargar el resumen.');
        return res.json();
      })
      .then(function (data) {
        rows = data.resumen || [];
        renderNationalSummary();
        render();
      })
      .catch(function (err) {
        if (err.message === 'no-session') return;
        tableStatusEl.hidden = false;
        tableStatusEl.textContent = err.message || 'Ocurrió un error al cargar el resumen.';
      });
  }

  checkSession()
    .then(loadResumen)
    .catch(function (err) {
      if (err.message === 'no-session') return;
    });
})();
