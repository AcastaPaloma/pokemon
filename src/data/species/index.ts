import type { SpeciesDef } from '../types';
import { STARTERS } from './starters';
import { VALE } from './vale';
import { BAMBOO } from './bamboo';
import { DEEPWOOD } from './deepwood';
import { PLAINS } from './plains';
import { VOLCANIC } from './volcanic';
import { SNOW } from './snow';
import { MARSH } from './marsh';
import { COAST } from './coast';
import { HIGHLAND } from './highland';
import { ISLE } from './isle';
import { MYTHIC } from './mythic';

const ALL: SpeciesDef[] = [
  ...STARTERS,
  ...VALE,
  ...BAMBOO,
  ...DEEPWOOD,
  ...PLAINS,
  ...VOLCANIC,
  ...SNOW,
  ...MARSH,
  ...COAST,
  ...HIGHLAND,
  ...ISLE,
  ...MYTHIC,
];

export const SPECIES: Record<string, SpeciesDef> = Object.fromEntries(ALL.map((s) => [s.id, s]));
export const SPECIES_LIST = ALL;
export const STARTER_IDS = ALL.filter((s) => s.starter).map((s) => s.id);
export function species(id: string): SpeciesDef {
  const s = SPECIES[id];
  if (!s) throw new Error(`unknown species: ${id}`);
  return s;
}
/** All species sharing an evolution line, ordered by stage. */
export function lineOf(line: string): SpeciesDef[] {
  return ALL.filter((s) => s.line === line).sort((a, b) => a.stage - b.stage);
}
