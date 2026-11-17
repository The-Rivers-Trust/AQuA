// =====================================================================
// GROUP LINKS
// A web address can point at one group: ?group=river-foss-society opens
// the dashboard on the Groups tab with that group picked (its profile and
// map), as if it had been chosen in the header. The address also follows
// the group filter, so a group picked anywhere can be shared by copying
// the address bar (the Groups tab has a Copy link button too). An unknown
// group in an address is ignored and the dashboard opens as normal.
// Other parts of the address (such as ?drafts) are left alone.
// =====================================================================

import { fetchSites } from "./data/aqua-service.js";
import { fetchOrganisations, groupForSlug, slugOf, slugify } from "./data/organisations.js";
import { onFilterChange, getFilters, setSiteFilter } from "./filters.js";

// True when the address asked for a group (so the first-visit tour offer
// can stay out of the way).
export function arrivedByGroupLink() {
  const params = new URLSearchParams(location.search);
  return params.has("group") || params.has("catchment");
}

// filtersReady: the promise of the header filters having started.
export async function initGroupLink(filtersReady) {
  await filtersReady;
  const [organisations, siteFeatures] = await Promise.all([fetchOrganisations(), fetchSites()]);
  const names = [...new Set(siteFeatures.map((f) => f.attributes.case_study_group).filter(Boolean))];

  const asked = new URLSearchParams(location.search).get("group");
  const group = asked ? groupForSlug(names, organisations, asked) : null;
  const askedCatchment = new URLSearchParams(location.search).get("catchment");
  const catchments = [...new Set(siteFeatures.map((f) => f.attributes.Catchment).filter(Boolean))];
  const catchment = !group && askedCatchment
    ? catchments.find((c) => slugify(c) === askedCatchment.trim().toLowerCase()) ?? null
    : null;
  if (group) {
    setSiteFilter("group", group);
    document.querySelector('calcite-tab-title[data-view="groups"]')?.click();
  } else if (catchment) {
    setSiteFilter("catchment", catchment);
    document.querySelector('calcite-tab-title[data-view="catchments"]')?.click();
  }

  // Keep the address in step with the group filter.
  const sync = () => {
    const url = new URL(location.href);
    const picked = getFilters().group;
    if (picked) url.searchParams.set("group", slugOf(picked, organisations[picked]));
    else url.searchParams.delete("group");
    url.searchParams.delete("catchment"); // only needed to arrive; the filter takes over
    if (url.href !== location.href) history.replaceState(null, "", url);
  };
  onFilterChange(sync);
  sync();
}
