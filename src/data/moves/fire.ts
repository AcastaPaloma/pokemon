import type { MoveDef } from '../types';

// Fire — hearths, kilns, beacons and the mountain's own breath.
export const FIRE_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'cinder_peck', name: 'Cinder Peck', kanji: '燼', element: 'fire', kind: 'fast', power: 6, energy: 8, cooldown: 0.4, windup: 0.08, shape: 'strike', range: 0.4, radius: 0.4, fx: 'ember', desc: 'A hot beak tapped once, the way one tests a kettle.' },
  { id: 'hearth_breath', name: 'Hearth Breath', kanji: '息', element: 'fire', kind: 'fast', power: 7, energy: 10, cooldown: 0.7, windup: 0.15, shape: 'cone', range: 4.5, radius: 25, duration: 0.25, fx: 'flame', desc: 'A slow exhale over banked coals.' },
  { id: 'torch_dash', name: 'Torch Dash', kanji: '炬', element: 'fire', kind: 'fast', power: 10, energy: 12, cooldown: 0.85, windup: 0.1, shape: 'lunge', range: 4, radius: 0.5, fx: 'flame', desc: 'A runner carrying fire between two villages.' },
  { id: 'brand_stamp', name: 'Brand Stamp', kanji: '烙', element: 'fire', kind: 'fast', power: 13, energy: 15, cooldown: 1.0, windup: 0.22, shape: 'strike', range: 0.6, radius: 0.7, effect: { type: 'burn', chance: 0.15, duration: 3, power: 2 }, fx: 'ember', desc: 'Pressed down and held a moment, like a cooper marking a cask.' },
  { id: 'wick_spark', name: 'Wick Spark', kanji: '灯芯', element: 'fire', kind: 'fast', power: 8, energy: 12, cooldown: 0.75, windup: 0.15, shape: 'projectile', range: 16, radius: 0.3, speed: 20, arc: 0.3, fx: 'ember', desc: 'The bright crumb that falls when a wick is trimmed.' },
  // ---- charged
  { id: 'ash_veil', name: 'Ash Veil', kanji: '灰幕', element: 'fire', kind: 'charged', power: 50, energy: 50, cooldown: 1.3, windup: 0.4, shape: 'field', range: 10, radius: 4, duration: 5, effect: { type: 'atkDown', chance: 1, duration: 3 }, fx: 'ember', desc: 'Grey snow settles, and the fight goes out of things.' },
  { id: 'sun_wheel', name: 'Sun Wheel', kanji: '日輪', element: 'fire', kind: 'charged', power: 100, energy: 68, cooldown: 1.5, windup: 0.5, shape: 'projectile', range: 24, radius: 0.9, speed: 18, arc: 0, fx: 'flame', desc: 'A disc of noon, rolled without hurry at what it dislikes.' },
  { id: 'signal_fire', name: 'Signal Fire', kanji: '烽', element: 'fire', kind: 'charged', power: 90, energy: 62, cooldown: 1.5, windup: 0.5, shape: 'beam', range: 22, radius: 0.5, duration: 0.7, fx: 'flame', desc: 'A beacon lit on one hill and read on the next.' },
  { id: 'caldera_wake', name: 'Caldera Wake', kanji: '噴', element: 'fire', kind: 'charged', power: 125, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'pulse', range: 0, radius: 8, fx: 'flame', desc: 'The mountain turns over in its sleep.' },
];
