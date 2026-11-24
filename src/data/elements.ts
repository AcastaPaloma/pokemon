import type { ElementId, WeatherId } from './types';

export interface ElementDef {
  id: ElementId;
  name: string;
  kanji: string;
  /** deals bonus damage to */
  strong: ElementId[];
  /** deals reduced damage to */
  weak: ElementId[];
  blurb: string;
}

// The ten currents. The first five follow the old overcoming cycle
// (wood parts earth, earth dams water, water quenches fire, fire melts metal,
// metal fells wood); the outer five weave across it.
export const ELEMENTS: Record<ElementId, ElementDef> = {
  fire: { id: 'fire', name: 'Fire', kanji: '火', strong: ['wood', 'metal', 'frost'], weak: ['water', 'earth', 'fire'], blurb: 'Melts metal, devours wood, wakes frost.' },
  water: { id: 'water', name: 'Water', kanji: '水', strong: ['fire', 'earth'], weak: ['wood', 'water', 'frost'], blurb: 'Quenches fire and wears earth away.' },
  wood: { id: 'wood', name: 'Wood', kanji: '木', strong: ['earth', 'water'], weak: ['fire', 'metal', 'wind', 'wood'], blurb: 'Roots part earth and drink water.' },
  metal: { id: 'metal', name: 'Metal', kanji: '金', strong: ['wood', 'frost', 'spirit'], weak: ['fire', 'metal', 'thunder'], blurb: 'Fells wood, shatters ice, binds spirits.' },
  earth: { id: 'earth', name: 'Earth', kanji: '土', strong: ['thunder', 'fire', 'metal'], weak: ['wood', 'wind'], blurb: 'Grounds thunder and smothers flame.' },
  wind: { id: 'wind', name: 'Wind', kanji: '風', strong: ['shadow', 'wood'], weak: ['metal', 'earth', 'frost'], blurb: 'Scatters shadow and strips the bough.' },
  thunder: { id: 'thunder', name: 'Thunder', kanji: '雷', strong: ['water', 'wind', 'metal'], weak: ['earth', 'wood', 'thunder'], blurb: 'Runs through water, sky and steel.' },
  frost: { id: 'frost', name: 'Frost', kanji: '氷', strong: ['wood', 'wind', 'earth'], weak: ['fire', 'metal', 'water', 'frost'], blurb: 'Stills sap, air and soil alike.' },
  spirit: { id: 'spirit', name: 'Spirit', kanji: '霊', strong: ['shadow', 'spirit'], weak: ['metal', 'earth'], blurb: 'Light that unravels shadow and itself.' },
  shadow: { id: 'shadow', name: 'Shadow', kanji: '影', strong: ['spirit', 'fire'], weak: ['shadow', 'wind', 'thunder'], blurb: 'Smothers flame and swallows light.' },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];

export const STRONG = 1.6;
export const WEAK = 0.625;
/** same-element attack bonus */
export const KINSHIP = 1.2;
export const WEATHER_BOOST = 1.2;

export function effectiveness(attack: ElementId, defender: readonly ElementId[]): number {
  let m = 1;
  const a = ELEMENTS[attack];
  for (const d of defender) {
    if (a.strong.includes(d)) m *= STRONG;
    else if (a.weak.includes(d)) m *= WEAK;
  }
  return m;
}

export const WEATHER: Record<WeatherId, { name: string; kanji: string; boosts: ElementId[]; blurb: string }> = {
  clear: { name: 'Clear', kanji: '晴', boosts: ['wood', 'earth'], blurb: 'Still air and long light.' },
  sunny: { name: 'Blazing Sun', kanji: '炎天', boosts: ['fire', 'earth'], blurb: 'The plates run hot and dry.' },
  rain: { name: 'Rain', kanji: '雨', boosts: ['water', 'wood', 'thunder'], blurb: 'Ink-line rain; roofs darken.' },
  storm: { name: 'Thunderstorm', kanji: '雷雨', boosts: ['thunder', 'wind', 'shadow'], blurb: 'The sky splits white.' },
  snow: { name: 'Snow', kanji: '雪', boosts: ['frost', 'metal'], blurb: 'The world goes back to paper.' },
  fog: { name: 'Mist', kanji: '霧', boosts: ['spirit', 'shadow'], blurb: 'Edges dissolve; spirits walk.' },
  ashfall: { name: 'Ashfall', kanji: '灰', boosts: ['earth', 'metal', 'fire'], blurb: 'Grey snow from the mountain.' },
  gale: { name: 'Gale', kanji: '嵐', boosts: ['wind', 'frost', 'spirit'], blurb: 'Every blade bows the same way.' },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];
