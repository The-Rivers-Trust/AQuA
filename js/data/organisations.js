// =====================================================================
// ORGANISATIONS
// Loads data/organisations.json once (the Groups tab and the group links
// both need it) and works out each group's short name for web addresses:
// "River Foss Society" -> river-foss-society. A group can set its own
// "slug" in the file so its link keeps working if its display name is
// ever changed.
// =====================================================================

const ORGANISATIONS_URL = "data/organisations.json";

let cache = null;

// { "Group name": { about, concernsAndQuestions, links, slug?... } } - an
// empty object if the file can't be read.
export function fetchOrganisations() {
  cache ??= fetch(ORGANISATIONS_URL, { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : {}))
    .then((json) => json.organisations ?? {})
    .catch((error) => {
      console.warn("AQuA dashboard: organisations unavailable:", error);
      return {};
    });
  return cache;
}

export const slugify = (name) => String(name)
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

export const slugOf = (name, org) => org?.slug || slugify(name);

// The group (from `names`) a slug in an address refers to, or null.
export function groupForSlug(names, organisations, slug) {
  const wanted = String(slug ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return names.find((name) => slugOf(name, organisations[name]).toLowerCase() === wanted) ?? null;
}

// The shareable address of a group: this page with ?group=<slug>.
export function groupLink(name, organisations) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("group", slugOf(name, organisations[name]));
  return url.href;
}
