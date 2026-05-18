// main.js — Router + Auth integration · Trident OS v4

import { initDB, dbStatus } from "./db.js";
import { initAuth, onAuthChange, getCurrentUser, isOperator, isClient, signOut } from "./auth.js";
import { renderLogin } from "./login.js";
import { loadSkills } from "./admin.js";
import { startWizard } from "./wizard.js";
import { renderClientsTab } from "./clients.js";
import { renderPillarsTab } from "./pillars.js";
import { renderUsersAdmin } from "./users-admin.js";
import { renderClientWorkspace, cleanupWorkspace } from "./workspace.js";
import { confirmDialog } from "./modal.js";

// ============ INIT ============
const dbInit = initDB();

// Register auth listener FIRST · then init Auth so the listener catches the first state event
onAuthChange((user) => {
  if (!user) {
    renderUnauthenticated();
  } else {
    renderAuthenticated(user);
  }
});

const authInit = initAuth();
console.log("[main] DB:", dbInit, "Auth:", authInit);

// Force initial render if no user (auth listener fires only AFTER Firebase confirms state)
// Safety net: render login after 800ms if still no body content
setTimeout(() => {
  const root = document.getElementById("app-root");
  if (root && root.innerHTML.includes("Cargando Trident OS")) {
    console.log("[main] Safety net · forcing login render (auth never fired)");
    renderUnauthenticated();
  }
}, 1500);

// ============ UNAUTH ============
function renderUnauthenticated() {
  document.getElementById("app-root").innerHTML = `<div id="login-root"></div>`;
  renderLogin(document.getElementById("login-root"));
}

// ============ AUTH ============
function renderAuthenticated(user) {
  // Restore the original layout
  document.getElementById("app-root").innerHTML = `
    <header class="top-bar">
      <div class="brand">
        <span class="logo">⚓</span>
        <div>
          <h1>Trident OS <span class="version">v4</span></h1>
          <p class="tagline">Sistema operativo de Capitán del Marketing</p>
        </div>
      </div>
      <nav class="status-pill" id="connection-status">
        <span class="dot dot--ok"></span>
        <span id="connection-text">Conectando…</span>
      </nav>
      <div class="user-pill">
        <span class="user-pill__role">${roleBadgeForPill(user.role)}</span>
        <span class="user-pill__email">${escape(user.displayName || user.email)}</span>
        <button class="btn btn--ghost btn-signout" id="btn-signout">Salir</button>
      </div>
    </header>

    <nav class="tabs" id="main-tabs"></nav>

    <main id="main-content">
      <section class="tab-panel tab-panel--active" id="panel-admin"></section>
      <section class="tab-panel" id="panel-onboarding"></section>
      <section class="tab-panel" id="panel-clients"></section>
      <section class="tab-panel" id="panel-pillars"></section>
      <section class="tab-panel" id="panel-users"></section>
      <section class="tab-panel" id="panel-workspace"></section>
    </main>

    <footer class="footer">
      <span>QUWWA LLC dba Capitán del Marketing · New Mexico · USA</span>
      <span id="footer-version">Trident OS v4 · Auth + Roles</span>
    </footer>
  `;

  // Render tabs based on role
  const tabsHTML = isOperator()
    ? `
        <button class="tab tab--active" data-tab="admin">Neural Infrastructure</button>
        <button class="tab" data-tab="onboarding">Onboarding Wizard</button>
        <button class="tab" data-tab="clients">Clientes</button>
        <button class="tab" data-tab="pillars">Pilares</button>
        <button class="tab" data-tab="users">Usuarios</button>
      `
    : user.role === "pending"
      ? `<button class="tab tab--active" data-tab="pending">Cuenta pendiente</button>`
      : `<button class="tab tab--active" data-tab="workspace">Mi Workspace</button>`;
  document.getElementById("main-tabs").innerHTML = tabsHTML;

  // Wire tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  // Wire sign-out · with confirm dialog
  document.getElementById("btn-signout").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Cerrar sesión",
      body: `¿Cerrar sesión de ${user.email}?`,
      confirmLabel: "Cerrar sesión",
      cancelLabel: "Quedarme"
    });
    if (ok) await signOut();
  });

  // Update connection status
  const s = dbStatus();
  const dot = document.querySelector("#connection-status .dot");
  const txt = document.getElementById("connection-text");
  if (s.ready) {
    dot.className = "dot dot--ok";
    txt.textContent = `Firestore · ${s.projectId}`;
  } else {
    dot.className = "dot dot--warn";
    txt.textContent = `localStorage (fallback)`;
  }

  // Activate first tab
  const startTab = isOperator() ? "admin" : (user.role === "pending" ? "pending" : "workspace");
  activateTab(startTab);
}

let currentActiveTab = null;

async function activateTab(tab) {
  // Cleanup leaving tab (currently only workspace has subscriptions)
  if (currentActiveTab === "workspace" && tab !== "workspace") {
    cleanupWorkspace();
  }
  currentActiveTab = tab;

  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("tab--active", t.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("tab-panel--active", p.id === `panel-${tab}`));

  const panel = document.getElementById(`panel-${tab}`);
  if (!panel) return;

  switch (tab) {
    case "admin":      await loadSkills(panel); break;
    case "onboarding": await startWizard(panel); break;
    case "clients":    await renderClientsTab(panel); break;
    case "pillars":    await renderPillarsTab(panel); break;
    case "users":      await renderUsersAdmin(panel); break;
    case "workspace":  await renderClientWorkspace(panel); break;
    case "pending":    renderPendingAccount(panel); break;
  }
}

function renderPendingAccount(panel) {
  const user = getCurrentUser();
  panel.innerHTML = `
    <div class="panel-header">
      <h2>⏳ Cuenta pendiente</h2>
      <p class="subtitle">Tu cuenta está creada pero aún no tiene rol asignado.</p>
    </div>
    <div class="empty-state">
      <p>Un operador (Damian u Oscar) tiene que asignarte un rol y vincularte a tu workspace antes de que puedas usar el sistema.</p>
      <p class="muted">Si esperabas acceso ya, contactá a Damian.</p>
      <p class="muted" style="margin-top:16px">Email: <code>${escape(user?.email)}</code></p>
      <p class="muted">UID: <code>${escape(user?.uid)}</code></p>
    </div>
  `;
}

// renderClientWorkspace lives in workspace.js (Turn 6b)
// renderPendingAccount + roleBadgeForPill + escape stay here below

// ============ HELPERS ============
function roleBadgeForPill(role) {
  if (role === "operator") return "⚙️ Operador";
  if (role === "client")   return "👤 Cliente";
  if (role === "pending")  return "⏳ Pendiente";
  return "—";
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
