// modal.js — Shared mini-modal helpers (confirm + prompt) for Trident OS v4

export function confirmDialog({ title, body, confirmLabel = "Aceptar", cancelLabel = "Cancelar", danger = false }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>${escapeHTML(title)}</h3>
        ${body ? `<p>${escapeHTML(body)}</p>` : ""}
        <div class="modal-actions">
          <button class="btn btn--ghost" data-act="cancel">${escapeHTML(cancelLabel)}</button>
          <button class="btn btn--primary ${danger ? "btn-danger" : ""}" data-act="ok">${escapeHTML(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const finish = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector("[data-act=cancel]").addEventListener("click", () => finish(false));
    overlay.querySelector("[data-act=ok]").addEventListener("click", () => finish(true));
    // Close on Escape
    const onKey = (e) => { if (e.key === "Escape") { document.removeEventListener("keydown", onKey); finish(false); } };
    document.addEventListener("keydown", onKey);
  });
}

export function promptChoice({ title, options, currentValue = null }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>${escapeHTML(title)}</h3>
        <div class="modal-options">
          ${options.map(o => `
            <label class="modal-option ${o.value === currentValue ? "modal-option--current" : ""}">
              <input type="radio" name="choice" value="${escapeHTML(o.value)}" ${o.value === currentValue ? "checked" : ""}>
              <span>${escapeHTML(o.label)}</span>
            </label>
          `).join("")}
        </div>
        <div class="modal-actions">
          <button class="btn btn--ghost" data-act="cancel">Cancelar</button>
          <button class="btn btn--primary" data-act="ok">Aplicar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const finish = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector("[data-act=cancel]").addEventListener("click", () => finish(null));
    overlay.querySelector("[data-act=ok]").addEventListener("click", () => {
      const picked = overlay.querySelector("input[name=choice]:checked")?.value || null;
      finish(picked);
    });
    const onKey = (e) => { if (e.key === "Escape") { document.removeEventListener("keydown", onKey); finish(null); } };
    document.addEventListener("keydown", onKey);
  });
}

function escapeHTML(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
