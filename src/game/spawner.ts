// Keeps the land around the player alive. Species appear where their ecology
// says they live, in the group sizes they keep, more often in the weather they
// love, asleep at the hours they sleep — and quietly leave when you are far away.
import type { SpeciesDef, TimeOfDay, WeatherId } from '../data/types';
import { SPECIES_LIST } from '../data/species';
import { Creature, rollIndividual } from './creature';
import { makeBrain, isAsleepHour, type Brain } from './ai';
import { BIOMES, groundAt, makeSample, sampleTerrain, waterAt } from '../world/terrain';
import { SPAWN_POINT } from '../data/world';
import { clamp } from '../core/math';

const RARITY_W = [0, 10, 5, 2, 0.45, 0];
const s = makeSample();

/** Fixed lairs for the mythic spirits, by the biome they haunt. */
const LAIRS: Record<string, { x: number; z: number }> = {
  isle: { x: -3170, z: 2190 },
  snow: { x: -150, z: -1555 },
  deepwood: { x: -1262, z: -700 },
  volcanic: { x: 1250, z: -790 },
  sea: { x: 1250, z: 2750 },
  highland: { x: 60, z: -640 },
};

export interface SpawnCtx {
  creatures: Creature[];
  add: (c: Creature) => void;
  remove: (c: Creature) => void;
  player: () => Creature | null;
  tod: TimeOfDay;
  weather: WeatherId;
  /** line ids the player has already bonded (mythics do not respawn) */
  bondedLines: Set<string>;
  maxWild: number;
}

export function levelAt(x: number, z: number, biome: string): number {
  const d = Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z);
  const base: Record<string, number> = { vale: 2, beach: 6, bamboo: 7, plains: 7, marsh: 12, deepwood: 13, highland: 14, sea: 12, volcanic: 20, snow: 22, isle: 28, cliff: 12 };
  return Math.max(1, Math.round((base[biome] ?? 5) + d / 420 + Math.random() * 3));
}

export class Spawner {
  private timer = 0;
  private herdSeq = 1;
  private lairSpawned = new Set<string>();

  private fits(sp: SpeciesDef, biome: string, hasWater: boolean): boolean {
    if (sp.rarity >= 5 || sp.starter) return false;
    const loc = sp.ecology.locomotion;
    if (loc === 'swim') return hasWater && (sp.ecology.habitats.includes(biome as never) || (biome === 'beach' && sp.ecology.habitats.includes('sea')));
    if (hasWater && loc !== 'amphibious' && loc !== 'fly' && loc !== 'float') return false;
    return sp.ecology.habitats.includes(biome as never);
  }

  update(dt: number, ctx: SpawnCtx) {
    const p = ctx.player();
    if (!p) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.6;

    // leave when far
    let wild = 0;
    for (let i = ctx.creatures.length - 1; i >= 0; i--) {
      const c = ctx.creatures[i];
      if (c.team !== 'wild') continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d > 230 && c.inCombat <= 0) ctx.remove(c);
      else if (c.fainted && c.faintT > 14) ctx.remove(c);
      else wild++;
    }
    this.lairs(ctx, p);
    if (wild >= ctx.maxWild) return;

    // try a few candidate spots out of easy sight
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = wild < 6 ? 28 + Math.random() * 60 : 70 + Math.random() * 90;
      const x = p.pos.x + Math.cos(a) * r;
      const z = p.pos.z + Math.sin(a) * r;
      sampleTerrain(x, z, s);
      const biome = BIOMES[s.biome];
      const hasWater = s.water > s.h + 0.8;
      const pool = SPECIES_LIST.filter((sp) => this.fits(sp, biome, hasWater));
      if (!pool.length) continue;
      let total = 0;
      const weights = pool.map((sp) => {
        let w = RARITY_W[sp.rarity] * (4 - sp.stage);
        if (sp.ecology.weatherLove?.includes(ctx.weather)) w *= 2.5;
        const act = sp.ecology.activity;
        const asleep = (act === 'diurnal' && ctx.tod === 'night') || (act === 'nocturnal' && ctx.tod === 'day');
        if (asleep) w *= 0.3;
        if (act === 'crepuscular' && (ctx.tod === 'dawn' || ctx.tod === 'dusk')) w *= 2;
        total += w;
        return w;
      });
      let pick = Math.random() * total;
      let sp = pool[0];
      for (let i = 0; i < pool.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          sp = pool[i];
          break;
        }
      }
      const [g0, g1] = sp.ecology.group;
      const n = clamp(Math.round(g0 + Math.random() * (g1 - g0)), 1, Math.min(8, ctx.maxWild - wild));
      const lvl = levelAt(x, z, biome) + (sp.stage - 1) * 9;
      const herd = n > 1 ? this.herdSeq++ : 0;
      let leader: Creature | null = null;
      for (let i = 0; i < n; i++) {
        const ox = x + (Math.random() - 0.5) * (3 + sp.height * 4) * Math.sqrt(n);
        const oz = z + (Math.random() - 0.5) * (3 + sp.height * 4) * Math.sqrt(n);
        const g = groundAt(ox, oz);
        const w = waterAt(ox, oz);
        if (sp.ecology.locomotion === 'swim' ? !(w > g + sp.height * 0.8) : w > g + sp.height * 0.7 && sp.ecology.locomotion !== 'amphibious' && sp.ecology.locomotion !== 'fly' && sp.ecology.locomotion !== 'float') continue;
        const c = new Creature(rollIndividual(sp.id, Math.max(1, lvl + Math.round((Math.random() - 0.5) * 3))));
        c.team = 'wild';
        c.place(ox, oz, Math.random() * 6.283);
        const b = makeBrain(c, herd, leader);
        c.brain = b;
        if (isAsleepHour(c, ctx.tod)) {
          b.mood = 'sleep';
          c.action = 'sleep';
        }
        if (!leader) leader = c;
        ctx.add(c);
        wild++;
      }
      break;
    }
  }

  /** Mythic spirits wait at their lairs for whoever comes looking. */
  private lairs(ctx: SpawnCtx, p: Creature) {
    for (const sp of SPECIES_LIST) {
      if (sp.rarity < 5 || ctx.bondedLines.has(sp.line) || this.lairSpawned.has(sp.id)) continue;
      const lair = LAIRS[sp.ecology.habitats[0]];
      if (!lair) continue;
      if (Math.hypot(lair.x - p.pos.x, lair.z - p.pos.z) > 190) continue;
      const c = new Creature(rollIndividual(sp.id, 46));
      c.team = 'wild';
      c.place(lair.x, lair.z, Math.random() * 6.283);
      const b: Brain = makeBrain(c);
      c.brain = b;
      this.lairSpawned.add(sp.id);
      ctx.add(c);
    }
  }

  /** Let a lair refill after its spirit wanders off unbonded. */
  forget(c: Creature) {
    if (c.sp.rarity >= 5) this.lairSpawned.delete(c.sp.id);
  }
}
