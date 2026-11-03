// =====================================================================
// PHOTO VIEWER
// Survey photos open large in the page rather than in a new browser tab:
// a modal dialog (<calcite-dialog id="photoDialog"> in index.html) showing
// the clicked photo, with Previous / Next - and the left / right arrow
// keys - to step through the survey's other photos. Escape or the close
// button returns to the panel. Same pattern as the NRS dashboard.
// =====================================================================

const state = { photos: [], index: 0, heading: "" };
let els = null;

// photos: [{ url, caption, alt }]; heading: what the dialog is titled.
export function openPhotos(photos, index, heading) {
  els ??= init();
  if (!els) return;
  state.photos = photos;
  state.index = index;
  state.heading = heading;
  render();
  els.dialog.open = true;
}

function init() {
  const dialog = document.getElementById("photoDialog");
  if (!dialog) return null;
  const found = {
    dialog,
    img: document.getElementById("photoImg"),
    prev: document.getElementById("photoPrev"),
    next: document.getElementById("photoNext"),
  };
  found.prev.addEventListener("click", () => step(-1));
  found.next.addEventListener("click", () => step(1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
  });
  return found;
}

function step(direction) {
  const next = state.index + direction;
  if (next < 0 || next >= state.photos.length) return;
  state.index = next;
  render();
}

function render() {
  const { dialog, img, prev, next } = els;
  const count = state.photos.length;
  const photo = state.photos[state.index];
  img.src = photo.url;
  img.alt = photo.alt;
  dialog.heading = state.heading;
  dialog.description = `${photo.caption}${count > 1 ? ` · ${state.index + 1} of ${count}` : ""}`;
  prev.hidden = count < 2;
  next.hidden = count < 2;
  prev.disabled = state.index === 0;
  next.disabled = state.index === count - 1;
}
