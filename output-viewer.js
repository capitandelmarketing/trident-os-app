// output-viewer.js — Shared modal to view a pillar output
// Used by pillars.js (operator · with Regenerate) and workspace.js (client · with Approve/Request changes/Download)

import { updateOutputApproval } from "./db.js";
import { getCurrentUser, isOperator, isClient } from "./auth.js";
import { confirmDialog } from "./modal.js";
import { PILLAR_META } from "./brief-schema.js";

// Public entry · render modal
// opts: { output, client, mode: "operator" | "client", onApprovalChange, onClose }
export function showOutputViewer(opts) {
  const { output, client, mode = "operator", onApprovalChange, onClose } = opts;
  const meta = PILLAR_META[output.pillar_key];

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop output-viewer";
  backdrop.innerHTML = `
    <div class="modal modal--wide">
      <div class="modal-header">
        <div>
          <strong>Pilar ${meta?.num || "?"} · ${meta?.name || output.pillar_key}</strong>
          ${qaBadgeHTML(output)}
          ${approvalBadgeHTML(output.approval_status)}
          <span class="muted" style="margin-left:8px">${formatDate(output.generated_at)}</span>
        </div>
        <button class="modal-close" aria-label="Cerrar">×</button>
      </div>

      <div class="modal-tabs">
        <button class="modal-tab modal-tab--active" data-tab="output">Output</button>
        ${mode === "operator" ? `<button class="modal-tab" data-tab="qa">QA Result</button>` : ""}
        <button class="modal-tab" data-tab="history">Historial</button>
        ${mode === "operator" ? `<button class="modal-tab" data-tab="meta">Meta</button>` : ""}
        ${mode === "operator" ? `<button class="modal-tab" data-tab="raw">Raw</button>` : ""}
      </div>

      <div class="modal-body modal-body--rich" data-tab-content="output"></div>
      ${mode === "operator" ? `<div class="modal-body" data-tab-content="qa" hidden></div>` : ""}
      <div class="modal-body" data-tab-content="history" hidden></div>
      ${mode === "operator" ? `<div class="modal-body modal-body--code" data-tab-content="meta" hidden></div>` : ""}
      ${mode === "operator" ? `<div class="modal-body modal-body--code" data-tab-content="raw" hidden></div>` : ""}

      <div class="modal-footer" id="output-viewer-actions"></div>
    </div>
  `;

  // Content render
  backdrop.querySelector("[data-tab-content='output']").innerHTML = renderMarkdown(output.content || "");
  backdrop.querySelector("[data-tab-content='history']").innerHTML = renderApprovalHistory(output);
  if (mode === "operator") {
    backdrop.querySelector("[data-tab-content='qa']").innerHTML = renderQAResult(output);
    backdrop.querySelector("[data-tab-content='meta']").textContent = JSON.stringify(output.meta || {}, null, 2);
    backdrop.querySelector("[data-tab-content='raw']").textContent = output.content || "";
  }

  // Tabs
  backdrop.querySelectorAll(".modal-tab").forEach(t => {
    t.addEventListener("click", () => {
      backdrop.querySelectorAll(".modal-tab").forEach(x => x.classList.remove("modal-tab--active"));
      t.classList.add("modal-tab--active");
      backdrop.querySelectorAll("[data-tab-content]").forEach(c => c.hidden = c.dataset.tabContent !== t.dataset.tab);
    });
  });

  // Render mode-specific footer actions
  renderActions(backdrop, output, client, mode, onApprovalChange);

  // Close
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop || e.target.classList.contains("modal-close")) {
      backdrop.remove();
      if (onClose) onClose();
    }
  });

  document.body.appendChild(backdrop);
  return backdrop;
}

// ============ ACTIONS FOOTER (per mode) ============
function renderActions(backdrop, output, client, mode, onApprovalChange) {
  const footer = backdrop.querySelector("#output-viewer-actions");
  const status = output.approval_status || "draft";

  if (mode === "client") {
    // Client sees: approve / request changes / download (if approved)
    const canApprove   = status === "draft" || status === "in-edit";
    const canDownload  = status === "approved" || status === "downloaded";

    footer.innerHTML = `
      <button class="btn btn--ghost" data-act="request-changes">📝 Solicitar cambios</button>
      ${canApprove   ? `<button class="btn btn--primary" data-act="approve">✓ Aprobar</button>` : ""}
      ${canDownload  ? `<button class="btn btn--primary" data-act="download-docx">⬇ Descargar .docx</button>` : ""}
    `;

    footer.querySelector("[data-act='request-changes']")?.addEventListener("click", async () => {
      const notes = prompt("¿Qué cambios necesitás? (Damian va a recibir esta nota)");
      if (notes === null || notes.trim() === "") return;
      const res = await updateOutputApproval(client.id, output.pillar_key, "in-edit", {
        actorUid: getCurrentUser()?.uid,
        actorRole: "client",
        notes
      });
      if (res.ok) {
        window.notifyInfo?.("✓ Pedido enviado · Damian recibirá tu nota", "ok");
        backdrop.remove();
        onApprovalChange?.(res.newStatus);
      } else {
        window.notifyInfo?.(`Error: ${res.error}`, "attention");
      }
    });

    footer.querySelector("[data-act='approve']")?.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Aprobar deliverable",
        body: "Aprobás este deliverable como está. Después vas a poder descargarlo.",
        confirmLabel: "Aprobar"
      });
      if (!ok) return;
      const res = await updateOutputApproval(client.id, output.pillar_key, "approved", {
        actorUid: getCurrentUser()?.uid,
        actorRole: "client"
      });
      if (res.ok) {
        window.notifyInfo?.("✓ Deliverable aprobado", "ok");
        backdrop.remove();
        onApprovalChange?.(res.newStatus);
      } else {
        window.notifyInfo?.(`Error: ${res.error}`, "attention");
      }
    });

    footer.querySelector("[data-act='download-docx']")?.addEventListener("click", async () => {
      downloadDocx(output, client);
      // Mark as downloaded (one-way · downloaded never reverts)
      if (output.approval_status === "approved") {
        await updateOutputApproval(client.id, output.pillar_key, "downloaded", {
          actorUid: getCurrentUser()?.uid,
          actorRole: "client"
        });
        onApprovalChange?.("downloaded");
      }
    });

  } else {
    // Operator sees: copy / download .md / download .docx / mark approved-on-behalf-of-client
    footer.innerHTML = `
      <button class="btn btn--ghost" data-act="copy-md">Copiar markdown</button>
      <button class="btn btn--ghost" data-act="download-md">Descargar .md</button>
      <button class="btn btn--primary" data-act="download-docx">Descargar .docx</button>
      ${status !== "approved" && status !== "downloaded" ? `
        <button class="btn btn--ghost" data-act="approve-onbehalf">✓ Marcar aprobado</button>
      ` : ""}
    `;

    footer.querySelector("[data-act='copy-md']").addEventListener("click", () => {
      navigator.clipboard.writeText(output.content || "");
      window.notifyInfo?.("Markdown copiado", "ok");
    });

    footer.querySelector("[data-act='download-md']").addEventListener("click", () => {
      const blob = new Blob([output.content || ""], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${client.id}_${output.pillar_key}_${(output.generated_at || "").substring(0,10)}.md`;
      a.click();
    });

    footer.querySelector("[data-act='download-docx']").addEventListener("click", () => downloadDocx(output, client));

    footer.querySelector("[data-act='approve-onbehalf']")?.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Aprobar en nombre del cliente",
        body: "Esto marca el deliverable como aprobado sin pedirle al realtor. Solo hacelo si tenés su OK por otro canal.",
        confirmLabel: "Aprobar"
      });
      if (!ok) return;
      const res = await updateOutputApproval(client.id, output.pillar_key, "approved", {
        actorUid: getCurrentUser()?.uid,
        actorRole: "operator",
        notes: "Aprobado en nombre del cliente por el operador"
      });
      if (res.ok) {
        window.notifyInfo?.("✓ Marcado aprobado", "ok");
        backdrop.remove();
        onApprovalChange?.(res.newStatus);
      }
    });
  }
}

// ============ BADGES ============
function qaBadgeHTML(output) {
  if (output.qa_status === "PASS") return `<span class="qa-badge qa-badge--pass">✓ QA PASS</span>`;
  if (output.qa_status === "FAIL") return `<span class="qa-badge qa-badge--fail">⚠ QA FAIL · ${output.qa_violations?.length || 0} violaciones</span>`;
  return `<span class="qa-badge">QA pending</span>`;
}

function approvalBadgeHTML(status) {
  const map = {
    "draft":      { label: "📝 En revisión",    cls: "approval-badge--draft" },
    "in-edit":    { label: "✏️ Pediste cambios", cls: "approval-badge--in-edit" },
    "approved":   { label: "✓ Aprobado",        cls: "approval-badge--approved" },
    "downloaded": { label: "⬇ Descargado",       cls: "approval-badge--downloaded" }
  };
  const cfg = map[status] || map["draft"];
  return `<span class="approval-badge ${cfg.cls}">${cfg.label}</span>`;
}

// ============ APPROVAL HISTORY ============
function renderApprovalHistory(output) {
  const hist = output.approval_history || [];
  if (hist.length === 0) {
    return `
      <div class="empty-state">
        <p>Sin acciones de aprobación todavía. Este deliverable está en estado <strong>borrador</strong>.</p>
        <p class="muted">Generado el ${formatDate(output.generated_at)}.</p>
      </div>
    `;
  }
  return `
    <h3>Línea de tiempo</h3>
    <ul class="approval-timeline">
      ${hist.map(h => `
        <li>
          ${approvalBadgeHTML(h.status)}
          <span class="approval-when">${formatDate(h.at)}</span>
          <span class="approval-who">por ${escape(h.actor_role || "—")}${h.actor_uid ? ` <code>${escape(h.actor_uid.slice(0,8))}…</code>` : ""}</span>
          ${h.notes ? `<div class="approval-notes">"${escape(h.notes)}"</div>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

// ============ QA RESULT (reused from pillars.js logic) ============
function renderQAResult(output) {
  const layers = output.qa_layers || {};
  const violations = output.qa_violations || [];
  const history = output.qa_history || [];

  const renderLayer = (key, title) => {
    const l = layers[key] || {};
    if (l.skipped) return `<div class="qa-layer qa-layer--skipped"><strong>${title}</strong> · ⏭ Saltada (${l.reason || ""})</div>`;
    const status = (l.items_failed || 0) === 0 ? "qa-layer--pass" : "qa-layer--fail";
    return `
      <div class="qa-layer ${status}">
        <strong>${title}</strong> · ${l.items_validated || 0} validados · ${l.items_failed || 0} fallos
        ${l.detail ? `<ul class="qa-detail">${l.detail.map(d => `<li>${escape(d)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
  };

  const renderViolation = v => `
    <div class="qa-violation qa-violation--${v.severity?.toLowerCase() || "high"}">
      <div class="qa-violation__head">
        <strong>${v.rule_id} · ${escape(v.rule_name || "")}</strong>
        <span class="qa-violation__layer">layer ${v.layer || "?"}</span>
        <span class="qa-violation__sev">${v.severity || "?"}</span>
      </div>
      ${v.violated_fragment ? `<div class="qa-violation__frag"><em>Fragment:</em> ${escape(v.violated_fragment).substring(0,300)}</div>` : ""}
      <div class="qa-violation__fix"><em>Fix:</em> ${escape(v.correction_suggestion || "")}</div>
    </div>
  `;

  return `
    <div class="qa-summary">
      <strong>Resultado:</strong> ${output.qa_status === "PASS" ? "✓ PASS" : "⚠ FAIL"} ·
      Ciclos usados: ${output.qa_cycles_used || 1} / ${output.qa_max_cycles || 3}
    </div>
    ${renderLayer("layer_1_blocking",   "Layer 1 · Blocking (programmatic)")}
    ${renderLayer("layer_2_format",     "Layer 2 · Format (programmatic)")}
    ${renderLayer("layer_3_contextual", "Layer 3 · Contextual (AI · Gemini)")}
    ${violations.length > 0 ? `
      <h3 style="margin-top:20px">Violaciones detectadas (${violations.length})</h3>
      ${violations.map(renderViolation).join("")}
    ` : `<div class="qa-clean">🎉 Sin violaciones detectadas en ningún layer.</div>`}
    ${history.length > 1 ? `
      <h3 style="margin-top:20px">Historial de ciclos</h3>
      <table class="qa-history-table">
        <thead><tr><th>Ciclo</th><th>QA</th><th>Violaciones</th></tr></thead>
        <tbody>
          ${history.map(h => `<tr><td>${h.cycle}</td><td><span class="qa-pill qa-pill--${h.qa.toLowerCase()}">${h.qa}</span></td><td>${h.violations}</td></tr>`).join("")}
        </tbody>
      </table>
    ` : ""}
  `;
}

// ============ DOWNLOAD .docx ============
function downloadDocx(output, client) {
  const meta = PILLAR_META[output.pillar_key];
  if (typeof window.htmlDocx === "undefined") {
    window.notifyInfo?.("⚠ html-docx-js no cargó · descargando como .doc", "attention");
    downloadAsDoc(output, client, meta);
    return;
  }
  const fullHtml = buildDocxHtml(output, client, meta);
  const blob = window.htmlDocx.asBlob(fullHtml);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${client.id}_${output.pillar_key}_${(output.generated_at || "").substring(0,10)}.docx`;
  a.click();
  window.notifyInfo?.(".docx descargado", "ok");
}

function downloadAsDoc(output, client, meta) {
  const fullHtml = buildDocxHtml(output, client, meta);
  const blob = new Blob([fullHtml], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${client.id}_${output.pillar_key}_${(output.generated_at || "").substring(0,10)}.doc`;
  a.click();
}

function buildDocxHtml(output, client, meta) {
  const css = `
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111827; }
    h1 { color: #0F1B2D; font-size: 22pt; border-bottom: 3px solid #E86A1E; padding-bottom: 6pt; margin-top: 0; }
    h2 { color: #0F1B2D; font-size: 16pt; margin-top: 18pt; border-bottom: 1px solid #DDE2EA; padding-bottom: 4pt; }
    h3 { color: #E86A1E; font-size: 13pt; margin-top: 14pt; }
    p  { margin: 6pt 0; }
    ul, ol { margin-left: 24pt; }
    code { background: #EEF1F5; padding: 1pt 5pt; font-family: "Courier New", monospace; font-size: 11pt; }
    .header-block { border-left: 4pt solid #E86A1E; padding-left: 12pt; margin-bottom: 24pt; }
    .footer { margin-top: 36pt; padding-top: 12pt; border-top: 1px solid #DDE2EA; font-size: 10pt; color: #6B7280; }
  `;
  const clientName = client.brief?.realtor?.full_name || client.id;
  const headerBlock = `
    <div class="header-block">
      <h1>Pilar ${meta?.num || ""} · ${meta?.name || ""}</h1>
      <p><strong>Cliente:</strong> ${escape(clientName)}<br>
      <strong>Generado:</strong> ${formatDate(output.generated_at)}<br>
      <strong>QA Status:</strong> ${output.qa_status} (${output.qa_cycles_used || 1} ciclos)<br>
      <strong>Aprobación:</strong> ${output.approval_status || "draft"}<br>
      <strong>Trident OS v4</strong> · Capitán del Marketing</p>
    </div>
  `;
  const body = renderMarkdown(output.content || "");
  const footer = `
    <div class="footer">
      QUWWA LLC dba Capitán del Marketing · New Mexico · USA<br>
      Generado por Trident OS v4 con Gemini
    </div>
  `;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${headerBlock}${body}${footer}</body></html>`;
}

// ============ MARKDOWN ============
function renderMarkdown(md) {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, m => "<ul>" + m + "</ul>")
    .split(/\n\n+/).map(p => p.match(/^<(h\d|ul|ol|pre|table)/) ? p : `<p>${p}</p>`).join("\n");
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es"); } catch { return iso; }
}
