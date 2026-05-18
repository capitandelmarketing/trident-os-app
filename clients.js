// clients.js — Tab Clientes · lista de realtors guardados

import { listClients, deleteClient, dbStatus } from "./db.js";
import { startWizard } from "./wizard.js";

export async function renderClientsTab(panelEl) {
  panelEl.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Clientes</h2>
        <p class="subtitle">Realtors latinos activos en el sistema</p>
      </div>
      <div class="header-actions">
        <button class="btn btn--primary" id="btn-new-client">+ Cliente nuevo</button>
      </div>
    </div>

    <div class="db-status" id="db-status"></div>

    <div id="clients-list">
      <div class="empty-state">Cargando…</div>
    </div>
  `;

  // DB status pill
  const status = dbStatus();
  document.getElementById("db-status").innerHTML = `
    <span class="status-pill ${status.ready ? "status-pill--ok" : "status-pill--warn"}">
      <span class="dot dot--${status.ready ? "ok" : "warn"}"></span>
      DB: ${status.mode} · proyecto ${status.projectId}
      ${status.databaseId !== "(default)" ? `· DB <code>${status.databaseId.substring(0, 20)}…</code>` : ""}
      ${!status.ready ? `· ${status.lastError || "no inicializado"}` : ""}
    </span>
  `;

  // New client
  document.getElementById("btn-new-client").addEventListener("click", () => {
    switchToOnboardingTab();
  });

  // Load list
  const res = await listClients();
  renderList(res.clients, res.mode);
}

function renderList(clients, mode) {
  const container = document.getElementById("clients-list");

  if (!clients || clients.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Todavía no hay clientes guardados.</p>
        <p class="muted">Click "+ Cliente nuevo" para arrancar el wizard de onboarding.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <p class="muted">${clients.length} cliente${clients.length === 1 ? "" : "s"} · cargados desde <code>${mode}</code></p>
    <div class="clients-grid">
      ${clients.map(c => renderClientCard(c)).join("")}
    </div>
  `;

  container.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", async e => {
      const action = el.dataset.action;
      const id = el.dataset.id;
      if (action === "resume")  resumeClient(id);
      if (action === "delete")  confirmDelete(id);
    });
  });
}

function renderClientCard(c) {
  const name = c.brief?.realtor?.full_name || "(sin nombre)";
  const zone = c.brief?.realtor?.geo_zone || "—";
  const avatar = c.brief?.avatar?.primary_avatar || "—";
  const pillars = c.brief?.activation?.pillars_active || {};
  const pillarsActive = Object.entries(pillars).filter(([_, v]) => v).length;
  const loc = c.brief?.activation?.localization;
  const locStr = loc ? `${loc.language?.replace("lang-", "")} · ${loc.nationality?.replace("nat-es-", "") || "generic"} · ${loc.tone?.replace("tone-", "")}` : "—";

  const statusBadge = {
    draft:       "<span class='badge badge--draft'>Draft</span>",
    in_progress: "<span class='badge badge--progress'>En progreso</span>",
    completed:   "<span class='badge badge--done'>Completado</span>"
  }[c.status] || "<span class='badge'>—</span>";

  const progress = c.status === "completed" ? 11 : (c.current_screen + 1);

  return `
    <div class="client-card">
      <div class="client-card__header">
        <div>
          <strong>${escape(name)}</strong>
          <p class="muted">${escape(zone)} · avatar: ${escape(avatar)}</p>
        </div>
        ${statusBadge}
      </div>
      <div class="client-card__meta">
        <div><strong>${pillarsActive}</strong> pilares activos · <strong>${progress}/11</strong> pantallas</div>
        <div class="muted">Localización: ${escape(locStr)}</div>
        <div class="muted">ID: <code>${c.id}</code></div>
        <div class="muted">Actualizado: ${formatDate(c.updated_at)}</div>
      </div>
      <div class="client-card__actions">
        <button class="btn btn--ghost" data-action="resume" data-id="${c.id}">
          ${c.status === "completed" ? "Ver" : "Continuar wizard"}
        </button>
        <button class="btn btn--danger-soft" data-action="delete" data-id="${c.id}">Eliminar</button>
      </div>
    </div>
  `;
}

async function resumeClient(id) {
  switchToOnboardingTab();
  const panel = document.getElementById("panel-onboarding");
  await startWizard(panel, id);
}

async function confirmDelete(id) {
  if (!confirm(`¿Eliminar cliente ${id}? Esta acción borra el cliente de Firestore y localStorage.`)) return;
  const res = await deleteClient(id);
  renderClientsTab(document.getElementById("panel-clients"));
}

function switchToOnboardingTab() {
  document.querySelector(`[data-tab="onboarding"]`)?.click();
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es");
  } catch {
    return iso;
  }
}
