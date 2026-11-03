// =====================================================================
// FORMAT
// Small display helpers shared across tabs.
// =====================================================================

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// For lab results that span orders of magnitude (0.000144 to 119): a fixed
// number of significant figures rather than decimal places.
export function formatSignificant(value, digits = 3) {
  if (value == null || Number.isNaN(Number(value))) return "–";
  return new Intl.NumberFormat("en-GB", { maximumSignificantDigits: digits }).format(value);
}

// "Summer26" -> "Summer 2026". Anything not in <word><2 or 4 digit year>
// form is returned as-is, so an unexpected season code still shows.
export function formatSeason(season) {
  const match = /^([A-Za-z]+)\s*(\d{2}|\d{4})$/.exec(String(season ?? "").trim());
  if (!match) return season ?? "";
  const [, name, year] = match;
  return `${name[0].toUpperCase()}${name.slice(1).toLowerCase()} ${year.length === 2 ? `20${year}` : year}`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatNumber(value, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return "–";
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

// Takes epoch milliseconds (date fields) or "YYYY-MM-DD" (date-only fields).
export function formatDate(value) {
  return value == null ? "–" : dateFormat.format(new Date(value));
}

// ms -> "YYYY-MM-DD HH:MM:SS" (UTC), for a SQL TIMESTAMP '...' literal.
export function sqlTimestamp(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
