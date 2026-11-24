import type { MoveDef } from '../types';

// Seed moves for the four spring-born starters. These double as the tuning
// reference for every other move file.
export const STARTER_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'tusk_jab', name: 'Tusk Jab', kanji: '牙', element: 'earth', kind: 'fast', power: 8, energy: 9, cooldown: 0.55, windup: 0.12, shape: 'strike', range: 0.5, radius: 0.55, fx: 'thump', desc: 'A short upward hook of the tusks.' },
  { id: 'ember_snort', name: 'Ember Snort', kanji: '燠', element: 'fire', kind: 'fast', power: 6, energy: 10, cooldown: 0.5, windup: 0.1, shape: 'projectile', range: 14, radius: 0.28, speed: 22, arc: 0.15, effect: { type: 'burn', chance: 0.1, duration: 3, power: 2 }, fx: 'ember', desc: 'A coal sneezed from the snout. It glows where it lands.' },
  { id: 'ripple_peck', name: 'Ripple Peck', kanji: '啄', element: 'water', kind: 'fast', power: 5, energy: 8, cooldown: 0.36, windup: 0.07, shape: 'strike', range: 0.4, radius: 0.4, fx: 'water', desc: 'Quick as a sandpiper on wet sand.' },
  { id: 'spray_dart', name: 'Spray Dart', kanji: '飛沫', element: 'water', kind: 'fast', power: 7, energy: 11, cooldown: 0.62, windup: 0.12, shape: 'projectile', range: 18, radius: 0.25, speed: 30, arc: 0.05, fx: 'water', desc: 'A bead of water flicked hard off the wingtip.' },
  { id: 'leaf_flick', name: 'Leaf Flick', kanji: '葉', element: 'wood', kind: 'fast', power: 6, energy: 10, cooldown: 0.5, windup: 0.1, shape: 'projectile', range: 15, radius: 0.3, speed: 24, arc: 0, fx: 'leaf', desc: 'A spinning leaf with a sharpened edge.' },
  { id: 'drum_thump', name: 'Belly Drum', kanji: '鼓', element: 'earth', kind: 'fast', power: 9, energy: 12, cooldown: 0.85, windup: 0.2, shape: 'pulse', range: 0, radius: 2.4, fx: 'thump', desc: 'One round note on a full belly. The ground answers.' },
  { id: 'static_nip', name: 'Static Nip', kanji: '静電', element: 'thunder', kind: 'fast', power: 5, energy: 9, cooldown: 0.34, windup: 0.06, shape: 'strike', range: 0.4, radius: 0.4, effect: { type: 'stun', chance: 0.05, duration: 0.6 }, fx: 'spark', desc: 'A bite that crackles like wool in winter.' },
  { id: 'spark_skip', name: 'Spark Skip', kanji: '閃', element: 'thunder', kind: 'fast', power: 9, energy: 11, cooldown: 0.8, windup: 0.08, shape: 'lunge', range: 4.5, radius: 0.5, fx: 'spark', desc: 'A zig-zag dash that leaves a bright after-line.' },
  // ---- charged
  { id: 'bonfire_rush', name: 'Bonfire Rush', kanji: '篝火', element: 'fire', kind: 'charged', power: 80, energy: 50, cooldown: 1.2, windup: 0.35, shape: 'lunge', range: 9, radius: 1.0, effect: { type: 'burn', chance: 0.4, duration: 4, power: 3 }, fx: 'flame', desc: 'Head down, bristles lit, straight through.' },
  { id: 'kiln_burst', name: 'Kiln Burst', kanji: '窯', element: 'fire', kind: 'charged', power: 65, energy: 40, cooldown: 1.1, windup: 0.4, shape: 'pulse', range: 0, radius: 5, fx: 'flame', desc: 'Stored heat let go all at once.' },
  { id: 'tide_wing', name: 'Tide Wing', kanji: '汐', element: 'water', kind: 'charged', power: 70, energy: 45, cooldown: 1.1, windup: 0.3, shape: 'cone', range: 8, radius: 32, duration: 0.5, fx: 'water', desc: 'A wingbeat that throws a curling wave.' },
  { id: 'whirl_pool', name: 'Whirlpool', kanji: '渦', element: 'water', kind: 'charged', power: 60, energy: 55, cooldown: 1.4, windup: 0.45, shape: 'field', range: 12, radius: 3.5, duration: 4, effect: { type: 'chill', chance: 1, duration: 1.5 }, fx: 'bubble', desc: 'A turning pool that holds what steps in it.' },
  { id: 'thicket_rise', name: 'Thicket Rise', kanji: '藪', element: 'wood', kind: 'charged', power: 55, energy: 45, cooldown: 1.3, windup: 0.4, shape: 'field', range: 10, radius: 3, duration: 3.5, effect: { type: 'root', chance: 1, duration: 1.2 }, fx: 'vine', desc: 'Shoots burst from the soil and grab at ankles.' },
  { id: 'acorn_barrage', name: 'Acorn Barrage', kanji: '団栗', element: 'wood', kind: 'charged', power: 22, energy: 50, cooldown: 1.2, windup: 0.3, shape: 'projectile', range: 20, radius: 0.35, speed: 26, count: 5, spread: 16, arc: 0.3, fx: 'leaf', desc: 'Five acorns thrown faster than seems fair.' },
  { id: 'thunderclap', name: 'Thunderclap', kanji: '霹靂', element: 'thunder', kind: 'charged', power: 60, energy: 40, cooldown: 1.1, windup: 0.3, shape: 'pulse', range: 0, radius: 5.5, effect: { type: 'stun', chance: 0.5, duration: 1 }, fx: 'bolt', desc: 'A white ring and then the sound.' },
  { id: 'sky_lance', name: 'Sky Lance', kanji: '天槍', element: 'thunder', kind: 'charged', power: 95, energy: 65, cooldown: 1.5, windup: 0.5, shape: 'beam', range: 26, radius: 0.5, duration: 0.6, fx: 'bolt', desc: 'A single bolt, drawn straight as a ruled line.' },
];
