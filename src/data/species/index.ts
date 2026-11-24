import type { SpeciesDef } from '../types';
import { STARTERS } from './starters';

const ALL: SpeciesDef[] = [...STARTERS];

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
