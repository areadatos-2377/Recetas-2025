(function () {
  'use strict';

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

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    hideError();

    var password = passwordInput.value;
    if (!password) {
      showError('Ingresa la contraseña.');
      return;
    }

    setLoading(true);

    fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password }),
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
        window.location.href = 'control-panel.html';
      })
      .catch(function (err) {
        showError(err.message || 'Ocurrió un error al iniciar sesión.');
        setLoading(false);
      });
  });
})();
