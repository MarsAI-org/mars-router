// Formatting helpers shared by the limits/flow-control dashboards so large
// numbers (TPM etc.) stay readable and the UI is consistent.

/** 20000000 -> "20M", 1500 -> "1.5k", 0 -> "unlimited". */
export function formatCount(value) {
  const n = Number(value) || 0;
  if (n <= 0) return "unlimited";
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}k`;
  return String(n);
}

function trim(n) {
  const r = Math.round(n * 10) / 10;
  return String(r);
}

/** 120 -> "120", 20 -> "20". Plain number for chips/labels. */
export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString();
}

/** Parse a user-entered number (allow "" -> 0). */
export function parseCount(value) {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
