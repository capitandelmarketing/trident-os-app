// brief-importer.js — Carga rápida de brief existente via Gemini extraction
// Operator sube .md/.txt/.json o pega texto libre → Gemini extrae los 35 campos del schema
// → tabla de revisión → aplicar al wizard state

import { generate } from "./gemini.js";
import { OFFICIAL_DATA_FIELDS, BRIEF_INPUTS, LANGUAGES, NATIONALITIES, TONES } from "./brief-schema.js";
import { ensurePapaParse, ensureMammoth, ensurePdfJs } from "./lazy-loader.js";

// ============ PUBLIC API ============
// opts: { onApply(extracted), onCancel }
export function openBriefImporter(opts) {
  const { onApply, onCancel } = opts || {};
  let currentText = "";
  let extractedData = null;
  let isExtracting = false;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop brief-importer";
  backdrop.innerHTML = `
    <div class="modal modal--wide modal--importer">
      <div class="modal-header">
        <strong>⚡ Cargar brief existente</strong>
        <button class="modal-close" aria-label="Cerrar">×</button>
      </div>

      <div class="modal-body modal-body--importer" id="importer-body">
        <p class="importer-intro">
          La IA va a leer tu brief (en cualquier formato) y autocompletar el wizard con los 35 campos del cliente.
          Acepta <strong>.md · .txt · .json · .csv · .docx · .pdf</strong> · si tu CSV tiene varios briefs, te muestra selector para elegir cuál importar.
          Después podés revisar y ajustar antes de guardar.
        </p>

        <div class="importer-tabs">
          <button class="importer-tab importer-tab--active" data-tab="paste">📋 Pegar texto</button>
          <button class="importer-tab" data-tab="upload">📁 Subir archivo</button>
        </div>

        <div class="importer-tab-content" id="importer-tab-paste">
          <textarea
            id="importer-paste"
            placeholder="Pegá acá el brief del cliente · markdown, texto plano, lo que sea. Ej:
Realtor: Guillermo Gori, brokerage Coldwell Banker, licencia FL-123456.
Zona: Florida · Miami-Dade · enfoque inversionistas LATAM.
Arrancó en 2019. Habla español/inglés.
Programas DPA: Florida Hometown Heroes hasta $35K cred 640..."
            rows="14"></textarea>
          <p class="importer-hint">Tip: si tu brief está en un .docx, abrilo, Ctrl+A, Ctrl+C, pegá acá.</p>
        </div>

        <div class="importer-tab-content" id="importer-tab-upload" hidden>
          <div class="importer-dropzone" id="importer-dropzone">
            <div class="importer-dropzone__inner">
              <div class="importer-dropzone__icon">📥</div>
              <p><strong>Arrastrá un archivo aquí</strong></p>
              <p class="muted">o</p>
              <button class="btn btn--ghost" id="importer-pick-file">Elegir archivo</button>
              <input type="file" id="importer-file-input" accept=".md,.markdown,.txt,.json,.csv,.docx,.pdf,.tsv" hidden>
              <p class="muted importer-formats">Formatos: .md · .txt · .json · .csv · .docx · .pdf · .tsv</p>
            </div>
          </div>
          <div class="importer-file-preview" id="importer-file-preview" hidden></div>
          <div class="importer-csv-selector" id="importer-csv-selector" hidden></div>
        </div>

        <div class="importer-progress" id="importer-progress" hidden>
          <div class="importer-spinner"></div>
          <p id="importer-progress-text">Leyendo con IA…</p>
        </div>

        <div class="importer-results" id="importer-results" hidden></div>
      </div>

      <div class="modal-footer">
        <button class="btn btn--ghost" id="importer-cancel">Cancelar</button>
        <button class="btn btn--primary" id="importer-extract" disabled>Extraer con IA</button>
        <button class="btn btn--primary" id="importer-apply" hidden>Aplicar al wizard</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // ============ Tabs ============
  backdrop.querySelectorAll(".importer-tab").forEach(t => {
    t.addEventListener("click", () => {
      backdrop.querySelectorAll(".importer-tab").forEach(x => x.classList.remove("importer-tab--active"));
      t.classList.add("importer-tab--active");
      backdrop.querySelector("#importer-tab-paste").hidden = t.dataset.tab !== "paste";
      backdrop.querySelector("#importer-tab-upload").hidden = t.dataset.tab !== "upload";
    });
  });

  // ============ Paste ============
  const pasteEl = backdrop.querySelector("#importer-paste");
  pasteEl.addEventListener("input", () => {
    currentText = pasteEl.value.trim();
    backdrop.querySelector("#importer-extract").disabled = currentText.length < 50;
  });

  // ============ Upload ============
  const dropzone = backdrop.querySelector("#importer-dropzone");
  const fileInput = backdrop.querySelector("#importer-file-input");
  const filePreview = backdrop.querySelector("#importer-file-preview");
  const pickFileBtn = backdrop.querySelector("#importer-pick-file");

  pickFileBtn.addEventListener("click", () => fileInput.click());

  const csvSelector = backdrop.querySelector("#importer-csv-selector");

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      window.notifyInfo?.(`Archivo muy grande (${(file.size/1024/1024).toFixed(1)}MB · máx 10MB)`, "attention");
      return;
    }

    // Reset state
    csvSelector.hidden = true;
    csvSelector.innerHTML = "";
    filePreview.hidden = true;
    backdrop.querySelector("#importer-extract").disabled = true;

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const fileInfo = `<span>📄 <strong>${escape(file.name)}</strong></span><span class="muted">${(file.size/1024).toFixed(1)} KB · ${ext.toUpperCase()}</span>`;

    try {
      let parsed = null;

      if (["md", "markdown", "txt", "json"].includes(ext)) {
        // Plain text · read directly
        parsed = { kind: "text", text: (await file.text()).trim() };

      } else if (ext === "csv" || ext === "tsv") {
        // CSV/TSV via Papa Parse · may contain multiple briefs
        const Papa = await ensurePapaParse();
        const text = await file.text();
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          delimiter: ext === "tsv" ? "\t" : "",  // empty = auto-detect
          dynamicTyping: false
        });
        if (result.errors.length > 0 && result.data.length === 0) {
          throw new Error(`CSV parse error: ${result.errors[0].message}`);
        }
        const rows = result.data.filter(r => Object.values(r).some(v => String(v || "").trim() !== ""));
        if (rows.length === 0) throw new Error("CSV vacío o sin filas con datos");
        parsed = { kind: "csv", rows, headers: result.meta.fields };

      } else if (ext === "docx") {
        // DOCX via mammoth.js
        const mammoth = await ensureMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        if (result.messages?.length > 0) {
          console.warn("[importer] mammoth warnings:", result.messages);
        }
        parsed = { kind: "text", text: (result.value || "").trim() };

      } else if (ext === "pdf") {
        // PDF via pdf.js
        const pdfjsLib = await ensurePdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const allText = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(" ");
          allText.push(`--- Página ${i} ---\n${pageText}`);
        }
        parsed = { kind: "text", text: allText.join("\n\n").trim() };

      } else {
        throw new Error(`Formato no soportado: .${ext} · usá .md, .txt, .json, .csv, .docx o .pdf`);
      }

      // Show file info preview
      filePreview.hidden = false;

      if (parsed.kind === "text") {
        currentText = parsed.text;
        filePreview.innerHTML = `
          <div class="file-info">${fileInfo}<span class="muted">${currentText.length.toLocaleString()} caracteres</span></div>
          <pre class="file-preview-text">${escape(currentText.slice(0, 600))}${currentText.length > 600 ? "\n…" : ""}</pre>
        `;
        backdrop.querySelector("#importer-extract").disabled = currentText.length < 50;

      } else if (parsed.kind === "csv") {
        filePreview.innerHTML = `
          <div class="file-info">${fileInfo}<span class="muted">${parsed.rows.length} fila${parsed.rows.length === 1 ? "" : "s"} · ${parsed.headers.length} columnas</span></div>
        `;

        if (parsed.rows.length === 1) {
          // Single row · convert and use directly
          currentText = csvRowToQA(parsed.rows[0]);
          backdrop.querySelector("#importer-extract").disabled = false;
        } else {
          // Multiple rows · show selector
          csvSelector.hidden = false;
          csvSelector.innerHTML = `
            <div class="csv-selector-header">
              <strong>Tu CSV tiene ${parsed.rows.length} briefs.</strong> ¿Cuál querés importar?
            </div>
            <div class="csv-selector-list">
              ${parsed.rows.map((row, idx) => {
                const name = guessName(row);
                const preview = previewRow(row);
                return `
                  <label class="csv-row-option">
                    <input type="radio" name="csv-row" value="${idx}" ${idx === 0 ? "checked" : ""}>
                    <div class="csv-row-content">
                      <strong>${escape(name)}</strong>
                      <p class="muted">${escape(preview)}</p>
                    </div>
                  </label>
                `;
              }).join("")}
            </div>
          `;
          // Wire radio change to update currentText
          const updateFromSelection = () => {
            const checked = csvSelector.querySelector("input[name=csv-row]:checked");
            if (!checked) return;
            const row = parsed.rows[parseInt(checked.value, 10)];
            currentText = csvRowToQA(row);
            backdrop.querySelector("#importer-extract").disabled = currentText.length < 50;
          };
          csvSelector.querySelectorAll("input[name=csv-row]").forEach(r => {
            r.addEventListener("change", updateFromSelection);
          });
          updateFromSelection();  // initial
        }
      }
    } catch (err) {
      window.notifyInfo?.(`Error leyendo archivo: ${err.message}`, "attention");
      filePreview.hidden = false;
      filePreview.innerHTML = `<div class="alert alert--error">⚠ ${escape(err.message)}</div>`;
    }
  };

  // Convert a CSV row (object) to "Pregunta: ... · Respuesta: ..." text · Gemini parses better
  function csvRowToQA(row) {
    return Object.entries(row)
      .filter(([k, v]) => k && String(v || "").trim() !== "")
      .map(([k, v]) => `${k.trim()}: ${String(v).trim()}`)
      .join("\n\n");
  }

  // Try to guess a human-readable name for a CSV row (for the selector)
  function guessName(row) {
    const nameKeys = Object.keys(row).filter(k => /name|nombre/i.test(k));
    for (const k of nameKeys) {
      const v = String(row[k] || "").trim();
      if (v && v.length < 60) return v;
    }
    // Fallback: first non-empty value
    const firstVal = Object.values(row).find(v => String(v || "").trim());
    return firstVal ? String(firstVal).slice(0, 50) : "(sin nombre)";
  }

  // Preview a row for the selector · show email, zone, brokerage if available
  function previewRow(row) {
    const interesting = ["email", "brokerage", "zona", "city", "ciudad", "phone", "teléfono", "telefono", "whatsapp"];
    const parts = [];
    for (const key of Object.keys(row)) {
      const lc = key.toLowerCase();
      if (interesting.some(t => lc.includes(t))) {
        const val = String(row[key] || "").trim();
        if (val && val.length < 80) parts.push(val);
        if (parts.length >= 3) break;
      }
    }
    return parts.join(" · ") || "(sin preview)";
  }

  fileInput.addEventListener("change", e => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.add("importer-dropzone--active");
    });
  });
  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.remove("importer-dropzone--active");
    });
  });
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  // ============ Extract ============
  const progress = backdrop.querySelector("#importer-progress");
  const progressText = backdrop.querySelector("#importer-progress-text");
  const results = backdrop.querySelector("#importer-results");
  const extractBtn = backdrop.querySelector("#importer-extract");
  const applyBtn = backdrop.querySelector("#importer-apply");

  extractBtn.addEventListener("click", async () => {
    if (!currentText || isExtracting) return;
    isExtracting = true;
    extractBtn.disabled = true;
    progress.hidden = false;
    results.hidden = true;
    progressText.textContent = `Leyendo ${currentText.length.toLocaleString()} caracteres con IA…`;

    try {
      const startMs = Date.now();
      extractedData = await extractBriefWithGemini(currentText, (msg) => {
        progressText.textContent = msg;
      });
      const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
      progress.hidden = true;
      results.hidden = false;
      results.innerHTML = renderResultsTable(extractedData, elapsedSec);
      wireResultsToggle(results);
      applyBtn.hidden = false;
      extractBtn.hidden = true;
    } catch (err) {
      progress.hidden = true;
      results.hidden = false;
      results.innerHTML = `<div class="alert alert--error">⚠ Error extracting: ${escape(err.message)}</div>`;
      extractBtn.disabled = false;
      isExtracting = false;
    }
  });

  // ============ Apply ============
  applyBtn.addEventListener("click", () => {
    if (!extractedData) return;
    backdrop.remove();
    onApply?.(extractedData);
  });

  // ============ Cancel / Close ============
  const close = () => {
    backdrop.remove();
    onCancel?.();
  };
  backdrop.querySelector("#importer-cancel").addEventListener("click", close);
  backdrop.querySelector(".modal-close").addEventListener("click", close);
}

// ============ GEMINI EXTRACTION ============
async function extractBriefWithGemini(briefText, onProgress) {
  const schema = buildSchemaSummary();
  const prompt = `Sos un parser experto en briefs de marketing inmobiliario para realtors latinos en USA.

TAREA: Leer el brief de un realtor (formato libre) y extraer EXACTAMENTE estos campos. Devolver SOLO un objeto JSON válido (sin markdown wrappers, sin explicaciones, sin texto antes ni después).

SCHEMA A EXTRAER:
${schema}

REGLAS CRÍTICAS:
- Si un campo NO aparece en el brief o no podés inferirlo con certeza, omitilo del JSON (no inventes valores).
- Para campos enum (primary_avatar, language, nationality, tone, pillars_active), usar EXACTAMENTE los IDs listados.
- "years_experience" debe ser el año fijo en que arrancó (ej. "2019"), no "5 años".
- "geo_zone" formato: "Estado · Condado · Ciudades" (ej. "Florida · Miami-Dade · Hialeah · Doral").
- Devolver string vacío "" NO es válido · si no hay info, omitir la key.
- Output SOLO JSON · empieza con { y termina con }.

BRIEF:
${briefText.slice(0, 50000)}`;

  onProgress?.("Llamando Gemini 2.5-flash…");

  // Retry on transient errors (503/429) · Gemini frequently rate-limits or has demand spikes
  let result = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await generate(prompt, {
        temperature: 0.2,
        maxOutputTokens: 8192,
        thinkingBudget: 0
      });
      break;
    } catch (err) {
      lastErr = err;
      const msg = err.message || "";
      const isTransient = /\b503\b|\b429\b|UNAVAILABLE|RESOURCE_EXHAUSTED|temporary|high demand/i.test(msg);
      if (!isTransient || attempt === 3) throw err;
      const delayMs = 1500 * attempt;
      onProgress?.(`Gemini saturado · reintento ${attempt}/3 en ${delayMs/1000}s…`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  if (!result) throw lastErr || new Error("Gemini failed after 3 retries");

  onProgress?.("Parsing JSON respuesta…");

  // Strip any markdown wrappers Gemini may add despite instructions
  let jsonText = result.text.trim();
  jsonText = jsonText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```\s*$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Gemini devolvió JSON inválido · ${err.message}`);
  }

  // Validate enums + flag uncertain fields
  return validateAndAnnotate(parsed);
}

function buildSchemaSummary() {
  const officialFields = OFFICIAL_DATA_FIELDS.map(f => `  - ${f.id}: ${f.label}`).join("\n");
  const briefByLine = BRIEF_INPUTS.filter(i => i.type !== "checkbox" && i.type !== "multicheck" && i.type !== "localization_panel")
    .map(i => `  - brief.${i.section}.${i.id}: ${i.label}`).join("\n");
  const avatarOptions = BRIEF_INPUTS.find(i => i.id === "primary_avatar").options.join(" | ");
  const languageOpts = LANGUAGES.map(l => l.id).join(" | ");
  const nationalityOpts = NATIONALITIES.map(n => n.id).join(" | ");
  const toneOpts = TONES.map(t => t.id).join(" | ");

  return `
{
  "official_data": {
${officialFields.replace(/^  - /gm, '    ').split('\n').map(l => l + ',').join('\n').slice(0, -1)}
  },
  "brief": {
${briefByLine}

    "avatar.primary_avatar": ENUM(${avatarOptions}),
    "activation.localization.language": ENUM(${languageOpts}),
    "activation.localization.nationality": ENUM(${nationalityOpts}),
    "activation.localization.tone": ENUM(${toneOpts}),
    "activation.pillars_active": {
      "p1_onboard": true, "p2_offer": true, "p3_brand": true,
      "p4_ads7": true, "p5_funnel": true, "p6_report": true
    }
  }
}`.trim();
}

// Coerce any value (string, number, array, object) to a clean string · avoids "[object Object]"
function toStr(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    // Array of primitives → comma-separated · array of objects → newline-separated JSON-ish
    return val.map(item => {
      if (typeof item === "object" && item !== null) {
        return Object.entries(item).map(([k, v]) => `${k}: ${toStr(v)}`).join(" · ");
      }
      return String(item);
    }).join("\n");
  }
  if (typeof val === "object") {
    return Object.entries(val).map(([k, v]) => `${k}: ${toStr(v)}`).join("\n");
  }
  return String(val);
}

function validateAndAnnotate(parsed) {
  const out = { official_data: {}, brief: { realtor: {}, avatar: {}, data: {}, activation: {} } };
  const issues = [];

  // ============ official_data
  if (parsed.official_data) {
    OFFICIAL_DATA_FIELDS.forEach(f => {
      const str = toStr(parsed.official_data[f.id]);
      if (str !== "") out.official_data[f.id] = str;
    });
  }

  // ============ brief
  if (parsed.brief) {
    // realtor (10)
    BRIEF_INPUTS.filter(i => i.section === "realtor").forEach(i => {
      const str = toStr(parsed.brief.realtor?.[i.id]);
      if (str !== "") out.brief.realtor[i.id] = str;
    });
    // avatar (4)
    BRIEF_INPUTS.filter(i => i.section === "avatar").forEach(i => {
      const val = parsed.brief.avatar?.[i.id];
      const str = toStr(val);
      if (str !== "") {
        if (i.id === "primary_avatar") {
          const valid = i.options.includes(str);
          if (!valid) {
            issues.push(`primary_avatar inválido "${str}" · valores válidos: ${i.options.join(", ")}`);
          } else {
            out.brief.avatar.primary_avatar = str;
          }
        } else {
          out.brief.avatar[i.id] = str;
        }
      }
    });
    // data (2)
    BRIEF_INPUTS.filter(i => i.section === "data").forEach(i => {
      const str = toStr(parsed.brief.data?.[i.id]);
      if (str !== "") out.brief.data[i.id] = str;
    });
    // activation (localization + pillars)
    const loc = parsed.brief.activation?.localization || {};
    const validLang = LANGUAGES.find(l => l.id === loc.language);
    const validNat = NATIONALITIES.find(n => n.id === loc.nationality);
    const validTone = TONES.find(t => t.id === loc.tone);
    out.brief.activation.localization = {
      language:    validLang?.id || LANGUAGES.find(l => l.default).id,
      nationality: validNat?.id  || NATIONALITIES.find(n => n.default).id,
      tone:        validTone?.id || TONES.find(t => t.default).id
    };
    if (loc.language && !validLang) issues.push(`language "${loc.language}" inválido · default aplicado`);
    if (loc.nationality && !validNat) issues.push(`nationality "${loc.nationality}" inválido · default aplicado`);
    if (loc.tone && !validTone) issues.push(`tone "${loc.tone}" inválido · default aplicado`);

    const pa = parsed.brief.activation?.pillars_active;
    if (pa && typeof pa === "object") {
      out.brief.activation.pillars_active = {
        p1_onboard: true,  // always locked
        p2_offer:  pa.p2_offer  !== false,
        p3_brand:  pa.p3_brand  !== false,
        p4_ads7:   pa.p4_ads7   !== false,
        p5_funnel: pa.p5_funnel !== false,
        p6_report: pa.p6_report !== false
      };
    }
  }

  return { extracted: out, issues };
}

// ============ RENDER RESULTS TABLE ============
function renderResultsTable({ extracted, issues }, elapsedSec) {
  const officialRows = OFFICIAL_DATA_FIELDS.map(f => {
    const val = extracted.official_data[f.id];
    return rowHTML(f.label, val, "official_data." + f.id);
  }).join("");

  const realtorRows = BRIEF_INPUTS.filter(i => i.section === "realtor").map(i => {
    const val = extracted.brief.realtor[i.id];
    return rowHTML(i.label, val, "brief.realtor." + i.id);
  }).join("");

  const avatarRows = BRIEF_INPUTS.filter(i => i.section === "avatar").map(i => {
    const val = extracted.brief.avatar[i.id];
    return rowHTML(i.label, val, "brief.avatar." + i.id);
  }).join("");

  const dataRows = BRIEF_INPUTS.filter(i => i.section === "data").map(i => {
    const val = extracted.brief.data[i.id];
    return rowHTML(i.label, val, "brief.data." + i.id);
  }).join("");

  const loc = extracted.brief.activation?.localization || {};
  const pillars = extracted.brief.activation?.pillars_active || {};

  const totalFields = OFFICIAL_DATA_FIELDS.length + BRIEF_INPUTS.filter(i => i.type !== "checkbox" && i.type !== "multicheck" && i.type !== "localization_panel").length;
  let extractedCount = Object.keys(extracted.official_data).length
    + Object.keys(extracted.brief.realtor).length
    + Object.keys(extracted.brief.avatar).length
    + Object.keys(extracted.brief.data).length;
  const coverage = Math.round((extractedCount / totalFields) * 100);

  return `
    <div class="importer-summary">
      <div class="summary-stat">
        <strong>${extractedCount}</strong>
        <span>de ${totalFields} campos extraídos</span>
      </div>
      <div class="summary-stat">
        <strong>${coverage}%</strong>
        <span>cobertura</span>
      </div>
      <div class="summary-stat">
        <strong>${elapsedSec}s</strong>
        <span>Gemini 2.5-flash</span>
      </div>
    </div>

    ${issues.length > 0 ? `
      <div class="alert alert--warn">
        ⚠ ${issues.length} advertencia${issues.length === 1 ? "" : "s"}:
        <ul>${issues.map(i => `<li>${escape(i)}</li>`).join("")}</ul>
      </div>
    ` : ""}

    <div class="results-section">
      <h4 class="results-section-title">📋 Datos Oficiales (${countFilled(OFFICIAL_DATA_FIELDS, extracted.official_data)}/${OFFICIAL_DATA_FIELDS.length})</h4>
      <table class="results-table">${officialRows}</table>
    </div>

    <div class="results-section">
      <h4 class="results-section-title">👤 Realtor (${Object.keys(extracted.brief.realtor).length}/10)</h4>
      <table class="results-table">${realtorRows}</table>
    </div>

    <div class="results-section">
      <h4 class="results-section-title">🎯 Avatar (${Object.keys(extracted.brief.avatar).length}/4)</h4>
      <table class="results-table">${avatarRows}</table>
    </div>

    <div class="results-section">
      <h4 class="results-section-title">📊 Brokerage / Política (${Object.keys(extracted.brief.data).length}/2)</h4>
      <table class="results-table">${dataRows}</table>
    </div>

    <div class="results-section">
      <h4 class="results-section-title">⚙️ Activación</h4>
      <table class="results-table">
        ${rowHTML("Idioma", loc.language, "lang")}
        ${rowHTML("Nacionalidad (override)", loc.nationality, "nat")}
        ${rowHTML("Tono", loc.tone, "tone")}
        ${rowHTML("Pilares activos", Object.entries(pillars).filter(([_, v]) => v).map(([k]) => k.replace("p", "P")).join(" · "), "pillars")}
      </table>
    </div>

    <p class="importer-final-hint muted">
      Click <strong>"Aplicar al wizard"</strong> abajo · vas a entrar al wizard normal con todos los campos pre-cargados.
      Revisá pantalla por pantalla y ajustá lo que haga falta antes de guardar.
    </p>
  `;
}

function rowHTML(label, val, key) {
  const filled = val !== undefined && val !== null && String(val).trim() !== "";
  const cellVal = filled
    ? `<span class="result-val">${escape(String(val).slice(0, 200))}${String(val).length > 200 ? "…" : ""}</span>`
    : `<span class="result-empty">— no encontrado —</span>`;
  return `
    <tr class="result-row ${filled ? "result-row--filled" : "result-row--empty"}">
      <td class="result-label">
        <span class="result-icon">${filled ? "✓" : "·"}</span>
        ${escape(label)}
      </td>
      <td class="result-value">${cellVal}</td>
    </tr>
  `;
}

function countFilled(fields, data) {
  return fields.filter(f => data[f.id] !== undefined && String(data[f.id]).trim() !== "").length;
}

function wireResultsToggle(_results) {
  // Future: allow click on a row to override individual fields manually
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
