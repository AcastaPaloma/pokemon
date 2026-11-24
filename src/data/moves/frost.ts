import type { MoveDef } from '../types';

// Frost — rime, sleet, eave icicles and the passes closed until spring.
export const FROST_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'rime_peck', name: 'Rime Peck', kanji: '霜', element: 'frost', kind: 'fast', power: 5, energy: 8, cooldown: 0.36, windup: 0.07, shape: 'strike', range: 0.4, radius: 0.4, fx: 'shard', desc: 'A beak that has been digging in snow all morning.' },
  { id: 'sleet_flick', name: 'Sleet Flick', kanji: '霙', element: 'frost', kind: 'fast', power: 6, energy: 10, cooldown: 0.5, windup: 0.1, shape: 'projectile', range: 15, radius: 0.26, speed: 26, arc: 0.05, effect: { type: 'chill', chance: 0.1, duration: 1.2 }, fx: 'shard', desc: 'Half rain, half ice, entirely down the collar.' },
  { id: 'icicle_jab', name: 'Icicle Jab', kanji: '氷柱', element: 'frost', kind: 'fast', power: 9, energy: 11, cooldown: 0.7, windup: 0.14, shape: 'strike', range: 0.7, radius: 0.5, fx: 'needle', desc: 'Long, clear, and broken off at the root for the purpose.' },
  { id: 'snow_lob', name: 'Snow Lob', kanji: '雪玉', element: 'frost', kind: 'fast', power: 8, energy: 12, cooldown: 0.75, windup: 0.16, shape: 'projectile', range: 14, radius: 0.4, speed: 18, arc: 0.6, fx: 'shard', desc: 'Packed between two palms with real attention.' },
  { id: 'cold_breath', name: 'Cold Breath', kanji: '白息', element: 'frost', kind: 'fast', power: 6, energy: 10, cooldown: 0.68, windup: 0.14, shape: 'cone', range: 4.5, radius: 26, duration: 0.25, fx: 'shard', desc: 'Breath you can see, and then feel.' },
  // ---- charged
  { id: 'powder_burst', name: 'Powder Burst', kanji: '粉雪', element: 'frost', kind: 'charged', power: 55, energy: 38, cooldown: 1.1, windup: 0.3, shape: 'pulse', range: 0, radius: 4, fx: 'shard', desc: 'A laden bough shaken once, by something underneath it.' },
  { id: 'frost_flowers', name: 'Frost Flowers', kanji: '霜花', element: 'frost', kind: 'charged', power: 55, energy: 50, cooldown: 1.3, windup: 0.4, shape: 'field', range: 10, radius: 4, duration: 5, effect: { type: 'chill', chance: 1, duration: 2 }, fx: 'shard', desc: 'Ice blooms on still ground, thin as paper and as sharp.' },
  { id: 'eave_icicles', name: 'Eave Icicles', kanji: '垂氷', element: 'frost', kind: 'charged', power: 30, energy: 56, cooldown: 1.3, windup: 0.4, shape: 'projectile', range: 14, radius: 0.35, speed: 16, count: 4, spread: 20, arc: 0.9, fx: 'shard', desc: 'The whole row along the roof edge, let go together.' },
  { id: 'snow_blind', name: 'Snow Blind', kanji: '雪盲', element: 'frost', kind: 'charged', power: 76, energy: 54, cooldown: 1.3, windup: 0.4, shape: 'cone', range: 9, radius: 40, duration: 0.7, effect: { type: 'atkDown', chance: 0.4, duration: 3 }, fx: 'shard', desc: 'White in front, white behind, and no line between.' },
  { id: 'cornice_break', name: 'Cornice Break', kanji: '雪庇', element: 'frost', kind: 'charged', power: 88, energy: 55, cooldown: 1.3, windup: 0.4, shape: 'lunge', range: 8, radius: 1.1, fx: 'shard', desc: 'The overhang that waited all winter for one footstep.' },
  { id: 'cold_moon', name: 'Cold Moon', kanji: '寒月', element: 'frost', kind: 'charged', power: 90, energy: 60, cooldown: 1.4, windup: 0.45, shape: 'beam', range: 22, radius: 0.6, duration: 0.8, fx: 'moon', desc: 'Midwinter moonlight, narrow and without any kindness in it.' },
  { id: 'deep_winter', name: 'Deep Winter', kanji: '厳冬', element: 'frost', kind: 'charged', power: 120, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'pulse', range: 0, radius: 8, effect: { type: 'chill', chance: 1, duration: 3 }, fx: 'shard', desc: 'The kind of cold that shuts the passes until spring.' },
];
