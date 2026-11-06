// Prompt injections: operator-authored instructions merged into the system
// message of every request, scoped globally or to a specific combo.
//
// A pure resolver (selectInjections) plus an applier that reuses the shared
// system-prompt injector. Fail-open: bad input yields no injections.

import { injectSystemPrompt, prependSystemPrompt } from "./systemInject.js";

export const PROMPT_SCOPE = { GLOBAL: "global", COMBO: "combo" };
export const PROMPT_POSITION = { PREPEND: "prepend", APPEND: "append" };

/**
 * Select the injections that apply to a request.
 * @param {Array} injections - settings.promptInjections
 * @param {string|null} comboName - the requested combo name (or null)
 * @returns {Array} applicable injections, ordered: prepend first (higher priority), then append
 */
export function selectInjections(injections, comboName = null) {
  if (!Array.isArray(injections)) return [];
  const combo = comboName ? String(comboName).toLowerCase() : null;

  const picked = [];
  for (const entry of injections) {
    if (!entry || entry.enabled !== true) continue;
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!text) continue;
    const scope = entry.scope === PROMPT_SCOPE.COMBO ? PROMPT_SCOPE.COMBO : PROMPT_SCOPE.GLOBAL;
    if (scope === PROMPT_SCOPE.COMBO) {
      if (!combo) continue;
      if (String(entry.comboName || "").toLowerCase() !== combo) continue;
    }
    picked.push({
      id: entry.id || null,
      name: entry.name || "",
      text,
      scope,
      position: entry.position === PROMPT_POSITION.PREPEND ? PROMPT_POSITION.PREPEND : PROMPT_POSITION.APPEND,
      priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0,
    });
  }

  // Deterministic order: prepend group first (highest priority leads), then append.
  const byPriority = (a, b) => b.priority - a.priority;
  const prepends = picked.filter((p) => p.position === PROMPT_POSITION.PREPEND).sort(byPriority);
  const appends = picked.filter((p) => p.position === PROMPT_POSITION.APPEND).sort(byPriority);
  return [...prepends, ...appends];
}

/**
 * Apply the selected injections to a request body, in order.
 * @returns {number} how many injections were applied
 */
export function applyInjections(body, format, injections) {
  if (!Array.isArray(injections) || injections.length === 0) return 0;
  let applied = 0;
  for (const inj of injections) {
    if (!inj?.text) continue;
    if (inj.position === PROMPT_POSITION.PREPEND) {
      if (prependSystemPrompt(body, format, inj.text)) applied++;
    } else if (injectSystemPrompt(body, format, inj.text)) {
      applied++;
    }
  }
  return applied;
}
