// =====================================================================
// LEAGUE TABLE
// Sortable table of sites ranked by their citizen science readings,
// shown in place of the map on the Citizen Science tab. Same behaviour
// as the NRS dashboard's league table: click a column header to sort
// (numbers lead with the highest, text A-Z; click again to flip),
// missing readings always sort to the bottom. Clicking a row (or
// Enter/Space on it) hands the site to onSelectSite.
// =====================================================================

import { METRICS } from "../config.js";
import { classify } from "../metrics.js";
import { escapeHtml, formatNumber, formatSeason } from "../utils/format.js";

// Ranks: 1 = lowest reading (cleanest). Equal readings share a rank
// ("1, 2, 2, 4"), and sites with no reading get none.
const COLUMNS = [
  { field: "site_name", label: "Site", type: "text" },
  { field: "River_Waterbody", label: "River / waterbody", type: "text" },
  { field: "Catchment", label: "Catchment", type: "text" },
  { field: "case_study_group", label: "Group", type: "text" },
  { field: "phosphate_rank", label: "Phosphate rank", type: "rank" },
  { field: "phosphate_ppm", label: `Phosphate (${METRICS.phosphate.unit})`, type: "metric", metric: "phosphate" },
  { field: "ecoli_rank", label: "E. coli rank", type: "rank" },
  { field: "ecoli_cfu", label: `E. coli (${METRICS.ecoli.unit})`, type: "metric", metric: "ecoli" },
];

let sort = { field: "phosphate_rank", direction: "asc" };

// rows: site attribute objects (already filtered). metric: the metric
// picked in the side panel ("sites" for none) - when it changes, the
// table re-sorts by that metric's rank.
let lastMetric = null;

export function renderLeagueTable(containerEl, { rows, metric, season, filteredNote, onSelectSite }) {
  if (metric !== lastMetric && METRICS[metric]) {
    sort = { field: `${metric}_rank`, direction: "asc" };
  }
  lastMetric = metric;

  const ranked = withRanks(rows);
  const sorted = ranked.slice().sort(compareRows);

  containerEl.innerHTML = `
    <div class="leagueHeader">
      <h2>Site league table</h2>
      <p class="leagueSubtitle">Citizen science readings, ${escapeHtml(formatSeason(season) || "–")}. Rank 1 = lowest reading. Click a column to sort, or a site to see it on the map.</p>
      ${filteredNote}
    </div>
    ${sorted.length
      ? `<div class="tableScroll">
          <table class="leagueTable">
            <thead><tr>${COLUMNS.map(headerCell).join("")}</tr></thead>
            <tbody>${sorted.map(rowHtml).join("")}</tbody>
          </table>
        </div>`
      : `<p class="muted">No sites match the current filters.</p>`}`;

  containerEl.querySelectorAll("th[data-field]").forEach((th) => {
    const activate = () => {
      const col = COLUMNS.find((c) => c.field === th.dataset.field);
      sort = sort.field === col.field
        ? { field: col.field, direction: sort.direction === "asc" ? "desc" : "asc" }
        // Ranks lead with 1 (lowest reading), other numbers with the
        // highest, text A-Z.
        : { field: col.field, direction: col.type === "metric" ? "desc" : "asc" };
      renderLeagueTable(containerEl, { rows, metric, season, filteredNote, onSelectSite });
      containerEl.querySelector(`th[data-field="${col.field}"]`)?.focus();
    };
    th.addEventListener("click", activate);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
  });

  containerEl.querySelectorAll("tbody tr[data-site]").forEach((tr) => {
    const select = () => onSelectSite(tr.dataset.site);
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });
  });
}

function withRanks(rows) {
  const ranked = rows.map((a) => ({ ...a }));
  for (const [key, metric] of Object.entries(METRICS)) {
    const values = ranked.map((r) => r[metric.field]).filter((v) => v != null).sort((x, y) => x - y);
    for (const r of ranked) {
      const v = r[metric.field];
      // Competition ranking: 1 + number of readings strictly lower.
      r[`${key}_rank`] = v == null ? null : values.findIndex((x) => x === v) + 1;
    }
  }
  return ranked;
}

function compareRows(a, b) {
  const av = a[sort.field];
  const bv = b[sort.field];
  const aMissing = av == null || av === "";
  const bMissing = bv == null || bv === "";
  // Missing readings sort to the bottom whichever way round, rather than
  // masquerading as zero.
  if (aMissing && bMissing) return a.site_name.localeCompare(b.site_name, "en-GB");
  if (aMissing) return 1;
  if (bMissing) return -1;
  const cmp = typeof av === "string" ? av.localeCompare(bv, "en-GB") : av - bv;
  // Ties fall back to site name so the order is stable.
  return (sort.direction === "asc" ? cmp : -cmp) || a.site_name.localeCompare(b.site_name, "en-GB");
}

function headerCell(col) {
  const active = sort.field === col.field;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  const numeric = col.type !== "text";
  return `
    <th data-field="${col.field}" tabindex="0" role="button" aria-sort="${ariaSort}" class="${numeric ? "leagueColNum" : ""}">
      ${escapeHtml(col.label)}${active ? `<span class="sortArrow" aria-hidden="true">${sort.direction === "asc" ? " ▲" : " ▼"}</span>` : ""}
    </th>`;
}

function rowHtml(row) {
  const cells = COLUMNS.map((col) => {
    const v = row[col.field];
    if (col.type === "metric") {
      const metric = METRICS[col.metric];
      const band = classify(col.metric, v);
      return `
        <td class="leagueColNum">
          <span class="leagueValue">
            <span class="legendSwatch" style="background:${band.color}" aria-hidden="true"></span>
            ${formatNumber(v, metric.decimals)}
          </span>
          <span class="leagueBand">${escapeHtml(band.label)}</span>
        </td>`;
    }
    if (col.type === "rank") return `<td class="leagueColNum leagueRank">${v ?? "–"}</td>`;
    return `<td>${escapeHtml(v ?? "–")}</td>`;
  }).join("");
  return `<tr data-site="${escapeHtml(row.site_name)}" tabindex="0" title="Show ${escapeHtml(row.site_name)} on the map">${cells}</tr>`;
}
