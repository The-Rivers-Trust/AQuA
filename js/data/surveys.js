// =====================================================================
// SURVEYS
// A site's citizen science surveys - one record per visit, so over time
// many per site (Summer 2026, Autumn 2026, ...). The site panel charts
// them and lets people flick through them.
// =====================================================================

import { AQUA } from "../config.js";

// Every record for a site, oldest first. Records with no date go last.
export function surveysForSite(records, siteName) {
  return records
    .filter((r) => r[AQUA.joinField] === siteName)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

const sortKey = (r) => `${r.field_date ?? "9999-99-99"} ${r.field_time ?? ""} ${r.OBJECTID ?? 0}`.padEnd(40);

// Which survey is showing, shared by the charts (which highlight it) and
// the survey browser (which shows it). Starts on the survey for the
// header's season - the latest one if it has several - or else the most
// recent survey; or on the one the user was last looking at for this
// site, if it's still there and the header season hasn't changed since.
let remembered = null; // { site, season, id }

export function createSurveyView(surveys, siteName, season) {
  const listeners = new Set();
  let index = startIndex();

  function startIndex() {
    if (!surveys.length) return -1;
    if (remembered?.site === siteName && remembered.season === season) {
      const again = surveys.findIndex((s) => s.OBJECTID === remembered.id);
      if (again !== -1) return again;
    }
    let inSeason = -1;
    surveys.forEach((s, i) => { if (s[AQUA.seasonField] === season) inSeason = i; });
    return inSeason !== -1 ? inSeason : surveys.length - 1;
  }

  return {
    surveys,
    get index() { return index; },
    get current() { return surveys[index] ?? null; },
    select(next) {
      if (next < 0 || next >= surveys.length || next === index) return;
      index = next;
      remembered = { site: siteName, season, id: surveys[next].OBJECTID };
      listeners.forEach((fn) => fn(index));
    },
    onChange(fn) { listeners.add(fn); },
  };
}
