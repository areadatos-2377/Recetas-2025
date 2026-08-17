(function () {
  'use strict';

  var logoutBtn = document.getElementById('logout-btn');
  var nationalSummaryEl = document.getElementById('national-summary');
  var focusGridEl = document.getElementById('story-focus-grid');
  var tableStatusEl = document.getElementById('table-status');
  var tbody = document.getElementById('resumen-tbody');
  var table = document.getElementById('resumen-table');
  var quickFilters = document.getElementById('quick-filters');
  var viewSwitcher = document.getElementById('view-switcher');
  var chartContainerEl = document.getElementById('chart-container');
  var tableScrollWrap = document.getElementById('table-scroll-wrap');
  var operationsTitleEl = document.getElementById('operations-title');

  var rows = [];
  var sortKey = 'porcentaje';
  var sortDir = 'asc';
  var activeFilter = 'all';
  var currentView = 'table';

  var DEFAULT_TABLE_TITLE = 'Las 25 entidades, de menor a mayor avance';

  var CHART_VIEWS = {
    'pct-all': {
      title: 'Avance porcentual por entidad',
      theme: 'accent',
      getList: function () { return sortDescByPct(rows); },
      valueLabel: function (r) { return progressPercent(r) + '%'; },
      emptyText: 'No hay datos todavía.',
    },
    'abs-all': {
      title: 'Avance en unidades por entidad',
      theme: 'info',
      getList: function () { return sortDescByPct(rows); },
      valueLabel: function (r) { return formatNumber(r.capturadas) + ' / ' + formatNumber(r.total); },
      emptyText: 'No hay datos todavía.',
    },
    pending: {
      title: 'Entidades sin enviar',
      theme: 'risk',
      getList: function () { return sortDescByPct(rows.filter(function (r) { return !r.ultimoEnvio; })); },
      valueLabel: function (r) { return formatNumber(r.capturadas) + ' / ' + formatNumber(r.total); },
      emptyText: 'Todas las entidades ya enviaron su reporte.',
    },
    sent: {
      title: 'Entidades que ya enviaron',
      theme: 'good',
      getList: function () { return sortDescByPct(rows.filter(function (r) { return !!r.ultimoEnvio; })); },
      valueLabel: function (r) { return formatNumber(r.capturadas) + ' / ' + formatNumber(r.total); },
      emptyText: 'Todavía no hay envíos registrados.',
    },
  };

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

  function pluralize(n, singular, plural) {
    return formatNumber(n) + ' ' + (n === 1 ? singular : plural);
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

  // Ranking en barras horizontales (magnitud de unidades pendientes por
  // entidad), a diferencia de renderEntityList que solo compara texto.
  function renderRankList(list, maxValue, emptyText) {
    if (list.length === 0) {
      return '<p class="focus-empty">' + escapeHtml(emptyText) + '</p>';
    }
    return (
      '<div class="rank-list">' +
      list
        .map(function (r) {
          var value = r.total - r.capturadas;
          var width = maxValue > 0 ? Math.max(4, Math.round((value / maxValue) * 100)) : 0;
          return (
            '<div class="rank-row-wrap">' +
            '<div class="rank-top"><span>' + escapeHtml(r.estado) + '</span><strong>' + pluralize(value, 'pendiente', 'pendientes') + '</strong></div>' +
            '<div class="track"><div class="fill" style="width:' + width + '%"></div></div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function sortDescByPct(list) {
    return list.slice().sort(function (a, b) { return progressPercent(b) - progressPercent(a); });
  }

  // Barras de avance por entidad para las vistas de grafico (una entidad
  // por fila, ancho de barra = % de avance de esa entidad).
  function renderBarChart(list, cfg) {
    if (list.length === 0) {
      return '<p class="focus-empty">' + escapeHtml(cfg.emptyText) + '</p>';
    }
    return (
      '<div class="chart-bars chart-theme-' + cfg.theme + '">' +
      list
        .map(function (r) {
          var pct = progressPercent(r);
          return (
            '<div class="chart-bar-row">' +
            '<div class="chart-bar-top"><span>' + escapeHtml(r.estado) + '</span><strong>' + escapeHtml(cfg.valueLabel(r)) + '</strong></div>' +
            '<div class="chart-bar-track"><div class="chart-bar-fill" style="width:' + pct + '%"></div></div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderChart(viewKey) {
    var cfg = CHART_VIEWS[viewKey];
    chartContainerEl.innerHTML = renderBarChart(cfg.getList(), cfg);
  }

  function applyView(view) {
    currentView = view;
    viewSwitcher.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-view') === view);
    });
    quickFilters.hidden = view !== 'table';

    if (view === 'table') {
      chartContainerEl.hidden = true;
      tableScrollWrap.hidden = false;
      operationsTitleEl.textContent = DEFAULT_TABLE_TITLE;
      render();
    } else {
      tableScrollWrap.hidden = true;
      tableStatusEl.hidden = true;
      chartContainerEl.hidden = false;
      operationsTitleEl.textContent = CHART_VIEWS[view].title;
      renderChart(view);
    }
  }

  viewSwitcher.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-view]');
    if (!btn) return;
    applyView(btn.getAttribute('data-view'));
  });

  function renderFileLink(envio) {
    var fileUrl = envio.archivoUrl || envio.descargaUrl || envio.url;
    if (!fileUrl) return '';
    return '<a class="file-link" href="' + escapeHtml(fileUrl) + '" target="_blank" rel="noopener noreferrer">Ver archivo</a>';
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
    var pctText = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);
    var pendientes = rows.length - enviaron;

    var pendingRows = rows.filter(function (r) {
      return !r.ultimoEnvio;
    });
    var riskRows = topRows(pendingRows, 5, function (r) {
      return r.total - r.capturadas;
    });
    var maxPendiente = riskRows.length > 0 ? (riskRows[0].total - riskRows[0].capturadas) : 0;
    var activeRows = latestSentRows(4);
    var observationRows = topRows(rows, 4, validationCount);

    var entidadesConCaptura = rows.filter(function (r) { return r.capturadas > 0; }).length;

    var headline;
    if (capturadas === 0 && enviaron === 0) {
      headline = 'El levantamiento del padrón todavía no arranca en ninguna entidad';
    } else if (enviaron === rows.length) {
      headline = 'Las ' + rows.length + ' entidades ya iniciaron su reporte';
    } else if (enviaron > 0) {
      headline = 'Solo ' + enviaron + ' de ' + rows.length + ' entidades han iniciado su reporte';
    } else {
      headline = entidadesConCaptura + ' de ' + rows.length + ' entidades ya están capturando información, pero ninguna ha enviado su reporte todavía';
    }

    var hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });

    nationalSummaryEl.innerHTML =
      '<p class="eyebrow">Avance nacional · corte al ' + escapeHtml(hoy) + '</p>' +
      '<h1>' + escapeHtml(headline) + '</h1>' +
      '<p>Se han capturado <strong>' + formatNumber(capturadas) + '</strong> de <strong>' + formatNumber(total) + '</strong> unidades a nivel nacional. El avance acumulado es de <strong>' + pctText + '%</strong>.</p>' +
      '<div class="hero-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pctText + '">' +
      '<div class="hero-progress-track"><div class="hero-progress-fill" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<div class="stat-row">' +
      '<div class="stat"><b>' + pctText + '%</b><span>avance nacional</span></div>' +
      '<div class="stat"><b>' + formatNumber(capturadas) + '</b><span>unidades capturadas</span></div>' +
      '<div class="stat"><b>' + enviaron + ' / ' + rows.length + '</b><span>entidades con envío registrado</span></div>' +
      '</div>';

    focusGridEl.innerHTML =
      '<div class="insight-col">' +
      '<p class="eyebrow">Mayor volumen pendiente</p>' +
      '<h3>Dónde concentrar el seguimiento</h3>' +
      '<p class="insight-col-copy">' + pluralize(pendientes, 'entidad sigue', 'entidades siguen') + ' sin enviar. Prioridad por volumen pendiente:</p>' +
      renderRankList(riskRows, maxPendiente, 'No hay entidades pendientes.') +
      '</div>' +
      '<div class="insight-col">' +
      '<p class="eyebrow">Entidades activas</p>' +
      '<h3>Cumplimiento reciente</h3>' +
      '<p class="insight-col-copy">' + pluralize(enviaron, 'entidad ya registró', 'entidades ya registraron') + ' al menos un envío.</p>' +
      renderEntityList(activeRows, function (r) { return formatFecha(r.ultimoEnvio.creadoEn); }, 'Todavía no hay envíos confirmados.') +
      '</div>' +
      '<div class="insight-col">' +
      '<p class="eyebrow">Hallazgos de validación</p>' +
      '<h3>Revisión operativa</h3>' +
      '<p class="insight-col-copy">' + pluralize(observaciones, 'registro requiere', 'registros requieren') + ' lectura por incluir, excluir o no contar con CLUES.</p>' +
      renderEntityList(observationRows, function (r) { return pluralize(validationCount(r), 'hallazgo', 'hallazgos'); }, 'No hay hallazgos acumulados.') +
      '</div>';

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
    var pctClass = pct >= 60 ? 'pct-good' : 'pct-risk';
    var ultimo = r.ultimoEnvio
      ? '<span class="chip chip-sent">Enviado</span>' +
        '<span class="send-date">' + escapeHtml(formatFecha(r.ultimoEnvio.creadoEn)) + '</span>' +
        renderFileLink(r.ultimoEnvio)
      : '<span class="chip chip-pending">Sin enviar</span>';
    return (
      '<tr>' +
      '<td>' + escapeHtml(r.estado) + '</td>' +
      '<td class="num">' + formatNumber(r.total) + '</td>' +
      '<td class="num">' + formatNumber(r.capturadas) + '</td>' +
      '<td class="num ' + pctClass + '">' + pct + '%</td>' +
      '<td class="num">' + formatNumber(r.incluidas) + '</td>' +
      '<td class="num">' + formatNumber(r.excluidas) + '</td>' +
      '<td class="num">' + formatNumber(r.ratificadas) + '</td>' +
      '<td class="num">' + formatNumber(r.manuales) + '</td>' +
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
        applyView(currentView);
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
