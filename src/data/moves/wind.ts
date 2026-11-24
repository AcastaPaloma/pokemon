import type { MoveDef } from '../types';

// Wind — wingbeats, winnowing fans, and the draught that comes down off the peaks.
export const WIND_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'feather_dart', name: 'Feather Dart', kanji: '羽', element: 'wind', kind: 'fast', power: 4, energy: 7, cooldown: 0.33, windup: 0.06, shape: 'projectile', range: 16, radius: 0.22, speed: 34, arc: 0, fx: 'gust', desc: 'A shed primary, sent quill-first.' },
  { id: 'wing_cuff', name: 'Wing Cuff', kanji: '翼', element: 'wind', kind: 'fast', power: 7, energy: 9, cooldown: 0.48, windup: 0.09, shape: 'strike', range: 0.6, radius: 0.6, fx: 'gust', desc: 'The wrist of the wing, used the way a goose uses it.' },
  { id: 'chaff_gust', name: 'Chaff Gust', kanji: '籾', element: 'wind', kind: 'fast', power: 6, energy: 10, cooldown: 0.65, windup: 0.14, shape: 'cone', range: 5, radius: 28, duration: 0.25, fx: 'gust', desc: 'Enough wind to winnow rice, aimed at a face.' },
  { id: 'wing_clap', name: 'Wing Clap', kanji: '拍', element: 'wind', kind: 'fast', power: 8, energy: 11, cooldown: 0.8, windup: 0.16, shape: 'pulse', range: 0, radius: 2.3, fx: 'gust', desc: 'Both wings brought together overhead. The air jumps.' },
  { id: 'short_stoop', name: 'Short Stoop', kanji: '急降', element: 'wind', kind: 'fast', power: 10, energy: 12, cooldown: 0.85, windup: 0.1, shape: 'lunge', range: 5, radius: 0.5, fx: 'gust', desc: 'Wings folded for the length of one breath.' },
  { id: 'gallop_clip', name: 'Gallop Clip', kanji: '駆', element: 'wind', kind: 'fast', power: 11, energy: 13, cooldown: 0.95, windup: 0.14, shape: 'lunge', range: 4.5, radius: 0.6, fx: 'gust', desc: 'A shoulder in passing, at the speed of the whole herd.' },
  // ---- charged
  { id: 'fair_wind', name: 'Fair Wind', kanji: '順風', element: 'wind', kind: 'charged', power: 45, energy: 35, cooldown: 1.2, windup: 0.3, shape: 'pulse', range: 0, radius: 3, effect: { type: 'atkUp', chance: 1, duration: 6, self: true }, fx: 'gust', desc: 'The wind comes round behind, and stays there.' },
  { id: 'winnowing_fan', name: 'Winnowing Fan', kanji: '箕', element: 'wind', kind: 'charged', power: 68, energy: 44, cooldown: 1.1, windup: 0.3, shape: 'cone', range: 9, radius: 40, duration: 0.6, fx: 'gust', desc: 'One broad toss, and everything light is somewhere else.' },
  { id: 'dust_devil', name: 'Dust Devil', kanji: '旋風', element: 'wind', kind: 'charged', power: 60, energy: 52, cooldown: 1.3, windup: 0.4, shape: 'field', range: 12, radius: 3, duration: 4.5, effect: { type: 'atkDown', chance: 1, duration: 2 }, fx: 'gust', desc: 'A small turning thing made of road and dry leaves.' },
  { id: 'sickle_wind', name: 'Sickle Wind', kanji: '鎌風', element: 'wind', kind: 'charged', power: 36, energy: 55, cooldown: 1.3, windup: 0.35, shape: 'projectile', range: 22, radius: 0.5, speed: 36, count: 3, spread: 30, arc: 0, fx: 'slash', desc: 'Three cuts found afterwards, and no memory of a blade.' },
  { id: 'kite_stoop', name: 'Kite Stoop', kanji: '鳶', element: 'wind', kind: 'charged', power: 90, energy: 56, cooldown: 1.3, windup: 0.4, shape: 'lunge', range: 10, radius: 1.0, fx: 'gust', desc: 'It leaves its circle and becomes a falling stone with opinions.' },
  { id: 'mountain_draft', name: 'Mountain Draft', kanji: '颪', element: 'wind', kind: 'charged', power: 84, energy: 58, cooldown: 1.4, windup: 0.45, shape: 'beam', range: 24, radius: 0.8, duration: 0.8, fx: 'gust', desc: 'Cold air poured down a valley as though down a spout.' },
  { id: 'typhoon_eye', name: 'Typhoon Eye', kanji: '颱', element: 'wind', kind: 'charged', power: 120, energy: 78, cooldown: 1.7, windup: 0.65, shape: 'pulse', range: 0, radius: 8, fx: 'gust', desc: 'Everything turns except the place where it stands.' },
];
