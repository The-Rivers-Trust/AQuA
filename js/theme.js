// =====================================================================
// THEME
// Dark/light switching. The inline script in index.html applies a saved
// choice before first paint; this module keeps everything in step after
// that: Calcite's mode class, the ArcGIS widget stylesheet, and anything
// that registered with onThemeChange (e.g. the map's basemap).
// =====================================================================

const THEME_STORAGE_KEY = "aquaDashboardTheme"; // also used in index.html
const ARCGIS_THEME_URL = (theme) => `https://js.arcgis.com/5.1/esri/themes/${theme}/main.css`;

const listeners = new Set();

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.remove("calcite-mode-dark", "calcite-mode-light");
  root.classList.add(`calcite-mode-${theme}`);

  const link = document.getElementById("arcgisThemeLink");
  if (link) link.href = ARCGIS_THEME_URL(theme);

  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) { /* storage blocked - fine, just not remembered */ }

  listeners.forEach((fn) => fn(theme));
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme(toggleButton) {
  toggleButton?.addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });
}
