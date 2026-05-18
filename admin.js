// admin.js — Tab "Neural Infrastructure" (skills + db status)
// Reemplaza el viejo app.js · ahora ES module integrado con router en index.html

import { dbStatus } from "./db.js";

const EXPECTED_COUNTS = {
  meta_docs:        { count: 4,  label: "Docs maestros",        hint: "Master · Architecture · Consolidation · Smoke Test" },
  nucleus_main:     { count: 1,  label: "Núcleo Global",        hint: "00-MAIN del Núcleo" },
  universal:        { count: 10, label: "Universal Rules",      hint: "10 sub-skills universales" },
  language:         { count: 2,  label: "Language Layer",       hint: "es-neutral · en-us" },
  nationality:      { count: 9,  label: "Nationality Flavor",   hint: "MX·CU·VE·CO·AR·PR·DO·PE·UY" },
  tone:             { count: 5,  label: "Tone Styles",          hint: "Friendly·Formal·Didactic·Provocative·Storytelling" },
  transversal:      { count: 3,  label: "Skills Transversales", hint: "Formula 100K · Estudador · Formula VSL" },
  qa_validator:     { count: 4,  label: "QA Validator",         hint: "Main + Blocking + Format + Contextual" },
  pillars:          { count: 6,  label: "Pilares secuenciales", hint: "Onboard·Offer·Brand·Ads 7·Funnel·Report" },
  laurel_subskills: { count: 5,  label: "Laurel 2026 Sub-Skills", hint: "Constraint·Power Content·Hot 7·3x3·Stealth Influence" }
};

const CATEGORY_ORDER = [
  "meta_docs","nucleus_main","universal","language","nationality","tone","transversal","qa_validator","pillars","laurel_subskills"
];

let skillsData = null;

export async function loadSkills(panelEl) {
  try {
    const res = await fetch("skills.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    skillsData = await res.json();
    renderAdmin(panelEl, skillsData);
  } catch (err) {
    renderAdminError(panelEl, err);
  }
}

function renderAdmin(panel, data) {
  const skillsOnly = data.skills.filter(s => s.category !== "meta_docs");
  const db = dbStatus();

  panel.innerHTML = `
    <div class="panel-header">
      <h2>Neural Infrastructure</h2>
      <div class="metrics">
        <div class="metric">
          <span class="metric-value">${skillsOnly.length}</span>
          <span class="metric-label">Skills activadas</span>
        </div>
        <div class="metric">
          <span class="metric-value">${data.meta.total_files}</span>
          <span class="metric-label">Archivos cargados</span>
        </div>
        <div class="metric">
          <span class="metric-value">${Math.round(data.meta.total_size / 1024)}</span>
          <span class="metric-label">KB en memoria</span>
        </div>
      </div>
    </div>

    <div class="alert alert--ok">
      <strong>✓ Skills cargados correctamente.</strong>
      ${data.meta.total_files} archivos · ${Math.round(data.meta.total_size/1024)} KB · generados ${new Date(data.meta.generated_at).toLocaleString("es")}.
    </div>

    <div class="alert ${db.ready ? "alert--ok" : "alert--orange-soft"}">
      <strong>💾 DB:</strong> ${db.mode} · proyecto <code>${db.projectId}</code>
      ${db.databaseId !== "(default)" ? `· database <code>${db.databaseId.substring(0,30)}…</code>` : ""}
      ${!db.ready ? `<br><small>${db.lastError || "Firebase no inicializado · usando localStorage como fallback"}</small>` : ""}
    </div>

    <div class="category-grid">
      ${CATEGORY_ORDER.map(cat => {
        const meta = EXPECTED_COUNTS[cat];
        const actual = data.counts[cat] || 0;
        const mismatch = actual !== meta.count;
        const items = data.skills.filter(s => s.category === cat);
        return `
          <div class="category-card">
            <div class="category-card__header">
              <div>
                <div class="category-card__title">${meta.label}</div>
                <div class="category-card__expected">${meta.hint}</div>
              </div>
              <div class="category-card__count ${mismatch ? "category-card__count--mismatch" : ""}">
                ${actual} / ${meta.count}
              </div>
            </div>
            <ul class="category-card__items">
              ${items.map(s => `<li>${s.filename}</li>`).join("")}
            </ul>
          </div>
        `;
      }).join("")}
    </div>

    <details class="full-list">
      <summary>Ver listado completo de los ${data.skills.length} archivos</summary>
      <table id="skills-table">
        <thead>
          <tr><th>#</th><th>Categoría</th><th>Archivo</th><th>Líneas</th><th>Tamaño</th><th></th></tr>
        </thead>
        <tbody>
          ${data.skills.map((s, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><span class="tag tag--${s.category}">${s.category.replace("_"," ")}</span></td>
              <td>${s.filename}</td>
              <td>${s.line_count}</td>
              <td>${(s.size_bytes/1024).toFixed(1)} KB</td>
              <td><button class="btn-link" data-id="${s.id}">Ver contenido</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </details>
  `;

  panel.querySelectorAll(".btn-link").forEach(btn => {
    btn.addEventListener("click", e => {
      const skill = data.skills.find(s => s.id === btn.dataset.id);
      if (skill) openModal(skill);
    });
  });
}

function renderAdminError(panel, err) {
  panel.innerHTML = `
    <div class="panel-header"><h2>Neural Infrastructure</h2></div>
    <div class="alert alert--error">
      <strong>No pude cargar <code>skills.json</code>.</strong><br>
      Razón: ${err.message}<br><br>
      <strong>Cómo arreglarlo:</strong><br>
      1. PowerShell en <code>C:\\Users\\Usuario\\trident-os-app</code><br>
      2. <code>python build-skills-json.py</code><br>
      3. Refrescá esta página
    </div>
  `;
}

function openModal(skill) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div>
          <strong>${skill.filename}</strong>
          <span class="tag tag--${skill.category}" style="margin-left:8px">${skill.category.replace("_"," ")}</span>
        </div>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;
  backdrop.querySelector(".modal-body").textContent = skill.content;
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop || e.target.classList.contains("modal-close")) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}
