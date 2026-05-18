// output-editor.js — Operator-only in-app editor for pillar outputs (Turn 6c)
// Uses EasyMDE (loaded via CDN in index.html · window.EasyMDE)
// Autosave every 30s · manual save · approval_status reset to "draft" on save
// Tracks edit_history per output (who edited · when · diff_size)

import { saveOutput, getClient } from "./db.js";
import { getCurrentUser, isOperator } from "./auth.js";
import { confirmDialog } from "./modal.js";
import { PILLAR_META } from "./brief-schema.js";

const AUTOSAVE_INTERVAL_MS = 30000;  // 30 seconds
const UNSAVED_INDICATOR_DELAY_MS = 500;  // grace before marking dirty

// Public entry · open the editor for a given output
// opts: { output, client, onSaved, onCancel }
export function openOutputEditor(opts) {
  const { output, client, onSaved, onCancel } = opts;
  if (!isOperator()) {
    window.notifyInfo?.("Solo operadores pueden editar deliverables", "attention");
    return;
  }
  if (typeof window.EasyMDE === "undefined") {
    window.notifyInfo?.("⚠ EasyMDE no cargó · revisar conexión CDN", "attention");
    return;
  }

  const meta = PILLAR_META[output.pillar_key];
  const originalContent = output.content || "";
  let currentContent = originalContent;
  let isDirty = false;
  let isSaving = false;
  let easyMDE = null;
  let autosaveTimer = null;

  // Build the editor modal
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop output-editor";
  backdrop.innerHTML = `
    <div class="modal modal--wide modal--editor">
      <div class="modal-header">
        <div>
          <strong>✏️ Editar · Pilar ${meta?.num || "?"} · ${escape(meta?.name || output.pillar_key)}</strong>
          <span class="muted" style="margin-left:8px">${escape(client.brief?.realtor?.full_name || client.id)}</span>
        </div>
        <div class="editor-header-status">
          <span class="editor-save-indicator" id="editor-save-indicator">Sin cambios</span>
          <button class="modal-close" id="editor-close" aria-label="Cerrar">×</button>
        </div>
      </div>

      <div class="modal-body modal-body--editor">
        <div class="editor-info-bar">
          <span class="muted">
            <strong>Editando contenido del deliverable.</strong>
            Al guardar, el estado vuelve a <em>"En revisión"</em> y el cliente lo ve actualizado en vivo.
            Autosave cada 30s.
          </span>
        </div>
        <textarea id="editor-textarea"></textarea>
      </div>

      <div class="modal-footer">
        <button class="btn btn--ghost" id="editor-cancel">Cancelar</button>
        <button class="btn btn--ghost" id="editor-revert" disabled>↶ Descartar cambios</button>
        <button class="btn btn--primary" id="editor-save" disabled>Guardar y notificar al cliente</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // Initialize EasyMDE
  easyMDE = new window.EasyMDE({
    element: document.getElementById("editor-textarea"),
    initialValue: originalContent,
    spellChecker: false,         // español + custom terms · false avoids noise
    autosave: { enabled: false },  // we handle our own
    status: ["lines", "words"],
    toolbar: [
      "bold", "italic", "heading", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "code", "table", "|",
      "preview", "side-by-side", "fullscreen", "|",
      "guide"
    ],
    placeholder: "Escribí el contenido en markdown · cambios autosaved cada 30s",
    minHeight: "500px"
  });

  // Watch for changes
  let dirtyTimer = null;
  easyMDE.codemirror.on("change", () => {
    if (isSaving) return;
    currentContent = easyMDE.value();
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      isDirty = (currentContent !== originalContent);
      updateSaveIndicator(isDirty ? "dirty" : "clean");
      backdrop.querySelector("#editor-save").disabled = !isDirty;
      backdrop.querySelector("#editor-revert").disabled = !isDirty;
    }, UNSAVED_INDICATOR_DELAY_MS);
  });

  // Autosave timer
  autosaveTimer = setInterval(() => {
    if (isDirty && !isSaving) {
      doSave({ silent: true });
    }
  }, AUTOSAVE_INTERVAL_MS);

  // ============ Buttons ============
  backdrop.querySelector("#editor-save").addEventListener("click", () => doSave({ silent: false }));
  backdrop.querySelector("#editor-revert").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Descartar cambios",
      body: "Vas a perder lo editado y volver al contenido original. ¿Continuar?",
      confirmLabel: "Descartar",
      danger: true
    });
    if (!ok) return;
    easyMDE.value(originalContent);
    currentContent = originalContent;
    isDirty = false;
    updateSaveIndicator("clean");
    backdrop.querySelector("#editor-save").disabled = true;
    backdrop.querySelector("#editor-revert").disabled = true;
  });

  const closeEditor = async (force = false) => {
    if (isDirty && !force) {
      const ok = await confirmDialog({
        title: "Tenés cambios sin guardar",
        body: "¿Salir sin guardar? Los cambios se pierden.",
        confirmLabel: "Salir sin guardar",
        cancelLabel: "Seguir editando",
        danger: true
      });
      if (!ok) return;
    }
    clearInterval(autosaveTimer);
    easyMDE.toTextArea();
    backdrop.remove();
    if (onCancel) onCancel();
  };

  backdrop.querySelector("#editor-cancel").addEventListener("click", () => closeEditor(false));
  backdrop.querySelector("#editor-close").addEventListener("click", () => closeEditor(false));
  // Don't close on backdrop click (too easy to lose work) · only via Cancel/Close

  // Escape to close
  const onEscape = (e) => {
    if (e.key === "Escape") {
      // EasyMDE intercepts when focus is in editor · only close if outside
      if (!easyMDE.codemirror.hasFocus()) closeEditor(false);
    }
  };
  document.addEventListener("keydown", onEscape);
  backdrop.addEventListener("DOMNodeRemovedFromDocument", () => {
    document.removeEventListener("keydown", onEscape);
  });

  // ============ Save logic ============
  async function doSave({ silent = false }) {
    if (isSaving) return;
    if (!isDirty) {
      if (!silent) window.notifyInfo?.("Sin cambios para guardar", "ok");
      return;
    }
    isSaving = true;
    updateSaveIndicator("saving");

    const user = getCurrentUser();
    const previousContent = output.content;
    const newContent = currentContent;
    const editEntry = {
      at: new Date().toISOString(),
      editor_uid: user?.uid || null,
      editor_email: user?.email || null,
      previous_length: (previousContent || "").length,
      new_length: newContent.length,
      diff_chars: Math.abs(newContent.length - (previousContent || "").length)
    };

    // Build updated output object · reset approval_status to "draft" so client sees it fresh
    const updated = {
      ...output,
      content: newContent,
      updated_at: editEntry.at,
      last_edited_at: editEntry.at,
      last_edited_by: user?.uid || null,
      edit_count: (output.edit_count || 0) + 1,
      edit_history: [...(output.edit_history || []), editEntry],
      // Reset approval status if it was approved/downloaded · client must re-review
      approval_status: (output.approval_status === "approved" || output.approval_status === "downloaded")
        ? "draft"
        : (output.approval_status || "draft"),
      // Append to approval history so client sees the timeline
      approval_history: [
        ...(output.approval_history || []),
        {
          status: "draft",
          at: editEntry.at,
          actor_uid: user?.uid || null,
          actor_role: "operator",
          notes: `Operador editó el deliverable (${editEntry.diff_chars > 0 ? "+" : ""}${editEntry.new_length - editEntry.previous_length} chars)`
        }
      ]
    };

    const res = await saveOutput(client.id, output.pillar_key, updated);

    isSaving = false;
    if (res.ok) {
      // Sync local state · subsequent edits diff against this new baseline
      Object.assign(output, updated);
      isDirty = false;
      updateSaveIndicator("saved");
      backdrop.querySelector("#editor-save").disabled = true;
      backdrop.querySelector("#editor-revert").disabled = true;
      if (!silent) {
        window.notifyInfo?.("✓ Guardado · cliente notificado en vivo", "ok");
      }
      if (onSaved) onSaved(updated);
    } else {
      updateSaveIndicator("error");
      window.notifyInfo?.(`Error al guardar: ${res.error || "desconocido"}`, "attention");
    }
  }

  function updateSaveIndicator(state) {
    const el = backdrop.querySelector("#editor-save-indicator");
    if (!el) return;
    el.dataset.state = state;
    el.textContent = {
      clean:  "Sin cambios",
      dirty:  "● Cambios sin guardar",
      saving: "Guardando…",
      saved:  "✓ Guardado",
      error:  "⚠ Error al guardar"
    }[state] || state;
  }
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
