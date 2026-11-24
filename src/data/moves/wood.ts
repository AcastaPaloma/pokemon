import type { MoveDef } from '../types';

// Wood — thorn, blossom, sap and the patience of old trunks.
export const WOOD_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'thorn_jab', name: 'Thorn Jab', kanji: '棘', element: 'wood', kind: 'fast', power: 7, energy: 9, cooldown: 0.5, windup: 0.1, shape: 'strike', range: 0.5, radius: 0.45, fx: 'needle', desc: 'The bramble does not reach for you. You simply arrive.' },
  { id: 'petal_drift', name: 'Petal Drift', kanji: '花', element: 'wood', kind: 'fast', power: 5, energy: 8, cooldown: 0.42, windup: 0.07, shape: 'projectile', range: 12, radius: 0.35, speed: 15, arc: 0, fx: 'petal', desc: 'One petal, taking the long way down.' },
  { id: 'creeper_snap', name: 'Creeper Snap', kanji: '蔓', element: 'wood', kind: 'fast', power: 9, energy: 11, cooldown: 0.75, windup: 0.16, shape: 'strike', range: 1.2, radius: 0.6, fx: 'vine', desc: 'A green tendril cracked like a wet towel.' },
  { id: 'antler_hook', name: 'Antler Hook', kanji: '角', element: 'wood', kind: 'fast', power: 12, energy: 14, cooldown: 0.95, windup: 0.2, shape: 'strike', range: 0.7, radius: 0.8, fx: 'thump', desc: 'Head lowered, a half turn, and the tines do the lifting.' },
  { id: 'spore_sigh', name: 'Spore Sigh', kanji: '胞', element: 'wood', kind: 'fast', power: 6, energy: 10, cooldown: 0.7, windup: 0.15, shape: 'cone', range: 4, radius: 30, duration: 0.3, effect: { type: 'atkDown', chance: 0.1, duration: 2 }, fx: 'petal', desc: 'A pale dust breathed out from under the cap.' },
  { id: 'night_chirr', name: 'Night Chirr', kanji: '鳴', element: 'wood', kind: 'fast', power: 8, energy: 11, cooldown: 0.8, windup: 0.18, shape: 'pulse', range: 0, radius: 2.2, fx: 'bell', desc: 'Wing rubbed on wing until the grass rings.' },
  // ---- charged
  { id: 'petal_squall', name: 'Petal Squall', kanji: '花嵐', element: 'wood', kind: 'charged', power: 72, energy: 48, cooldown: 1.1, windup: 0.3, shape: 'cone', range: 8, radius: 35, duration: 0.6, fx: 'petal', desc: 'A whole branch of blossom lets go in one gust.' },
  { id: 'sap_draw', name: 'Sap Draw', kanji: '樹液', element: 'wood', kind: 'charged', power: 60, energy: 40, cooldown: 1.1, windup: 0.3, shape: 'strike', range: 0.8, radius: 0.9, effect: { type: 'leech', chance: 1, duration: 0, power: 0.5 }, fx: 'vine', desc: 'It drinks the way a beetle drinks at a wounded oak.' },
  { id: 'cedar_fall', name: 'Cedar Fall', kanji: '倒木', element: 'wood', kind: 'charged', power: 105, energy: 66, cooldown: 1.5, windup: 0.6, shape: 'strike', range: 1.2, radius: 1.5, fx: 'thump', desc: 'An old trunk coming down takes its time, and then does not.' },
  { id: 'leaf_light', name: 'Leaf Light', kanji: '木漏', element: 'wood', kind: 'charged', power: 80, energy: 56, cooldown: 1.4, windup: 0.45, shape: 'beam', range: 20, radius: 0.7, duration: 0.9, fx: 'leaf', desc: 'Sun let down through the canopy in one narrow shaft.' },
  { id: 'moss_mend', name: 'Moss Mend', kanji: '苔', element: 'wood', kind: 'charged', power: 45, energy: 45, cooldown: 1.4, windup: 0.4, shape: 'pulse', range: 0, radius: 3.5, effect: { type: 'heal', chance: 1, duration: 0, power: 0.22, self: true }, fx: 'leaf', desc: 'Green creeps over the hurt place and stays.' },
  { id: 'elder_grove', name: 'Elder Grove', kanji: '杜', element: 'wood', kind: 'charged', power: 110, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'field', range: 10, radius: 5, duration: 6, effect: { type: 'root', chance: 1, duration: 1.5 }, fx: 'vine', desc: 'For a few breaths the clearing remembers being forest.' },
];
