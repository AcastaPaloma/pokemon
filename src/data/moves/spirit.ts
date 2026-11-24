import type { MoveDef } from '../types';

// Spirit — shrine bells, paper slips, salt, and the rice pounded on the moon.
export const SPIRIT_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'moon_mote', name: 'Moon Mote', kanji: '月', element: 'spirit', kind: 'fast', power: 4, energy: 7, cooldown: 0.32, windup: 0.06, shape: 'projectile', range: 12, radius: 0.3, speed: 16, arc: 0, fx: 'moon', desc: 'A crumb of pale light, blown off a fingertip.' },
  { id: 'wisp_touch', name: 'Wisp Touch', kanji: '灯', element: 'spirit', kind: 'fast', power: 5, energy: 8, cooldown: 0.35, windup: 0.06, shape: 'strike', range: 0.4, radius: 0.45, fx: 'wisp', desc: 'Cool, and gone before the skin can decide what it was.' },
  { id: 'prayer_slip', name: 'Prayer Slip', kanji: '札', element: 'spirit', kind: 'fast', power: 6, energy: 10, cooldown: 0.5, windup: 0.1, shape: 'projectile', range: 16, radius: 0.26, speed: 28, arc: 0, fx: 'wisp', desc: 'A strip of paper that flies as though it had somewhere to be.' },
  { id: 'bell_shake', name: 'Bell Shake', kanji: '鈴', element: 'spirit', kind: 'fast', power: 8, energy: 12, cooldown: 0.8, windup: 0.17, shape: 'pulse', range: 0, radius: 2.3, fx: 'bell', desc: 'A cluster of small bells, rung once to get attention.' },
  { id: 'mochi_pound', name: 'Mochi Pound', kanji: '餅', element: 'spirit', kind: 'fast', power: 12, energy: 14, cooldown: 0.95, windup: 0.22, shape: 'strike', range: 0.5, radius: 0.7, fx: 'moon', desc: 'The mallet comes down. Somebody should have moved their hand.' },
  // ---- charged
  { id: 'mask_turn', name: 'Mask Turn', kanji: '面', element: 'spirit', kind: 'charged', power: 66, energy: 42, cooldown: 1.1, windup: 0.3, shape: 'cone', range: 7, radius: 35, duration: 0.5, effect: { type: 'defDown', chance: 0.4, duration: 4 }, fx: 'wisp', desc: 'It looks at you with the other face.' },
  { id: 'offering', name: 'Offering', kanji: '供', element: 'spirit', kind: 'charged', power: 45, energy: 45, cooldown: 1.4, windup: 0.4, shape: 'pulse', range: 0, radius: 3.5, effect: { type: 'heal', chance: 1, duration: 0, power: 0.22, self: true }, fx: 'bell', desc: 'Rice, water, a moment of quiet. Something accepts.' },
  { id: 'moon_mortar', name: 'Moon Mortar', kanji: '臼', element: 'spirit', kind: 'charged', power: 78, energy: 50, cooldown: 1.2, windup: 0.35, shape: 'strike', range: 0.9, radius: 1.4, effect: { type: 'stun', chance: 0.3, duration: 0.8 }, fx: 'moon', desc: 'One full swing, with the whole round moon behind it.' },
  { id: 'firefly_drift', name: 'Firefly Drift', kanji: '蛍', element: 'spirit', kind: 'charged', power: 22, energy: 50, cooldown: 1.2, windup: 0.3, shape: 'projectile', range: 18, radius: 0.35, speed: 14, count: 5, spread: 40, arc: 0, fx: 'wisp', desc: 'Slow lights that all seem to be going somewhere else.' },
  { id: 'salt_ring', name: 'Salt Ring', kanji: '盛塩', element: 'spirit', kind: 'charged', power: 55, energy: 50, cooldown: 1.3, windup: 0.4, shape: 'field', range: 8, radius: 3.5, duration: 5, effect: { type: 'atkDown', chance: 1, duration: 2.5 }, fx: 'wisp', desc: 'A circle of salt. Unkind things discover the edge of it.' },
  { id: 'gate_row', name: 'Gate Row', kanji: '鳥居', element: 'spirit', kind: 'charged', power: 90, energy: 62, cooldown: 1.5, windup: 0.5, shape: 'beam', range: 24, radius: 0.7, duration: 0.8, fx: 'wisp', desc: 'Vermilion gates one behind another, further than the eye agrees to go.' },
  { id: 'dawn_bell', name: 'Dawn Bell', kanji: '暁鐘', element: 'spirit', kind: 'charged', power: 124, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'pulse', range: 0, radius: 8, fx: 'bell', desc: 'The first bell of morning. Night things recall appointments.' },
];
