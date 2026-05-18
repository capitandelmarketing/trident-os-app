// gemini.js — Cliente para Google Gemini API
// Usa REST API directo (no SDK) para evitar dependencias.
// Modelo: gemini-2.0-flash (mejor calidad/precio · 1M context window)

const MODEL = "gemini-2.5-flash";
const ENDPOINT_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;

export function getApiKey() {
  const k = window.GEMINI_API_KEY;
  if (!k || k.includes("PEGAR")) throw new Error("GEMINI_API_KEY no configurada en firebase-config.js");
  return k;
}

/**
 * Generate content (non-streaming).
 * @param {string} prompt
 * @param {object} opts { temperature, maxOutputTokens, onProgress }
 * @returns {Promise<{text, usage, raw}>}
 */
export async function generate(prompt, opts = {}) {
  const apiKey = getApiKey();
  const url = `${ENDPOINT_BASE}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:      opts.temperature ?? 0.7,
      maxOutputTokens:  opts.maxOutputTokens ?? 32768,
      responseMimeType: "text/plain",
      thinkingConfig:   { thinkingBudget: opts.thinkingBudget ?? 0 }
    }
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.substring(0, 400)}`);
  }

  const data = await res.json();
  const elapsedMs = Date.now() - start;

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidates");

  const text = candidate.content?.parts?.map(p => p.text).join("") || "";
  const usage = data.usageMetadata || {};

  return {
    text,
    usage: {
      promptTokens:    usage.promptTokenCount    || 0,
      outputTokens:    usage.candidatesTokenCount || 0,
      totalTokens:     usage.totalTokenCount     || 0,
      elapsedMs
    },
    finishReason: candidate.finishReason || "STOP",
    raw: data
  };
}

/**
 * Generate content with streaming. Calls onChunk(text) for each delta.
 * @returns {Promise<{text, usage}>}
 */
export async function generateStream(prompt, opts = {}) {
  const apiKey = getApiKey();
  const url = `${ENDPOINT_BASE}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:      opts.temperature ?? 0.7,
      maxOutputTokens:  opts.maxOutputTokens ?? 32768,
      thinkingConfig:   { thinkingBudget: opts.thinkingBudget ?? 0 }
    }
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini stream ${res.status}: ${errText.substring(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let lastUsage = {};
  let finishReason = "STOP";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events separated by blank line · Gemini uses CRLF (\r\n\r\n) · normalize both
    const normalized = buffer.replace(/\r\n/g, "\n");
    const events = normalized.split("\n\n");
    // Keep the last (possibly incomplete) event in buffer
    const lastEvent = events.pop() || "";
    buffer = lastEvent.includes("\n") ? "" : lastEvent;  // simple heuristic

    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.substring(5).trim();
      if (!json) continue;
      try {
        const chunk = JSON.parse(json);
        const candidate = chunk.candidates?.[0];
        if (candidate?.content?.parts) {
          const delta = candidate.content.parts.map(p => p.text || "").join("");
          if (delta) {
            fullText += delta;
            opts.onChunk?.(delta, fullText);
          }
        }
        if (candidate?.finishReason) finishReason = candidate.finishReason;
        if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
      } catch (err) {
        console.warn("[gemini] failed to parse SSE chunk", err, json.substring(0, 200));
      }
    }
  }

  const elapsedMs = Date.now() - start;

  return {
    text: fullText,
    usage: {
      promptTokens:    lastUsage.promptTokenCount    || 0,
      outputTokens:    lastUsage.candidatesTokenCount || 0,
      totalTokens:     lastUsage.totalTokenCount     || 0,
      elapsedMs
    },
    finishReason
  };
}
