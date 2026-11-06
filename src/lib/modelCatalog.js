// /v1/models catalog control: hide entries, override display names, and pin an
// order — applied to the resolved list just before it is published.
//
// Pure + fail-open: a malformed catalog yields the input list untouched.

export const DEFAULT_CATALOG = Object.freeze({ hidden: [], displayNames: {}, order: [] });

export function normalizeCatalog(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...DEFAULT_CATALOG };
  const hidden = Array.isArray(input.hidden)
    ? [...new Set(input.hidden.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))]
    : [];
  const order = Array.isArray(input.order)
    ? [...new Set(input.order.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))]
    : [];
  const displayNames = {};
  if (input.displayNames && typeof input.displayNames === "object" && !Array.isArray(input.displayNames)) {
    for (const [k, v] of Object.entries(input.displayNames)) {
      if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
        displayNames[k.trim()] = v.trim().slice(0, 256);
      }
    }
  }
  return { hidden, displayNames, order };
}

/**
 * Apply catalog overrides to a model list.
 * - `hidden` entries are removed.
 * - `displayNames[id]` sets the entry's `name` (and `id` stays the routable id).
 * - `order` moves listed ids to the front in that exact order; the rest follow
 *   in their original relative order.
 *
 * @param {Array} models
 * @param {object} catalog
 * @returns {Array}
 */
export function applyCatalogOverrides(models, catalog) {
  if (!Array.isArray(models)) return models;
  const cfg = normalizeCatalog(catalog);
  const hiddenSet = new Set(cfg.hidden);

  const visible = models.filter((m) => m && typeof m.id === "string" && !hiddenSet.has(m.id));

  const withNames = visible.map((m) => {
    const name = cfg.displayNames[m.id];
    return name ? { ...m, name } : m;
  });

  if (!cfg.order.length) return withNames;

  const rank = new Map();
  cfg.order.forEach((id, i) => rank.set(id, i));
  return [...withNames].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}
