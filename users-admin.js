// users-admin.js — Operator-only panel to manage user profiles
// List users · change role · link to a client · delete profile (Firestore-only)

import { listUsers, updateUserRole, setLinkedClient, deleteUserProfile, isOperator, getCurrentUser } from "./auth.js";
import { listClients } from "./db.js";
import { confirmDialog, promptChoice } from "./modal.js";

let cachedClients = [];

export async function renderUsersAdmin(panel) {
  if (!isOperator()) {
    panel.innerHTML = `<div class="empty-state"><p>🔒 Solo operadores pueden ver este panel.</p></div>`;
    return;
  }

  panel.innerHTML = `
    <div class="panel-header">
      <h2>👥 Usuarios</h2>
      <p class="subtitle">Gestionar cuentas · roles · vinculación a clientes</p>
    </div>
    <div id="users-list"><p class="muted">Cargando…</p></div>
  `;

  const [usersRes, clientsRes] = await Promise.all([listUsers(), listClients()]);
  cachedClients = clientsRes.clients || [];
  const users = usersRes.users || [];

  if (!usersRes.ok) {
    document.getElementById("users-list").innerHTML = `
      <div class="alert alert--error">No pude cargar usuarios: ${escape(usersRes.error || "error desconocido")}</div>
    `;
    return;
  }

  if (users.length === 0) {
    document.getElementById("users-list").innerHTML = `
      <div class="empty-state"><p>Sin usuarios todavía.</p></div>
    `;
    return;
  }

  document.getElementById("users-list").innerHTML = `
    <table class="users-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Nombre</th>
          <th>Rol</th>
          <th>Cliente vinculado</th>
          <th>UID</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => rowHTML(u)).join("")}
      </tbody>
    </table>
  `;

  wireRowActions(panel);
}

function rowHTML(u) {
  const me = getCurrentUser();
  const isSelf = me?.uid === u.uid;
  const linkedLabel = u.linkedClientId
    ? (cachedClients.find(c => c.id === u.linkedClientId)?.brief?.realtor?.full_name || u.linkedClientId)
    : "—";
  const roleBadge = roleBadgeHTML(u.role);

  return `
    <tr data-uid="${escape(u.uid)}">
      <td class="cell-email">${escape(u.email || "—")}${isSelf ? ' <span class="self-tag">(vos)</span>' : ""}</td>
      <td>${escape(u.displayName || "—")}</td>
      <td>${roleBadge}</td>
      <td class="cell-linked">${escape(linkedLabel)}</td>
      <td class="cell-uid"><code>${escape(u.uid.slice(0, 8))}…</code></td>
      <td class="cell-actions">
        <button class="btn btn--ghost btn-sm" data-action="role" data-uid="${escape(u.uid)}">Cambiar rol</button>
        <button class="btn btn--ghost btn-sm" data-action="link" data-uid="${escape(u.uid)}">Vincular cliente</button>
        ${isSelf ? "" : `<button class="btn btn--ghost btn-sm btn-danger" data-action="delete" data-uid="${escape(u.uid)}">Borrar perfil</button>`}
      </td>
    </tr>
  `;
}

function roleBadgeHTML(role) {
  const map = {
    operator: { label: "⚙️ Operador", cls: "role-badge--operator" },
    client:   { label: "👤 Cliente",  cls: "role-badge--client" },
    pending:  { label: "⏳ Pendiente", cls: "role-badge--pending" }
  };
  const cfg = map[role] || { label: role || "—", cls: "role-badge--pending" };
  return `<span class="role-badge ${cfg.cls}">${cfg.label}</span>`;
}

function wireRowActions(panel) {
  panel.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const action = btn.dataset.action;
      const uid = btn.dataset.uid;
      if (action === "role")   await handleChangeRole(uid, panel);
      if (action === "link")   await handleLinkClient(uid, panel);
      if (action === "delete") await handleDeleteProfile(uid, panel);
    });
  });
}

async function handleChangeRole(uid, panel) {
  const row = panel.querySelector(`tr[data-uid="${uid}"]`);
  const currentRole = row.querySelector(".role-badge")?.textContent?.includes("Operador")
    ? "operator"
    : row.querySelector(".role-badge")?.textContent?.includes("Cliente")
      ? "client"
      : "pending";

  const newRole = await promptChoice({
    title: "Cambiar rol del usuario",
    options: [
      { value: "operator", label: "⚙️ Operador (ve todo · gestiona clientes)" },
      { value: "client",   label: "👤 Cliente (ve solo su workspace)" },
      { value: "pending",  label: "⏳ Pendiente (sin acceso · pre-onboarding)" }
    ],
    currentValue: currentRole
  });
  if (!newRole || newRole === currentRole) return;

  // Preserve linkedClientId if exists
  const linkedCell = row.querySelector(".cell-linked").textContent.trim();
  // We need the actual linkedClientId · not the display name. Pull from cache.
  const linkedId = cachedClients.find(c => (c.brief?.realtor?.full_name || c.id) === linkedCell)?.id || null;

  const res = await updateUserRole(uid, newRole, linkedId);
  if (!res.ok) {
    window.notifyInfo?.(`Error: ${res.error}`, "attention");
    return;
  }
  window.notifyInfo?.(`Rol actualizado a ${newRole}`, "ok");
  await renderUsersAdmin(panel);
}

async function handleLinkClient(uid, panel) {
  if (cachedClients.length === 0) {
    window.notifyInfo?.("No hay clientes creados todavía. Cargá uno desde Onboarding Wizard primero.", "attention");
    return;
  }

  const choice = await promptChoice({
    title: "Vincular usuario a un cliente",
    options: [
      { value: "__none__", label: "Sin vincular (desvincula si está vinculado)" },
      ...cachedClients.map(c => ({
        value: c.id,
        label: `${c.brief?.realtor?.full_name || "(sin nombre)"} · ${c.brief?.realtor?.geo_zone || "—"}`
      }))
    ],
    currentValue: null
  });
  if (choice === null) return;

  const linkedClientId = choice === "__none__" ? null : choice;
  const res = await setLinkedClient(uid, linkedClientId);
  if (!res.ok) {
    window.notifyInfo?.(`Error: ${res.error}`, "attention");
    return;
  }
  window.notifyInfo?.(linkedClientId ? "Usuario vinculado al cliente" : "Usuario desvinculado", "ok");
  await renderUsersAdmin(panel);
}

async function handleDeleteProfile(uid, panel) {
  const confirmed = await confirmDialog({
    title: "Borrar perfil del usuario",
    body: "Esto elimina el doc Firestore (role + linkedClientId). La cuenta de Firebase Auth NO se borra · si el usuario se loguea otra vez quedará en estado \"pendiente\" hasta que le asignes rol de nuevo.",
    confirmLabel: "Borrar perfil",
    danger: true
  });
  if (!confirmed) return;

  const res = await deleteUserProfile(uid);
  if (!res.ok) {
    window.notifyInfo?.(`Error: ${res.error}`, "attention");
    return;
  }
  window.notifyInfo?.("Perfil borrado", "ok");
  await renderUsersAdmin(panel);
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
