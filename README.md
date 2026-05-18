# Trident OS v3 — Capitán del Marketing

Sistema operativo de la agencia · MVP vanilla HTML/JS · cero setup local.

---

## Stack del MVP (Fase 1 · este turn)

- **Frontend:** HTML + CSS + JS vanilla (sin Node, sin npm, sin build)
- **Skills:** 44 .md empaquetados a `skills.json` por script PowerShell
- **Persistencia:** Firebase Firestore vía Web SDK (CDN) — se agrega en Turn 2
- **IA:** Gemini API vía `fetch` — se agrega en Turn 3
- **Hosting:** Firebase Hosting (drag & drop desde consola web)

Cuando el MVP valide producto · migración planificada a Next.js + TypeScript (Fase 2).

---

## Estructura del repo

```
trident-os-app/
├── index.html              ← UI principal (4 tabs)
├── styles.css              ← Branding Capitán (naranja E86A1E)
├── app.js                  ← Lógica + carga skills.json + render admin
├── firebase-config.js      ← Config placeholder (completar Turn 2)
├── skills.json             ← Generado por build-skills-json.py (296.9 KB · 44 skills)
├── build-skills-json.py    ← Empaqueta los 44 .md → skills.json (USAR ESTE)
├── build-skills-json.ps1   ← Fallback PowerShell (lento · no usar)
└── README.md
```

---

## Cómo correrlo (primera vez)

### Paso 1 · Generar skills.json

Abrí PowerShell en esta carpeta y corré el script Python (ya tenés Python 3.12 instalado · build en <1 seg):

```powershell
cd C:\Users\Usuario\trident-os-app
python build-skills-json.py
```

(El script PowerShell `build-skills-json.ps1` existe como fallback pero es ~150× más lento en Windows PowerShell 5.1 · usar Python siempre.)

Debería mostrar:

```
Found 44 .md files in source directory
  [meta_docs]    00-MASTER-INSTRUCTIONS-START-HERE.md (...)
  [meta_docs]    01-ARCHITECTURE-OVERVIEW.md (...)
  ...
Wrote skills.json
Total: 44 files / ~XXX KB

Category breakdown:
  meta_docs        4 [OK]
  nucleus_main     1 [OK]
  universal       10 [OK]
  language         2 [OK]
  nationality      9 [OK]
  tone             5 [OK]
  transversal      3 [OK]
  qa_validator     4 [OK]
  pillars          6 [OK]
```

Si alguno dice `MISMATCH` · falta o sobra un archivo en la carpeta fuente.

### Paso 2 · Abrir la app

**Servir con Python (recomendado · evita bloqueos CORS de file://):**

```powershell
cd C:\Users\Usuario\trident-os-app
python -m http.server 3460
```

Y abrí http://localhost:3460

(Si usás Claude Code · ya está configurado en `.claude/launch.json` como server `trident-os` en puerto 3460.)

---

## Checklist de validación del Admin Panel

Al abrir `index.html` debe verse:

- [ ] **Top metrics:** 40 Skills activadas · 44 Archivos cargados · ~XXX KB
- [ ] **9 cards de categoría · todas en verde (sin `MISMATCH`):**
  - Docs maestros: 4 / 4
  - Núcleo Global: 1 / 1
  - Universal Rules: 10 / 10
  - Language Layer: 2 / 2
  - Nationality Flavor: 9 / 9
  - Tone Styles: 5 / 5
  - Skills Transversales: 3 / 3
  - QA Validator: 4 / 4
  - Pilares secuenciales: 6 / 6
- [ ] **Tabla expandible** con los 44 archivos · cada uno con botón "Ver contenido" funcional
- [ ] **Tabs:** Onboarding · Clientes · Pilares (muestran placeholders Turn 2-3)

Si todo OK · esto resuelve el problema visible que falló 3 veces en Google AI Studio.

---

## Próximos turns

| Turn | Qué se entrega |
|------|----------------|
| 2    | Wizard onboarding 11 pantallas · Firebase Firestore integrado · cliente schema |
| 3    | Dashboard de 6 pilares · ejecución Gemini con skills |
| 4    | QA Validator automático · loop 3 cycles · descarga .docx |
| 5    | Smoke test con cliente ficticio Carlos Rodriguez |
| 6+   | Fase 2 · migración a Next.js cuando MVP valide producto |

---

## Lo que necesitamos antes del Turn 2

Para integrar Firebase + Gemini necesito que crees 2 cuentas (10 min total):

### 1 · Firebase project (consola web · cero instalación)
- Ir a https://console.firebase.google.com
- "Add project" → nombre `trident-os-prod`
- Disable Google Analytics (no lo necesitamos para MVP)
- Una vez creado: **Build** → **Firestore Database** → **Create database** → **Production mode** → región `nam5 (us-central)`
- En el engranaje (arriba izq) → **Project settings** → **General** → bajar hasta "Your apps" → click `</>` (Web) → app nickname `trident-os-web` → "Register app"
- **Copiá el objeto `firebaseConfig`** que aparece (apiKey · authDomain · projectId · etc.) y pegámelo en chat

### 2 · Gemini API key (2 min)
- Ir a https://aistudio.google.com/apikey
- "Create API key" → seleccionar tu proyecto (o crear uno nuevo)
- Copiá la key (empieza con `AIza...`) y pegámela en chat

Con esos 2 datos · en el próximo turn dejo Firebase + Gemini configurados y arrancamos con el Wizard.

---

QUWWA LLC dba Capitán del Marketing · New Mexico · USA
