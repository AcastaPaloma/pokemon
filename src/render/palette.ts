// The woodblock ink plates. Every colour in the game is drawn from here so the
// whole world reads as one restricted print palette.

export const INK = {
  sumi: '#1d1a1a', // charcoal ink — outlines, trunks, deep shadow
  sumiSoft: '#3a3433',
  washi: '#f4e9d6', // warm parchment cream
  washiDeep: '#e6d6ba',
  sakura: '#f3a0b5', // blossom pink
  sakuraDeep: '#d9728f',
  sakuraPale: '#f8cdd6',
  moss: '#7d8f5c', // muted moss green
  mossDeep: '#55683f',
  mossPale: '#aab884',
  bamboo: '#93a866',
  cedar: '#8a6f5a', // cedar taupe
  cedarDark: '#4b3b33',
  indigo: '#2f3e5c', // twilight indigo
  indigoDeep: '#1c2438',
  indigoPale: '#7f93b3',
  water: '#5f8fa3',
  waterDeep: '#3a6478',
  waterPale: '#a9cdd3',
  vermilion: '#c8553d', // torii lacquer, hanko seals
  persimmon: '#e08a4a',
  gold: '#d6a94a',
  straw: '#d9c38a',
  thatch: '#b59a6a',
  stone: '#9a968c',
  stoneDark: '#6d6a64',
  rooftile: '#3f4756',
  snow: '#f3f1ec',
  ash: '#6b6260',
  ember: '#e2603a',
  sand: '#e3d2a8',
  maple: '#c9553a',
  paperLantern: '#f5e2b8',
  bronze: '#6f6a4a',
} as const;

export type InkName = keyof typeof INK;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB hex → linear rgb triple (three.js works in linear). */
export function hexToLinear(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
}

export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round((v + (B[i] - v) * t) * 255));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Element plate colours used by UI seals, move FX and auras. */
export const ELEMENT_INK: Record<string, string> = {
  fire: '#d9593a',
  water: '#4f86a6',
  wood: '#6f9150',
  metal: '#8f97a3',
  earth: '#a6835a',
  wind: '#8fbfae',
  thunder: '#e0b23c',
  frost: '#a9d0de',
  spirit: '#c79ad1',
  shadow: '#4a3f5c',
};

// ---------------------------------------------------------------- time-of-day plates

export interface SkyPlate {
  /** hour of day this plate is keyed at */
  hour: number;
  zenith: string;
  horizon: string;
  haze: string; // atmospheric perspective / distance wash
  sun: string; // light colour multiplier
  shade: string; // shadow multiply tint
  ambient: number; // 0..1 floor on shading
  paper: string; // final plate tint
  cloud: string;
  cloudShade: string;
  disc: string; // sun / moon disc colour
  stars: number;
}

export const SKY_PLATES: SkyPlate[] = [
  { hour: 0, zenith: '#141b30', horizon: '#35405e', haze: '#2c3653', sun: '#8d9cc4', shade: '#3c4468', ambient: 0.5, paper: '#c9d0e6', cloud: '#4a5578', cloudShade: '#2a3250', disc: '#f6efd9', stars: 1 },
  { hour: 4.5, zenith: '#1d2440', horizon: '#56506f', haze: '#4a4a6b', sun: '#a39fc6', shade: '#444a70', ambient: 0.5, paper: '#d3d2e6', cloud: '#655f85', cloudShade: '#3a3a5c', disc: '#f6efd9', stars: 0.8 },
  { hour: 6, zenith: '#6f86ad', horizon: '#f5b9a8', haze: '#f1cdbd', sun: '#ffd9c2', shade: '#8a7a9c', ambient: 0.42, paper: '#fbe9dc', cloud: '#f9d5cc', cloudShade: '#d89aa5', disc: '#e8643f', stars: 0 },
  { hour: 8, zenith: '#7fa3bf', horizon: '#f3e2c7', haze: '#efe2cb', sun: '#fff3df', shade: '#8f8aa6', ambient: 0.4, paper: '#f8efdf', cloud: '#fbf3e4', cloudShade: '#d9c8c0', disc: '#f7e6b0', stars: 0 },
  { hour: 12, zenith: '#6f9cbd', horizon: '#f4ead4', haze: '#eee6d2', sun: '#fffaf0', shade: '#8c8fae', ambient: 0.4, paper: '#f6efe0', cloud: '#fdf7ea', cloudShade: '#d6cdc6', disc: '#fbf1c8', stars: 0 },
  { hour: 16, zenith: '#7399b5', horizon: '#f5e0bd', haze: '#f0dfc2', sun: '#fff0d6', shade: '#90869f', ambient: 0.4, paper: '#f8ecd8', cloud: '#fbeedb', cloudShade: '#dcc0b0', disc: '#f8dc9a', stars: 0 },
  { hour: 18, zenith: '#5a6c98', horizon: '#f2a27a', haze: '#eeb694', sun: '#ffc79a', shade: '#7b6790', ambient: 0.42, paper: '#fbe0cc', cloud: '#f6b79c', cloudShade: '#c2707c', disc: '#de4f33', stars: 0 },
  { hour: 19.5, zenith: '#2c365c', horizon: '#9a6a84', haze: '#77607f', sun: '#c5a6c4', shade: '#514a74', ambient: 0.46, paper: '#e2d3df', cloud: '#8d6f93', cloudShade: '#4f456e', disc: '#f6efd9', stars: 0.4 },
  { hour: 21, zenith: '#161d34', horizon: '#3a4466', haze: '#303a58', sun: '#8d9cc4', shade: '#3c4468', ambient: 0.5, paper: '#c9d0e6', cloud: '#4a5578', cloudShade: '#2a3250', disc: '#f6efd9', stars: 1 },
  { hour: 24, zenith: '#141b30', horizon: '#35405e', haze: '#2c3653', sun: '#8d9cc4', shade: '#3c4468', ambient: 0.5, paper: '#c9d0e6', cloud: '#4a5578', cloudShade: '#2a3250', disc: '#f6efd9', stars: 1 },
];
