// The Yaoshima archipelago: regions, waters, settlements, sacred sites and the
// footpaths between them. Pure data — the terrain function, the map screen and
// the site builder all read from here. 1 unit = 1 metre, +x east, +z south.
import type { BiomeId, ElementId, Trait } from './types';

export const WORLD_HALF = 4096;

export interface RegionDef {
  id: string;
  name: string;
  kanji: string;
  biome: BiomeId;
  x: number;
  z: number;
  /** influence radius */
  r: number;
  /** typical ground elevation */
  base: number;
  /** relief amplitude */
  amp: number;
  /** 0 rolling … 1 knife ridges */
  ridge: number;
  blurb: string;
}

export const REGIONS: RegionDef[] = [
  { id: 'hanamori', name: 'Hanamori Vale', kanji: '花守の谷', biome: 'vale', x: 0, z: 650, r: 700, base: 14, amp: 10, ridge: 0, blurb: 'A sheltered valley of cherry groves around the first spring.' },
  { id: 'akehara', name: 'Akehara Plains', kanji: '明原', biome: 'plains', x: 1150, z: 550, r: 800, base: 20, amp: 14, ridge: 0, blurb: 'Open grassland where herds run under a wide sky.' },
  { id: 'takesasa', name: 'Takesasa Thicket', kanji: '竹笹の林', biome: 'bamboo', x: -1050, z: 620, r: 740, base: 32, amp: 24, ridge: 0.1, blurb: 'Green pillars that knock together when the wind turns.' },
  { id: 'kokemido', name: 'Kokemidō Deepwood', kanji: '苔御堂', biome: 'deepwood', x: -1180, z: -560, r: 860, base: 78, amp: 46, ridge: 0.2, blurb: 'Old cedars and older moss. Sound does not carry here.' },
  { id: 'kazamine', name: 'Kazamine Heights', kanji: '風峰', biome: 'highland', x: 60, z: -470, r: 600, base: 150, amp: 34, ridge: 0.15, blurb: 'A maple plateau that looks down on every other plate.' },
  { id: 'hinoyama', name: 'Hinoyama Caldera', kanji: '火の山', biome: 'volcanic', x: 1250, z: -850, r: 780, base: 110, amp: 50, ridge: 0.35, blurb: 'Ash slopes around a crater that still breathes.' },
  { id: 'shirane', name: 'Shirane Peaks', kanji: '白嶺', biome: 'snow', x: -150, z: -1500, r: 820, base: 290, amp: 280, ridge: 0.85, blurb: 'Where the print runs out of ink and becomes paper again.' },
  { id: 'ashinuma', name: 'Ashinuma Marsh', kanji: '葦沼', biome: 'marsh', x: 1500, z: 1550, r: 620, base: 0.5, amp: 1.5, ridge: 0, blurb: 'Reed beds, still pools and lights that are not lanterns.' },
  { id: 'namiura', name: 'Namiura Shore', kanji: '波浦', biome: 'beach', x: -200, z: 1950, r: 620, base: 6, amp: 5, ridge: 0, blurb: 'Black pines, pale sand and a gate standing in the tide.' },
  { id: 'tsukikage', name: 'Tsukikage Isle', kanji: '月影島', biome: 'isle', x: -2950, z: 2350, r: 720, base: 34, amp: 40, ridge: 0.3, blurb: 'An island that keeps its own hours.' },
  { id: 'korijima', name: 'Kōrijima Skerry', kanji: '氷島', biome: 'snow', x: -2300, z: -2700, r: 560, base: 60, amp: 70, ridge: 0.6, blurb: 'A frozen rock the northern gales forgot.' },
];

/** Land masses as warped ellipses: centre, radii. */
export const ISLANDS: { x: number; z: number; rx: number; rz: number }[] = [
  { x: 0, z: 0, rx: 2700, rz: 2450 },
  { x: -2950, z: 2350, rx: 640, rz: 600 },
  { x: -2300, z: -2700, rx: 520, rz: 480 },
  { x: 3150, z: 350, rx: 360, rz: 420 },
  { x: 2950, z: 1950, rx: 300, rz: 260 },
  { x: -3200, z: -300, rx: 280, rz: 360 },
];

export interface LakeDef {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  depth: number;
  /** hot springs steam and heal */
  hot?: boolean;
}

export const LAKES: LakeDef[] = [
  { id: 'spring', name: 'Minamoto Spring', x: 0, z: 650, r: 15, depth: 1.3 },
  { id: 'tarn', name: 'Kagami Tarn', x: -70, z: -470, r: 72, depth: 7 },
  { id: 'crater', name: 'Caldera Springs', x: 1250, z: -850, r: 62, depth: 4, hot: true },
  { id: 'kokepool', name: 'Moss Pool', x: -1260, z: -745, r: 42, depth: 3.5 },
  { id: 'rimepool', name: 'Rime Tarn', x: -430, z: -1270, r: 52, depth: 5 },
  { id: 'onsen', name: 'Yunosato Bath', x: 925, z: -600, r: 13, depth: 0.9, hot: true },
  { id: 'moonpool', name: 'Moon Mirror', x: -2980, z: 2360, r: 34, depth: 3 },
];

export interface RiverDef {
  id: string;
  name: string;
  width: number;
  /** control points from source to mouth */
  pts: [number, number][];
}

export const RIVERS: RiverDef[] = [
  {
    id: 'hanamori', name: 'Hanamori River', width: 13,
    pts: [[-20, -400], [-10, -190], [70, 60], [150, 330], [135, 560], [185, 880], [120, 1240], [225, 1600], [265, 1960], [310, 2520]],
  },
  {
    id: 'kokemizu', name: 'Kokemizu Stream', width: 10,
    pts: [[-1290, -700], [-1500, -360], [-1760, -10], [-2060, 240], [-2700, 430]],
  },
  {
    id: 'akehara', name: 'Akehara Brook', width: 11,
    pts: [[985, -520], [1050, -40], [1250, 420], [1490, 800], [1560, 1240], [1930, 1850], [2260, 2260]],
  },
];

// ---------------------------------------------------------------- sites

export type SiteKind =
  | 'spring' // the sacred starting spring
  | 'village'
  | 'shrine'
  | 'pagoda'
  | 'sanctuary' // pack roster home, fast-heal
  | 'ruins'
  | 'grotto'
  | 'seaGate'
  | 'bellHill'
  | 'camp';

export interface SiteDef {
  id: string;
  kind: SiteKind;
  name: string;
  kanji: string;
  x: number;
  z: number;
  /** radius of ground levelled for the site */
  pad: number;
  /** facing in radians (0 = entrance looks toward +z) */
  face?: number;
  /** variant hint for the builder */
  style?: 'stilt' | 'fishing' | 'mountain' | 'forest' | 'ash' | 'grand' | 'three' | 'five' | 'crystal' | 'ice' | 'tide';
}

export const SITES: SiteDef[] = [
  { id: 'spring', kind: 'spring', name: 'Minamoto Spring', kanji: '源の泉', x: 0, z: 650, pad: 34 },
  // settlements — small, quiet, wooden
  { id: 'hanamura', kind: 'village', name: 'Hanamura', kanji: '花村', x: -270, z: 890, pad: 62 },
  { id: 'takenoko', kind: 'village', name: 'Takenoko Hamlet', kanji: '筍の里', x: -900, z: 790, pad: 52, style: 'forest' },
  { id: 'akeno', kind: 'village', name: 'Akeno', kanji: '明野', x: 1040, z: 640, pad: 66 },
  { id: 'ashibe', kind: 'village', name: 'Ashibe', kanji: '葦辺', x: 1330, z: 1370, pad: 50, style: 'stilt' },
  { id: 'namiya', kind: 'village', name: 'Namiya', kanji: '波屋', x: -430, z: 2040, pad: 56, style: 'fishing' },
  { id: 'kazado', kind: 'village', name: 'Kazado Waystation', kanji: '風戸', x: 190, z: -360, pad: 44, style: 'mountain' },
  { id: 'yunosato', kind: 'village', name: 'Yunosato', kanji: '湯の里', x: 900, z: -640, pad: 46, style: 'ash' },
  { id: 'yukimi', kind: 'village', name: 'Yukimi Lodge', kanji: '雪見', x: -390, z: -1140, pad: 40, style: 'mountain' },
  { id: 'kokemura', kind: 'village', name: 'Kokemura', kanji: '苔村', x: -980, z: -290, pad: 48, style: 'forest' },
  { id: 'tsukimi', kind: 'camp', name: 'Tsukimi Hermitage', kanji: '月見庵', x: -2790, z: 2240, pad: 30 },
  // sacred places
  { id: 'hanamori_shrine', kind: 'shrine', name: 'Hanamori Shrine', kanji: '花守神社', x: -150, z: 400, pad: 46, face: 0.5 },
  { id: 'take_shrine', kind: 'shrine', name: 'Sasane Shrine', kanji: '笹音神社', x: -1260, z: 470, pad: 40, face: 1.2 },
  { id: 'hi_shrine', kind: 'shrine', name: 'Okibi Shrine', kanji: '熾火神社', x: 1090, z: -690, pad: 40, face: -2.2, style: 'ash' },
  { id: 'numa_shrine', kind: 'shrine', name: 'Mizukagami Shrine', kanji: '水鏡神社', x: 1640, z: 1660, pad: 36, face: 2.4, style: 'stilt' },
  { id: 'tsuki_shrine', kind: 'shrine', name: 'Tsukikage Shrine', kanji: '月影神社', x: -3060, z: 2470, pad: 40, face: -0.6 },
  { id: 'koke_pagoda', kind: 'pagoda', name: 'Kokemidō Pagoda', kanji: '苔御堂塔', x: -1330, z: -600, pad: 44, style: 'five' },
  { id: 'kaza_pagoda', kind: 'pagoda', name: 'Kazamine Pagoda', kanji: '風峰塔', x: -190, z: -590, pad: 36, style: 'three' },
  { id: 'shirane_gate', kind: 'seaGate', name: 'Shirane Gate', kanji: '白嶺門', x: -210, z: -1120, pad: 26, style: 'grand' },
  { id: 'umi_torii', kind: 'seaGate', name: 'Namiura Tide Gate', kanji: '潮の鳥居', x: -160, z: 2420, pad: 0, style: 'tide' },
  { id: 'bell_hill', kind: 'bellHill', name: 'Akegane Hill', kanji: '明鐘の丘', x: 1420, z: 290, pad: 24 },
  // sanctuaries
  { id: 'sanct_spring', kind: 'sanctuary', name: 'Spring Sanctuary', kanji: '泉の杜', x: 52, z: 596, pad: 16 },
  { id: 'sanct_bamboo', kind: 'sanctuary', name: 'Thicket Sanctuary', kanji: '竹の杜', x: -1110, z: 920, pad: 18 },
  { id: 'sanct_deep', kind: 'sanctuary', name: 'Moss Sanctuary', kanji: '苔の杜', x: -1010, z: -660, pad: 18 },
  { id: 'sanct_plains', kind: 'sanctuary', name: 'Meadow Sanctuary', kanji: '原の杜', x: 1310, z: 820, pad: 18 },
  { id: 'sanct_volcano', kind: 'sanctuary', name: 'Ember Sanctuary', kanji: '熾の杜', x: 1010, z: -930, pad: 18 },
  { id: 'sanct_snow', kind: 'sanctuary', name: 'Rime Sanctuary', kanji: '霜の杜', x: -300, z: -1340, pad: 18 },
  { id: 'sanct_marsh', kind: 'sanctuary', name: 'Reed Sanctuary', kanji: '葦の杜', x: 1660, z: 1400, pad: 16 },
  { id: 'sanct_coast', kind: 'sanctuary', name: 'Tide Sanctuary', kanji: '潮の杜', x: 40, z: 2010, pad: 18 },
  { id: 'sanct_high', kind: 'sanctuary', name: 'Wind Sanctuary', kanji: '風の杜', x: 300, z: -600, pad: 18 },
  { id: 'sanct_isle', kind: 'sanctuary', name: 'Moon Sanctuary', kanji: '月の杜', x: -2890, z: 2520, pad: 18 },
  // ruins & grottos
  { id: 'sekichu', kind: 'ruins', name: 'Sekichū Ruins', kanji: '石柱跡', x: 1660, z: 180, pad: 40 },
  { id: 'kagami_circle', kind: 'ruins', name: 'Kagami Circle', kanji: '鏡の環', x: -180, z: -430, pad: 22 },
  { id: 'old_kiln', kind: 'ruins', name: 'Old Kiln', kanji: '古窯', x: 1470, z: -1060, pad: 30, style: 'ash' },
  { id: 'sunken_court', kind: 'ruins', name: 'Sunken Court', kanji: '沈みの庭', x: -3170, z: 2190, pad: 40 },
  { id: 'hotaru_grotto', kind: 'grotto', name: 'Hotaru Grotto', kanji: '蛍の洞', x: -1520, z: -830, pad: 24, style: 'crystal' },
  { id: 'rime_grotto', kind: 'grotto', name: 'Rime Grotto', kanji: '霜の洞', x: 60, z: -1690, pad: 24, style: 'ice' },
  { id: 'tide_grotto', kind: 'grotto', name: 'Tide Grotto', kanji: '潮の洞', x: 720, z: 2120, pad: 24, style: 'tide' },
];

/** Footpaths: sequences of site ids or raw [x,z] waypoints. */
export const PATHS: (string | [number, number])[][] = [
  ['spring', 'sanct_spring', [60, 500], 'hanamori_shrine'],
  ['spring', [-120, 760], 'hanamura'],
  ['hanamura', [-560, 860], 'takenoko', 'sanct_bamboo'],
  ['takenoko', [-1080, 640], 'take_shrine'],
  ['hanamura', [-340, 1400], [-400, 1760], 'namiya'],
  ['namiya', [-180, 2080], 'sanct_coast', [420, 2060], 'tide_grotto'],
  ['spring', [330, 700], [700, 660], 'akeno'],
  ['akeno', 'sanct_plains', [1330, 1100], 'ashibe', 'sanct_marsh', 'numa_shrine'],
  ['akeno', [1260, 440], 'bell_hill', 'sekichu'],
  ['hanamori_shrine', [-90, 150], [40, -120], 'kazado'],
  ['kazado', 'sanct_high'],
  ['kazado', [20, -480], 'kagami_circle', 'kaza_pagoda'],
  ['kazado', [520, -470], 'yunosato', 'hi_shrine'],
  ['yunosato', 'sanct_volcano', [1240, -1010], 'old_kiln'],
  ['kaza_pagoda', [-250, -860], 'shirane_gate', 'yukimi', 'sanct_snow'],
  ['kaza_pagoda', [-560, -480], 'kokemura', 'sanct_deep', 'koke_pagoda', 'hotaru_grotto'],
  ['kokemura', [-1010, 60], [-960, 420], 'takenoko'],
  ['tsukimi', 'sanct_isle', 'tsuki_shrine', 'sunken_court'],
];

// ---------------------------------------------------------------- relics & stones

/**
 * Altars where awakening seals lie buried. Seals are matched to altars at
 * start-up: each awakenable evolution line takes the free altar whose biome
 * best fits its habitat, so the bestiary data never needs editing here.
 */
export interface AltarDef {
  id: string;
  x: number;
  z: number;
  biome: BiomeId;
  /** traversal ability needed to open the way (none = just hidden) */
  gate?: Trait;
  hint: string;
}

export const ALTARS: AltarDef[] = [
  { id: 'altar_spring', x: -48, z: 705, biome: 'vale', hint: 'Beneath the oldest cherry by the spring.' },
  { id: 'altar_vale_w', x: -330, z: 520, biome: 'vale', gate: 'grow', hint: 'Across the gully west of the shrine.' },
  { id: 'altar_vale_e', x: 420, z: 860, biome: 'vale', gate: 'burn', hint: 'Behind a wall of thorn on the river bend.' },
  { id: 'altar_bamboo', x: -1380, z: 760, biome: 'bamboo', gate: 'tiny', hint: 'Through a hollow log where the culms grow thickest.' },
  { id: 'altar_bamboo_n', x: -820, z: 300, biome: 'bamboo', gate: 'charge', hint: 'A dead stone lamp waits for a spark.' },
  { id: 'altar_deep', x: -1620, z: -520, biome: 'deepwood', gate: 'smash', hint: 'Sealed behind a fallen crag in the cedars.' },
  { id: 'altar_deep_s', x: -900, z: -820, biome: 'deepwood', gate: 'phase', hint: 'Warded with paper that no paw can lift.' },
  { id: 'altar_deep_pool', x: -1255, z: -770, biome: 'deepwood', gate: 'dive', hint: 'At the bottom of the Moss Pool.' },
  { id: 'altar_plains', x: 1560, z: 600, biome: 'plains', hint: 'Where the lone pine throws its noon shadow.' },
  { id: 'altar_plains_s', x: 820, z: 1120, biome: 'plains', gate: 'burrow', hint: 'Under a slab the grass has swallowed.' },
  { id: 'altar_volcano', x: 1310, z: -790, biome: 'volcanic', gate: 'burn', hint: 'On the crater rim, ringed with black thorn.' },
  { id: 'altar_volcano_e', x: 1680, z: -700, biome: 'volcanic', gate: 'smash', hint: 'Inside a cracked lava dome.' },
  { id: 'altar_snow', x: -120, z: -1560, biome: 'snow', gate: 'climb', hint: 'On the shoulder of the highest peak.' },
  { id: 'altar_snow_w', x: -640, z: -1420, biome: 'snow', gate: 'charge', hint: 'A frozen conduit hums when storms pass.' },
  { id: 'altar_marsh', x: 1760, z: 1620, biome: 'marsh', gate: 'swim', hint: 'On a reed islet the paths do not reach.' },
  { id: 'altar_marsh_w', x: 1280, z: 1700, biome: 'marsh', gate: 'phase', hint: 'Where the marsh lights gather.' },
  { id: 'altar_coast', x: -160, z: 2440, biome: 'beach', gate: 'swim', hint: 'At the foot of the gate in the tide.' },
  { id: 'altar_coast_e', x: 760, z: 2150, biome: 'beach', hint: 'Deep in the Tide Grotto.' },
  { id: 'altar_sea', x: 1250, z: 2750, biome: 'sea', gate: 'dive', hint: 'On the seabed south of the marsh mouth.' },
  { id: 'altar_high', x: 360, z: -260, biome: 'highland', gate: 'glide', hint: 'On a rock stack off the plateau edge.' },
  { id: 'altar_high_w', x: -330, z: -330, biome: 'highland', gate: 'grow', hint: 'Across the maple ravine.' },
  { id: 'altar_isle', x: -3010, z: 2300, biome: 'isle', gate: 'phase', hint: 'Behind the Moon Mirror.' },
  { id: 'altar_isle_n', x: -2760, z: 2080, biome: 'isle', gate: 'glow', hint: 'In a hollow that swallows light.' },
  { id: 'altar_isle_s', x: -3140, z: 2640, biome: 'isle', hint: 'Under the last standing arch.' },
];

/** Elemental stone outcrops — touch one to trigger stone evolutions. */
export const STONES: { element: ElementId; x: number; z: number }[] = [
  { element: 'fire', x: 1180, z: -960 },
  { element: 'fire', x: 1490, z: -620 },
  { element: 'water', x: 240, z: 1320 },
  { element: 'water', x: -620, z: 2120 },
  { element: 'wood', x: -1420, z: -360 },
  { element: 'wood', x: -260, z: 610 },
  { element: 'metal', x: 1630, z: -980 },
  { element: 'metal', x: 470, z: -620 },
  { element: 'earth', x: 1180, z: 260 },
  { element: 'earth', x: -700, z: 1040 },
  { element: 'wind', x: 130, z: -640 },
  { element: 'wind', x: 1700, z: 760 },
  { element: 'thunder', x: -60, z: -820 },
  { element: 'thunder', x: 1480, z: 240 },
  { element: 'frost', x: -260, z: -1460 },
  { element: 'frost', x: -2280, z: -2640 },
  { element: 'spirit', x: -120, z: 360 },
  { element: 'spirit', x: -2940, z: 2420 },
  { element: 'shadow', x: -1560, z: -900 },
  { element: 'shadow', x: -3100, z: 2260 },
];

export const SPAWN_POINT = { x: 4, z: 676 };

export function regionById(id: string) {
  return REGIONS.find((r) => r.id === id);
}
export function siteById(id: string) {
  return SITES.find((s) => s.id === id);
}
