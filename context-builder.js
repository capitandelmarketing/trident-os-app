// context-builder.js — Ensambla el context cascade para Gemini
// Per architecture: Nucleus MAIN + Universal sub-skills + Language + Nationality + Tone + Pillar MAIN + Client data
// Output: string único listo para Gemini + meta info (tokens estimados, skills cargadas)

let skillsCache = null;

export async function loadSkillsOnce() {
  if (skillsCache) return skillsCache;
  const res = await fetch("skills.json");
  if (!res.ok) throw new Error(`Cannot load skills.json: ${res.status}`);
  skillsCache = await res.json();
  return skillsCache;
}

// Map pillar wizard key → skill file ID
const PILLAR_KEY_TO_SKILL_ID = {
  pillar_onboard: "80-PILLAR-01-onboard",
  pillar_offer:   "81-PILLAR-02-offer",
  pillar_brand:   "82-PILLAR-03-brand",
  pillar_ads7:    "83-PILLAR-04-ads-7",
  pillar_funnel:  "84-PILLAR-05-funnel",
  pillar_report:  "85-PILLAR-06-report"
};

// Transversal skill IDs (for [[USE_SKILL: X]] detection)
const TRANSVERSAL_MAP = {
  "formula-100k": "60-TRANSVERSAL-formula-100k",
  "estudador":    "61-TRANSVERSAL-estudador",
  "formula-vsl":  "62-TRANSVERSAL-formula-vsl",
  "qa-validator": "70-QA-VALIDATOR-main"
};

export async function buildContext(client, pillarKey) {
  const skills = await loadSkillsOnce();
  const findSkill = (id) => skills.skills.find(s => s.id === id);

  const sections = [];
  const loadedSkills = [];

  // ============ 1. Nucleus Global MAIN ============
  const nucleus = findSkill("10-NUCLEUS-MAIN");
  if (nucleus) {
    sections.push(section("NUCLEUS GLOBAL — MASTER RULES (always applied)", nucleus.content));
    loadedSkills.push(nucleus.id);
  }

  // ============ 2. Universal sub-skills (all 10) ============
  const universals = skills.skills.filter(s => s.category === "universal");
  for (const u of universals) {
    sections.push(section(`UNIVERSAL · ${u.filename}`, u.content));
    loadedSkills.push(u.id);
  }

  // ============ 3. Language ============
  const lang = client.brief?.activation?.localization?.language || "lang-es-neutral";
  const langSkill = skills.skills.find(s => s.filename.includes(lang.replace("lang-", "LANG-")));
  if (langSkill) {
    sections.push(section(`LANGUAGE · ${langSkill.filename}`, langSkill.content));
    loadedSkills.push(langSkill.id);
  }

  // ============ 4. Nationality (only if Spanish + selected) ============
  const nat = client.brief?.activation?.localization?.nationality;
  if (lang === "lang-es-neutral" && nat && nat !== "none") {
    const natShort = nat.replace("nat-es-", "");
    const natSkill = skills.skills.find(s => s.filename.toLowerCase().includes(`nat-${natShort}`));
    if (natSkill) {
      sections.push(section(`NATIONALITY · ${natSkill.filename}`, natSkill.content));
      loadedSkills.push(natSkill.id);
    }
  }

  // ============ 5. Tone ============
  const tone = client.brief?.activation?.localization?.tone || "tone-friendly";
  const toneShort = tone.replace("tone-", "");
  const toneSkill = skills.skills.find(s => s.filename.toLowerCase().includes(`tone-${toneShort}`));
  if (toneSkill) {
    sections.push(section(`TONE · ${toneSkill.filename}`, toneSkill.content));
    loadedSkills.push(toneSkill.id);
  }

  // ============ 6. Pillar MAIN ============
  const pillarSkillId = PILLAR_KEY_TO_SKILL_ID[pillarKey];
  const pillarSkill = pillarSkillId ? findSkill(pillarSkillId) : null;
  if (!pillarSkill) throw new Error(`Pillar skill not found: ${pillarKey}`);
  sections.push(section(`PILLAR · ${pillarSkill.filename}`, pillarSkill.content));
  loadedSkills.push(pillarSkill.id);

  // ============ 7. Transversal skills referenced via [[USE_SKILL: X]] ============
  const transversalMatches = [...pillarSkill.content.matchAll(/\[\[USE_SKILL:\s*([a-z0-9-]+)\s*\]\]/gi)];
  const transversalIds = [...new Set(transversalMatches.map(m => m[1].toLowerCase()))];
  for (const tid of transversalIds) {
    if (tid === "qa-validator") continue;  // QA loads at validation step (Turn 4), not at gen
    const fileId = TRANSVERSAL_MAP[tid];
    const t = fileId ? findSkill(fileId) : null;
    if (t) {
      sections.push(section(`TRANSVERSAL · ${t.filename}`, t.content));
      loadedSkills.push(t.id);
    }
  }

  // ============ 8. Client context ============
  sections.push(section("CLIENT CONTEXT — strategic input for this generation", buildClientContext(client)));

  // ============ 9. Task instruction ============
  sections.push(section("TASK", buildTaskInstruction(pillarKey, client)));

  const fullPrompt = sections.join("\n\n");
  const charCount = fullPrompt.length;
  const tokenEstimate = Math.round(charCount / 4);

  return {
    prompt: fullPrompt,
    meta: {
      pillarKey,
      pillarName: pillarSkill.filename,
      loadedSkills,
      skillCount: loadedSkills.length,
      transversalsInvoked: transversalIds,
      language: lang,
      nationality: nat,
      tone,
      charCount,
      tokenEstimate
    }
  };
}

function section(title, body) {
  return `\n========================================\n${title}\n========================================\n\n${body}`;
}

function buildClientContext(c) {
  const r = c.brief?.realtor || {};
  const a = c.brief?.avatar || {};
  const d = c.brief?.data || {};
  const od = c.official_data || {};
  const loc = c.brief?.activation?.localization || {};

  return `
## Realtor identity
- Full name: ${r.full_name || "—"}
- Brokerage + license: ${r.brokerage_license || "—"}
- Geographic zone: ${r.geo_zone || "—"}
- Active since (year): ${r.years_experience || "—"}
- Active calendar URL: ${r.active_calendar || "—"}
- Contact: ${r.whatsapp_email || "—"}
- Social: ${r.ig_fb || "—"}
- Voice audio sample: ${r.voice_audio || "—"}

## Personal story
${r.personal_story || "(missing)"}

## Testimonials available
${r.testimonials || "(missing)"}

## Avatar / Target audience
- Primary avatar: ${a.primary_avatar || "—"}
- Top 3 dolores (pain points):
${a.top_3_dolores || "(missing)"}
- Top 1 deseo (desire):
${a.top_1_deseo || "(missing)"}
- Specific objections heard most often:
${a.objections || "(missing)"}

## Official data (RULE #1 — never invent · always use these)
- Credit min general: ${od.credit_min_general || "—"}
- Credit min DPA: ${od.credit_min_dpa || "—"}
- Credit min ITIN: ${od.credit_min_itin || "—"}
- Employment required (months): ${od.employment_months || "—"}
- Downpayment min %: ${od.downpayment_min || "—"}
- Savings min USD: ${od.savings_min || "—"}
- DPA programs available:
${od.dpa_programs || "(missing)"}
- Price ranges by zone:
${od.price_ranges || "(missing)"}
- Property types focus:
${od.property_types || "(missing)"}
- Brokerage + hours: ${od.brokerage_name || "—"}
- Non-qualified leads policy: ${od.non_qualified_policy || "—"}

## Brokerage policies (commission · listings · marketing rules)
${d.brokerage_policies || "(missing)"}

## Localization context (already applied via sub-skills above · for reference)
- Language: ${loc.language || "—"}
- Nationality flavor: ${loc.nationality || "none"}
- Tone: ${loc.tone || "—"}
`.trim();
}

function buildTaskInstruction(pillarKey, client) {
  const pillarName = {
    pillar_onboard: "Pillar 1 — ONBOARD",
    pillar_offer:   "Pillar 2 — OFFER",
    pillar_brand:   "Pillar 3 — BRAND",
    pillar_ads7:    "Pillar 4 — ADS 7",
    pillar_funnel:  "Pillar 5 — FUNNEL",
    pillar_report:  "Pillar 6 — REPORT"
  }[pillarKey] || pillarKey;

  // 🔴 Top-level language enforcement — must dominate over skill files' language (which are in English)
  const lang = client.brief?.activation?.localization?.language || "lang-es-neutral";
  const nat  = client.brief?.activation?.localization?.nationality || "none";
  const langInstruction = lang === "lang-en-us"
    ? `**OUTPUT LANGUAGE: ENGLISH (US).** Write the entire deliverable in US English. The skill files are in English — match that.`
    : `**OUTPUT LANGUAGE: ESPAÑOL NEUTRAL (no voseo · tú/tienes/puedes · "latino" no "hispano").** ⚠️ AUNQUE las skills cargadas (Nucleus·Universal·Pillar) están en INGLÉS · el deliverable final · todos los headings · todo el copy · todas las explicaciones DEBEN salir en español neutral. Las instrucciones en inglés son SOLO para que vos las entiendas · NO para reflejar en el output. Si dudas, pensá: "esto lo va a leer un realtor latino en USA · ¿lo entiende?" — si dudas, español.${nat !== "none" ? ` Adicionalmente aplicá el flavor de nacionalidad ${nat} cargado en la sub-skill correspondiente.` : ""}`;

  return `
You are the agent of ${pillarName} in Trident OS v3 (the operating system of Capitán del Marketing agency).

# 🔴 LANGUAGE RULE (highest priority · overrides skill file language)

${langInstruction}

# Task

Generate the complete deliverable for this pillar following EXACTLY the protocol described in the PILLAR section above. Apply ALL inviolable rules from NUCLEUS GLOBAL · UNIVERSAL · LANGUAGE · NATIONALITY (if loaded) · TONE.

## Output requirements

1. **Format:** Markdown · structured with H2/H3 headings · ready to be exported to .docx
2. **Voice:** match the realtor's voice based on the personal story and voice audio reference. NEVER sound like generic AI or template.
3. **Data:** ALL numbers · programs · prices · requirements come from the "Official data" section. NEVER invent. If a required datum is missing from official data, write \`⚠️ MISSING: [field]\` instead of inventing.
4. **Length:** as specified in the pillar deliverables section. NO laziness · NO "use these as templates" · produce the actual content the operator will deliver.
5. **Localization:** if a NATIONALITY skill is loaded · apply its specific idioms · greetings · cultural references. Avoid the prohibited expressions.
6. **Compliance:** Fair Housing + TCPA + SAFE Act rules from UNIVERSAL · compliance-deep are MANDATORY for any ad/sms/email content.

## What NOT to include

- Do NOT include Laurel Portie name or references (Rule from feedback memory).
- Do NOT mention public pricing (\$2,000/mes etc) in client-facing content.
- Do NOT include filtros Doglio (BOLSA SATURADA · DECISIÓN/PASA QA) — that scaffolding is editorial only.
- Do NOT invent client names · testimonials · case studies that aren't in the realtor's data.

## At the end of your output

Add a brief section \`## Generation metadata\`:
- Localization applied: language · nationality · tone
- Skills invoked via [[USE_SKILL]]: list them
- Missing data flagged: list each \`⚠️ MISSING\` instance
- Word count

Begin generation now.
`.trim();
}
