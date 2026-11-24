import type { SpeciesDef } from '../types';

// The three that the island was drawn around. One of each; they do not share.
export const MYTHIC: SpeciesDef[] = [
  {
    id: 'bokuryu', name: 'Bokuryu', kanji: '墨龍', title: 'the ink dragon of the isle',
    elements: ['shadow', 'water'], height: 9, weight: 800,
    stats: { hp: 180, atk: 190, def: 160, spd: 170 },
    fast: ['ink_fleck', 'fin_slap'], charged: ['ink_spill', 'great_swell', 'eaten_moon'],
    line: 'bokuryu', stage: 1,
    awakening: { seal: 'seal_bokuryu', name: 'The Dragon With Its Eyes Dotted', kanji: '点睛', scale: 1.2, statMul: 1.35, tint: '#f4e9d6' },
    body: {
      arch: 'serpent',
      colors: { body: '#1d1a1a', belly: '#6b6260', accent: '#f4e9d6', dark: '#1d1a1a', glow: '#f4e9d6' },
      bodyLen: 1.6, bodyGirth: 1.1, headSize: 1.2, snout: 0.8,
      ears: { type: 'fin', size: 0.6 }, tail: { type: 'ribbon', len: 1.0 }, horns: { type: 'antler', size: 0.9, count: 2 },
      back: { type: 'mane', size: 1.0 }, eyes: { style: 'sleepy' }, whiskers: true, segments: 18, float: 0.2, extras: ['beard'],
    },
    ecology: {
      habitats: ['isle', 'sea'], activity: 'cathemeral', diet: 'spirit', foods: ['moonlight', 'fish'],
      prey: [], rivals: ['reirin'], social: 'solitary', group: [1, 1], temperament: 'territorial', territory: 40, weatherLove: ['storm', 'fog', 'rain'], locomotion: 'float',
    },
    traits: ['swim', 'dive', 'fly', 'phase'], rarity: 5,
    lore: 'It lies coiled around the isle\'s one peak, black where the brush was loaded and grey where it ran dry. The painter left its eyes blank on purpose. Everyone agrees that was wise.',
  },
  {
    id: 'reirin', name: 'Reirin', kanji: '嶺麟', title: 'the storm kirin of the white peaks',
    elements: ['thunder', 'spirit'], height: 2.6, weight: 420,
    stats: { hp: 170, atk: 185, def: 150, spd: 195 },
    fast: ['storm_hoof', 'prayer_slip'], charged: ['bolt_run', 'gate_row', 'heavens_seam'],
    line: 'reirin', stage: 1,
    awakening: { seal: 'seal_reirin', name: 'Auspice of the White Peaks', kanji: '瑞兆', scale: 1.2, statMul: 1.35, tint: '#fff2a8' },
    body: {
      arch: 'quadruped',
      colors: { body: '#6f6a4a', belly: '#d9c38a', accent: '#d6a94a', dark: '#2f3e5c', glow: '#fff2a8' },
      bodyLen: 1.1, bodyGirth: 0.95, headSize: 0.9, snout: 0.7, neck: 0.8, legLen: 1.5, legThick: 0.9,
      ears: { type: 'long', size: 0.6 }, tail: { type: 'bushy', len: 1.0 }, horns: { type: 'antler', size: 1.0, count: 1 },
      back: { type: 'mane', size: 1.2 }, pattern: { type: 'bands' }, eyes: { style: 'glow' }, whiskers: true, extras: ['beard', 'cheekTufts'],
    },
    ecology: {
      habitats: ['snow', 'cliff', 'highland'], activity: 'diurnal', diet: 'spirit', foods: ['dew', 'moonlight'],
      prey: [], rivals: ['bokuryu'], social: 'solitary', group: [1, 1], temperament: 'territorial', territory: 40, weatherLove: ['storm', 'gale'], locomotion: 'walk',
    },
    traits: ['charge', 'climb', 'phase'], rarity: 5,
    lore: 'Bronze-scaled, deer-bodied, with one branching horn and a mane like the underside of a thundercloud. It crosses the snowfield without marking it and will not tread on a living blade of grass.',
  },
  {
    id: 'kokeyama', name: 'Kokeyama', kanji: '苔山', title: 'the moss mountain',
    elements: ['earth', 'wood'], height: 6, weight: 40000,
    stats: { hp: 220, atk: 160, def: 220, spd: 100 },
    fast: ['stone_nod', 'creeper_snap'], charged: ['moss_mend', 'elder_grove', 'mountain_shrug'],
    line: 'kokeyama', stage: 1,
    awakening: { seal: 'seal_kokeyama', name: 'The Isle That Does Not Age', kanji: '蓬莱', scale: 1.15, statMul: 1.35, tint: '#aab884' },
    body: {
      arch: 'quadruped',
      colors: { body: '#55683f', belly: '#8a6f5a', accent: '#7d8f5c', dark: '#3a2f2a', glow: '#aab884' },
      bodyLen: 1.2, bodyGirth: 1.6, headSize: 0.8, snout: 0.4, neck: 0.5, legLen: 0.5, legThick: 1.6,
      ears: { type: 'none' }, tail: { type: 'stub' }, back: { type: 'shell', size: 1.5 }, pattern: { type: 'saddle' },
      eyes: { style: 'sleepy' }, extras: ['beard', 'rope'],
    },
    ecology: {
      habitats: ['deepwood'], activity: 'cathemeral', diet: 'photosynth', foods: ['moss', 'dew', 'minerals'],
      prey: [], rivals: [], social: 'solitary', group: [1, 1], temperament: 'territorial', territory: 40, weatherLove: ['rain', 'clear'], locomotion: 'walk',
    },
    traits: ['smash', 'grow'], rarity: 5,
    lore: 'The hill at the heart of the old wood has a stone lantern on it that nobody remembers placing, and cedars older than the village. Every few decades the hill is found a little to the east.',
  },
];
