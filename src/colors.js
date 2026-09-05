export const DEFAULT_COLOR = "#57534e";

const LEGACY_THEME = {
  auth: "#6d4caf",
  catalog: "#c4921a",
  routes: "#546e7a",
  exec: "#c62828",
  fact: "#2e7d32",
  custom: DEFAULT_COLOR,
};

export const ZONE_PALETTE = [
  "#6d4caf",
  "#c4921a",
  "#546e7a",
  "#c62828",
  "#2e7d32",
  "#1565c0",
  "#ef6c00",
];

export function normalizeHex(value, fallback = DEFAULT_COLOR) {
  const raw = String(value || "").trim();
  if (LEGACY_THEME[raw]) return LEGACY_THEME[raw];
  const match = raw.match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (!match) return fallback;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  return `#${hex.toLowerCase()}`;
}

export function hexRgb(hex) {
  const value = normalizeHex(hex).slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function tint(hex, alpha = 0.28) {
  const { r, g, b } = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function inkOf(hex) {
  const { r, g, b } = hexRgb(hex);
  return `rgb(${Math.round(r * 0.42)}, ${Math.round(g * 0.42)}, ${Math.round(b * 0.42)})`;
}

export function zonePaint(color) {
  const hex = normalizeHex(color);
  return {
    hex,
    bg: tint(hex, 0.28),
    border: hex,
    title: inkOf(hex),
    header: hex,
  };
}

export function nextZoneColor(count) {
  return ZONE_PALETTE[count % ZONE_PALETTE.length];
}
