// pillars.js — Tab Pilares: selector de cliente · ejecución pilar · render output
// Turn 3 deliverable. Conecta context-builder + gemini + output-storage.

import { listClients, saveOutput, listOutputs } from "./db.js";
import { buildContext, loadSkillsOnce } from "./context-builder.js";
import { generateStream } from "./gemini.js";
import { validateOutput, buildCorrectionPrompt } from "./qa-validator.js";
import { PILLAR_META } from "./brief-schema.js";

const MAX_QA_CYCLES = 3;

const PILLAR_KEYS = [
  "pillar_onboard","pillar_offer","pillar_brand","pillar_ads7","pillar_funnel","pillar_report"
];

let currentClient = null;
let panelRef = null;

export async function renderPillarsTab(panelEl) {
  panelRef = panelEl;
  await loadSkillsOnce();  // warm cache
  const res = await listClients();
  const clients = res.clients || [];

  panelEl.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>6 Pilares secuenciales</h2>
        <p class="subtitle">Onboard · Offer · Brand · Ads 7 · Funnel · Report — generación con Gemini + QA Validator</p>
      </div>
    </div>

    <div class="pillars-layout">
      <aside class="pillars-sidebar">
        <h3>Cliente</h3>
        ${clients.length === 0 ? `
          <p class="muted">No hay clientes guardados.<br>Andá al wizard de Onboarding primero.</p>
        ` : `
          <select id="client-selector">
            <option value="">— elegí cliente —</option>
            ${clients.map(c => `
              <option value="${c.id}">${escape(c.brief?.realtor?.full_name || c.id)}</option>
            `).join("")}
          </select>
          <div id="client-info" class="client-info-box"></div>
        `}
      </aside>

      <section class="pillars-grid" id="pillars-grid">
        ${PILLAR_KEYS.map((k, idx) => renderPillarCard(k, idx)).join("")}
      </section>
    </div>

    <div id="pillar-output-modal"></div>
  `;

  const selector = document.getElementById("client-selector");
  if (selector) {
    selector.addEventListener("change", e => {
      const id = e.target.value;
      currentClient = clients.find(c => c.id === id) || null;
      renderClientInfo();
      updatePillarCards();
    });
  }

  // Wire generate buttons
  panelEl.querySelectorAll("[data-pillar-action='generate']").forEach(btn => {
    btn.addEventListener("click", () => runPillar(btn.dataset.pillarKey));
  });
}

function renderPillarCard(key, idx) {
  const meta = PILLAR_META[key];
  return `
    <div class="pillar-card" data-pillar-key="${key}">
      <div class="pillar-card__head">
        <span class="pillar-num">${meta.num}</span>
        <div>
          <strong>${meta.name}</strong>
          <small class="muted">${meta.time}</small>
        </div>
        <span class="pillar-status" data-status="idle">○ Sin generar</span>
      </div>
      <p class="pillar-desc">${meta.desc}</p>
      <div class="pillar-card__actions">
        <button class="btn btn--primary" data-pillar-action="generate" data-pillar-key="${key}" disabled>
          Generar Pilar ${meta.num}
        </button>
      </div>
    </div>
  `;
}

function renderClientInfo() {
  const el = document.getElementById("client-info");
  if (!el) return;
  if (!currentClient) {
    el.innerHTML = "";
    return;
  }
  const c = currentClient;
  const loc = c.brief?.activation?.localization || {};
  const pillarsActive = c.brief?.activation?.pillars_active || {};
  const activeCount = Object.values(pillarsActive).filter(Boolean).length;

  el.innerHTML = `
    <div class="client-info-block">
      <strong>${escape(c.brief?.realtor?.full_name || c.id)}</strong>
      <p class="muted">${escape(c.brief?.realtor?.geo_zone || "—")}</p>
      <p class="muted">Avatar: ${escape(c.brief?.avatar?.primary_avatar || "—")}</p>
      <p class="muted">${activeCount}/6 pilares activos</p>
      <p class="muted">
        <code>${loc.language?.replace("lang-","")}</code> ·
        <code>${(loc.nationality || "none").replace("nat-es-","")}</code> ·
        <code>${loc.tone?.replace("tone-","")}</code>
      </p>
    </div>
  `;
}

async function updatePillarCards() {
  panelRef.querySelectorAll("[data-pillar-action='generate']").forEach(btn => {
    btn.disabled = !currentClient;
  });
  if (!currentClient) return;

  // Show previously generated outputs status
  const outputsRes = await listOutputs(currentClient.id);
  const outputs = outputsRes.outputs || [];
  const byPillar = outputs.reduce((acc, o) => ({ ...acc, [o.pillar_key]: o }), {});

  panelRef.querySelectorAll(".pillar-card").forEach(card => {
    const key = card.dataset.pillarKey;
    const status = card.querySelector(".pillar-status");
    const existing = byPillar[key];
    if (existing) {
      status.dataset.status = "done";
      status.innerHTML = `✓ Generado ${formatDate(existing.generated_at)}`;
      const btn = card.querySelector("[data-pillar-action='generate']");
      btn.textContent = "Regenerar";
      // Add a "view" button
      if (!card.querySelector("[data-pillar-action='view']")) {
        const viewBtn = document.createElement("button");
        viewBtn.className = "btn btn--ghost";
        viewBtn.dataset.pillarAction = "view";
        viewBtn.dataset.pillarKey = key;
        viewBtn.textContent = "Ver output";
        viewBtn.addEventListener("click", () => viewOutput(key));
        card.querySelector(".pillar-card__actions").prepend(viewBtn);
      }
    }
  });
}

async function runPillar(pillarKey) {
  if (!currentClient) {
    alert("Elegí un cliente primero.");
    return;
  }
  const meta = PILLAR_META[pillarKey];
  const card = panelRef.querySelector(`.pillar-card[data-pillar-key="${pillarKey}"]`);
  const status = card.querySelector(".pillar-status");
  const btn = card.querySelector("[data-pillar-action='generate']");

  // Open progress modal
  openProgressModal(meta);

  try {
    // Step 1 — build context
    setProgress("Ensamblando context cascade…", 10);
    const ctx = await buildContext(currentClient, pillarKey);
    setProgress(`Context: ${ctx.meta.skillCount} skills · ${ctx.meta.tokenEstimate.toLocaleString()} tokens estimados`, 20);
    appendMeta(ctx.meta);

    // Step 2 — call Gemini with streaming (initial cycle)
    setProgress("Generando con Gemini…", 25);
    status.dataset.status = "running";
    status.textContent = "⏳ Generando…";
    btn.disabled = true;

    let currentPrompt = ctx.prompt;
    let finalResult = null;
    let qaResult = null;
    let cyclesUsed = 0;
    const usageTotals = { tokens: 0, elapsedMs: 0 };
    const qaHistory = [];

    for (let cycle = 0; cycle < MAX_QA_CYCLES; cycle++) {
      cyclesUsed = cycle + 1;
      const cycleLabel = cycle === 0 ? "ciclo 1 · generación inicial" : `ciclo ${cycle+1} · corrección por QA`;
      setProgress(`Generando con Gemini (${cycleLabel})…`, 25 + cycle * 20);

      const result = await generateStream(currentPrompt, {
        temperature: 0.7,
        maxOutputTokens: 32768,
        thinkingBudget: 0,
        onChunk: (delta, full) => {
          const pct = Math.min(40 + cycle * 20, 25 + cycle * 20 + Math.round((full.length / 5000) * 15));
          setProgress(`Generando · ${cycleLabel} · ${full.length} chars`, pct);
          appendOutputPreview(full);
        }
      });
      usageTotals.tokens   += result.usage.totalTokens || 0;
      usageTotals.elapsedMs += result.usage.elapsedMs || 0;
      finalResult = result;

      // Step 3 — QA Validator
      setProgress(`QA Validator · ciclo ${cycle+1}/3…`, 45 + cycle * 20);
      qaResult = await validateOutput(result.text, pillarKey, currentClient, {
        onProgress: (msg) => setProgress(`QA · ${msg}`, 50 + cycle * 20)
      });
      qaResult.cycles_used = cycle + 1;
      qaHistory.push({
        cycle: cycle + 1,
        qa: qaResult.qa,
        violations: qaResult.violations.length,
        violation_ids: qaResult.violations.map(v => v.rule_id)
      });

      if (qaResult.qa === "PASS") {
        setProgress(`✅ QA PASS en ciclo ${cycle+1}`, 90);
        break;
      }

      if (cycle < MAX_QA_CYCLES - 1) {
        setProgress(`QA FAIL · ${qaResult.violations.length} violaciones · regenerando…`, 60 + cycle * 20);
        currentPrompt = buildCorrectionPrompt(ctx.prompt, result.text, qaResult, cycle + 1);
      } else {
        setProgress(`⚠️ QA FAIL después de ${MAX_QA_CYCLES} ciclos · requiere intervención humana`, 90, "error");
      }
    }

    setProgress("Guardando en Firestore…", 96);

    // Step 4 — save output with QA result
    const output = {
      client_id: currentClient.id,
      pillar_key: pillarKey,
      generated_at: new Date().toISOString(),
      content: finalResult.text,
      meta: {
        ...ctx.meta,
        usage: { ...finalResult.usage, total_across_cycles: usageTotals },
        finishReason: finalResult.finishReason
      },
      qa_status: qaResult.qa,                          // "PASS" | "FAIL"
      qa_cycles_used: cyclesUsed,
      qa_max_cycles: MAX_QA_CYCLES,
      qa_layers: qaResult.layers,
      qa_violations: qaResult.violations,
      qa_history: qaHistory,
      qa_ai_calls: qaResult.ai_used || []
    };
    const saveRes = await saveOutput(currentClient.id, pillarKey, output);

    const qaBadge = qaResult.qa === "PASS"
      ? `✅ QA PASS (${cyclesUsed} ciclo${cyclesUsed === 1 ? "" : "s"})`
      : `⚠️ QA FAIL (${cyclesUsed}/${MAX_QA_CYCLES} ciclos · ${qaResult.violations.length} violaciones)`;
    setProgress(`${qaBadge} · ${usageTotals.tokens.toLocaleString()} tokens · ${(usageTotals.elapsedMs/1000).toFixed(1)}s · ${saveRes.mode}`, 100);

    status.dataset.status = qaResult.qa === "PASS" ? "done" : "qa-fail";
    status.innerHTML = qaResult.qa === "PASS" ? `✓ QA PASS` : `⚠ QA FAIL`;
    btn.disabled = false;
    btn.textContent = "Regenerar";

    // Show full output after 1.5s
    setTimeout(() => {
      closeProgressModal();
      viewOutput(pillarKey, output);
    }, 1500);

    // Refresh pillar cards
    updatePillarCards();

  } catch (err) {
    setProgress(`❌ Error: ${err.message}`, 100, "error");
    status.dataset.status = "error";
    status.textContent = "✗ Error";
    btn.disabled = false;
    console.error("[pillars] runPillar error", err);
  }
}

async function viewOutput(pillarKey, outputObj = null) {
  let output = outputObj;
  if (!output) {
    const outputsRes = await listOutputs(currentClient.id);
    output = outputsRes.outputs.find(o => o.pillar_key === pillarKey);
  }
  if (!output) return alert("No hay output guardado para este pilar.");

  const meta = PILLAR_META[pillarKey];
  const qaBadge = output.qa_status === "PASS"
    ? `<span class="qa-badge qa-badge--pass">✓ QA PASS · ${output.qa_cycles_used || 1} ciclo${(output.qa_cycles_used || 1) === 1 ? "" : "s"}</span>`
    : output.qa_status === "FAIL"
      ? `<span class="qa-badge qa-badge--fail">⚠ QA FAIL · ${output.qa_violations?.length || 0} violaciones</span>`
      : `<span class="qa-badge">QA pending</span>`;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal modal--wide">
      <div class="modal-header">
        <div>
          <strong>Pilar ${meta.num} · ${meta.name}</strong>
          ${qaBadge}
          <span class="muted" style="margin-left:8px">${formatDate(output.generated_at)} · ${output.meta?.usage?.total_across_cycles?.tokens?.toLocaleString() || output.meta?.usage?.totalTokens?.toLocaleString() || "?"} tokens</span>
        </div>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-tabs">
        <button class="modal-tab modal-tab--active" data-modal-tab="output">Output</button>
        <button class="modal-tab" data-modal-tab="qa">QA Result</button>
        <button class="modal-tab" data-modal-tab="meta">Meta</button>
        <button class="modal-tab" data-modal-tab="raw">Raw</button>
      </div>
      <div class="modal-body modal-body--rich" data-tab-content="output"></div>
      <div class="modal-body" data-tab-content="qa" hidden></div>
      <div class="modal-body modal-body--code" data-tab-content="meta" hidden>${escape(JSON.stringify(output.meta, null, 2))}</div>
      <div class="modal-body modal-body--code" data-tab-content="raw" hidden></div>
      <div class="modal-footer">
        <button class="btn btn--ghost" id="btn-copy-output">Copiar markdown</button>
        <button class="btn btn--ghost" id="btn-download-md">Descargar .md</button>
        <button class="btn btn--primary" id="btn-download-docx">Descargar .docx</button>
      </div>
    </div>
  `;

  const outBody = backdrop.querySelector("[data-tab-content='output']");
  outBody.innerHTML = renderMarkdown(output.content);
  backdrop.querySelector("[data-tab-content='raw']").textContent = output.content;
  backdrop.querySelector("[data-tab-content='qa']").innerHTML = renderQAResult(output);

  // Tabs
  backdrop.querySelectorAll(".modal-tab").forEach(t => {
    t.addEventListener("click", () => {
      backdrop.querySelectorAll(".modal-tab").forEach(x => x.classList.remove("modal-tab--active"));
      t.classList.add("modal-tab--active");
      backdrop.querySelectorAll("[data-tab-content]").forEach(c => c.hidden = c.dataset.tabContent !== t.dataset.modalTab);
    });
  });

  // Close
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop || e.target.classList.contains("modal-close")) backdrop.remove();
  });

  // Copy
  backdrop.querySelector("#btn-copy-output").addEventListener("click", () => {
    navigator.clipboard.writeText(output.content);
    notify("Markdown copiado al clipboard");
  });

  // Download .md
  backdrop.querySelector("#btn-download-md").addEventListener("click", () => {
    const blob = new Blob([output.content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${currentClient.id}_${pillarKey}_${output.generated_at.substring(0,10)}.md`;
    a.click();
  });

  // Download .docx
  backdrop.querySelector("#btn-download-docx").addEventListener("click", () => {
    downloadDocx(output, pillarKey, meta);
  });

  document.body.appendChild(backdrop);
}

// ============ RENDER QA RESULT ============
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
        <thead><tr><th>Ciclo</th><th>QA</th><th>Violaciones</th><th>IDs</th></tr></thead>
        <tbody>
          ${history.map(h => `
            <tr>
              <td>${h.cycle}</td>
              <td><span class="qa-pill qa-pill--${h.qa.toLowerCase()}">${h.qa}</span></td>
              <td>${h.violations}</td>
              <td class="muted">${h.violation_ids.join(" · ") || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : ""}
  `;
}

// ============ DOWNLOAD .docx (uses html-docx-js loaded via CDN) ============
function downloadDocx(output, pillarKey, meta) {
  if (typeof window.htmlDocx === "undefined") {
    notify("⚠ html-docx-js no cargó · descargando como .html en su lugar");
    downloadAsHtml(output, pillarKey);
    return;
  }
  const fullHtml = buildDocxHtml(output, pillarKey, meta);
  const blob = window.htmlDocx.asBlob(fullHtml);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${currentClient.id}_${pillarKey}_${output.generated_at.substring(0,10)}.docx`;
  a.click();
  notify(".docx descargado");
}

function downloadAsHtml(output, pillarKey) {
  const fullHtml = buildDocxHtml(output, pillarKey, PILLAR_META[pillarKey]);
  const blob = new Blob([fullHtml], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${currentClient.id}_${pillarKey}_${output.generated_at.substring(0,10)}.doc`;
  a.click();
}

function buildDocxHtml(output, pillarKey, meta) {
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
  const clientName = currentClient.brief?.realtor?.full_name || currentClient.id;
  const headerBlock = `
    <div class="header-block">
      <h1>Pilar ${meta.num} · ${meta.name}</h1>
      <p><strong>Cliente:</strong> ${escape(clientName)}<br>
      <strong>Generado:</strong> ${formatDate(output.generated_at)}<br>
      <strong>QA Status:</strong> ${output.qa_status} (${output.qa_cycles_used || 1} ciclos)<br>
      <strong>Trident OS v3</strong> · Capitán del Marketing</p>
    </div>
  `;
  const body = renderMarkdown(output.content);
  const footer = `
    <div class="footer">
      QUWWA LLC dba Capitán del Marketing · New Mexico · USA<br>
      Generado por Trident OS v3 con Gemini · context cascade ${output.meta?.skillCount || "?"} skills · ${output.meta?.usage?.total_across_cycles?.tokens?.toLocaleString() || output.meta?.usage?.totalTokens?.toLocaleString() || "?"} tokens totales
    </div>
  `;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${headerBlock}${body}${footer}</body></html>`;
}

// ============ PROGRESS MODAL ============
function openProgressModal(pillarMeta) {
  const el = document.getElementById("pillar-output-modal");
  el.innerHTML = `
    <div class="modal-backdrop" id="progress-backdrop">
      <div class="modal modal--wide">
        <div class="modal-header">
          <strong>Generando Pilar ${pillarMeta.num} · ${pillarMeta.name}</strong>
          <button class="modal-close" id="progress-close">×</button>
        </div>
        <div class="modal-body">
          <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
          <p class="progress-label" id="progress-label">Iniciando…</p>
          <details class="progress-meta-block" open>
            <summary>Context cascade</summary>
            <pre id="progress-meta-pre" class="progress-meta-pre"></pre>
          </details>
          <details class="progress-meta-block" open>
            <summary>Output (streaming)</summary>
            <pre id="progress-output-pre" class="progress-output-pre"></pre>
          </details>
        </div>
      </div>
    </div>
  `;
  document.getElementById("progress-close").addEventListener("click", closeProgressModal);
}

function setProgress(label, pct, kind = "ok") {
  const fill = document.getElementById("progress-fill");
  const lbl  = document.getElementById("progress-label");
  if (fill) { fill.style.width = pct + "%"; fill.dataset.kind = kind; }
  if (lbl)  { lbl.textContent = label; lbl.dataset.kind = kind; }
}

function appendMeta(meta) {
  const pre = document.getElementById("progress-meta-pre");
  if (!pre) return;
  pre.textContent = [
    `Pillar: ${meta.pillarName}`,
    `Skills loaded (${meta.skillCount}): ${meta.loadedSkills.join(" · ")}`,
    `Transversals invoked: ${meta.transversalsInvoked.length ? meta.transversalsInvoked.join(" · ") : "—"}`,
    `Language: ${meta.language} · Nationality: ${meta.nationality} · Tone: ${meta.tone}`,
    `Estimated input tokens: ${meta.tokenEstimate.toLocaleString()}`
  ].join("\n");
}

function appendOutputPreview(text) {
  const pre = document.getElementById("progress-output-pre");
  if (!pre) return;
  pre.textContent = text;
  pre.scrollTop = pre.scrollHeight;
}

function closeProgressModal() {
  const el = document.getElementById("pillar-output-modal");
  if (el) el.innerHTML = "";
}

// ============ HELPERS ============
function renderMarkdown(md) {
  // Minimal markdown → HTML (headings, bold, italic, code, lists, paragraphs)
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

function notify(msg) {
  const n = document.createElement("div");
  n.className = "toast";
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add("toast--show"), 10);
  setTimeout(() => { n.classList.remove("toast--show"); setTimeout(() => n.remove(), 300); }, 3000);
}
