// brief-schema.js — Definición canónica de las 11 pantallas del Wizard
// Fuente: 80-PILLAR-01-onboard.md + 18-UNIVERSAL-process-and-execution.md + 01-ARCHITECTURE-OVERVIEW.md

export const WIZARD_SCREENS = [
  { id: 0,  key: "welcome",       title: "Bienvenida",            icon: "👋", kind: "info" },
  { id: 1,  key: "accesses",      title: "Validar 6 accesos",     icon: "🔑", kind: "checklist" },
  { id: 2,  key: "official_data", title: "Datos Oficiales",       icon: "📋", kind: "form" },
  { id: 3,  key: "brief",         title: "Brief · 18 inputs",     icon: "📝", kind: "form" },
  { id: 4,  key: "pillar_onboard",title: "Pilar 1 · Onboard",     icon: "1️⃣", kind: "pillar" },
  { id: 5,  key: "pillar_offer",  title: "Pilar 2 · Offer",       icon: "2️⃣", kind: "pillar" },
  { id: 6,  key: "pillar_brand",  title: "Pilar 3 · Brand",       icon: "3️⃣", kind: "pillar" },
  { id: 7,  key: "pillar_ads7",   title: "Pilar 4 · Ads 7",       icon: "4️⃣", kind: "pillar" },
  { id: 8,  key: "pillar_funnel", title: "Pilar 5 · Funnel",      icon: "5️⃣", kind: "pillar" },
  { id: 9,  key: "pillar_report", title: "Pilar 6 · Report",      icon: "6️⃣", kind: "pillar" },
  { id: 10, key: "installed",     title: "Sistema Instalado",     icon: "✅", kind: "info" }
];

// Screen 1 — 6 accesos requeridos
export const ACCESS_CHECKLIST = [
  { id: "meta_bm",    label: "Meta Business Manager",    hint: "Acceso Admin · ID BM verificado" },
  { id: "ghl",        label: "GoHighLevel (subaccount)", hint: "Sub-cuenta creada · API key disponible" },
  { id: "manychat",   label: "ManyChat",                 hint: "Página IG conectada · keywords libres" },
  { id: "calendar",   label: "Calendario activo",        hint: "GHL Calendar O Calendly · URL embed lista" },
  { id: "pixel",      label: "Meta Pixel",               hint: "Pixel ID · Conversions API token" },
  { id: "domain",     label: "Dominio + DNS",            hint: "Dominio del realtor · acceso DNS para A/CNAME" }
];

// Screen 2 — Datos Oficiales (campos críticos · regla 🔴 de CLAUDE.md)
export const OFFICIAL_DATA_FIELDS = [
  { id: "credit_min_general", label: "Crédito mínimo general", type: "text", placeholder: "620", required: true },
  { id: "credit_min_dpa",     label: "Crédito mínimo DPA",     type: "text", placeholder: "640", required: true },
  { id: "credit_min_itin",    label: "Crédito mínimo ITIN",    type: "text", placeholder: "N/A · 580 · etc.", required: true },
  { id: "employment_months",  label: "Tiempo de empleo requerido (meses)", type: "text", placeholder: "24", required: true },
  { id: "downpayment_min",    label: "% Enganche mínimo",      type: "text", placeholder: "3.5%", required: true },
  { id: "savings_min",        label: "Ahorros mínimos requeridos (USD)", type: "text", placeholder: "$8,000", required: true },
  { id: "dpa_programs",       label: "Programas DPA disponibles (con monto + credit mín)", type: "textarea", placeholder: "Florida Hometown Heroes — hasta $35,000 · cred 640\nFlorida Bond — hasta $10,000 · cred 620", required: true },
  { id: "price_ranges",       label: "Rangos de precio por zona",  type: "textarea", placeholder: "Hialeah: $380K-$450K\nMiami Lakes: $500K-$650K", required: true },
  { id: "property_types",     label: "Tipos de propiedad (foco actual)", type: "textarea", placeholder: "Single family · Townhouse · Condo", required: true },
  { id: "brokerage_name",     label: "Brokerage actual + horarios", type: "textarea", placeholder: "Villa Realty · L-V 9am-7pm · Sáb 10am-2pm", required: true },
  { id: "non_qualified_policy", label: "Política con leads que no califican", type: "textarea", placeholder: "Si crédito < 580 → enviar a Carolina Rodríguez (credit repair partner)", required: false }
];

// Screen 3 — Brief 18 inputs críticos (de Rule J1)
export const BRIEF_INPUTS = [
  // Realtor (10)
  { section: "realtor", id: "full_name",         label: "Nombre completo + nombre legal (si difiere)", type: "text", required: true, idx: 1 },
  { section: "realtor", id: "brokerage_license", label: "Brokerage y número de licencia", type: "text", required: true, idx: 2 },
  { section: "realtor", id: "geo_zone",          label: "Zona geográfica primaria (estado + ciudad/condado)", type: "text", required: true, idx: 3 },
  { section: "realtor", id: "years_experience",  label: "Año en que arrancó como realtor (fecha fija, ej. 2018)", type: "text", required: true, idx: 4, hint: "Usar año fijo · NUNCA \"X años\" que se actualizan" },
  { section: "realtor", id: "active_calendar",   label: "Calendario activo (URL donde caen las citas)", type: "url", required: true, idx: 5 },
  { section: "realtor", id: "whatsapp_email",    label: "WhatsApp directo + email", type: "text", required: true, idx: 6 },
  { section: "realtor", id: "ig_fb",             label: "@ de Instagram + link Facebook page", type: "text", required: true, idx: 7 },
  { section: "realtor", id: "testimonials",      label: "Testimonios existentes (mín 6 si los hay)", type: "textarea", required: true, idx: 8, hint: "URLs · descripción audio/video/screenshots · firma quién autoriza" },
  { section: "realtor", id: "voice_audio",       label: "Sample audio voz (3-5 min hablando natural, NO leyendo)", type: "url", required: true, idx: 9, hint: "Drive/Dropbox link" },
  { section: "realtor", id: "personal_story",    label: "Historia personal (origen · por qué real estate · momento formativo)", type: "textarea", required: true, idx: 10 },

  // Avatar (4)
  { section: "avatar", id: "primary_avatar",     label: "Avatar primario", type: "select",
    options: ["first-time", "ITIN", "move-up", "luxury", "investor", "seller", "mixed"], required: true, idx: 11 },
  { section: "avatar", id: "top_3_dolores",      label: "Top 3 dolores del avatar (en sus palabras si es posible)", type: "textarea", required: true, idx: 12 },
  { section: "avatar", id: "top_1_deseo",        label: "Top 1 deseo del avatar (en sus palabras)", type: "textarea", required: true, idx: 13 },
  { section: "avatar", id: "objections",         label: "Objeciones específicas que el realtor escucha más", type: "textarea", required: true, idx: 14 },

  // Official data (2 — ya capturado en Screen 2, acá solo confirmación)
  { section: "data",   id: "official_data_ack",  label: "Confirmo que los Datos Oficiales (Screen 2) están completos", type: "checkbox", required: true, idx: 15 },
  { section: "data",   id: "brokerage_policies", label: "Políticas del brokerage (split de comisión · listings permitidos · reglas de marketing)", type: "textarea", required: true, idx: 16 },

  // Activation (2)
  { section: "activation", id: "pillars_active", label: "Pilares activados", type: "multicheck",
    options: [
      { id: "p1_onboard", label: "Pilar 1 · Onboard (siempre obligatorio)", default: true, locked: true },
      { id: "p2_offer",   label: "Pilar 2 · Offer", default: true },
      { id: "p3_brand",   label: "Pilar 3 · Brand", default: true },
      { id: "p4_ads7",    label: "Pilar 4 · Ads 7 (Laurel completo)", default: true },
      { id: "p5_funnel",  label: "Pilar 5 · Funnel (VSL + Bot Artix)", default: true },
      { id: "p6_report",  label: "Pilar 6 · Report (ongoing)", default: true }
    ], required: true, idx: 17 },
  { section: "activation", id: "localization",   label: "Localización", type: "localization_panel", required: true, idx: 18 }
];

// Localization options (para Screen 3 input 18)
export const LANGUAGES = [
  { id: "lang-es-neutral", label: "Español neutral", default: true },
  { id: "lang-en-us",      label: "English (US)" }
];

export const NATIONALITIES = [
  { id: "none",        label: "— Sin override (genérico latino) —", default: true },
  { id: "nat-es-mx",   label: "Mexicano (TX·CA·AZ·IL)" },
  { id: "nat-es-cu",   label: "Cubano (Miami·NJ)" },
  { id: "nat-es-ve",   label: "Venezolano (FL·TX·NY)" },
  { id: "nat-es-co",   label: "Colombiano (Miami·NY·NJ·TX)" },
  { id: "nat-es-ar",   label: "Argentino (FL·NY·CA)" },
  { id: "nat-es-pr",   label: "Puertorriqueño (FL·NY·PA·NJ)" },
  { id: "nat-es-do",   label: "Dominicano (NY·NJ·MA·FL)" },
  { id: "nat-es-pe",   label: "Peruano (CA·NJ·FL·NY)" },
  { id: "nat-es-uy",   label: "Uruguayo (Damian own voice)" }
];

export const TONES = [
  { id: "tone-friendly",     label: "Friendly (default · warm)", default: true },
  { id: "tone-formal",       label: "Formal (structured)" },
  { id: "tone-didactic",     label: "Didactic (teaching mode)" },
  { id: "tone-provocative",  label: "Provocative (edge)" },
  { id: "tone-storytelling", label: "Storytelling (narrative)" }
];

// Pillar metadata (Screens 4-9)
export const PILLAR_META = {
  pillar_onboard: { num: 1, name: "Onboard", time: "1-2 hrs", desc: "Brief procesado + Market research + Checklist + Timeline" },
  pillar_offer:   { num: 2, name: "Offer",   time: "3-4 hrs", desc: "Grand Slam Offer (Hormozi) + Big Domino (Brunson) + 13 secciones" },
  pillar_brand:   { num: 3, name: "Brand",   time: "1-2 hrs", desc: "Brand board (paleta · tipografía · voz · slogan) + Photo guide" },
  pillar_ads7:    { num: 4, name: "Ads 7",   time: "4-5 hrs", desc: "Laurel completo · Power Content · Value Bombs · Conveyor Belt" },
  pillar_funnel:  { num: 5, name: "Funnel",  time: "5-6 hrs", desc: "VSL + Bot Artix + 44 automatizaciones + 9 HTML pages" },
  pillar_report:  { num: 6, name: "Report",  time: "ongoing", desc: "Weekly + Monthly + Optimization rules + HOT 7" }
};

// Default client state
export function emptyClientState() {
  return {
    id: null,
    created_at: null,
    updated_at: null,
    current_screen: 0,
    status: "draft",  // draft | in_progress | completed
    accesses: ACCESS_CHECKLIST.reduce((acc, a) => ({ ...acc, [a.id]: false }), {}),
    official_data: {},
    brief: {
      realtor: {},
      avatar: {},
      data: {},
      activation: {
        pillars_active: BRIEF_INPUTS.find(i => i.id === "pillars_active").options.reduce(
          (acc, p) => ({ ...acc, [p.id]: p.default }), {}
        ),
        localization: {
          language:    LANGUAGES.find(l => l.default).id,
          nationality: NATIONALITIES.find(n => n.default).id,
          tone:        TONES.find(t => t.default).id
        }
      }
    },
    pillar_outputs: {},  // pillar_onboard: {...}, pillar_offer: {...}, etc.
    qa_results: {}
  };
}
