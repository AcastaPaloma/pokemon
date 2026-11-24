// Data schema for the bestiary, moves and world. All game content is plain data
// in src/data/ — the engine never hard-codes a species, move or region.

// ---------------------------------------------------------------- elements

export type ElementId =
  | 'fire'
  | 'water'
  | 'wood'
  | 'metal'
  | 'earth'
  | 'wind'
  | 'thunder'
  | 'frost'
  | 'spirit'
  | 'shadow';

export type WeatherId = 'clear' | 'sunny' | 'rain' | 'storm' | 'snow' | 'fog' | 'ashfall' | 'gale';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export type BiomeId =
  | 'sea'
  | 'beach'
  | 'vale' // sakura valley
  | 'bamboo'
  | 'deepwood' // moss cedar old growth
  | 'plains'
  | 'volcanic'
  | 'snow'
  | 'marsh'
  | 'highland' // maple plateau
  | 'isle' // moon-shadow isle
  | 'cliff';

// ---------------------------------------------------------------- moves

/**
 * How a move physically exists in the world.
 *  strike     – short melee swing; hits anything inside `radius` at `range` in front of the user.
 *  lunge      – the user dashes `range` metres; its own body is the hitbox.
 *  projectile – spawns `count` travelling shots (`speed` m/s, `arc` gravity) that hit on contact.
 *  beam       – a sustained ray of length `range`, thickness `radius`, ticking for `duration`.
 *  pulse      – a ring expanding from the user out to `radius`.
 *  cone       – a breath cone of length `range` and half-angle `radius` (degrees), ticking for `duration`.
 *  field      – a lingering hazard zone of `radius` dropped at up to `range`, ticking for `duration`.
 */
export type MoveShape = 'strike' | 'lunge' | 'projectile' | 'beam' | 'pulse' | 'cone' | 'field';

export type StatusId =
  | 'burn' // damage over time
  | 'chill' // slowed
  | 'root' // cannot move
  | 'stun' // cannot act
  | 'atkUp'
  | 'defUp'
  | 'atkDown'
  | 'defDown'
  | 'heal' // restores hp (power = fraction of max hp)
  | 'leech'; // user heals for a share of damage dealt

export type FxStyle =
  | 'slash'
  | 'bite'
  | 'thump'
  | 'ember'
  | 'flame'
  | 'water'
  | 'bubble'
  | 'leaf'
  | 'petal'
  | 'vine'
  | 'spark'
  | 'bolt'
  | 'rock'
  | 'mud'
  | 'gust'
  | 'shard' // ice / crystal
  | 'needle'
  | 'wisp'
  | 'ink'
  | 'moon'
  | 'bell';

export interface MoveDef {
  id: string;
  name: string;
  /** one or two characters brushed on the move seal */
  kanji: string;
  element: ElementId;
  kind: 'fast' | 'charged';
  /** base damage. fast ≈ 4–14, charged ≈ 45–130 */
  power: number;
  /** fast: ink energy gained per landed hit (5–16). charged: energy cost (35–80). */
  energy: number;
  /** seconds before the move can be used again */
  cooldown: number;
  /** seconds between input and the hit frame */
  windup: number;
  shape: MoveShape;
  /** metres — see MoveShape. For melee this is added to the user's own reach. */
  range: number;
  /** metres (or degrees for `cone`) — see MoveShape */
  radius: number;
  speed?: number;
  count?: number;
  /** total spread in degrees across `count` projectiles */
  spread?: number;
  duration?: number;
  /** 0 = flies straight, 1 = lobbed with full gravity */
  arc?: number;
  effect?: { type: StatusId; chance: number; duration: number; power?: number; self?: boolean };
  fx: FxStyle;
  desc: string;
}

// ---------------------------------------------------------------- body plans

export type Arch =
  | 'quadruped' // four-legged beasts: foxes, deer, boars, badgers, turtles
  | 'biped' // upright walkers: apes, tanuki-like, kappa-like, golems
  | 'bird' // winged, two legs
  | 'serpent' // limbless chain: snakes, eels, river dragons
  | 'fish' // finned swimmers
  | 'insect' // six legs, optional wings
  | 'hopper' // frogs, hares: big hind legs, hops
  | 'spirit'; // floating rounded yokai: lanterns, wisps, stones, masks

export interface BodyColors {
  /** main coat */
  body: string;
  /** underside */
  belly: string;
  /** markings, tail tips, crests */
  accent: string;
  /** paws, ear tips, beaks, hooves */
  dark: string;
  /** emissive bits (flames, lantern light, eyes when awakened) */
  glow?: string;
}

/**
 * Parametric creature description. The builder turns this into a jointed,
 * vertex-coloured mesh; every factor is relative (1 = archetype default) and
 * the finished rig is scaled so the creature stands `SpeciesDef.height` metres.
 */
export interface BodyPlan {
  arch: Arch;
  colors: BodyColors;
  /** torso length, 0.6 (stubby) – 1.8 (long) */
  bodyLen?: number;
  /** torso thickness, 0.6 (lean) – 1.6 (rotund) */
  bodyGirth?: number;
  /** head size, 0.6 – 1.6. Young stages read as young with big heads. */
  headSize?: number;
  /** 0 flat face – 1 long muzzle. For birds this is beak length. */
  snout?: number;
  /** 0 none – 1 long (crane, deer) */
  neck?: number;
  /** 0.4 short – 1.8 stilts */
  legLen?: number;
  legThick?: number;
  ears?: { type: 'none' | 'round' | 'point' | 'long' | 'fin' | 'tuft' | 'leaf'; size?: number };
  tail?: {
    type: 'none' | 'stub' | 'whip' | 'bushy' | 'fan' | 'flame' | 'leaf' | 'fin' | 'club' | 'ribbon';
    len?: number;
    /** number of tails (1–9) */
    count?: number;
  };
  horns?: { type: 'none' | 'nub' | 'spike' | 'antler' | 'curl' | 'blade' | 'crest'; size?: number; count?: 1 | 2 | 3 };
  back?: {
    type:
      | 'none'
      | 'spines'
      | 'shell'
      | 'moss'
      | 'flame'
      | 'crystals'
      | 'sail'
      | 'mane'
      | 'lantern'
      | 'blossoms'
      | 'mushrooms'
      | 'stones';
    size?: number;
  };
  wings?: { type: 'none' | 'feather' | 'bat' | 'insect' | 'fin'; span?: number };
  pattern?: { type: 'none' | 'stripes' | 'spots' | 'socks' | 'mask' | 'bands' | 'saddle' | 'tips' };
  eyes?: { size?: number; style?: 'dot' | 'slit' | 'glow' | 'sleepy' | 'wide' };
  whiskers?: boolean;
  /** serpent / insect segment count */
  segments?: number;
  /** hover height as a fraction of body height (spirits, hovering insects) */
  float?: number;
  extras?: (
    | 'cheekTufts'
    | 'tusks'
    | 'beard'
    | 'thirdEye'
    | 'haloRing'
    | 'talisman' // paper charm on the brow
    | 'rope' // shimenawa straw rope collar
    | 'bell'
    | 'leafHat'
    | 'maskFace'
    | 'topknot'
  )[];
}

// ---------------------------------------------------------------- ecology

export type FoodId =
  | 'berry'
  | 'sap'
  | 'nectar'
  | 'grass'
  | 'moss'
  | 'bamboo'
  | 'fungus'
  | 'reeds'
  | 'fish'
  | 'shellfish'
  | 'insects'
  | 'minerals'
  | 'embers'
  | 'dew'
  | 'carrion'
  | 'moonlight';

export type Locomotion = 'walk' | 'hop' | 'fly' | 'swim' | 'slither' | 'float' | 'amphibious' | 'burrow';

/** Traversal abilities that open up the world while possessing this creature. */
export type Trait =
  | 'swim' // strong swimmer
  | 'dive' // can go underwater
  | 'fly' // sustained flight
  | 'glide' // slow fall, long jumps
  | 'climb' // scales steep rock
  | 'glow' // lights dark places
  | 'burn' // burns bramble thickets
  | 'smash' // breaks boulders
  | 'charge' // powers thunder conduits
  | 'grow' // raises vine bridges
  | 'burrow' // tunnels under obstacles
  | 'tiny' // fits hollow logs and crevices
  | 'phase'; // slips through spirit wards

export interface EcologyDef {
  habitats: BiomeId[];
  activity: 'diurnal' | 'nocturnal' | 'crepuscular' | 'cathemeral';
  diet: 'grazer' | 'forager' | 'predator' | 'scavenger' | 'filter' | 'photosynth' | 'spirit';
  foods: FoodId[];
  /** evolution-line ids this species hunts */
  prey: string[];
  /** evolution-line ids it clashes with over territory */
  rivals: string[];
  social: 'solitary' | 'pair' | 'herd' | 'flock' | 'swarm' | 'pack';
  /** [min, max] group size when spawned */
  group: [number, number];
  temperament: 'docile' | 'skittish' | 'curious' | 'territorial' | 'aggressive';
  /** metres inside which it reacts to intruders */
  territory: number;
  /** weather it thrives in (spawns more, never shelters) */
  weatherLove?: WeatherId[];
  /** seeks cover under eaves and canopies in rain / storm */
  shelters?: boolean;
  locomotion: Locomotion;
}

// ---------------------------------------------------------------- species

export interface EvolutionDef {
  to: string;
  /** mastery level required */
  level: number;
  when?: {
    time?: TimeOfDay;
    weather?: WeatherId;
    biome?: BiomeId;
    /** must touch an elemental stone outcrop of this element */
    stone?: ElementId;
  };
  /** flavour hint shown in the menu before it is met */
  hint?: string;
}

export interface AwakeningDef {
  /** relic seal id (see data/world.ts) that unlocks this awakened form */
  seal: string;
  name: string;
  kanji: string;
  /** size multiplier while awakened */
  scale: number;
  /** attack / defence multiplier while awakened */
  statMul: number;
  addElement?: ElementId;
  /** replaces the accent + glow colours */
  tint: string;
}

export interface SpeciesDef {
  /** unique snake_case id */
  id: string;
  name: string;
  /** 1–3 characters, drawn vertically beside the name */
  kanji: string;
  /** short epithet, e.g. "the ember-tail kit" */
  title: string;
  elements: [ElementId] | [ElementId, ElementId];
  /** metres: standing height (or body length for serpents and fish) */
  height: number;
  /** kilograms */
  weight: number;
  /** base stats, roughly 40–200 */
  stats: { hp: number; atk: number; def: number; spd: number };
  /** fast move ids, first is the default */
  fast: string[];
  /** charged move ids, first is the default */
  charged: string[];
  /** id of the first species in this evolution line */
  line: string;
  stage: 1 | 2 | 3;
  evolvesTo?: EvolutionDef[];
  awakening?: AwakeningDef;
  body: BodyPlan;
  ecology: EcologyDef;
  traits: Trait[];
  /** 1 common – 5 mythic */
  rarity: 1 | 2 | 3 | 4 | 5;
  starter?: boolean;
  /** one or two sentences for the bestiary scroll */
  lore: string;
}

// ---------------------------------------------------------------- individuals (save data)

export interface Individual {
  uid: number;
  species: string;
  nickname?: string;
  level: number;
  xp: number;
  hp: number;
  /** per-individual stat variance, 0.9–1.1 */
  vigor: [number, number, number, number];
  fast: string;
  charged: string;
  charged2?: string;
  /** 'pack' or a sanctuary id */
  home: string;
  /** hours of world time spent bonded */
  bond: number;
  shiny?: boolean;
}
