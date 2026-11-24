// Bestiary + move data validator.
//   npx -y tsx scripts/validate-data.ts
// Exits non-zero with a readable list if anything in src/data is inconsistent.

import { MOVE_LIST } from '../src/data/moves/index';
import { SPECIES_LIST } from '../src/data/species/index';
import type { MoveDef, SpeciesDef } from '../src/data/types';

const ELEMENTS = ['fire', 'water', 'wood', 'metal', 'earth', 'wind', 'thunder', 'frost', 'spirit', 'shadow'];
const SHAPES = ['strike', 'lunge', 'projectile', 'beam', 'pulse', 'cone', 'field'];
const STATUSES = ['burn', 'chill', 'root', 'stun', 'atkUp', 'defUp', 'atkDown', 'defDown', 'heal', 'leech'];
const FX = ['slash', 'bite', 'thump', 'ember', 'flame', 'water', 'bubble', 'leaf', 'petal', 'vine', 'spark', 'bolt', 'rock', 'mud', 'gust', 'shard', 'needle', 'wisp', 'ink', 'moon', 'bell'];
const BIOMES = ['sea', 'beach', 'vale', 'bamboo', 'deepwood', 'plains', 'volcanic', 'snow', 'marsh', 'highland', 'isle', 'cliff'];
const WEATHERS = ['clear', 'sunny', 'rain', 'storm', 'snow', 'fog', 'ashfall', 'gale'];
const TIMES = ['dawn', 'day', 'dusk', 'night'];
const ARCHES = ['quadruped', 'biped', 'bird', 'serpent', 'fish', 'insect', 'hopper', 'spirit'];
const TRAITS = ['swim', 'dive', 'fly', 'glide', 'climb', 'glow', 'burn', 'smash', 'charge', 'grow', 'burrow', 'tiny', 'phase'];
const SEED_STARTERS = ['kagari', 'namichi', 'hagakure', 'inabi'];
/** lines whose final stage must carry an awakening */
const AWAKENING_LINES = [
  'kagari', 'namichi', 'hagakure', 'inabi',
  'kotsuka', 'kowaguma', 'okuriko', 'akegarasu', 'hanzako', 'mokame', 'komako', 'goroko', 'shirohimo', 'kokabuto',
  'bokuryu', 'reirin', 'kokeyama',
];
const BANNED_WORDS = /\b(trainer|pok[eé]|gym|ball|badge|pocket monster|digi)\w*/i;

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);
const within = (v: number | undefined, lo: number, hi: number) => typeof v === 'number' && v >= lo - 1e-9 && v <= hi + 1e-9;
const chars = (s: string) => Array.from(s).length;
const HEX = /^#[0-9a-f]{6}$/i;

// ------------------------------------------------------------------ moves

const moves = new Map<string, MoveDef>();
const moveNames = new Map<string, string>();

for (const m of MOVE_LIST) {
  const w = `move ${m.id}`;
  if (moves.has(m.id)) err(w, 'duplicate move id');
  moves.set(m.id, m);
  if (!/^[a-z][a-z0-9_]*$/.test(m.id)) err(w, 'id is not snake_case');
  const lname = m.name.toLowerCase();
  if (moveNames.has(lname)) err(w, `duplicate move name "${m.name}" (also ${moveNames.get(lname)})`);
  moveNames.set(lname, m.id);
  if (m.name.trim().split(/\s+/).length > 2) err(w, `name "${m.name}" is longer than two words`);
  if (!within(chars(m.kanji), 1, 2)) err(w, `kanji "${m.kanji}" must be 1–2 characters`);
  if (!ELEMENTS.includes(m.element)) err(w, `unknown element ${m.element}`);
  if (!SHAPES.includes(m.shape)) err(w, `unknown shape ${m.shape}`);
  if (!FX.includes(m.fx)) err(w, `unknown fx ${m.fx}`);
  if (!m.desc || m.desc.length < 8) err(w, 'missing desc');

  const count = m.count ?? 1;
  if (m.kind === 'fast') {
    if (!within(m.power, 4, 14)) err(w, `fast power ${m.power} outside 4–14`);
    if (!within(m.energy, 6, 16)) err(w, `fast energy gain ${m.energy} outside 6–16`);
    if (!within(m.cooldown, 0.3, 1.1)) err(w, `fast cooldown ${m.cooldown} outside 0.3–1.1`);
    if (!within(m.windup, 0.05, 0.25)) err(w, `fast windup ${m.windup} outside 0.05–0.25`);
    if (count !== 1) err(w, 'fast moves fire a single shot');
  } else if (m.kind === 'charged') {
    if (count > 1) {
      if (!within(m.power * count, 45, 140)) err(w, `charged count×power ${m.power * count} outside 45–140`);
    } else if (!within(m.power, 45, 130)) err(w, `charged power ${m.power} outside 45–130`);
    if (!within(m.energy, 35, 80)) err(w, `charged energy cost ${m.energy} outside 35–80`);
    if (!within(m.cooldown, 1.0, 1.8)) err(w, `charged cooldown ${m.cooldown} outside 1.0–1.8`);
    if (!within(m.windup, 0.25, 0.7)) err(w, `charged windup ${m.windup} outside 0.25–0.7`);
  } else err(w, `unknown kind ${(m as MoveDef).kind}`);

  switch (m.shape) {
    case 'strike':
      if (!within(m.range, 0.3, 1.2)) err(w, `strike reach ${m.range} outside 0.3–1.2`);
      if (!within(m.radius, 0.3, 2.0)) err(w, `strike radius ${m.radius} outside 0.3–2.0`);
      break;
    case 'lunge':
      if (!within(m.range, 3, 10)) err(w, `lunge distance ${m.range} outside 3–10`);
      if (!within(m.radius, 0.4, 1.5)) err(w, `lunge radius ${m.radius} outside 0.4–1.5`);
      break;
    case 'projectile':
      if (!within(m.range, 10, 30)) err(w, `projectile range ${m.range} outside 10–30`);
      if (!within(m.speed, 14, 40)) err(w, `projectile speed ${m.speed} outside 14–40`);
      if (!within(m.radius, 0.2, 1.2)) err(w, `projectile radius ${m.radius} outside 0.2–1.2`);
      if (m.arc !== undefined && !within(m.arc, 0, 1)) err(w, `arc ${m.arc} outside 0–1`);
      if (count > 1 && !within(m.spread, 1, 90)) err(w, 'multi-shot needs a spread');
      break;
    case 'beam':
      if (!within(m.range, 12, 30)) err(w, `beam range ${m.range} outside 12–30`);
      if (!within(m.radius, 0.2, 1.2)) err(w, `beam thickness ${m.radius} outside 0.2–1.2`);
      if (!within(m.duration, 0.2, 1.5)) err(w, 'beam needs a duration (0.2–1.5)');
      break;
    case 'pulse':
      if (!within(m.radius, 2, 8)) err(w, `pulse radius ${m.radius} outside 2–8`);
      break;
    case 'cone':
      if (!within(m.range, 4, 10)) err(w, `cone range ${m.range} outside 4–10`);
      if (!within(m.radius, 20, 45)) err(w, `cone half-angle ${m.radius} outside 20–45`);
      if (!within(m.duration, 0.1, 1.5)) err(w, 'cone needs a duration (0.1–1.5)');
      break;
    case 'field':
      if (!within(m.radius, 2, 5)) err(w, `field radius ${m.radius} outside 2–5`);
      if (!within(m.duration, 2.5, 6)) err(w, `field duration ${m.duration} outside 2.5–6`);
      if (!within(m.range, 0, 14)) err(w, `field drop range ${m.range} outside 0–14`);
      break;
  }
  if (m.shape !== 'projectile' && count !== 1) err(w, 'count only applies to projectiles');

  if (m.effect) {
    if (!STATUSES.includes(m.effect.type)) err(w, `unknown status ${m.effect.type}`);
    if (!within(m.effect.chance, 0.01, 1)) err(w, `effect chance ${m.effect.chance} outside 0–1`);
    if (!within(m.effect.duration, 0, 8)) err(w, `effect duration ${m.effect.duration} outside 0–8`);
    if ((m.effect.type === 'heal' || m.effect.type === 'leech') && !within(m.effect.power, 0.05, 0.6)) err(w, `${m.effect.type} needs power as a fraction (0.05–0.6)`);
  }
}

const shapeCount: Record<string, number> = Object.fromEntries(SHAPES.map((s) => [s, 0]));
const moveElem: Record<string, { fast: number; charged: number }> = Object.fromEntries(ELEMENTS.map((e) => [e, { fast: 0, charged: 0 }]));
for (const m of moves.values()) {
  shapeCount[m.shape]++;
  if (moveElem[m.element]) moveElem[m.element][m.kind]++;
}
for (const e of ELEMENTS) {
  if (moveElem[e].fast < 5) err(`element ${e}`, `only ${moveElem[e].fast} fast moves (need ≥ 5)`);
  if (moveElem[e].charged < 5) err(`element ${e}`, `only ${moveElem[e].charged} charged moves (need ≥ 5)`);
}
for (const s of SHAPES) if (!shapeCount[s]) err('moves', `no move uses shape ${s}`);

const fastMoves = [...moves.values()].filter((m) => m.kind === 'fast');
const chargedMoves = [...moves.values()].filter((m) => m.kind === 'charged');
const fastFx = fastMoves.filter((m) => m.effect).length / Math.max(1, fastMoves.length);
const chargedFx = chargedMoves.filter((m) => m.effect).length / Math.max(1, chargedMoves.length);
if (!within(fastFx, 0.08, 0.25)) warn('moves', `${(fastFx * 100).toFixed(0)}% of fast moves have an effect (target ≈ 15%)`);
if (!within(chargedFx, 0.3, 0.5)) warn('moves', `${(chargedFx * 100).toFixed(0)}% of charged moves have an effect (target ≈ 40%)`);

// ------------------------------------------------------------------ species

const species = new Map<string, SpeciesDef>();
for (const s of SPECIES_LIST) {
  if (species.has(s.id)) err(`species ${s.id}`, 'duplicate species id');
  species.set(s.id, s);
}
const lines = new Map<string, SpeciesDef[]>();
for (const s of species.values()) {
  if (!lines.has(s.line)) lines.set(s.line, []);
  lines.get(s.line)!.push(s);
}
for (const l of lines.values()) l.sort((a, b) => a.stage - b.stage);

const speciesNames = new Map<string, string>();
const usedMoves = new Set<string>();
let evoTotal = 0;
let evoWhen = 0;

for (const s of species.values()) {
  const w = `species ${s.id}`;
  const line = lines.get(s.line)!;
  const final = line[line.length - 1];
  const mythic = s.rarity === 5;

  if (!/^[a-z][a-z0-9_]*$/.test(s.id)) err(w, 'id is not snake_case');
  if (speciesNames.has(s.name.toLowerCase())) err(w, `duplicate name ${s.name}`);
  speciesNames.set(s.name.toLowerCase(), s.id);
  if (!within(chars(s.kanji), 1, 3)) err(w, `kanji "${s.kanji}" must be 1–3 characters`);
  if (!s.title) err(w, 'missing title');
  if (!s.lore || s.lore.length < 30) err(w, 'lore too short');
  if (BANNED_WORDS.test(s.lore) || BANNED_WORDS.test(s.title)) err(w, 'lore/title uses a word that belongs to other games');
  if (![1, 2, 3, 4, 5].includes(s.rarity)) err(w, `rarity ${s.rarity} outside 1–5`);
  if (!(s.height > 0) || !(s.weight > 0)) err(w, 'height and weight must be positive');
  if (s.starter && !SEED_STARTERS.includes(s.id)) err(w, 'only the four seeds may be starters');
  if (SEED_STARTERS.includes(s.id) && !s.starter) err(w, 'seed starter lost its starter flag');

  // elements
  if (s.elements.length < 1 || s.elements.length > 2) err(w, 'needs one or two elements');
  for (const e of s.elements) if (!ELEMENTS.includes(e)) err(w, `unknown element ${e}`);
  if (s.elements.length === 2 && s.elements[0] === s.elements[1]) err(w, 'repeats the same element');

  // line / stage
  if (!species.has(s.line)) err(w, `line "${s.line}" is not a species id`);
  else if (species.get(s.line)!.stage !== 1) err(w, `line root ${s.line} is not stage 1`);
  if (s.stage === 1 && s.id !== s.line) err(w, 'stage 1 must be its own line id');
  line.forEach((member, i) => {
    if (member === s && member.stage !== i + 1) err(w, `stage ${s.stage} does not fit line ${s.line} (stages must run 1..${line.length} with no gaps or repeats)`);
  });

  // stats
  const total = s.stats.hp + s.stats.atk + s.stats.def + s.stats.spd;
  for (const [k, v] of Object.entries(s.stats)) if (!within(v, 30, 240)) err(w, `stat ${k}=${v} outside 30–240`);
  let lo: number, hi: number, tier: string;
  if (mythic) [lo, hi, tier] = [680, 720, 'mythic'];
  else if (s.stage === 3) [lo, hi, tier] = [520, 600, 'stage 3'];
  else if (s.stage === 2) [lo, hi, tier] = [430, 500, 'stage 2'];
  else if (line.length === 1) [lo, hi, tier] = [520, 600, 'single-stage adult'];
  else [lo, hi, tier] = [330, 380, 'stage 1'];
  if (!within(total, lo, hi)) err(w, `stat total ${total} outside ${lo}–${hi} for ${tier}`);

  // moves
  if (s.fast.length !== 2) err(w, `needs exactly 2 fast moves (has ${s.fast.length})`);
  if (s.charged.length < 2 || s.charged.length > 3) err(w, `needs 2–3 charged moves (has ${s.charged.length})`);
  if (new Set([...s.fast, ...s.charged]).size !== s.fast.length + s.charged.length) err(w, 'lists the same move twice');
  let offElement = 0;
  let onFast = 0;
  let onCharged = 0;
  for (const [list, kind] of [[s.fast, 'fast'], [s.charged, 'charged']] as const) {
    for (const id of list) {
      const m = moves.get(id);
      if (!m) { err(w, `unknown ${kind} move "${id}"`); continue; }
      usedMoves.add(id);
      if (m.kind !== kind) err(w, `${id} is a ${m.kind} move listed under ${kind}`);
      if ((s.elements as string[]).includes(m.element)) kind === 'fast' ? onFast++ : onCharged++;
      else offElement++;
    }
  }
  if (!onFast) err(w, 'no fast move matches its elements');
  if (!onCharged) err(w, 'no charged move matches its elements');
  if (offElement > 1) err(w, `${offElement} off-element moves (at most one coverage move)`);

  // evolution
  const next = line.find((m) => m.stage === s.stage + 1);
  if (s === final && s.evolvesTo?.length) err(w, 'final stage should not evolve');
  if (s !== final && !s.evolvesTo?.length) err(w, `missing evolvesTo → ${next?.id}`);
  for (const ev of s.evolvesTo ?? []) {
    evoTotal++;
    const t = species.get(ev.to);
    if (!t) { err(w, `evolves to unknown species "${ev.to}"`); continue; }
    if (t.line !== s.line) err(w, `evolves to ${ev.to}, which is in line ${t.line}`);
    if (t.stage !== s.stage + 1) err(w, `evolves to ${ev.to} (stage ${t.stage}); expected stage ${s.stage + 1}`);
    const [elo, ehi] = line.length === 2 ? [14, 28] : s.stage === 1 ? [12, 18] : [30, 36];
    if (!within(ev.level, elo, ehi)) err(w, `evolution level ${ev.level} outside ${elo}–${ehi}`);
    if (ev.when) {
      evoWhen++;
      const keys = Object.keys(ev.when);
      if (!keys.length) err(w, 'empty `when` condition');
      if (ev.when.time && !TIMES.includes(ev.when.time)) err(w, `unknown time ${ev.when.time}`);
      if (ev.when.weather && !WEATHERS.includes(ev.when.weather)) err(w, `unknown weather ${ev.when.weather}`);
      if (ev.when.biome && !BIOMES.includes(ev.when.biome)) err(w, `unknown biome ${ev.when.biome}`);
      if (ev.when.stone && !ELEMENTS.includes(ev.when.stone)) err(w, `unknown stone ${ev.when.stone}`);
      if (!ev.hint) err(w, 'conditional evolution needs a hint');
    }
  }

  // awakening
  if (s.awakening) {
    if (s !== final) err(w, 'only a final stage may awaken');
    if (s.awakening.seal !== `seal_${s.line}`) err(w, `awakening seal should be seal_${s.line}`);
    if (!s.awakening.name || !within(chars(s.awakening.kanji), 1, 3)) err(w, 'awakening needs a name and 1–3 kanji');
    if (!within(s.awakening.scale, 1, 1.6)) err(w, `awakening scale ${s.awakening.scale} outside 1–1.6`);
    if (!within(s.awakening.statMul, 1.1, 1.5)) err(w, `awakening statMul ${s.awakening.statMul} outside 1.1–1.5`);
    if (!HEX.test(s.awakening.tint)) err(w, 'awakening tint is not a hex colour');
    if (s.awakening.addElement && (s.elements as string[]).includes(s.awakening.addElement)) err(w, 'awakening adds an element it already has');
    if (!AWAKENING_LINES.includes(s.line)) warn(w, 'has an awakening that is not on the required list');
  }

  // mythic
  if (mythic) {
    if (line.length !== 1) err(w, 'mythic must be single-stage');
    if (!s.awakening) err(w, 'mythic must have an awakening');
    if (s.ecology.social !== 'solitary' || s.ecology.temperament !== 'territorial') err(w, 'mythic must be solitary and territorial');
    if (s.ecology.territory !== 40) err(w, 'mythic territory must be 40 m');
  }

  // body
  const b = s.body;
  if (!ARCHES.includes(b.arch)) err(w, `unknown arch ${b.arch}`);
  for (const [k, v] of Object.entries(b.colors)) if (!HEX.test(v as string)) err(w, `colour ${k}="${v}" is not #rrggbb`);
  const ranges: [keyof typeof b, number, number][] = [['bodyLen', 0.6, 1.8], ['bodyGirth', 0.6, 1.6], ['headSize', 0.6, 1.6], ['snout', 0, 1], ['neck', 0, 1], ['legLen', 0.4, 1.8], ['legThick', 0.5, 1.8], ['float', 0, 1]];
  for (const [k, a, z] of ranges) if (b[k] !== undefined && !within(b[k] as number, a, z)) err(w, `body.${String(k)}=${b[k]} outside ${a}–${z}`);
  if (b.tail?.count !== undefined && !within(b.tail.count, 1, 9)) err(w, 'tail count outside 1–9');
  if (b.extras && new Set(b.extras).size !== b.extras.length) err(w, 'repeats a body extra');

  // ecology
  const ec = s.ecology;
  if (!ec.habitats.length) err(w, 'no habitats');
  for (const h of ec.habitats) if (!BIOMES.includes(h)) err(w, `unknown habitat ${h}`);
  if (new Set(ec.habitats).size !== ec.habitats.length) err(w, 'repeats a habitat');
  if (!ec.foods.length) err(w, 'no foods');
  for (const wl of ec.weatherLove ?? []) if (!WEATHERS.includes(wl)) err(w, `unknown weather ${wl}`);
  if (ec.group[0] < 1 || ec.group[0] > ec.group[1]) err(w, `bad group size [${ec.group}]`);
  if (ec.social === 'solitary' && ec.group[1] > 3) err(w, 'solitary species spawns in a crowd');
  for (const p of ec.prey) {
    if (!lines.has(p)) err(w, `prey "${p}" is not an evolution-line id`);
    if (p === s.line) err(w, 'preys on its own line');
  }
  if (ec.diet === 'predator' && !ec.prey.length) (SEED_STARTERS.includes(s.id) ? warn : err)(w, 'predator with no prey lines');
  for (const r of ec.rivals) {
    if (!lines.has(r)) { err(w, `rival "${r}" is not an evolution-line id`); continue; }
    if (r === s.line) err(w, 'rivals its own line');
    if (!lines.get(r)!.some((o) => o.ecology.rivals.includes(s.line))) err(w, `rivalry with ${r} is not mutual (no ${r}-line species lists ${s.line})`);
  }
  if (mythic) { /* checked above */ }
  else if (ec.temperament === 'docile' && !within(ec.territory, 4, 8)) err(w, `docile territory ${ec.territory} outside 4–8`);
  else if (ec.temperament === 'territorial' && !within(ec.territory, 14, 25)) err(w, `territorial territory ${ec.territory} outside 14–25`);
  else if (!within(ec.territory, 4, 25)) err(w, `territory ${ec.territory} outside 4–25`);

  // traits
  if (new Set(s.traits).size !== s.traits.length) err(w, 'repeats a trait');
  for (const t of s.traits) if (!TRAITS.includes(t)) err(w, `unknown trait ${t}`);
  if (s.traits.includes('tiny') && !(s.height < 0.5)) err(w, `tiny trait but stands ${s.height} m`);
  if (s.traits.includes('fly') && !b.wings && b.arch !== 'spirit' && b.arch !== 'serpent') err(w, 'flies without wings');
}

for (const l of AWAKENING_LINES) {
  const line = lines.get(l);
  if (!line) err(`line ${l}`, 'required awakening line does not exist');
  else if (!line[line.length - 1].awakening) err(`line ${l}`, `final stage ${line[line.length - 1].id} is missing its awakening`);
}
for (const id of SEED_STARTERS) if (!species.has(id)) err(`species ${id}`, 'seed starter is missing');

// food web: who is eaten, who is never used
const hunted = new Set<string>();
for (const s of species.values()) for (const p of s.ecology.prey) hunted.add(p);
const unusedMoves = [...moves.keys()].filter((id) => !usedMoves.has(id));
if (unusedMoves.length) warn('moves', `not used by any species: ${unusedMoves.join(', ')}`);

// ------------------------------------------------------------------ report

const tally = (keys: string[], pick: (s: SpeciesDef) => string[]) => {
  const t: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const s of species.values()) for (const k of pick(s)) t[k] = (t[k] ?? 0) + 1;
  return t;
};
const row = (t: Record<string, number>) => Object.entries(t).map(([k, v]) => `${k} ${v}`).join(' · ');

const perElement = tally(ELEMENTS, (s) => s.elements);
const perArch = tally(ARCHES, (s) => [s.body.arch]);
const perHabitat = tally(BIOMES, (s) => s.ecology.habitats);
const perRarity = tally(['1', '2', '3', '4', '5'], (s) => [String(s.rarity)]);
const awakenings = [...species.values()].filter((s) => s.awakening).length;
const predators = [...species.values()].filter((s) => s.ecology.prey.length).length;
const rivalPairs = new Set<string>();
for (const s of species.values()) for (const r of s.ecology.rivals) rivalPairs.add([s.line, r].sort().join('↔'));

console.log('── Sumirei data ─────────────────────────────────────────────');
console.log(`moves    ${moves.size}  (fast ${fastMoves.length}, charged ${chargedMoves.length})   with effect: fast ${(fastFx * 100).toFixed(0)}% · charged ${(chargedFx * 100).toFixed(0)}%`);
console.log(`species  ${species.size}  in ${lines.size} lines   awakenings ${awakenings}   conditional evolutions ${evoWhen}/${evoTotal}`);
console.log('');
console.log('moves per element (fast/charged)');
console.log('  ' + ELEMENTS.map((e) => `${e} ${moveElem[e].fast}/${moveElem[e].charged}`).join(' · '));
console.log('moves per shape');
console.log('  ' + row(shapeCount));
console.log('species per element');
console.log('  ' + row(perElement));
console.log('species per arch');
console.log('  ' + row(perArch));
console.log('species per habitat');
console.log('  ' + row(perHabitat));
console.log('species per rarity');
console.log('  ' + row(perRarity));
console.log(`food web: ${predators} species hunt ${hunted.size} prey lines · ${rivalPairs.size} mutual rivalries (${[...rivalPairs].join(', ')})`);
console.log('');

if (warnings.length) {
  console.log(`${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  ~ ' + w);
  console.log('');
}
if (errors.length) {
  console.log(`${errors.length} error(s):`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('✓ all checks passed');
