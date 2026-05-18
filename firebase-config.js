// Firebase + Gemini config
// Proyecto Firebase: "Centro Comando Capitan"
// Database ID: ai-studio-0dcbd183-6688-4fcd-9005-35378feb0ec0 (no es default · se pasa explícito al SDK)
// Region: us-west2

window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA8t3GI_wtlTjYtBODSMu1-TQeCCi_Rw_k",
  authDomain:        "centro-comando-capitan.firebaseapp.com",
  projectId:         "centro-comando-capitan",
  storageBucket:     "centro-comando-capitan.firebasestorage.app",
  messagingSenderId: "1068973802480",
  appId:             "1:1068973802480:web:d4d3b131e9e3a664e89335"
};

window.FIREBASE_DATABASE_ID = "ai-studio-0dcbd183-6688-4fcd-9005-35378feb0ec0";

// Gemini API key (obtenida de https://aistudio.google.com/apikey)
// NOTA SEGURIDAD: en Fase 2 mover a Cloud Function (no exponer en frontend público)
window.GEMINI_API_KEY = "AIzaSyBn7RzVwzfnVPbviRpatyrTinV8-TO26ws";
