// Environment-variable compatibility after the Mars Router → Mars Router rename.
//
// New names are `MARS_ROUTER_*`. The old `NINEROUTER_*` / `NINE_ROUTER_*` names
// are still read as a fallback so an existing deployment keeps working without
// editing its env; the new name always wins when both are set.

const PREFIXES = {
  MARS_ROUTER_: ["NINEROUTER_", "NINE_ROUTER_"],
};

/**
 * Read an env var by its new name, falling back to legacy spellings.
 * @param {string} name - e.g. "MARS_ROUTER_PROXY_URL"
 * @returns {string|undefined}
 */
export function readCompatEnv(name) {
  const value = process.env[name];
  if (value !== undefined && value !== "") return value;
  for (const [prefix, legacies] of Object.entries(PREFIXES)) {
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    for (const legacy of legacies) {
      const legacyName = `${legacy}${suffix}`;
      const legacyValue = process.env[legacyName];
      if (legacyValue !== undefined && legacyValue !== "") return legacyValue;
    }
  }
  return value;
}

export function hasCompatEnv(name) {
  return readCompatEnv(name) !== undefined;
}
