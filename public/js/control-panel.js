(function () {
  'use strict';

  var logoutBtn = document.getElementById('logout-btn');
  var nationalSummaryEl = document.getElementById('national-summary');
  var tableStatusEl = document.getElementById('table-status');
  var tbody = document.getElementById('resumen-tbody');
  var table = document.getElementById('resumen-table');

  var rows = [];
  var sortKey = 'porcentaje';
  var sortDir = 'asc';

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
    rows.forEach(function (r) {
      total += r.total;
      capturadas += r.capturadas;
      if (r.ultimoEnvio) enviaron++;
    });
    var pct = total > 0 ? Math.round((capturadas / total) * 100) : 0;

    nationalSummaryEl.innerHTML =
      '<div class="progress-info">' +
      '<strong>' + formatNumber(capturadas) + '</strong> de <strong>' + formatNumber(total) + '</strong> unidades capturadas a nivel nacional (' + pct + '%)' +
      ' &middot; <strong>' + enviaron + '</strong> de <strong>' + rows.length + '</strong> entidades ya enviaron al menos una vez' +
      '</div>' +
      '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>';
  }

  function rowHtml(r) {
    var pct = r.total > 0 ? Math.round((r.capturadas / r.total) * 100) : 0;
    var ultimo = r.ultimoEnvio
      ? escapeHtml(formatFecha(r.ultimoEnvio.creadoEn)) + '<br><span class="detail-label">' + escapeHtml(r.ultimoEnvio.archivoNombre) + '</span>'
      : '<em class="clues-pendiente">Sin enviar</em>';
    return (
      '<tr>' +
      '<td>' + escapeHtml(r.estado) + '</td>' +
      '<td>' + formatNumber(r.total) + '</td>' +
      '<td>' + formatNumber(r.capturadas) + '</td>' +
      '<td>' + pct + '%</td>' +
      '<td>' + formatNumber(r.incluidas) + '</td>' +
      '<td>' + formatNumber(r.excluidas) + '</td>' +
      '<td>' + formatNumber(r.ratificadas) + '</td>' +
      '<td>' + formatNumber(r.manuales) + '</td>' +
      '<td>' + ultimo + '</td>' +
      '</tr>'
    );
  }

  function sortedRows() {
    var withPct = rows.map(function (r) {
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
      tableStatusEl.textContent = 'No hay datos todavía.';
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
