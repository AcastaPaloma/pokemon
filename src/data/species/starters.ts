import type { SpeciesDef } from '../types';

// The four spirits waiting at the sacred spring. Later stages are appended below.
export const STARTERS: SpeciesDef[] = [
  {
    id: 'kagari', name: 'Kagari', kanji: '篝', title: 'the watch-fire piglet',
    elements: ['fire'], height: 0.42, weight: 9,
    stats: { hp: 92, atk: 104, def: 86, spd: 78 },
    fast: ['tusk_jab', 'ember_snort'], charged: ['bonfire_rush', 'kiln_burst'],
    line: 'kagari', stage: 1,
    body: {
      arch: 'quadruped',
      colors: { body: '#5a4038', belly: '#e9d6b8', accent: '#f08a4b', dark: '#2a2222', glow: '#ffb347' },
      bodyLen: 0.9, bodyGirth: 1.25, headSize: 1.3, snout: 0.7, legLen: 0.6, legThick: 1.2,
      ears: { type: 'point', size: 0.7 }, tail: { type: 'stub' }, back: { type: 'flame', size: 0.5 },
      pattern: { type: 'stripes' }, extras: ['tusks'],
    },
    ecology: {
      habitats: ['vale', 'volcanic', 'highland'], activity: 'diurnal', diet: 'forager', foods: ['fungus', 'berry', 'embers'],
      prey: [], rivals: [], social: 'herd', group: [2, 4], temperament: 'curious', territory: 8, weatherLove: ['sunny', 'ashfall'], shelters: true, locomotion: 'walk',
    },
    traits: ['burn', 'glow'], rarity: 3, starter: true,
    lore: 'A striped boar piglet whose bristles smoulder when it is pleased. Villagers once followed its glow home through winter dusk.',
  },
  {
    id: 'namichi', name: 'Namichi', kanji: '波千', title: 'the wave-plover chick',
    elements: ['water', 'wind'], height: 0.3, weight: 0.4,
    stats: { hp: 78, atk: 88, def: 74, spd: 118 },
    fast: ['ripple_peck', 'spray_dart'], charged: ['tide_wing', 'whirl_pool'],
    line: 'namichi', stage: 1,
    body: {
      arch: 'bird',
      colors: { body: '#dfe7ea', belly: '#ffffff', accent: '#4f86a6', dark: '#2b2f3a' },
      bodyGirth: 1.2, headSize: 1.3, snout: 0.4, neck: 0.1, legLen: 0.9,
      tail: { type: 'fan', len: 0.6 }, wings: { type: 'feather', span: 0.9 }, pattern: { type: 'bands' },
    },
    ecology: {
      habitats: ['beach', 'marsh', 'vale'], activity: 'diurnal', diet: 'forager', foods: ['shellfish', 'insects'],
      prey: [], rivals: [], social: 'flock', group: [3, 7], temperament: 'skittish', territory: 6, weatherLove: ['rain', 'gale'], locomotion: 'fly',
    },
    traits: ['swim', 'glide'], rarity: 3, starter: true,
    lore: 'It runs ahead of each wave and back again, never once getting its feet wet. Printmakers draw it wherever they draw the sea.',
  },
  {
    id: 'hagakure', name: 'Hagakure', kanji: '葉隠', title: 'the leaf-hidden cub',
    elements: ['wood', 'earth'], height: 0.5, weight: 7,
    stats: { hp: 110, atk: 82, def: 104, spd: 64 },
    fast: ['leaf_flick', 'drum_thump'], charged: ['thicket_rise', 'acorn_barrage'],
    line: 'hagakure', stage: 1,
    body: {
      arch: 'biped',
      colors: { body: '#8a6f5a', belly: '#e6d6ba', accent: '#7d8f5c', dark: '#3a2f2a' },
      bodyGirth: 1.35, headSize: 1.25, snout: 0.45, legLen: 0.7,
      ears: { type: 'round', size: 0.8 }, tail: { type: 'bushy', len: 1.0 }, pattern: { type: 'mask' }, extras: ['leafHat'],
    },
    ecology: {
      habitats: ['vale', 'deepwood', 'bamboo'], activity: 'crepuscular', diet: 'forager', foods: ['berry', 'fungus', 'insects'],
      prey: [], rivals: [], social: 'pair', group: [1, 3], temperament: 'curious', territory: 7, shelters: true, locomotion: 'walk',
    },
    traits: ['grow', 'climb'], rarity: 3, starter: true,
    lore: 'A round forest cub that wears a single leaf and believes this makes it invisible. Seedlings sprout wherever it naps.',
  },
  {
    id: 'inabi', name: 'Inabi', kanji: '稲火', title: 'the rice-lightning marten',
    elements: ['thunder'], height: 0.3, weight: 1.6,
    stats: { hp: 74, atk: 108, def: 66, spd: 128 },
    fast: ['static_nip', 'spark_skip'], charged: ['thunderclap', 'sky_lance'],
    line: 'inabi', stage: 1,
    body: {
      arch: 'quadruped',
      colors: { body: '#f1ead8', belly: '#fff9ea', accent: '#e0b23c', dark: '#2f3e5c', glow: '#fff2a8' },
      bodyLen: 1.5, bodyGirth: 0.7, headSize: 1.0, snout: 0.5, legLen: 0.55,
      ears: { type: 'round', size: 0.6 }, tail: { type: 'bushy', len: 1.2 }, pattern: { type: 'tips' }, whiskers: true,
    },
    ecology: {
      habitats: ['plains', 'highland', 'vale'], activity: 'crepuscular', diet: 'predator', foods: ['insects', 'berry'],
      prey: [], rivals: [], social: 'solitary', group: [1, 2], temperament: 'curious', territory: 9, weatherLove: ['storm'], locomotion: 'walk',
    },
    traits: ['charge', 'tiny'], rarity: 3, starter: true,
    lore: 'Said to fall with summer lightning into ripening paddies. Its fur stands on end a breath before every storm.',
  },
];
