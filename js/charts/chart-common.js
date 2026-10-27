// =====================================================================
// CHART COMMON
// Reading text and the hover/focus tooltip, shared by the downstream
// line charts and the river diagrams. A point is
// { site, river, description, value, state: "value"|"belowLod"|"none",
//   color, bandLabel }.
// =====================================================================

export function valueText(p, unit, formatValue) {
  if (p.state === "belowLod") return "Below limit of detection";
  if (p.state === "none") return "No reading";
  return `${formatValue(p.value)} ${unit}`;
}

export function ariaLabel(p, unit, formatValue) {
  return [p.site, p.river, valueText(p, unit, formatValue), p.bandLabel].filter(Boolean).join(", ");
}

// Built with textContent - site names and descriptions are data.
export function showTooltip(tooltipEl, anchor, p, unit, formatValue) {
  tooltipEl.replaceChildren();
  const value = document.createElement("div");
  value.className = "chartTooltipValue";
  value.textContent = valueText(p, unit, formatValue);
  tooltipEl.append(value);
  if (p.bandLabel) {
    const band = document.createElement("div");
    band.className = "chartTooltipBand";
    const key = document.createElement("span");
    key.className = "chartTooltipKey";
    key.style.background = p.color;
    band.append(key, document.createTextNode(p.bandLabel));
    tooltipEl.append(band);
  }
  const site = document.createElement("div");
  site.className = "chartTooltipSite";
  site.textContent = [p.site, p.river].filter(Boolean).join(" · ");
  tooltipEl.append(site);
  if (p.description && p.description !== p.river) {
    const desc = document.createElement("div");
    desc.className = "chartTooltipDesc";
    desc.textContent = p.description;
    tooltipEl.append(desc);
  }

  tooltipEl.hidden = false;
  const box = anchor.getBoundingClientRect();
  // Positioned within the tooltip's (non-scrolling) offset parent.
  const host = tooltipEl.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const left = box.left + box.width / 2 - host.left + 12;
  const maxLeft = (tooltipEl.offsetParent?.clientWidth ?? window.innerWidth) - tooltipEl.offsetWidth - 8;
  tooltipEl.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
  tooltipEl.style.top = `${box.top - host.top + 8}px`;
}
