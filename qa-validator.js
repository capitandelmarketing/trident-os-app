// qa-validator.js — 3-layer QA Validator per skills 70-73
// Layer 1: Blocking (programmatic regex · zero tokens · fast)
// Layer 2: Format (programmatic regex · fast)
// Layer 3: Contextual (single Gemini call · evaluates pillar-specific rules + complex blocking like Fair Housing/TCPA)
// Returns { qa: "PASS"|"FAIL", violations, layers, cycles_used }

import { generate } from "./gemini.js";

// ============ PROGRAMMATIC REGEX RULES ============

const PATTERNS = {
  // B2 — GHL variables · should be {{contact.X}}, NOT [nombre]/[first_name]/etc
  b2_ghl_vars: /\[(nombre|Nombre|NOMBRE|first[_-]?name|cliente|email|telefono|teléfono|ciudad|estado|zip|fecha|hora|calendario|calendar)\]/g,

  // B6 — DEPRECATED 2026 · Damian has explicit permission to use Laurel terms · check removed
  // b6_laurel: /\b(Laurel\s*Portie|Power Content|Conveyor Belt|HOT\s*7|Lista Invisible|Invisible List|Starting 5|\$7 Video Marketing)\b/g,

  // B7 — Public prices · should NOT mention $X/mes etc in client copy
  b7_prices: /\$\d{1,3},?\d{3}|\$\d{2,4}\s*(?:\/(?:mes|month|mensual|monthly))?|precio\s+(?:de\s+)?(?:entrada|inicial|desde|setup)/gi,

  // B9 — WhatsApp must NOT include STOP/unsubscribe phrases
  b9_wa_stop: /\b(?:respond[eé]?\s*stop|escrib[ií]\s*stop|reply\s*stop|to\s*unsubscribe|para\s+no\s+recibir\s+m[áa]s|para\s+darte\s+de\s+baja)\b/gi,

  // F1 — Voseo (forbidden unless nat-es-ar or nat-es-uy)
  f1_voseo: /\b(vos|ten[eé]s|pod[eé]s|hac[eé]|sab[eé]s|quer[eé]s|sos|decime|escuch[áa]|abr[íi])\b/gi,

  // F1 — "hispano" forbidden (always "latino")
  f1_hispano: /\bhispan[oa]s?\b/gi,

  // F1 — "Damián" with tilde forbidden
  f1_damian_tilde: /Dami[áa]n/g,

  // F8 — AI binary contrast pattern
  f8_binary_contrast: /\b(?:esto|this)\s+no\s+es\s+[^.]{1,50}\.\s*es\s+/gi,

  // F8 — Generic AI closes
  f8_ai_closes: /\b(?:espero\s+que\s+esto\s+te\s+sirva|cualquier\s+consulta\s+no\s+dudes|mucho\s+éxito|hope\s+this\s+helps|feel\s+free\s+to\s+reach\s+out|best\s+of\s+luck)\b/gi
};

// ============ LAYER 1 — BLOCKING (programmatic subset · plus AI for complex) ============

export function checkBlocking(text, client) {
  const violations = [];
  const items_validated = [];

  // B2 — GHL Variables
  const ghlMatches = [...text.matchAll(PATTERNS.b2_ghl_vars)];
  if (ghlMatches.length) {
    violations.push({
      rule_id: "B2",
      rule_name: "Official GHL Variables",
      layer: "1 (BLOCKING)",
      severity: "CRITICAL",
      count: ghlMatches.length,
      violated_fragment: ghlMatches.slice(0, 5).map(m => m[0]).join(" · "),
      correction_suggestion: "Replace bracket placeholders with double-curly GHL variables: [nombre]→{{contact.first_name}} · [email]→{{contact.email}} · etc."
    });
  } else {
    items_validated.push("✓ B2 GHL Variables: 0 bracket placeholders");
  }

  // B6 DEPRECATED 2026 · Damian has explicit permission to use Laurel terms · check removed
  items_validated.push("✓ B6 Laurel terms: DEPRECATED (terms now allowed)");

  // B7 — Public SERVICE prices only (educational/informational/operational amounts permitted)
  const priceMatches = [...text.matchAll(PATTERNS.b7_prices)];
  const realPriceViolations = priceMatches.filter(m => {
    const ctx = text.substring(Math.max(0, m.index - 120), m.index + 120).toLowerCase();
    // Skip if context is:
    // - DPA program · loan · property · home buying education (for buyer)
    // - Meta ads budget · ad spend · CPL · CPA · ROAS (operational marketing)
    // - Test data · case study figures · client revenue examples
    // - Commission · closing fees · realtor education
    // - Investment minimums · savings · downpayment (buyer financial education)
    const okContexts = /\b(dpa|programa|program|loan|fha|conventional|itin|hometown\s*heroes|florida\s*bond|miami-dade|down\s*payment|enganche|cierre|closing|comisi[oó]n|commission|propiedad|property|casa|home|condo|townhouse|hipoteca|mortgage|tasa|rate|mensualidad|monthly\s*payment|equity|ahorro|ad\s*spend|ads?\s*budget|presupuesto\s*ads?|presupuesto\s*meta|presupuesto\s*publicidad|cpl|cpa|cpv|cpm|roas|per\s*call|por\s*aplicaci[oó]n|por\s*lead|por\s*cliente|per\s*lead|per\s*click|al\s*d[ií]a\s*en\s*ads?|\/d[ií]a|\/day|per\s*day|ingreso\s*mensual|monthly\s*revenue|revenue\s*target|objetivo\s*de\s*ingresos|caso\s*real|case\s*study|ejemplo|example|test|prueba|hipot[eé]tic|illustration|metric|m[eé]trica|kpi|cierre|closings?\s*per\s*month|ticket\s*promedio|avg\s*ticket|valor\s*medio|lifetime\s*value|ltv|escenario)/i;
    return !okContexts.test(ctx);
  });
  if (realPriceViolations.length) {
    // B7 is WARNING level now (informational · not blocking). Operator reviews case-by-case.
    violations.push({
      rule_id: "B7",
      rule_name: "Price mention review (WARNING · not blocking)",
      layer: "1 (BLOCKING)",
      severity: "WARNING",
      count: realPriceViolations.length,
      violated_fragment: realPriceViolations.slice(0, 5).map(m => m[0]).join(" · "),
      correction_suggestion: "Review price mentions case-by-case. SERVICE prices (Capitán paquete fees · realtor monthly fees · subscription costs to clients) should NOT be public. But DPA amounts · loans · property prices · commission percentages · Meta ad budgets · case studies · revenue targets are ALL PERMITTED."
    });
  } else {
    items_validated.push(`✓ B7 Service prices: not exposed (${priceMatches.length} price mentions but all in operational/educational context · OK)`);
  }

  // B9 — WhatsApp STOP
  const stopMatches = [...text.matchAll(PATTERNS.b9_wa_stop)];
  if (stopMatches.length) {
    violations.push({
      rule_id: "B9",
      rule_name: "WhatsApp NEVER Includes STOP",
      layer: "1 (BLOCKING)",
      severity: "CRITICAL",
      count: stopMatches.length,
      violated_fragment: stopMatches.slice(0, 3).map(m => m[0]).join(" · "),
      correction_suggestion: "Remove STOP/unsubscribe phrases from WhatsApp. Opt-out is handled by GHL trigger automation, not in message text."
    });
  } else {
    items_validated.push("✓ B9 WhatsApp STOP: not present");
  }

  return { items_validated, violations };
}

// ============ LAYER 2 — FORMAT (programmatic) ============

export function checkFormat(text, client) {
  const violations = [];
  const items_validated = [];

  const lang = client.brief?.activation?.localization?.language || "lang-es-neutral";
  const nat  = client.brief?.activation?.localization?.nationality || "none";

  // F1 — Voseo (only forbidden if NOT nat-es-ar or nat-es-uy)
  if (lang === "lang-es-neutral" && nat !== "nat-es-ar" && nat !== "nat-es-uy") {
    const voseoMatches = [...text.matchAll(PATTERNS.f1_voseo)];
    if (voseoMatches.length) {
      violations.push({
        rule_id: "F1a",
        rule_name: "Neutral Spanish · NO voseo",
        layer: "2 (FORMAT)",
        severity: "HIGH",
        count: voseoMatches.length,
        violated_fragment: [...new Set(voseoMatches.map(m => m[0]))].slice(0, 8).join(" · "),
        correction_suggestion: "Convert voseo to tuteo: tenés→tienes · podés→puedes · hacé→haz · sabés→sabes · querés→quieres · sos→eres · vos→tú · decime→dime · escuchá→escucha"
      });
    } else {
      items_validated.push("✓ F1a Voseo: not present");
    }
  } else {
    items_validated.push(`✓ F1a Voseo check skipped (${nat === "nat-es-ar" || nat === "nat-es-uy" ? "voseo allowed by nationality flavor" : "language is en-us"})`);
  }

  // F1 — Hispano forbidden
  if (lang === "lang-es-neutral") {
    const hispanoMatches = [...text.matchAll(PATTERNS.f1_hispano)];
    if (hispanoMatches.length) {
      violations.push({
        rule_id: "F1b",
        rule_name: "Use 'latino', not 'hispano'",
        layer: "2 (FORMAT)",
        severity: "HIGH",
        count: hispanoMatches.length,
        violated_fragment: hispanoMatches.slice(0, 3).map(m => m[0]).join(" · "),
        correction_suggestion: "Replace 'hispano/hispana/hispanos/hispanas' with 'latino/latina/latinos/latinas'."
      });
    } else {
      items_validated.push("✓ F1b 'latino' usage: correct");
    }
  }

  // F1 — Damian without tilde
  const tildeMatches = [...text.matchAll(PATTERNS.f1_damian_tilde)];
  if (tildeMatches.length) {
    violations.push({
      rule_id: "F1c",
      rule_name: "'Damian' sin tilde",
      layer: "2 (FORMAT)",
      severity: "MEDIUM",
      count: tildeMatches.length,
      violated_fragment: tildeMatches.slice(0, 3).map(m => m[0]).join(" · "),
      correction_suggestion: "Always write 'Damian' without tilde, never 'Damián'."
    });
  } else {
    items_validated.push("✓ F1c 'Damian' spelling: correct");
  }

  // F8 — AI binary contrast pattern (WARNING only)
  const binaryMatches = [...text.matchAll(PATTERNS.f8_binary_contrast)];
  if (binaryMatches.length > 2) {
    violations.push({
      rule_id: "F8a",
      rule_name: "AI Binary Contrast Pattern (overused)",
      layer: "2 (FORMAT)",
      severity: "WARNING",
      count: binaryMatches.length,
      violated_fragment: binaryMatches.slice(0, 2).map(m => m[0]).join(" / "),
      correction_suggestion: "Replace 'esto no es X. Es Y.' patterns with fluid narrative (more than 2 occurrences detected)."
    });
  } else {
    items_validated.push(`✓ F8a Binary contrast: ${binaryMatches.length}/2 (within tolerance)`);
  }

  // F8 — Generic AI closes
  const aiCloseMatches = [...text.matchAll(PATTERNS.f8_ai_closes)];
  if (aiCloseMatches.length) {
    violations.push({
      rule_id: "F8b",
      rule_name: "Generic AI Closing Phrases",
      layer: "2 (FORMAT)",
      severity: "WARNING",
      count: aiCloseMatches.length,
      violated_fragment: aiCloseMatches.slice(0, 3).map(m => m[0]).join(" · "),
      correction_suggestion: "Remove generic AI closes ('espero que te sirva' · 'hope this helps' · etc.) · close with specific CTA or human sign-off."
    });
  } else {
    items_validated.push("✓ F8b AI closes: not present");
  }

  return { items_validated, violations };
}

// ============ LAYER 3 — CONTEXTUAL (AI-based · per pillar) ============

const CONTEXTUAL_RULES_BY_PILLAR = {
  pillar_onboard: [
    "O1 — All 18 critical inputs validated (or flagged with ⚠️ MISSING if absent)",
    "O2 — Market research with 5+ Gold (NAR/Census/HUD/NAHREP) or Silver (Zillow/Redfin/ATTOM) sources cited",
    "O3 — 6+ copy hooks based on REAL numbers (not generic 'financial help')",
    "O4 — Competitive matrix with 3-5 competitors × 7 columns (Ads · Funnels · Content · Offer · Branding · Automations · Copy)"
  ],
  pillar_offer: [
    "O5 — 13 mandatory sections of Grand Slam Offer present",
    "O6 — Hormozi $100M Offers Value Equation + Brunson Big Domino frameworks visible"
  ],
  pillar_brand: [
    "O7 — Brand board with 3 hex colors + display+body typography + voice tone + slogan + logos",
    "O8 — Photo session guide with style + locations + photo types + art direction + technical specs"
  ],
  pillar_ads7: [
    "O9 — All 6 components delivered (Playbook · 3 Power Content · Value Bombs · Conveyor Belt · Keywords matrix · Roadmap)",
    "O10 — 3 Power Content videos = 3 DIFFERENT problems of SAME avatar (NOT buyers/sellers/investors)",
    "O11 — Anti-Viral Filter Phrase opens each hook ('Si eres [avatar] en [zone]…')",
    "O12 — 9-step framework in each Power Content (Hook · Promise · CTA · Humble Brag · Problem · Current attempts · Why fails · 3-step solution · Why works + CTA)",
    "O13 — Value Bombs: small problem + reveal larger + no email gate + 4 name variations",
    "O14 — Conveyor Belt: 48+ pieces (4A × 4 formats × 3 problems)"
  ],
  pillar_funnel: [
    "O15 — VSL uses formula-vsl 7 blocks (Gancho·Promesa·Puente·3 Mitos·Prueba·Oferta·Cierre) — NOT formula-100k",
    "O16 — Application Funnel 5 pages: Case Study → Application → Homework → Calendar → Confirmation",
    "O17 — Automations EXACTLY 44 messages: Doc01(12WA+6E) · Doc02(4+4) · Doc03(5+5) · Doc04(5+3) = 26 WA + 18 Email",
    "O18 — Bot Artix 3 sub-fields total ≤ 2000 words",
    "O19 — HTML edge-to-edge + CDN absolute URLs + compliance footer"
  ],
  pillar_report: [
    "O20 — Invisible List reported FIRST (before leads/CPL/appointments)",
    "O21 — 3-5 concrete actions for next period at end of every report",
    "O22 — Metrics match client mode (A: only IL+hooks+DMs · B: + leads/CPL/appt · C: + ROAS/revenue/CPA)",
    "O23 — Communication scripts: month 1 · month 2 · month 3+ · 'when something doesn't work'"
  ]
};

export async function checkContextual(text, pillarKey, client) {
  const rules = CONTEXTUAL_RULES_BY_PILLAR[pillarKey] || [];
  if (rules.length === 0) return { items_validated: [], violations: [] };

  const prompt = `You are the QA Validator (Layer 3 · Contextual) of Trident OS v3.

Evaluate the following pillar output against the contextual rules for ${pillarKey}.

For each rule · respond PASS or FAIL with a brief reason.
Be strict. If a rule says "must include X" and X is not clearly present · FAIL.
If the output is a "missing data blocker" (the pillar refused to generate because inputs were incomplete) · respond with rule_id "O0" PASS for all rules since the system correctly blocked.

## Rules for ${pillarKey}

${rules.map((r, i) => `${i+1}. ${r}`).join("\n")}

## Pillar output to evaluate

${text.substring(0, 30000)}${text.length > 30000 ? "\n…[truncated for QA review]" : ""}

## Required response format (strict JSON · no extra text)

{
  "summary": "PASS" or "FAIL",
  "blocked_by_missing_data": true | false,
  "results": [
    { "rule_id": "O1", "status": "PASS" or "FAIL", "reason": "brief reason in english" },
    ...
  ]
}

Respond with ONLY the JSON. No preamble. No markdown fence.`;

  const res = await generate(prompt, { temperature: 0, maxOutputTokens: 4096, thinkingBudget: 0 });
  const items_validated = [];
  const violations = [];

  try {
    // Strip markdown code fences if model added them
    const jsonText = res.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonText);

    if (parsed.blocked_by_missing_data) {
      items_validated.push("✓ L3 Contextual: pillar correctly blocked on missing critical data (per Rule J1)");
      return { items_validated, violations, ai_meta: { tokens: res.usage.totalTokens, elapsed_ms: res.usage.elapsedMs } };
    }

    for (const r of parsed.results || []) {
      if (r.status === "PASS") {
        items_validated.push(`✓ ${r.rule_id}: ${r.reason}`);
      } else {
        const ruleObj = rules.find(rule => rule.startsWith(r.rule_id));
        violations.push({
          rule_id: r.rule_id,
          rule_name: ruleObj || r.rule_id,
          layer: "3 (CONTEXTUAL)",
          severity: "HIGH",
          violated_fragment: r.reason,
          correction_suggestion: `Address rule "${ruleObj || r.rule_id}". Specific issue: ${r.reason}`
        });
      }
    }
  } catch (err) {
    violations.push({
      rule_id: "L3_PARSE_ERROR",
      rule_name: "QA Validator AI Layer 3 response parsing",
      layer: "3 (CONTEXTUAL)",
      severity: "WARNING",
      violated_fragment: res.text.substring(0, 200),
      correction_suggestion: `Layer 3 AI response did not parse as JSON. Raw response stored for review. Error: ${err.message}`
    });
  }

  return { items_validated, violations, ai_meta: { tokens: res.usage.totalTokens, elapsed_ms: res.usage.elapsedMs } };
}

// ============ ORCHESTRATOR ============

/**
 * Run the full 3-layer validation.
 * @returns { qa: "PASS"|"FAIL", violations, layers, ai_used }
 */
export async function validateOutput(text, pillarKey, client, opts = {}) {
  const { onProgress } = opts;

  onProgress?.("Layer 1 · Blocking…");
  const l1 = checkBlocking(text, client);

  // If blocking failed, return immediately (per protocol)
  if (l1.violations.length > 0) {
    return {
      qa: "FAIL",
      stopped_at_layer: 1,
      violations: l1.violations,
      layers: {
        layer_1_blocking:   { items_validated: l1.items_validated.length, items_failed: l1.violations.length, detail: l1.items_validated },
        layer_2_format:     { skipped: true, reason: "Layer 1 failed · format check skipped per protocol" },
        layer_3_contextual: { skipped: true }
      }
    };
  }

  onProgress?.("Layer 2 · Format…");
  const l2 = checkFormat(text, client);

  if (l2.violations.length > 0) {
    // Only stop if there are non-WARNING violations
    const blocking = l2.violations.filter(v => v.severity !== "WARNING");
    if (blocking.length > 0) {
      return {
        qa: "FAIL",
        stopped_at_layer: 2,
        violations: [...l2.violations],
        layers: {
          layer_1_blocking:   { items_validated: l1.items_validated.length, items_failed: 0, detail: l1.items_validated },
          layer_2_format:     { items_validated: l2.items_validated.length, items_failed: l2.violations.length, detail: [...l2.items_validated, ...l2.violations.map(v => `✗ ${v.rule_id}: ${v.rule_name}`)] },
          layer_3_contextual: { skipped: true, reason: "Layer 2 failed · contextual check skipped per protocol" }
        }
      };
    }
  }

  onProgress?.("Layer 3 · Contextual (AI)…");
  const l3 = await checkContextual(text, pillarKey, client);

  const allViolations = [...l2.violations.filter(v => v.severity === "WARNING"), ...l3.violations];
  const isPass = l3.violations.length === 0;

  return {
    qa: isPass ? "PASS" : "FAIL",
    violations: allViolations,
    layers: {
      layer_1_blocking:   { items_validated: l1.items_validated.length, items_failed: 0, detail: l1.items_validated },
      layer_2_format:     { items_validated: l2.items_validated.length, items_failed: l2.violations.length, detail: [...l2.items_validated, ...l2.violations.map(v => `${v.severity === "WARNING" ? "⚠" : "✗"} ${v.rule_id}: ${v.rule_name}`)] },
      layer_3_contextual: { items_validated: l3.items_validated.length, items_failed: l3.violations.length, detail: [...l3.items_validated, ...l3.violations.map(v => `✗ ${v.rule_id}`)] }
    },
    ai_used: l3.ai_meta ? [l3.ai_meta] : []
  };
}

// ============ CORRECTION PROMPT BUILDER ============

export function buildCorrectionPrompt(originalPrompt, originalOutput, qaResult, cycleNumber) {
  const violationsText = qaResult.violations.map((v, i) =>
    `${i+1}. **${v.rule_id} · ${v.rule_name}** (layer ${v.layer} · severity ${v.severity})\n   - Violated: ${v.violated_fragment || "(see output)"}\n   - Fix: ${v.correction_suggestion}`
  ).join("\n\n");

  return `${originalPrompt}

---

# ⚠️ QA VALIDATOR FAILED (cycle ${cycleNumber}/3) · REGENERATE WITH CORRECTIONS

Your previous output failed the QA Validator with the following violations:

${violationsText}

## Regenerate the COMPLETE deliverable applying ALL these corrections.

- Do NOT just patch the violated fragments · rewrite the whole output.
- Keep everything that was correct.
- Fix every single violation listed above.
- This is cycle ${cycleNumber} of 3. After cycle 3 the output escalates to operator review.

## Your previous output (for reference · do NOT repeat verbatim · regenerate corrected version)

${originalOutput.substring(0, 8000)}${originalOutput.length > 8000 ? "\n…[truncated]" : ""}

Begin corrected generation now.`;
}
