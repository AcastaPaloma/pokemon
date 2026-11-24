import type { MoveDef } from '../types';
import { STARTER_MOVES } from './starters';
import { FIRE_MOVES } from './fire';
import { WATER_MOVES } from './water';
import { WOOD_MOVES } from './wood';
import { METAL_MOVES } from './metal';
import { EARTH_MOVES } from './earth';
import { WIND_MOVES } from './wind';
import { THUNDER_MOVES } from './thunder';
import { FROST_MOVES } from './frost';
import { SPIRIT_MOVES } from './spirit';
import { SHADOW_MOVES } from './shadow';

const ALL: MoveDef[] = [
  ...STARTER_MOVES,
  ...FIRE_MOVES,
  ...WATER_MOVES,
  ...WOOD_MOVES,
  ...METAL_MOVES,
  ...EARTH_MOVES,
  ...WIND_MOVES,
  ...THUNDER_MOVES,
  ...FROST_MOVES,
  ...SPIRIT_MOVES,
  ...SHADOW_MOVES,
];

export const MOVES: Record<string, MoveDef> = Object.fromEntries(ALL.map((m) => [m.id, m]));
export const MOVE_LIST = ALL;
export function move(id: string): MoveDef {
  const m = MOVES[id];
  if (!m) throw new Error(`unknown move: ${id}`);
  return m;
}
