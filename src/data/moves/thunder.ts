import type { MoveDef } from '../types';

// Thunder — cloud drums, rice lightning, the white seam in a summer sky.
export const THUNDER_MOVES: MoveDef[] = [
  // ---- fast
  { id: 'wing_buzz', name: 'Wing Buzz', kanji: '震', element: 'thunder', kind: 'fast', power: 4, energy: 7, cooldown: 0.3, windup: 0.05, shape: 'strike', range: 0.35, radius: 0.4, fx: 'spark', desc: 'A wingtip brushed past too quickly to be an accident.' },
  { id: 'needle_spark', name: 'Needle Spark', kanji: '針電', element: 'thunder', kind: 'fast', power: 6, energy: 10, cooldown: 0.48, windup: 0.09, shape: 'projectile', range: 17, radius: 0.22, speed: 38, arc: 0, fx: 'spark', desc: 'The small bright thread between a finger and a door latch.' },
  { id: 'rolling_tap', name: 'Rolling Tap', kanji: '連打', element: 'thunder', kind: 'fast', power: 8, energy: 11, cooldown: 0.78, windup: 0.16, shape: 'pulse', range: 0, radius: 2.2, fx: 'bolt', desc: 'A quick roll on the drumhead, far off behind the hills.' },
  { id: 'storm_hoof', name: 'Storm Hoof', kanji: '雷蹄', element: 'thunder', kind: 'fast', power: 12, energy: 14, cooldown: 0.95, windup: 0.2, shape: 'strike', range: 0.7, radius: 0.8, fx: 'bolt', desc: 'Where the hoof comes down the grass stands up.' },
  // ---- charged
  { id: 'rice_lightning', name: 'Rice Lightning', kanji: '稲妻', element: 'thunder', kind: 'charged', power: 34, energy: 52, cooldown: 1.2, windup: 0.3, shape: 'projectile', range: 20, radius: 0.35, speed: 40, count: 3, spread: 24, arc: 0, fx: 'bolt', desc: 'Farmers say this is what makes the ears fill.' },
  { id: 'bolt_run', name: 'Bolt Run', kanji: '雷走', element: 'thunder', kind: 'charged', power: 85, energy: 54, cooldown: 1.3, windup: 0.35, shape: 'lunge', range: 10, radius: 0.9, fx: 'bolt', desc: 'It is here; then there is a scorched line, and it is there.' },
  { id: 'storm_drum', name: 'Storm Drum', kanji: '雷鼓', element: 'thunder', kind: 'charged', power: 70, energy: 58, cooldown: 1.4, windup: 0.45, shape: 'field', range: 10, radius: 4, duration: 4, effect: { type: 'stun', chance: 0.3, duration: 0.6 }, fx: 'bolt', desc: 'Eight beats on the cloud-drums, and the rain keeps time.' },
  { id: 'heavens_seam', name: 'Heaven\'s Seam', kanji: '天裂', element: 'thunder', kind: 'charged', power: 128, energy: 80, cooldown: 1.8, windup: 0.7, shape: 'beam', range: 30, radius: 0.9, duration: 0.9, effect: { type: 'stun', chance: 0.4, duration: 1.2 }, fx: 'bolt', desc: 'The sky comes unstitched along one white thread.' },
];
