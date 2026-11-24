import type * as THREE from 'three';

export type StructureKind =
  // gates & markers
  | 'torii'
  | 'toriiStone'
  | 'toriiGrand'
  | 'toro' // stone lantern
  | 'jizo' // small roadside stone figure with a cloth bib
  | 'signpost'
  | 'monolith'
  // sacred buildings
  | 'hokora' // miniature wayside shrine
  | 'shrine' // worship hall with raised floor
  | 'pagoda3'
  | 'pagoda5'
  | 'bellTower'
  | 'sanctuary' // ring of roped standing stones — pack roster home
  | 'altar' // relic dais
  // crossings
  | 'drumBridge'
  | 'plankBridge'
  | 'pier'
  | 'stairs'
  // early-human settlement
  | 'hut'
  | 'longhouse'
  | 'storehouse' // raised-floor granary
  | 'watchtower'
  | 'waterwheel'
  | 'well'
  | 'fence'
  | 'riceRack'
  | 'campfire'
  | 'boat'
  | 'teaHouse'
  // wind-reactive dressing
  | 'lanternPost'
  | 'norenFrame'
  | 'furinFrame' // wind-chime rack
  | 'shishiOdoshi' // bamboo deer-scarer fountain
  | 'prayerFlags'
  // ruins
  | 'ruinPillars'
  | 'ruinArch'
  | 'ruinWall'
  | 'stoneCircle'
  // natural set pieces
  | 'grotto' // hollow rock dome with an entrance
  | 'crystalCluster'
  | 'hollowLog'
  | 'stoneOutcrop' // elemental evolution stone; tinted by opts.tint
  // ability gates
  | 'brambleGate' // burn
  | 'boulderGate' // smash
  | 'wardGate' // phase
  | 'conduit' // charge
  | 'vineAnchor'; // grow

/** Collision volume in the structure's local space (origin on the ground, +Z is the front). */
export type ColliderDef =
  | { shape: 'circle'; x: number; z: number; r: number; y0: number; y1: number; clearance?: number }
  | { shape: 'box'; x: number; z: number; hx: number; hz: number; rot: number; y0: number; y1: number; clearance?: number };

/** Walkable surface in local space. */
export type PlatformDef =
  /** flat deck at height y */
  | { shape: 'box'; x: number; z: number; hx: number; hz: number; rot: number; y: number }
  /** arched deck running along local X: height = y + rise * (1 - (lx/hx)^2) */
  | { shape: 'arc'; x: number; z: number; hx: number; hz: number; rot: number; y: number; rise: number }
  /** ramp / stair flight running along local X from y0 (at -hx) to y1 (at +hx) */
  | { shape: 'ramp'; x: number; z: number; hx: number; hz: number; rot: number; y0: number; y1: number };

export interface AnchorDef {
  kind: 'chime' | 'lantern' | 'fountain' | 'shelter' | 'bell' | 'fire' | 'seat' | 'interact';
  x: number;
  y: number;
  z: number;
  /** shelter radius, light radius, interaction radius… */
  r?: number;
}

export interface StructureBuild {
  /** merged, painted geometry in the shared vertex format (see render/geo.ts) */
  geometry: THREE.BufferGeometry;
  colliders: ColliderDef[];
  platforms: PlatformDef[];
  anchors: AnchorDef[];
  /** bounding radius in the XZ plane */
  radius: number;
  /** overall height */
  height: number;
}

export interface StructureOpts {
  /** bridge span, fence length, stair run… in metres */
  span?: number;
  /** hex colour override for tintable kinds (stoneOutcrop, prayerFlags, crystalCluster) */
  tint?: string;
  /** 0 pristine … 1 overgrown and broken */
  age?: number;
}
