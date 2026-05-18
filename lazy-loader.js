// lazy-loader.js — Inject CDN scripts on demand · cache promises to avoid double-load
// All heavy libs (Papa Parse, mammoth, pdf.js, EasyMDE, html-docx-js) load only when needed.

const cache = new Map();

// Internal · load a single script and resolve when window has the expected global
function injectScript(src, opts = {}) {
  if (cache.has(src)) return cache.get(src);
  const promise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
    // CSS sibling if requested
    if (opts.css) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = opts.css;
      document.head.appendChild(l);
    }
  });
  cache.set(src, promise);
  return promise;
}

// ============ PUBLIC LOADERS ============
// Each waits for the underlying global to be ready before resolving.

export async function ensurePapaParse() {
  if (window.Papa) return window.Papa;
  await injectScript("https://unpkg.com/papaparse@5.4.1/papaparse.min.js");
  if (!window.Papa) throw new Error("Papa Parse loaded but window.Papa missing");
  return window.Papa;
}

export async function ensureMammoth() {
  if (window.mammoth) return window.mammoth;
  await injectScript("https://unpkg.com/mammoth@1.7.2/mammoth.browser.min.js");
  if (!window.mammoth) throw new Error("mammoth loaded but window.mammoth missing");
  return window.mammoth;
}

export async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await injectScript("https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js");
  if (!window.pdfjsLib) throw new Error("pdf.js loaded but window.pdfjsLib missing");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  return window.pdfjsLib;
}

export async function ensureEasyMDE() {
  if (window.EasyMDE) return window.EasyMDE;
  await injectScript("https://unpkg.com/easymde/dist/easymde.min.js", {
    css: "https://unpkg.com/easymde/dist/easymde.min.css"
  });
  if (!window.EasyMDE) throw new Error("EasyMDE loaded but window.EasyMDE missing");
  return window.EasyMDE;
}

export async function ensureHtmlDocx() {
  if (window.htmlDocx) return window.htmlDocx;
  await injectScript("https://unpkg.com/html-docx-js@0.3.1/dist/html-docx.js");
  if (!window.htmlDocx) throw new Error("html-docx-js loaded but window.htmlDocx missing");
  return window.htmlDocx;
}
