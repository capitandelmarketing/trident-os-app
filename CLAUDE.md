# Trident OS v4 · App · Instrucciones internas

Sistema operativo de Capitán del Marketing. Vanilla HTML + ES modules + Firebase (Auth + Firestore) + Gemini 2.5-flash.

**No es worktree de capitan-del-marketing.** Vive standalone en `C:\Users\Usuario\trident-os-app\`. Damian NO tiene Node/Firebase CLI · solo Python + git.

---

## Stack

- **Frontend:** HTML + CSS + JS vanilla (ES modules vía `<script type="module">`)
- **Backend:** Firebase Web SDK 10.12.0 vía CDN (NO npm)
  - **Auth:** Email/Password (único provider activo · ver "Auth flow")
  - **Firestore:** Custom database ID `ai-studio-0dcbd183-6688-4fcd-9005-35378feb0ec0` · NO el default
- **IA:** Gemini 2.5-flash vía fetch directo
- **Dev server:** Python `http.server` en puerto 3460 · launch.json en `.claude/`

Proyecto Firebase: `centro-comando-capitan`.

---

## Arquitectura de módulos

```
index.html          ← entrypoint · <div id="app-root"> + scripts
firebase-config.js  ← window.FIREBASE_CONFIG + GEMINI_API_KEY
main.js             ← router + auth listener + render por rol
auth.js             ← Firebase Auth wrapper + role helpers + onSnapshot profile
login.js            ← UI login overlay · 3 modes (signin/signup/reset)
modal.js            ← confirmDialog + promptChoice compartidos
db.js               ← Firestore wrapper (clients + outputs + logs) + localStorage fallback
users-admin.js      ← Panel operator · gestiona usuarios (role + linkedClientId)
notify-sound.js     ← Toast + chime + title flash · window.notifyInfo + attentionNeeded
admin.js            ← Neural Infrastructure tab (lista skills.json)
wizard.js           ← Onboarding wizard (11 pantallas)
clients.js          ← Lista de clientes
pillars.js          ← 6 pilares (ejecución Gemini)
qa-validator.js     ← Validador QA post-generación (B6 deprecated · B7 warning)
gemini.js           ← Wrapper Gemini con prompt caching
context-builder.js  ← Arma contexto skill + brief para Gemini
brief-schema.js     ← Schema del brief del wizard
skills.json         ← 49 skills empacadas (generado por script)
firestore.rules     ← Rules · pegar manual en Firebase Console (Damian no tiene CLI)
```

---

## Auth flow (Turn 6a · validado end-to-end)

### Roles
- `operator` — Damian, Oscar, equipo Capitán. Ve TODO (Neural · Onboarding · Clientes · Pilares · Usuarios).
- `client` — Realtor. Ve SOLO su workspace (vinculado vía `linkedClientId`).
- `pending` — Cuenta creada pero sin perfil en Firestore o sin rol asignado. UI muestra "Cuenta pendiente · contactá admin".

### Sign-up
1. `createUserWithEmailAndPassword` en Firebase Auth
2. `setDoc(users/{uid}, {email, role, linkedClientId, displayName, createdAt})`
3. Si setDoc falla → rollback: `deleteUser(authUser)` para no dejar cuenta huérfana
4. `onAuthStateChanged` dispara → carga profile de Firestore → notifica listeners

### Real-time profile
- `auth.js` mantiene `onSnapshot(users/{uid})` activo mientras el usuario esté logueado
- Cuando operator modifica `role` o `linkedClientId` en otra sesión, el usuario afectado VE el cambio en vivo (re-render automático)
- Cleanup `profileUnsub()` en sign-out

### Idempotencia init
- `db.js` y `auth.js` ambos usan `getApps()[0] || initializeApp()` para no crear múltiples instancias

### Pending state (sin Firestore doc)
- Si un usuario tiene cuenta en Auth pero NO doc en `users/{uid}` (caso típico: profile borrado por operator), queda como `role: "pending"` automáticamente
- NUNCA caer silentemente a `role: "client"` por default

### Sign-out
- Confirm dialog obligatorio antes de cerrar sesión

---

## Panel Usuarios (operator-only)

`users-admin.js` lista todos los docs de `users/` con acciones:
- **Cambiar rol** — operator/client/pending
- **Vincular cliente** — set `linkedClientId` para que el usuario client vea ese workspace
- **Borrar perfil** — `deleteDoc(users/{uid})`. NO borra la cuenta Auth (no se puede desde SDK cliente). Si el usuario se loguea de nuevo, queda como `pending`.

Self-guard: el operator logueado NO puede borrar su propio perfil.

Para borrar cuentas Auth de verdad → Firebase Console manual (no hay SDK admin en cliente).

---

## Firestore rules

Pegadas manualmente en Firebase Console (Damian no tiene CLI). Archivo de referencia en `firestore.rules`. Actualmente abiertas (`allow read, write: if true`) para MVP · Fase 2 tightening:

```
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId;
  // operators escriben docs de otros via Cloud Function (TODO)
}
match /clients/{clientId} {
  allow read, write: if request.auth != null;
  // Fase 2: solo operators · clients solo leen su linkedClientId
}
```

---

## Convenciones

### Output a usuario
- ESPAÑOL NEUTRO (tú/tienes/puedes) · NUNCA voseo rioplatense
- "Damian" SIN tilde
- "Latino" NO "hispano"
- Footer: "QUWWA LLC dba Capitán del Marketing · New Mexico · USA"

### Términos Laurel Portie
- PERMITIDO usar directo en UI/skills internas: Power Content · HOT 7 · Conveyor Belt · Invisible List · Show Up Engine · Starting 5 · The New Agent Method™
- B6/L11 deprecated en qa-validator.js

### Branding
- Naranja Capitán: `#E86A1E` (var `--capitan-orange`)
- Naranja dark: `#C9551A`
- Naranja light: `#FFE4D2`

### Notificaciones
- `window.notifyInfo(msg, "ok"|"attention")` para feedback no-bloqueante
- `window.attentionNeeded(msg)` para alertas críticas (chime + title flash + native notification)

### Modales
- Usar `confirmDialog({title, body, confirmLabel, danger})` y `promptChoice({title, options, currentValue})` de `modal.js`
- NO crear modales inline en cada módulo

---

## Setup Firebase Console (Damian · primera vez)

1. **Authentication → Método de acceso:** habilitar "Correo electrónico y contraseña". DESHABILITAR el resto de providers (Google, etc.) — no se usan.
2. **Firestore → Seguridad:** pegar contenido de `firestore.rules` y publicar.
3. **Authentication → Configuración → Dominios autorizados:** agregar dominio custom cuando hagamos deploy.

---

## Próximos turns

| Turn | Entrega |
|------|---------|
| 6a   | ✅ Auth + Roles + Login UI + Panel Usuarios + onSnapshot + Pending state |
| 6b   | Workspace cliente expandido (preview deliverables · QA badges · download .docx) |
| 6c   | Editor in-app TipTap rich text + autosave |
| 6d   | Workflow aprobación (draft → in-edit → approved → download) |
| 6e   | Rediseño UI premium (shadcn-style + dark mode + animaciones) |
| 6f   | GHL webhook receiver (Cloud Function) |
| 6g   | Deploy Firebase Hosting + custom domain |

---

## Reglas inquebrantables

1. **Profundidad > velocidad SIEMPRE.** No tomar atajos para ahorrar tokens/tiempo. Si una tarea requiere 3 vueltas, hacer las 3.
2. **No mockear datos.** Si falta un input del cliente (audio, brief, foto, brokerage), PAUSAR y pedir. Nunca inventar.
3. **Verificar consola sin errores antes de declarar trabajo terminado.** preview_console_logs · preview_eval.
4. **Cada cambio observable en browser → ejecutar verification_workflow** (preview_start + reload + snapshot + screenshot).
5. **No agregar features sin que Damian las pida.** Sólo lo solicitado · sin scope creep.

---

QUWWA LLC dba Capitán del Marketing · New Mexico · USA
