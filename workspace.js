// workspace.js — Expanded client workspace (Turn 6b)
// Shows all 6 pillars · status per pillar · click to open deliverable in viewer
// Real-time updates via subscribeToOutputs · auto-reflects operator changes

import { getClient, subscribeToOutputs } from "./db.js";
import { getCurrentUser } from "./auth.js";
import { showOutputViewer } from "./output-viewer.js";
import { PILLAR_META } from "./brief-schema.js";

const PILLAR_KEYS = [
  "pillar_onboard", "pillar_offer", "pillar_brand",
  "pillar_ads7", "pillar_funnel", "pillar_report"
];

let unsubOutputs = null;  // active Firestore subscription cleanup

export async function renderClientWorkspace(panel) {
  const user = getCurrentUser();
  if (!user) return;

  // Tear down previous subscription if any (avoid leaks on tab switch)
  if (unsubOutputs) { unsubOutputs(); unsubOutputs = null; }

  if (!user.linkedClientId) {
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Mi Workspace</h2>
        <p class="subtitle">Tu cuenta aún no está vinculada a un cliente.</p>
      </div>
      <div class="empty-state">
        <p>📋 Tu cuenta está creada pero todavía no tenés un cliente asignado.</p>
        <p class="muted">Contactá a tu operador (Damian o Oscar) para que vincule tu cuenta a tu workspace de realtor.</p>
        <p class="muted">Tu UID: <code>${escape(user.uid)}</code></p>
      </div>
    `;
    return;
  }

  // Load client metadata once (doesn't change often)
  const clientRes = await getClient(user.linkedClientId);
  if (!clientRes.ok) {
    panel.innerHTML = `
      <div class="panel-header"><h2>Mi Workspace</h2></div>
      <div class="empty-state">
        <p>No pude cargar tu cliente vinculado (ID: <code>${escape(user.linkedClientId)}</code>).</p>
        <p class="muted">Razón: ${escape(clientRes.error || "")}</p>
      </div>
    `;
    return;
  }
  const client = clientRes.client;

  // Initial shell render (cards rendered empty · then filled by snapshot)
  panel.innerHTML = `
    <div class="panel-header">
      <h2>👋 Hola, ${escape(client.brief?.realtor?.full_name || "Realtor")}</h2>
      <p class="subtitle">${escape(client.brief?.realtor?.geo_zone || "")}</p>
    </div>

    <div class="workspace-summary" id="workspace-summary"></div>

    <h3 class="workspace-section-title">Tus 6 pilares</h3>
    <div class="pillars-workspace-grid" id="pillars-workspace-grid">
      ${PILLAR_KEYS.map(k => renderPillarCardShell(k)).join("")}
    </div>

    <div class="alert alert--orange-soft workspace-help">
      💡 <strong>Cómo funciona:</strong>
      Cada pilar pasa por 4 estados: <strong>En revisión</strong> (recién generado · revisalo) →
      <strong>Pediste cambios</strong> (Damian está corrigiendo) →
      <strong>Aprobado</strong> (listo para descargar) → <strong>Descargado</strong>.
      Si querés cambios en algo, click "Solicitar cambios" y dejá tu nota.
    </div>
  `;

  // Subscribe to outputs subcollection · live updates
  unsubOutputs = subscribeToOutputs(client.id, (outputs) => {
    updateWorkspaceFromOutputs(outputs, client);
  });
}

// Tear down subscription when leaving tab (called externally if needed)
export function cleanupWorkspace() {
  if (unsubOutputs) { unsubOutputs(); unsubOutputs = null; }
}

// ============ RENDER ============
function renderPillarCardShell(pillarKey) {
  const meta = PILLAR_META[pillarKey];
  return `
    <div class="pillar-ws-card pillar-ws-card--pending" data-pillar-key="${pillarKey}">
      <div class="pillar-ws-card__head">
        <span class="pillar-ws-num">${meta?.num || "?"}</span>
        <div class="pillar-ws-name">
          <strong>${escape(meta?.name || pillarKey)}</strong>
          <small class="muted">${escape(meta?.time || "")}</small>
        </div>
      </div>
      <p class="pillar-ws-desc">${escape(meta?.desc || "")}</p>
      <div class="pillar-ws-card__footer">
        <span class="pillar-ws-status">⏳ Aún no generado</span>
      </div>
    </div>
  `;
}

function updateWorkspaceFromOutputs(outputs, client) {
  const byPillar = outputs.reduce((acc, o) => ({ ...acc, [o.pillar_key]: o }), {});

  // Update summary
  const summary = computeSummary(outputs);
  const sumEl = document.getElementById("workspace-summary");
  if (sumEl) sumEl.innerHTML = renderSummary(summary);

  // Update each card
  PILLAR_KEYS.forEach(key => {
    const card = document.querySelector(`.pillar-ws-card[data-pillar-key="${key}"]`);
    if (!card) return;
    const output = byPillar[key];
    rewireCard(card, output, client);
  });
}

function rewireCard(card, output, client) {
  // Reset classes
  card.classList.remove(
    "pillar-ws-card--pending",
    "pillar-ws-card--draft",
    "pillar-ws-card--in-edit",
    "pillar-ws-card--approved",
    "pillar-ws-card--downloaded"
  );

  const footer = card.querySelector(".pillar-ws-card__footer");
  if (!output) {
    card.classList.add("pillar-ws-card--pending");
    footer.innerHTML = `<span class="pillar-ws-status">⏳ Aún no generado</span>`;
    card.onclick = null;
    card.style.cursor = "default";
    return;
  }

  const status = output.approval_status || "draft";
  card.classList.add(`pillar-ws-card--${status}`);

  const statusInfo = {
    "draft":      { icon: "📝", label: "En revisión · revisalo", cta: "Ver y revisar" },
    "in-edit":    { icon: "✏️", label: "Pediste cambios · Damian está corrigiendo", cta: "Ver pedido" },
    "approved":   { icon: "✓",  label: "Aprobado · listo para descargar", cta: "Ver y descargar" },
    "downloaded": { icon: "⬇",  label: "Descargado", cta: "Ver de nuevo" }
  }[status] || { icon: "?", label: status, cta: "Ver" };

  const qaIcon = output.qa_status === "PASS" ? "✓" : output.qa_status === "FAIL" ? "⚠" : "·";

  footer.innerHTML = `
    <div class="pillar-ws-meta">
      <span class="pillar-ws-status">${statusInfo.icon} ${escape(statusInfo.label)}</span>
      <span class="pillar-ws-qa qa-mini-${(output.qa_status || "").toLowerCase()}">${qaIcon} QA ${escape(output.qa_status || "—")}</span>
    </div>
    <button class="btn btn--primary btn-sm" data-act="open">${escape(statusInfo.cta)}</button>
  `;

  // Wire open button (also card click)
  const openBtn = footer.querySelector("[data-act='open']");
  const openHandler = (e) => {
    e?.stopPropagation();
    showOutputViewer({
      output,
      client,
      mode: "client",
      onApprovalChange: () => {
        // The Firestore listener will fire and update the card automatically
      }
    });
  };
  openBtn.addEventListener("click", openHandler);
  card.onclick = openHandler;
  card.style.cursor = "pointer";
}

// ============ SUMMARY ============
function computeSummary(outputs) {
  let total = PILLAR_KEYS.length;
  let generated = outputs.length;
  let draft = 0, inEdit = 0, approved = 0, downloaded = 0;
  outputs.forEach(o => {
    const s = o.approval_status || "draft";
    if (s === "draft")      draft++;
    if (s === "in-edit")    inEdit++;
    if (s === "approved")   approved++;
    if (s === "downloaded") downloaded++;
  });
  return { total, generated, draft, inEdit, approved, downloaded };
}

function renderSummary(s) {
  const pct = Math.round((s.generated / s.total) * 100);
  return `
    <div class="ws-summary-card">
      <div class="ws-summary-progress">
        <div class="ws-summary-bar"><div class="ws-summary-fill" style="width:${pct}%"></div></div>
        <div class="ws-summary-pct">${s.generated} / ${s.total} pilares generados</div>
      </div>
      <div class="ws-summary-stats">
        <div class="ws-stat"><strong>${s.draft}</strong><span>📝 Para revisar</span></div>
        <div class="ws-stat"><strong>${s.inEdit}</strong><span>✏️ En cambios</span></div>
        <div class="ws-stat"><strong>${s.approved}</strong><span>✓ Aprobados</span></div>
        <div class="ws-stat"><strong>${s.downloaded}</strong><span>⬇ Descargados</span></div>
      </div>
    </div>
  `;
}

// ============ HELPERS ============
function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
