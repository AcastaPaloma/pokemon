import type { MoveDef } from '../types';
import { STARTER_MOVES } from './starters';

const ALL: MoveDef[] = [...STARTER_MOVES];

export const MOVES: Record<string, MoveDef> = Object.fromEntries(ALL.map((m) => [m.id, m]));
export const MOVE_LIST = ALL;
export function move(id: string): MoveDef {
  const m = MOVES[id];
  if (!m) throw new Error(`unknown move: ${id}`);
  return m;
}
