import type { MoveDef } from '../types';

// Water — shallows, tides, warm pools and the long grey swell.
export const WATER_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'fin_slap', name: 'Fin Slap', kanji: '鰭', element: 'water', kind: 'fast', power: 9, energy: 11, cooldown: 0.7, windup: 0.14, shape: 'strike', range: 0.6, radius: 0.7, fx: 'water', desc: 'Flat, wet, and louder than it needs to be.' },
  { id: 'brook_dart', name: 'Brook Dart', kanji: '瀬', element: 'water', kind: 'fast', power: 9, energy: 11, cooldown: 0.8, windup: 0.09, shape: 'lunge', range: 4, radius: 0.5, fx: 'water', desc: 'The way a trout crosses a shallow it does not trust.' },
  { id: 'bubble_string', name: 'Bubble String', kanji: '泡', element: 'water', kind: 'fast', power: 4, energy: 7, cooldown: 0.32, windup: 0.06, shape: 'projectile', range: 12, radius: 0.3, speed: 16, arc: 0, effect: { type: 'chill', chance: 0.08, duration: 1 }, fx: 'bubble', desc: 'Small round breaths let go one after another.' },
  // ---- charged
  { id: 'undertow', name: 'Undertow', kanji: '引潮', element: 'water', kind: 'charged', power: 72, energy: 50, cooldown: 1.2, windup: 0.4, shape: 'pulse', range: 0, radius: 6, effect: { type: 'chill', chance: 0.6, duration: 2 }, fx: 'water', desc: 'The sea taking back what it lent the beach.' },
  { id: 'hot_spring', name: 'Hot Spring', kanji: '湯', element: 'water', kind: 'charged', power: 45, energy: 45, cooldown: 1.4, windup: 0.4, shape: 'pulse', range: 0, radius: 3, effect: { type: 'heal', chance: 1, duration: 0, power: 0.2, self: true }, fx: 'bubble', desc: 'Warm water knows where every ache is kept.' },
  { id: 'sluice', name: 'Sluice', kanji: '堰', element: 'water', kind: 'charged', power: 88, energy: 60, cooldown: 1.4, windup: 0.45, shape: 'beam', range: 20, radius: 0.6, duration: 0.8, fx: 'water', desc: 'A gate is lifted; the river does the rest.' },
  { id: 'breach', name: 'Breach', kanji: '躍', element: 'water', kind: 'charged', power: 108, energy: 70, cooldown: 1.6, windup: 0.55, shape: 'lunge', range: 10, radius: 1.4, fx: 'water', desc: 'Up out of the grey water, and down again on whatever is there.' },
  { id: 'great_swell', name: 'Great Swell', kanji: '大波', element: 'water', kind: 'charged', power: 125, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'cone', range: 10, radius: 45, duration: 0.8, fx: 'water', desc: 'A wave drawn the way the old printmakers drew them, with fingers.' },
];
