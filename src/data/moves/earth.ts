import type { MoveDef } from '../types';

// Earth — paddy mud, scree, roadside stone and the mountain's shoulders.
export const EARTH_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'pebble_skip', name: 'Pebble Skip', kanji: '礫', element: 'earth', kind: 'fast', power: 6, energy: 10, cooldown: 0.5, windup: 0.1, shape: 'projectile', range: 14, radius: 0.28, speed: 24, arc: 0.25, fx: 'rock', desc: 'A flat stone chosen with care and thrown without any.' },
  { id: 'paddy_fling', name: 'Paddy Fling', kanji: '泥', element: 'earth', kind: 'fast', power: 5, energy: 9, cooldown: 0.42, windup: 0.08, shape: 'projectile', range: 11, radius: 0.35, speed: 18, arc: 0.5, effect: { type: 'chill', chance: 0.08, duration: 1 }, fx: 'mud', desc: 'A wet handful from the field edge. It clings.' },
  { id: 'hind_kick', name: 'Hind Kick', kanji: '蹴', element: 'earth', kind: 'fast', power: 11, energy: 13, cooldown: 0.9, windup: 0.18, shape: 'strike', range: 0.6, radius: 0.7, fx: 'thump', desc: 'Both back feet, delivered while already leaving.' },
  { id: 'stone_nod', name: 'Stone Nod', kanji: '頷', element: 'earth', kind: 'fast', power: 14, energy: 16, cooldown: 1.1, windup: 0.25, shape: 'strike', range: 0.5, radius: 0.8, fx: 'rock', desc: 'The statue inclines its head. That is all, and it is enough.' },
  // ---- charged
  { id: 'stone_vigil', name: 'Stone Vigil', kanji: '石守', element: 'earth', kind: 'charged', power: 48, energy: 38, cooldown: 1.2, windup: 0.3, shape: 'pulse', range: 0, radius: 3, effect: { type: 'defUp', chance: 1, duration: 6, self: true }, fx: 'rock', desc: 'It simply decides not to be moved.' },
  { id: 'burrow_burst', name: 'Burrow Burst', kanji: '穴', element: 'earth', kind: 'charged', power: 72, energy: 45, cooldown: 1.1, windup: 0.35, shape: 'lunge', range: 7, radius: 0.9, fx: 'mud', desc: 'Gone under the furrow, then up beneath your feet.' },
  { id: 'paddy_mire', name: 'Paddy Mire', kanji: '泥田', element: 'earth', kind: 'charged', power: 55, energy: 50, cooldown: 1.3, windup: 0.4, shape: 'field', range: 10, radius: 4, duration: 5, effect: { type: 'chill', chance: 1, duration: 2 }, fx: 'mud', desc: 'Planting-season mud, knee deep and in no hurry.' },
  { id: 'landslip', name: 'Landslip', kanji: '崩', element: 'earth', kind: 'charged', power: 80, energy: 52, cooldown: 1.2, windup: 0.4, shape: 'cone', range: 9, radius: 35, duration: 0.6, fx: 'rock', desc: 'The slope lets go of what it was holding.' },
  { id: 'ground_swell', name: 'Ground Swell', kanji: '地鳴', element: 'earth', kind: 'charged', power: 90, energy: 60, cooldown: 1.4, windup: 0.5, shape: 'pulse', range: 0, radius: 6.5, fx: 'rock', desc: 'A low sound first; the pheasants hear it before you do.' },
  { id: 'boulder_roll', name: 'Boulder Roll', kanji: '岩', element: 'earth', kind: 'charged', power: 96, energy: 62, cooldown: 1.5, windup: 0.5, shape: 'projectile', range: 18, radius: 1.0, speed: 14, arc: 0.2, fx: 'rock', desc: 'Set going with one shoulder. After that it is the hill\'s idea.' },
  { id: 'mountain_shrug', name: 'Mountain Shrug', kanji: '山', element: 'earth', kind: 'charged', power: 130, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'pulse', range: 0, radius: 8, effect: { type: 'stun', chance: 0.3, duration: 1 }, fx: 'rock', desc: 'Somewhere under the moss, a shoulder rolls.' },
];
