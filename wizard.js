// wizard.js — State machine de las 11 pantallas del Onboarding Wizard
// Cada pantalla: render + validate + persist

import {
  WIZARD_SCREENS, ACCESS_CHECKLIST, OFFICIAL_DATA_FIELDS, BRIEF_INPUTS,
  LANGUAGES, NATIONALITIES, TONES, PILLAR_META, emptyClientState
} from "./brief-schema.js";
import { saveClient, getClient } from "./db.js";
import { openBriefImporter } from "./brief-importer.js";

let state = null;
let panel = null;

export async function startWizard(panelEl, existingClientId = null) {
  panel = panelEl;
  if (existingClientId) {
    const res = await getClient(existingClientId);
    state = res.ok ? res.client : emptyClientState();
  } else {
    state = emptyClientState();
  }
  render();
}

function render() {
  const screen = WIZARD_SCREENS[state.current_screen];
  panel.innerHTML = `
    <div class="wizard">
      <div class="wizard-topbar">
        <div class="wizard-progress">
          ${WIZARD_SCREENS.map((s, i) => `
            <div class="wizard-step ${i === state.current_screen ? "wizard-step--active" : ""} ${i < state.current_screen ? "wizard-step--done" : ""}"
                 data-screen="${i}" title="${s.title}">
              <span class="wizard-step__icon">${s.icon}</span>
              <span class="wizard-step__label">${s.id}</span>
            </div>
          `).join("")}
        </div>
        <button class="btn btn--ghost btn-import-brief" id="btn-import-brief" title="Cargar brief existente con IA">
          ⚡ Cargar brief existente
        </button>
      </div>

      <div class="wizard-body">
        <header class="wizard-header">
          <h2>${screen.icon} ${screen.title}</h2>
          <span class="wizard-counter">Pantalla ${screen.id + 1} de ${WIZARD_SCREENS.length}</span>
        </header>

        <div class="wizard-content" id="wizard-content">
          ${renderScreen(screen)}
        </div>

        <footer class="wizard-footer">
          <button class="btn btn--ghost" id="btn-prev" ${state.current_screen === 0 ? "disabled" : ""}>← Atrás</button>
          <button class="btn btn--ghost" id="btn-save-exit">Guardar y salir</button>
          <button class="btn btn--primary" id="btn-next">
            ${state.current_screen === WIZARD_SCREENS.length - 1 ? "Finalizar" : "Siguiente →"}
          </button>
        </footer>
      </div>
    </div>
  `;

  // Wire navigation
  document.getElementById("btn-prev").addEventListener("click", () => navigate(-1));
  document.getElementById("btn-next").addEventListener("click", () => navigate(+1));
  document.getElementById("btn-save-exit").addEventListener("click", saveAndExit);

  // Wire brief importer button
  document.getElementById("btn-import-brief").addEventListener("click", () => {
    openBriefImporter({
      onApply: (extracted) => applyExtractedToState(extracted)
    });
  });

  // Wire progress dots (click to jump · only to completed or current)
  panel.querySelectorAll(".wizard-step").forEach(el => {
    el.addEventListener("click", () => {
      const target = parseInt(el.dataset.screen, 10);
      if (target <= state.current_screen) {
        state.current_screen = target;
        render();
      }
    });
  });

  // Wire screen-specific inputs
  wireInputs(screen);
}

function renderScreen(screen) {
  switch (screen.key) {
    case "welcome":       return renderWelcome();
    case "accesses":      return renderAccesses();
    case "official_data": return renderOfficialData();
    case "brief":         return renderBrief();
    case "pillar_onboard":
    case "pillar_offer":
    case "pillar_brand":
    case "pillar_ads7":
    case "pillar_funnel":
    case "pillar_report": return renderPillarPlaceholder(screen);
    case "installed":     return renderInstalled();
    default: return "<p>Pantalla no definida</p>";
  }
}

// ============ SCREEN 0 · WELCOME ============
function renderWelcome() {
  return `
    <div class="welcome-screen">
      <p class="lead">Vas a instalar el sistema <strong>The New Agent Method™</strong> para un realtor latino nuevo.</p>
      <p>El wizard captura los datos críticos en las primeras 4 pantallas (accesos · datos oficiales · brief con 18 inputs). Después ejecutás los 6 pilares uno por uno.</p>
      <div class="welcome-grid">
        <div class="welcome-card">
          <strong>⏱️ Tiempo total</strong>
          <p>15-20 min las primeras 4 pantallas · 14-22 hrs los 6 pilares (Turn 3)</p>
        </div>
        <div class="welcome-card">
          <strong>📦 Lo que necesitás tener listo</strong>
          <p>Audio voz del realtor · screenshots IG · 6+ testimonios firmados · datos oficiales verificados</p>
        </div>
        <div class="welcome-card">
          <strong>🔴 Regla 1 (CLAUDE.md)</strong>
          <p>TODOS los datos del contenido vienen del documento "Datos Oficiales". NUNCA inventar.</p>
        </div>
      </div>
      <p class="muted">Podés guardar y salir en cualquier pantalla · el cliente queda en estado <code>draft</code> para retomar.</p>
    </div>
  `;
}

// ============ SCREEN 1 · ACCESSES ============
function renderAccesses() {
  const checked = ACCESS_CHECKLIST.filter(a => state.accesses[a.id]).length;
  return `
    <p class="lead">Validá los 6 accesos antes de continuar · el equipo Oscar/Damian los configura previo a este punto.</p>
    <p class="muted">Marcados: <strong>${checked} / 6</strong></p>
    <div class="access-grid">
      ${ACCESS_CHECKLIST.map(a => `
        <label class="access-item ${state.accesses[a.id] ? "access-item--checked" : ""}">
          <input type="checkbox" data-access="${a.id}" ${state.accesses[a.id] ? "checked" : ""}>
          <div>
            <strong>${a.label}</strong>
            <p class="muted">${a.hint}</p>
          </div>
        </label>
      `).join("")}
    </div>
  `;
}

// ============ SCREEN 2 · OFFICIAL DATA ============
function renderOfficialData() {
  return `
    <div class="alert alert--orange-soft">
      🔴 <strong>Regla #1 de CLAUDE.md.</strong> Todos los datos acá deben venir verificados del realtor · NUNCA inventar. Sin esto · todo el contenido downstream queda contaminado.
    </div>
    <div class="form-grid">
      ${OFFICIAL_DATA_FIELDS.map(f => renderField("official_data", f)).join("")}
    </div>
  `;
}

// ============ SCREEN 3 · BRIEF ============
function renderBrief() {
  const sections = {
    realtor: { title: "Realtor (10 inputs)", icon: "👤" },
    avatar:  { title: "Avatar / Audiencia (4 inputs)", icon: "🎯" },
    data:    { title: "Datos oficiales (2 inputs)", icon: "📋" },
    activation: { title: "Activación (2 inputs)", icon: "⚙️" }
  };
  return Object.entries(sections).map(([key, meta]) => `
    <details class="brief-section" open>
      <summary>${meta.icon} ${meta.title}</summary>
      <div class="form-grid">
        ${BRIEF_INPUTS.filter(i => i.section === key).map(f =>
          f.type === "localization_panel"
            ? renderLocalizationPanel()
            : renderField("brief." + key, f)
        ).join("")}
      </div>
    </details>
  `).join("");
}

function renderLocalizationPanel() {
  const loc = state.brief.activation.localization;
  return `
    <div class="form-row form-row--full">
      <label>📍 Localización · combina idioma + nacionalidad + tono</label>
      <div class="loc-grid">
        <div>
          <label class="loc-label">Idioma</label>
          <select data-localization="language">
            ${LANGUAGES.map(l => `<option value="${l.id}" ${loc.language === l.id ? "selected" : ""}>${l.label}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="loc-label">Nacionalidad (override opcional · solo Spanish)</label>
          <select data-localization="nationality">
            ${NATIONALITIES.map(n => `<option value="${n.id}" ${loc.nationality === n.id ? "selected" : ""}>${n.label}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="loc-label">Tono</label>
          <select data-localization="tone">
            ${TONES.map(t => `<option value="${t.id}" ${loc.tone === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>
  `;
}

function renderField(pathPrefix, f) {
  const v = readPath(state, pathPrefix + "." + f.id) ?? "";
  const required = f.required ? "required" : "";
  const idxBadge = f.idx ? `<span class="input-idx">${f.idx}</span>` : "";
  const hint = f.hint ? `<small class="muted">${f.hint}</small>` : "";

  switch (f.type) {
    case "textarea":
      return `
        <div class="form-row form-row--full">
          <label>${idxBadge}${f.label} ${f.required ? "<span class='req'>*</span>" : ""}</label>
          <textarea data-field="${pathPrefix}.${f.id}" rows="3" placeholder="${f.placeholder || ""}" ${required}>${escape(v)}</textarea>
          ${hint}
        </div>
      `;
    case "select":
      return `
        <div class="form-row">
          <label>${idxBadge}${f.label} ${f.required ? "<span class='req'>*</span>" : ""}</label>
          <select data-field="${pathPrefix}.${f.id}" ${required}>
            <option value="">— elegí —</option>
            ${f.options.map(o => `<option value="${o}" ${v === o ? "selected" : ""}>${o}</option>`).join("")}
          </select>
          ${hint}
        </div>
      `;
    case "checkbox":
      return `
        <div class="form-row form-row--full">
          <label class="cb-label">
            <input type="checkbox" data-field="${pathPrefix}.${f.id}" ${v ? "checked" : ""}>
            ${idxBadge}${f.label}
          </label>
          ${hint}
        </div>
      `;
    case "multicheck":
      return `
        <div class="form-row form-row--full">
          <label>${idxBadge}${f.label}</label>
          <div class="multicheck-grid">
            ${f.options.map(o => {
              const checked = state.brief.activation.pillars_active?.[o.id] ?? o.default;
              return `
                <label class="cb-label ${o.locked ? "cb-label--locked" : ""}">
                  <input type="checkbox" data-pillar="${o.id}" ${checked ? "checked" : ""} ${o.locked ? "disabled" : ""}>
                  ${o.label} ${o.locked ? "<span class='muted'>(siempre activo)</span>" : ""}
                </label>
              `;
            }).join("")}
          </div>
        </div>
      `;
    default:
      return `
        <div class="form-row">
          <label>${idxBadge}${f.label} ${f.required ? "<span class='req'>*</span>" : ""}</label>
          <input type="${f.type}" data-field="${pathPrefix}.${f.id}" value="${escape(v)}" placeholder="${f.placeholder || ""}" ${required}>
          ${hint}
        </div>
      `;
  }
}

// ============ SCREENS 4-9 · PILLARS (placeholders Turn 3) ============
function renderPillarPlaceholder(screen) {
  const meta = PILLAR_META[screen.key];
  return `
    <div class="pillar-placeholder">
      <h3>Pilar ${meta.num} · ${meta.name}</h3>
      <p class="lead">${meta.desc}</p>
      <p class="muted">Tiempo estimado: ${meta.time}</p>
      <div class="alert alert--orange-soft">
        🚧 <strong>Ejecución disponible en Turn 3.</strong> Acá se integra Gemini · se carga el contexto cascade (Núcleo + Universal + Lang + Nat + Tone + Pilar) · se genera el output · y corre QA Validator automático.
      </div>
      <p>Por ahora · podés avanzar (los outputs quedan vacíos) o saltar al final.</p>
    </div>
  `;
}

// ============ SCREEN 10 · INSTALLED ============
function renderInstalled() {
  const name = state.brief?.realtor?.full_name || "cliente";
  return `
    <div class="installed-screen">
      <div class="installed-hero">
        <span class="installed-icon">✅</span>
        <h3>Sistema instalado para <strong>${escape(name)}</strong></h3>
      </div>
      <p class="lead">Cliente guardado con ID: <code>${state.id || "(se genera al guardar)"}</code></p>
      <p>Próximos pasos:</p>
      <ol>
        <li>El cliente aparece en el tab <strong>Clientes</strong></li>
        <li>Cada pilar se ejecuta desde ahí (Turn 3)</li>
        <li>El equipo (Oscar/Damian/diseño) recibe los entregables cuando QA Validator pasa</li>
      </ol>
      <p class="muted">Click "Finalizar" para guardar el estado <code>completed</code> y cerrar el wizard.</p>
    </div>
  `;
}

// ============ INPUT WIRING ============
function wireInputs(screen) {
  // Generic field inputs
  document.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("input", e => {
      const path = el.dataset.field;
      const val = el.type === "checkbox" ? el.checked : el.value;
      writePath(state, path, val);
    });
    el.addEventListener("change", e => {
      const path = el.dataset.field;
      const val = el.type === "checkbox" ? el.checked : el.value;
      writePath(state, path, val);
    });
  });

  // Accesses
  document.querySelectorAll("[data-access]").forEach(el => {
    el.addEventListener("change", e => {
      state.accesses[el.dataset.access] = el.checked;
      // Re-render counter
      if (screen.key === "accesses") {
        const checked = ACCESS_CHECKLIST.filter(a => state.accesses[a.id]).length;
        panel.querySelector(".muted strong").textContent = `${checked} / 6`;
        el.closest(".access-item").classList.toggle("access-item--checked", el.checked);
      }
    });
  });

  // Pillars multicheck
  document.querySelectorAll("[data-pillar]").forEach(el => {
    el.addEventListener("change", e => {
      state.brief.activation.pillars_active[el.dataset.pillar] = el.checked;
    });
  });

  // Localization
  document.querySelectorAll("[data-localization]").forEach(el => {
    el.addEventListener("change", e => {
      state.brief.activation.localization[el.dataset.localization] = el.value;
    });
  });
}

// ============ NAVIGATION ============
function navigate(delta) {
  const next = state.current_screen + delta;
  if (next < 0 || next >= WIZARD_SCREENS.length) {
    if (next === WIZARD_SCREENS.length) finalizeWizard();
    return;
  }
  state.current_screen = next;
  render();
}

async function saveAndExit() {
  state.status = state.status === "completed" ? "completed" : "draft";
  const res = await saveClient(state);
  notify(`Guardado · modo ${res.mode} · ID ${res.id}`);
  // Switch to Clientes tab
  document.querySelector(`[data-tab="clients"]`)?.click();
}

async function finalizeWizard() {
  state.status = "completed";
  state.current_screen = WIZARD_SCREENS.length - 1;
  const res = await saveClient(state);
  notify(`✅ Cliente finalizado · ${res.mode} · ${res.id}`);
  document.querySelector(`[data-tab="clients"]`)?.click();
}

// ============ APPLY EXTRACTED BRIEF (Turn 6h) ============
// Merge extracted data into the wizard state · keeps any field already entered by operator
function applyExtractedToState(extracted) {
  if (!extracted || !state) return;

  // Merge official_data · only fill empty fields, don't overwrite operator's manual entries
  if (extracted.official_data) {
    state.official_data = state.official_data || {};
    Object.entries(extracted.official_data).forEach(([k, v]) => {
      if (!state.official_data[k] || String(state.official_data[k]).trim() === "") {
        state.official_data[k] = v;
      }
    });
  }

  // Merge brief sections
  if (extracted.brief) {
    state.brief = state.brief || { realtor: {}, avatar: {}, data: {}, activation: {} };
    ["realtor", "avatar", "data"].forEach(section => {
      if (extracted.brief[section]) {
        state.brief[section] = state.brief[section] || {};
        Object.entries(extracted.brief[section]).forEach(([k, v]) => {
          if (!state.brief[section][k] || String(state.brief[section][k]).trim() === "") {
            state.brief[section][k] = v;
          }
        });
      }
    });

    // Activation overwrites · localization + pillars come as a unit
    if (extracted.brief.activation) {
      state.brief.activation = state.brief.activation || {};
      if (extracted.brief.activation.localization) {
        state.brief.activation.localization = {
          ...(state.brief.activation.localization || {}),
          ...extracted.brief.activation.localization
        };
      }
      if (extracted.brief.activation.pillars_active) {
        state.brief.activation.pillars_active = {
          ...(state.brief.activation.pillars_active || {}),
          ...extracted.brief.activation.pillars_active,
          p1_onboard: true  // always locked
        };
      }
    }
  }

  // Jump to first incomplete screen so operator can review
  // Screen 1 (accesses) → 2 (official_data) → 3 (brief) · check from current onwards
  const fromScreen = Math.min(state.current_screen, 1);  // start from accesses or current
  state.current_screen = fromScreen < 1 ? 1 : state.current_screen;
  render();
  notify("⚡ Brief importado · revisá los campos y completá lo que falte");
}

// ============ HELPERS ============
function readPath(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function writePath(obj, path, val) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (!o[k]) o[k] = {};
    return o[k];
  }, obj);
  target[last] = val;
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function notify(msg) {
  const n = document.createElement("div");
  n.className = "toast";
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add("toast--show"), 10);
  setTimeout(() => { n.classList.remove("toast--show"); setTimeout(() => n.remove(), 300); }, 3000);
}
