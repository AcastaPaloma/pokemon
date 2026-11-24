import type { MoveDef } from '../types';

// Shadow — spilled ink, dusk under the bamboo, the dark of the moon.
export const SHADOW_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'ink_dab', name: 'Ink Dab', kanji: '墨', element: 'shadow', kind: 'fast', power: 6, energy: 8, cooldown: 0.42, windup: 0.08, shape: 'strike', range: 0.45, radius: 0.45, fx: 'ink', desc: 'A single wet touch of the brush. It does not wash out.' },
  { id: 'ink_fleck', name: 'Ink Fleck', kanji: '飛墨', element: 'shadow', kind: 'fast', power: 5, energy: 9, cooldown: 0.44, windup: 0.08, shape: 'projectile', range: 15, radius: 0.28, speed: 24, arc: 0.1, fx: 'ink', desc: 'What leaves the brush when the wrist is careless on purpose.' },
  { id: 'hush_talon', name: 'Hush Talon', kanji: '爪', element: 'shadow', kind: 'fast', power: 8, energy: 10, cooldown: 0.55, windup: 0.1, shape: 'strike', range: 0.5, radius: 0.55, fx: 'slash', desc: 'No sound comes before it, and very little after.' },
  { id: 'pack_snap', name: 'Pack Snap', kanji: '噛', element: 'shadow', kind: 'fast', power: 9, energy: 11, cooldown: 0.68, windup: 0.13, shape: 'strike', range: 0.5, radius: 0.6, fx: 'bite', desc: 'A bite at the heel, meant to turn you toward the others.' },
  { id: 'dusk_pounce', name: 'Dusk Pounce', kanji: '宵', element: 'shadow', kind: 'fast', power: 10, energy: 12, cooldown: 0.85, windup: 0.1, shape: 'lunge', range: 4.5, radius: 0.55, fx: 'slash', desc: 'The stripe of shade between two stalks stands up and jumps.' },
  { id: 'viper_prick', name: 'Viper Prick', kanji: '咬', element: 'shadow', kind: 'fast', power: 11, energy: 13, cooldown: 0.9, windup: 0.2, shape: 'strike', range: 0.9, radius: 0.45, effect: { type: 'atkDown', chance: 0.12, duration: 2 }, fx: 'bite', desc: 'Two small marks. The arm feels heavy for a while.' },
  // ---- charged
  { id: 'throat_hold', name: 'Throat Hold', kanji: '喉笛', element: 'shadow', kind: 'charged', power: 74, energy: 46, cooldown: 1.2, windup: 0.3, shape: 'strike', range: 0.8, radius: 0.9, effect: { type: 'leech', chance: 1, duration: 0, power: 0.4 }, fx: 'bite', desc: 'It takes hold, and waits for the rest of the pack.' },
  { id: 'ink_spill', name: 'Ink Spill', kanji: '墨流', element: 'shadow', kind: 'charged', power: 58, energy: 50, cooldown: 1.3, windup: 0.4, shape: 'field', range: 10, radius: 4, duration: 5, effect: { type: 'chill', chance: 1, duration: 1.5 }, fx: 'ink', desc: 'A dropped inkstone. The floor becomes a place to be careful.' },
  { id: 'moonless_rush', name: 'Moonless Rush', kanji: '朔', element: 'shadow', kind: 'charged', power: 84, energy: 52, cooldown: 1.2, windup: 0.35, shape: 'lunge', range: 9, radius: 0.9, fx: 'ink', desc: 'It crosses the dark part of the garden. Then it has crossed.' },
  { id: 'blot_out', name: 'Blot Out', kanji: '塗潰', element: 'shadow', kind: 'charged', power: 80, energy: 56, cooldown: 1.4, windup: 0.45, shape: 'pulse', range: 0, radius: 6, effect: { type: 'atkDown', chance: 0.5, duration: 4 }, fx: 'ink', desc: 'One wet stroke laid across the whole picture.' },
  { id: 'long_shadow', name: 'Long Shadow', kanji: '長影', element: 'shadow', kind: 'charged', power: 90, energy: 60, cooldown: 1.4, windup: 0.45, shape: 'beam', range: 24, radius: 0.6, duration: 0.8, fx: 'ink', desc: 'Evening lays it across the field, and it has weight.' },
  { id: 'eaten_moon', name: 'Eaten Moon', kanji: '月蝕', element: 'shadow', kind: 'charged', power: 126, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'pulse', range: 0, radius: 8, fx: 'ink', desc: 'A bite out of the light, and then the rest of it.' },
];
