// =====================================================================
// BASEMAPS
// One basemap choice shared by every map. Each map has a basemap gallery
// (an <arcgis-basemap-gallery> in the map's Basemap panel, tool-panels.js);
// picking a basemap in any of them changes every map that's already
// running, and any map started later (tabs are only initialised the
// first time they're opened) starts with it.
//
// Until something is picked, the basemap follows the dark/light theme
// (MAP.basemap in config.js). A pick stays put when the theme is switched
// - except the light and dark gray pair, which are the theme's own
// basemaps: with either one showing, switching the theme swaps to the
// other, so light mode never keeps the dark map or the reverse. Any other
// pick (streets, topographic, imagery...) is left alone.
// =====================================================================

import { MAP } from "../config.js";
import { getTheme, onThemeChange } from "../theme.js";

let choice = null; // basemap id the user picked; null = follow the theme
const maps = new Set();

const themeDefault = () => MAP.basemap[getTheme()];

// The basemap id every map should be showing right now.
export const currentBasemapId = () => choice ?? themeDefault();

// Gives a map its starting basemap and wires up its gallery.
export async function setupBasemap(mapEl) {
  const [Basemap, LocalBasemapsSource] = await $arcgis.import([
    "@arcgis/core/Basemap.js",
    "@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js",
  ]);

  mapEl.basemap = currentBasemapId();
  maps.add(mapEl);

  const gallery = mapEl.closest(".view")?.querySelector("arcgis-basemap-gallery");
  if (!gallery) return;
  gallery.source = new LocalBasemapsSource({
    basemaps: MAP.basemaps.map((id) => {
      const basemap = Basemap.fromId(id);
      basemap.id = id; // the gallery reports a pick by this id
      return basemap;
    }),
  });
  gallery.addEventListener("arcgisPropertyChange", (event) => {
    if (event.detail?.name === "activeBasemap") pick(gallery.activeBasemap?.id);
  });
}

// A basemap was picked in a gallery. The same event also fires when a
// gallery just follows a change made elsewhere (another map, the theme,
// its own start-up), so ignore a basemap that's already the answer -
// otherwise the theme's own default would be mistaken for a user's pick
// and stop following the theme. (Re-picking the basemap already showing
// before choosing anything else therefore doesn't lock it in; harmless.)
function pick(id) {
  if (!id || id === choice) return;
  if (choice === null && id === themeDefault()) return;
  choice = id;
  applyToAll();
}

function applyToAll() {
  const id = currentBasemapId();
  for (const mapEl of maps) {
    if (mapEl.map?.basemap?.id !== id) mapEl.basemap = id;
  }
}

// On a theme switch, a basemap that's one of the theme defaults (light or
// dark gray) goes back to "follow the theme", so it lands on the new
// theme's one; any other pick is kept.
onThemeChange(() => {
  if (choice === null || Object.values(MAP.basemap).includes(choice)) {
    choice = null;
    applyToAll();
  }
});
