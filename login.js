// login.js — Login + Sign-up UI for Trident OS v4
// Renders full-screen login overlay when user not authenticated.

import { signIn, signUp, resetPassword } from "./auth.js";

let mode = "signin"; // signin | signup | reset

export function renderLogin(rootEl) {
  // rootEl could be #login-root inside #app-root · or directly #app-root
  rootEl.innerHTML = `
    <div class="auth-overlay">
      <div class="auth-card">
        <div class="auth-brand">
          <span class="auth-logo">⚓</span>
          <h1>Trident OS <span class="auth-version">v4</span></h1>
          <p class="auth-tagline">Sistema operativo · Capitán del Marketing</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${mode === "signin" ? "auth-tab--active" : ""}" data-mode="signin">Iniciar sesión</button>
          <button class="auth-tab ${mode === "signup" ? "auth-tab--active" : ""}" data-mode="signup">Crear cuenta</button>
          <button class="auth-tab ${mode === "reset" ? "auth-tab--active" : ""}" data-mode="reset">Recuperar</button>
        </div>

        <div class="auth-body" id="auth-body"></div>

        <p class="auth-footer">QUWWA LLC dba Capitán del Marketing · New Mexico · USA</p>
      </div>
    </div>
  `;

  rootEl.querySelectorAll(".auth-tab").forEach(t => {
    t.addEventListener("click", () => {
      mode = t.dataset.mode;
      renderLogin(rootEl);
    });
  });

  renderForm();
}

function renderForm() {
  const body = document.getElementById("auth-body");
  if (mode === "signin") body.innerHTML = signInFormHTML();
  if (mode === "signup") body.innerHTML = signUpFormHTML();
  if (mode === "reset")  body.innerHTML = resetFormHTML();
  wireForm();
}

function signInFormHTML() {
  return `
    <form id="auth-form" class="auth-form">
      <label>
        <span>Email</span>
        <input type="email" name="email" required autocomplete="email" placeholder="tu@email.com">
      </label>
      <label>
        <span>Contraseña</span>
        <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
      </label>
      <div class="auth-error" id="auth-error" hidden></div>
      <button type="submit" class="btn btn--primary auth-submit">Iniciar sesión</button>
      <p class="auth-hint">¿No tenés cuenta? Click "Crear cuenta" arriba.</p>
    </form>
  `;
}

function signUpFormHTML() {
  return `
    <form id="auth-form" class="auth-form">
      <label>
        <span>Nombre para mostrar</span>
        <input type="text" name="displayName" required placeholder="Ej. Damian Silva">
      </label>
      <label>
        <span>Email</span>
        <input type="email" name="email" required autocomplete="email" placeholder="tu@email.com">
      </label>
      <label>
        <span>Contraseña (mín 6 caracteres)</span>
        <input type="password" name="password" required minlength="6" autocomplete="new-password" placeholder="••••••••">
      </label>
      <label>
        <span>Tipo de cuenta</span>
        <select name="role" required>
          <option value="operator">Operador (Damian · Oscar · equipo Capitán)</option>
          <option value="client">Cliente (Realtor)</option>
        </select>
      </label>
      <div class="auth-error" id="auth-error" hidden></div>
      <button type="submit" class="btn btn--primary auth-submit">Crear cuenta</button>
      <p class="auth-hint">Los operadores ven todo. Los clientes ven solo SU workspace.</p>
    </form>
  `;
}

function resetFormHTML() {
  return `
    <form id="auth-form" class="auth-form">
      <label>
        <span>Email de la cuenta</span>
        <input type="email" name="email" required autocomplete="email" placeholder="tu@email.com">
      </label>
      <div class="auth-error" id="auth-error" hidden></div>
      <button type="submit" class="btn btn--primary auth-submit">Enviar enlace de recuperación</button>
      <p class="auth-hint">Te llega un email para crear nueva contraseña.</p>
    </form>
  `;
}

function wireForm() {
  const form = document.getElementById("auth-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector(".auth-submit");
    const err = document.getElementById("auth-error");
    btn.disabled = true;
    btn.textContent = "Procesando…";
    err.hidden = true;

    let res;
    if (mode === "signin") {
      res = await signIn(data.email, data.password);
    } else if (mode === "signup") {
      res = await signUp(data.email, data.password, data.role, null, data.displayName);
    } else if (mode === "reset") {
      res = await resetPassword(data.email);
      if (res.ok) {
        err.hidden = false;
        err.className = "auth-error auth-error--ok";
        err.textContent = "✓ Te enviamos un email para recuperar tu contraseña. Revisá tu bandeja.";
        btn.disabled = false;
        btn.textContent = "Enviar enlace de recuperación";
        return;
      }
    }

    if (!res.ok) {
      err.hidden = false;
      err.className = "auth-error";
      err.textContent = res.error;
      btn.disabled = false;
      btn.textContent = mode === "signin" ? "Iniciar sesión" : mode === "signup" ? "Crear cuenta" : "Enviar enlace de recuperación";
      return;
    }
    // Success: onAuthStateChanged will re-render the app
    const successMsg = mode === "signup"
      ? `¡Bienvenido, ${data.displayName || data.email}! Cuenta creada.`
      : `¡Hola de nuevo!`;
    window.notifyInfo?.(successMsg, "ok");
  });
}
