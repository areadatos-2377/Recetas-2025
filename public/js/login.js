(function () {
  'use strict';

  var estadoSelect = document.getElementById('estado');
  var passwordInput = document.getElementById('password');
  var form = document.getElementById('login-form');
  var submitBtn = document.getElementById('login-submit');
  var errorBox = document.getElementById('login-error');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Entrando…' : 'Entrar';
  }

  function loadEstados() {
    fetch('/api/estados', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('No se pudo cargar la lista de entidades.');
        return res.json();
      })
      .then(function (data) {
        var estados = (data && data.estados) || [];
        estadoSelect.innerHTML = '';

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecciona tu entidad';
        estadoSelect.appendChild(placeholder);

        estados.forEach(function (estado) {
          var opt = document.createElement('option');
          opt.value = estado;
          opt.textContent = estado;
          estadoSelect.appendChild(opt);
        });

        estadoSelect.disabled = false;
      })
      .catch(function (err) {
        estadoSelect.innerHTML = '<option value="">No se pudo cargar</option>';
        showError(err.message || 'No se pudo cargar la lista de entidades.');
      });
  }

  function handleSubmit(event) {
    event.preventDefault();
    hideError();

    var estado = estadoSelect.value;
    var password = passwordInput.value;

    if (!estado) {
      showError('Selecciona tu entidad federativa.');
      return;
    }
    if (!password) {
      showError('Ingresa tu contraseña.');
      return;
    }

    setLoading(true);

    fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: estado, password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.data && result.data.error) || 'No se pudo iniciar sesión.');
        }
        window.location.href = 'app.html';
      })
      .catch(function (err) {
        showError(err.message || 'Ocurrió un error al iniciar sesión.');
        setLoading(false);
      });
  }

  form.addEventListener('submit', handleSubmit);
  loadEstados();
})();
