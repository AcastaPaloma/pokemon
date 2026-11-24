import type { MoveDef } from '../types';

// Metal — horn and mandible, bell-bronze, black iron sand.
export const METAL_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'jaw_snip', name: 'Jaw Snip', kanji: '鋏', element: 'metal', kind: 'fast', power: 6, energy: 8, cooldown: 0.4, windup: 0.08, shape: 'strike', range: 0.4, radius: 0.45, fx: 'slash', desc: 'Two black tines closing with a gardener\'s tidy click.' },
  { id: 'scythe_flick', name: 'Scythe Flick', kanji: '鎌', element: 'metal', kind: 'fast', power: 8, energy: 10, cooldown: 0.55, windup: 0.1, shape: 'strike', range: 0.8, radius: 0.6, fx: 'slash', desc: 'The folded arm opens and is folded again before the leaf lands.' },
  { id: 'horn_toss', name: 'Horn Toss', kanji: '梃', element: 'metal', kind: 'fast', power: 10, energy: 12, cooldown: 0.8, windup: 0.18, shape: 'strike', range: 0.7, radius: 0.7, fx: 'thump', desc: 'Slide under, then lift. The beetle\'s whole argument.' },
  { id: 'hoof_ring', name: 'Hoof Ring', kanji: '蹄', element: 'metal', kind: 'fast', power: 9, energy: 12, cooldown: 0.85, windup: 0.2, shape: 'pulse', range: 0, radius: 2.2, fx: 'bell', desc: 'One stamp on bare rock, and the rock rings.' },
  { id: 'iron_sand', name: 'Iron Sand', kanji: '砂鉄', element: 'metal', kind: 'fast', power: 6, energy: 10, cooldown: 0.5, windup: 0.1, shape: 'projectile', range: 14, radius: 0.25, speed: 26, arc: 0.1, fx: 'needle', desc: 'A pinch of black river sand, thrown at the eyes.' },
  { id: 'mallet_rap', name: 'Mallet Rap', kanji: '撥', element: 'metal', kind: 'fast', power: 13, energy: 15, cooldown: 1.05, windup: 0.24, shape: 'strike', range: 0.6, radius: 0.8, effect: { type: 'stun', chance: 0.08, duration: 0.5 }, fx: 'bell', desc: 'A drumstick brought down on something that is not a drum.' },
  // ---- charged
  { id: 'twin_reap', name: 'Twin Reap', kanji: '双鎌', element: 'metal', kind: 'charged', power: 70, energy: 42, cooldown: 1.05, windup: 0.28, shape: 'strike', range: 1.0, radius: 1.3, fx: 'slash', desc: 'Both blades at once, crossing where the stalk was.' },
  { id: 'plough_charge', name: 'Plough Charge', kanji: '鋤', element: 'metal', kind: 'charged', power: 82, energy: 50, cooldown: 1.2, windup: 0.35, shape: 'lunge', range: 8, radius: 1.0, fx: 'thump', desc: 'Horn low to the ground, turning a furrow as it comes.' },
  { id: 'nail_rain', name: 'Nail Rain', kanji: '釘', element: 'metal', kind: 'charged', power: 24, energy: 58, cooldown: 1.3, windup: 0.35, shape: 'projectile', range: 20, radius: 0.25, speed: 32, count: 5, spread: 24, arc: 0.1, effect: { type: 'defDown', chance: 0.3, duration: 4 }, fx: 'needle', desc: 'A carpenter\'s handful, spilled sideways and fast.' },
  { id: 'mirror_glare', name: 'Mirror Glare', kanji: '鏡', element: 'metal', kind: 'charged', power: 86, energy: 60, cooldown: 1.4, windup: 0.45, shape: 'beam', range: 22, radius: 0.5, duration: 0.7, effect: { type: 'atkDown', chance: 0.5, duration: 4 }, fx: 'spark', desc: 'A bronze mirror tilted until the sun is someone else\'s trouble.' },
  { id: 'temple_toll', name: 'Temple Toll', kanji: '鐘', element: 'metal', kind: 'charged', power: 85, energy: 62, cooldown: 1.5, windup: 0.5, shape: 'pulse', range: 0, radius: 7, effect: { type: 'stun', chance: 0.4, duration: 1.2 }, fx: 'bell', desc: 'One stroke of the great bell. The valley holds still for it.' },
  { id: 'anvil_fall', name: 'Anvil Fall', kanji: '鉄床', element: 'metal', kind: 'charged', power: 128, energy: 78, cooldown: 1.8, windup: 0.7, shape: 'strike', range: 1.2, radius: 1.8, fx: 'thump', desc: 'All the weight of the smithy, set down in one place.' },
];
