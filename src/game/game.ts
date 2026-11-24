// The game itself: owns every system and the rules that join them — possession
// and pack switching, bonding with what you defeat, mastery and evolution,
// awakening, foraging, relic seals, sanctuaries, the clock and the weather.
import * as THREE from 'three';
import { InkRenderer } from '../render/renderer';
import { Sky, timeOfDay } from '../render/sky';
import { inkGlobals, resetBlobs } from '../render/inkMaterial';
import { Fx } from '../render/fx';
import { ELEMENT_INK } from '../render/palette';
import { ChunkManager, Flora } from '../world/chunks';
import { CollisionWorld } from '../world/colliders';
import { Water } from '../world/water';
import { Weather } from '../world/weather';
import { addGust, updatePressers, windUniforms } from '../world/wind';
import { BIOMES, groundAt, makeSample, regionAt, sampleTerrain } from '../world/terrain';
import { ALTARS, SITES, SPAWN_POINT, STONES, type AltarDef, type SiteDef } from '../data/world';
import { SPECIES, SPECIES_LIST, species } from '../data/species';
import { move as moveDef } from '../data/moves';
import type { BiomeId, ElementId, Individual, SpeciesDef, TimeOfDay } from '../data/types';
import { Input } from '../core/input';
import { DEFAULT_SETTINGS, SAVE_VERSION, saveGame, type SaveData, type Settings } from '../core/save';
import { clamp, damp, hash2 } from '../core/math';
import { InkOverlay } from '../ui/overlay';
import { Creature, rollIndividual, xpToNext } from './creature';
import { Combat, type HitEvent } from './combat';
import { makeBrain, updateFollower, updateWild, type AiWorld, type Brain } from './ai';
import { Spawner } from './spawner';
import { PlayerControl } from './player';

export type Mode = 'boot' | 'title' | 'starter' | 'play' | 'menu';

export interface P3 {
  x: number;
  y: number;
  z: number;
}
/** The slice of the audio engine the game talks to (the engine is plugged in at boot). */
export interface AudioPort {
  ready: boolean;
  unlock(): Promise<void>;
  setVolume(master: number, music: number, sfx: number): void;
  update(frame: unknown): void;
  footstep(surface: string, weightKg: number, wet: number, speed: number, pos?: P3): void;
  cry(seed: number, sizeMeters: number, mood: string, pos?: P3): void;
  moveFx(fx: string, phase: 'cast' | 'hit', power: number, pos?: P3): void;
  ui(kind: string): void;
  ink(kind: string): void;
  splash(size: number, pos?: P3): void;
  thunder(distance: number): void;
  stinger(kind: string): void;
  dash(pos?: P3): void;
  shield(pos?: P3): void;
}

export interface Toast {
  text: string;
  kanji?: string;
  kind: 'info' | 'bond' | 'level' | 'evolve' | 'seal' | 'warn';
}
export interface Prompt {
  key: string;
  text: string;
}
export interface Interactable {
  kind: 'berry' | 'stone' | 'altar' | 'sanctuary';
  x: number;
  y: number;
  z: number;
  label: string;
  ok: boolean;
  data?: unknown;
}

type Listener = (payload: any) => void;

export class Game {
  readonly R: InkRenderer;
  readonly sky = new Sky();
  readonly collision = new CollisionWorld();
  readonly chunks: ChunkManager;
  readonly water = new Water();
  readonly weather = new Weather();
  readonly fx = new Fx();
  readonly combat: Combat;
  readonly spawner = new Spawner();
  readonly input: Input;
  readonly control: PlayerControl;
  readonly overlay: InkOverlay;
  audio: AudioPort | null = null;

  mode: Mode = 'boot';
  hour = 6.4;
  day = 1;
  playTime = 0;
  /** real seconds per in-world hour */
  hourLength = 60;
  creatures: Creature[] = [];
  pack: Creature[] = [];
  active: Creature | null = null;
  roster: Individual[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  readonly journal = {
    seen: new Set<string>(),
    bonded: new Set<string>(),
    bondedLines: new Set<string>(),
    seals: new Set<string>(),
    sites: new Set<string>(),
    stones: new Set<string>(),
    foraged: new Set<string>(),
    lastSanctuary: 'sanct_spring',
    stats: { bonds: 0, faints: 0, steps: 0, evolutions: 0 },
  };
  /** which seal lies under which altar, decided from the bestiary at start-up */
  readonly sealAt = new Map<string, { altar: AltarDef; line: string; sp: SpeciesDef }>();
  region = '';
  biome: BiomeId = 'vale';
  tod: TimeOfDay = 'dawn';
  auraT = 0;
  hurt = 0;
  prompt: Prompt | null = null;
  focus: Interactable | null = null;
  switching = false;
  /** roofed places for rain shelter, filled by the site builder */
  shelters: { x: number; z: number; r: number }[] = [];
  /** creature the paused camera should frame (menu selection) */
  menuFocus: Creature | null = null;
  /** the radial pack wheel is up: the camera holds still */
  wheelOpen = false;
  /** lantern lights near the camera this frame, filled by the site builder */
  lanterns: { x: number; y: number; z: number; r: number }[] = [];
  /** camera orbit target for title / starter scenes */
  stage = { x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0, dist: 14, height: 4, look: 1.2 };
  fps = 60;
  private listeners = new Map<string, Listener[]>();
  private saveTimer = 20;
  private evoTimer = 2;
  private downT = 0;
  private menuK = 0;
  private aiWorld: AiWorld;
  private readonly s = makeSample();
  private readonly _v = new THREE.Vector3();
  private readonly _f = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, inkCanvas: HTMLCanvasElement) {
    this.R = new InkRenderer(canvas);
    this.chunks = new ChunkManager(this.collision);
    this.input = new Input(canvas);
    this.control = new PlayerControl(this.R.camera, this.input);
    this.overlay = new InkOverlay(inkCanvas);
    this.combat = new Combat(() => this.creatures, this.fx, this.collision);
    const sc = this.R.scene;
    sc.add(this.sky.mesh, this.chunks.group, this.water.group, this.weather.group, this.fx.group);
    this.chunks.onAtlas = (a) => {
      this.water.setAtlas(a);
      this.emit('atlas', a);
    };
    this.weather.onThunder = (d) => {
      this.audio?.thunder(d);
      this.control.addShake(d < 500 ? 0.5 : 0.15);
    };
    this.combat.hostile = (a, b) => {
      if (a.team !== b.team) return true;
      if (a.team === 'pack') return false;
      const ba = a.brain as Brain | null;
      const bb = b.brain as Brain | null;
      return ba?.target === b || bb?.target === a;
    };
    this.combat.onHit = (e) => this.onHit(e);
    this.combat.onFaint = (t, by) => this.onFaint(t, by);
    this.combat.onCast = (c, m, phase) => {
      if (phase === 'cast') this.audio?.moveFx(m.fx, 'cast', m.power, c.pos);
      if (phase === 'fire' && m.kind === 'charged' && c === this.active) this.control.addShake(0.3);
    };
    this.aiWorld = {
      creatures: this.creatures,
      combat: this.combat,
      player: () => this.active,
      hour: this.hour,
      tod: this.tod,
      weather: 'clear',
      shelters: this.shelters,
      onCry: (c, mood) => this.cry(c, mood),
    };
    this.assignSeals();
    this.applySettings();
    this.sky.update(this.hour, 0.3, 0, 0);
  }

  // ---------------------------------------------------------------- events

  on(ev: string, fn: Listener) {
    let l = this.listeners.get(ev);
    if (!l) this.listeners.set(ev, (l = []));
    l.push(fn);
  }
  emit(ev: string, payload?: unknown) {
    const l = this.listeners.get(ev);
    if (l) for (const fn of l) fn(payload);
  }
  toast(text: string, kind: Toast['kind'] = 'info', kanji?: string) {
    this.emit('toast', { text, kind, kanji } as Toast);
  }

  applySettings() {
    const s = this.settings;
    this.R.setQuality(s.quality);
    this.R.post.uniforms.uLine.value = 1.15 * s.lineWeight;
    this.control.sensitivity = s.sensitivity;
    this.control.invertY = s.invertY;
    this.audio?.setVolume(s.master, s.music, s.sfx);
  }

  /** Awakenable lines each take the free altar that best fits where they live. */
  private assignSeals() {
    const free = [...ALTARS];
    const lines = SPECIES_LIST.filter((sp) => sp.awakening).sort((a, b) => a.id.localeCompare(b.id));
    // starters keep their seals close to home so the first awakening is findable
    lines.sort((a, b) => (a.rarity === 5 ? 1 : 0) - (b.rarity === 5 ? 1 : 0));
    for (const sp of lines) {
      const first = SPECIES[sp.line];
      const habitats: string[] = [...sp.ecology.habitats, ...(first ? first.ecology.habitats : [])];
      let i = free.findIndex((a) => habitats.includes(a.biome));
      if (i < 0) i = 0;
      if (!free.length) break;
      const altar = free.splice(i, 1)[0];
      this.sealAt.set(sp.awakening!.seal, { altar, line: sp.line, sp });
    }
  }

  // ---------------------------------------------------------------- creatures

  addCreature(c: Creature) {
    this.creatures.push(c);
    this.R.scene.add(c.rig.root);
    if (c.team === 'wild') this.journal.seen.add(c.sp.id);
  }
  removeCreature(c: Creature) {
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    this.combat.forget(c);
    this.spawner.forget(c);
    c.dispose();
  }

  private cry(c: Creature, mood: 'call' | 'alarm' | 'hurt' | 'faint' | 'happy') {
    let h = 0;
    for (let i = 0; i < c.sp.line.length; i++) h = (h * 31 + c.sp.line.charCodeAt(i)) >>> 0;
    this.audio?.cry(h + c.sp.stage, c.height, mood, c.pos);
  }

  private spawnPack(ind: Individual, x: number, z: number, yaw = 0): Creature {
    const c = new Creature(ind);
    c.team = 'pack';
    c.brain = makeBrain(c);
    c.place(x, z, yaw);
    this.addCreature(c);
    this.pack.push(c);
    this.reslot();
    this.journal.seen.add(c.sp.id);
    this.journal.bonded.add(c.sp.id);
    this.journal.bondedLines.add(c.sp.line);
    return c;
  }
  private reslot() {
    let n = 0;
    for (const c of this.pack) if (c !== this.active) (c.brain as Brain).slot = n++;
  }

  // ---------------------------------------------------------------- starting and loading

  async newGame(starterId: string) {
    this.clearWorld();
    const ind = rollIndividual(starterId, 5);
    ind.home = 'pack';
    ind.shiny = false;
    const c = this.spawnPack(ind, SPAWN_POINT.x, SPAWN_POINT.z, Math.PI);
    this.setActive(c);
    this.hour = 6.6;
    this.day = 1;
    this.weather.set('clear', true);
    this.control.snapBehind(c);
    this.mode = 'play';
    this.fx.petals(c.pos.x, c.pos.y + c.height, c.pos.z, 40, 4);
    this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, c.height * 1.5);
    this.cry(c, 'happy');
    this.toast(`${c.sp.name} wakes beside the spring`, 'bond', c.sp.kanji);
    this.save();
  }

  loadSave(d: SaveData) {
    this.clearWorld();
    this.settings = { ...DEFAULT_SETTINGS, ...d.settings };
    this.applySettings();
    this.hour = d.hour;
    this.day = d.day;
    this.playTime = d.playTime;
    this.weather.set(d.weather, true);
    const j = this.journal;
    d.seen.forEach((s) => j.seen.add(s));
    d.bonded.forEach((s) => {
      j.bonded.add(s);
      if (SPECIES[s]) j.bondedLines.add(SPECIES[s].line);
    });
    d.seals.forEach((s) => j.seals.add(s));
    d.sites.forEach((s) => j.sites.add(s));
    d.stones.forEach((s) => j.stones.add(s));
    d.foraged.forEach((s) => j.foraged.add(s));
    j.lastSanctuary = d.lastSanctuary;
    Object.assign(j.stats, d.stats);
    this.roster = d.roster.filter((i) => SPECIES[i.species]);
    const pack = d.pack.filter((i) => SPECIES[i.species]);
    if (!pack.length) return this.newGame(SPECIES_LIST.find((s) => s.starter)!.id);
    pack.forEach((ind, i) => this.spawnPack(ind, d.pos.x + (i ? Math.cos(i * 1.7) * (1.5 + i * 0.4) : 0), d.pos.z + (i ? Math.sin(i * 1.7) * (1.5 + i * 0.4) : 0), d.pos.yaw));
    const act = this.pack[clamp(d.active, 0, this.pack.length - 1)];
    this.setActive(act);
    this.control.snapBehind(act);
    this.mode = 'play';
  }

  private clearWorld() {
    for (const c of [...this.creatures]) this.removeCreature(c);
    this.pack.length = 0;
    this.roster.length = 0;
    this.active = null;
    const j = this.journal;
    j.seen.clear();
    j.bonded.clear();
    j.bondedLines.clear();
    j.seals.clear();
    j.sites.clear();
    j.stones.clear();
    j.foraged.clear();
    j.lastSanctuary = 'sanct_spring';
    j.stats = { bonds: 0, faints: 0, steps: 0, evolutions: 0 };
    this.region = '';
  }

  snapshot(): SaveData {
    const a = this.active;
    const j = this.journal;
    for (const c of this.pack) c.ind.hp = c.hp;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playTime: this.playTime,
      day: this.day,
      hour: this.hour,
      weather: this.weather.current,
      pack: this.pack.map((c) => c.ind),
      active: Math.max(0, a ? this.pack.indexOf(a) : 0),
      roster: this.roster,
      pos: a ? { x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw } : { x: SPAWN_POINT.x, y: 0, z: SPAWN_POINT.z, yaw: 0 },
      seen: [...j.seen],
      bonded: [...j.bonded],
      seals: [...j.seals],
      sites: [...j.sites],
      stones: [...j.stones],
      foraged: [...j.foraged],
      lastSanctuary: j.lastSanctuary,
      stats: { ...j.stats },
      settings: { ...this.settings },
    };
  }
  save() {
    if (!this.active) return;
    saveGame(this.snapshot()).catch((e) => console.warn('save failed', e));
  }

  // ---------------------------------------------------------------- possession

  private setActive(c: Creature) {
    if (this.active) this.active.controlled = false;
    this.active = c;
    c.controlled = true;
    this.control.chargedSlot = 0;
    this.reslot();
    this.emit('active', c);
  }

  /** Pour your awareness into another member of the pack. */
  async switchTo(index: number, quiet = false) {
    const next = this.pack[index];
    const cur = this.active;
    if (!next || next === cur || this.switching || next.fainted || this.mode !== 'play') {
      if (next && next.fainted && !quiet) this.toast(`${next.ind.nickname ?? next.sp.name} cannot answer`, 'warn');
      return;
    }
    this.switching = true;
    this.audio?.ink('swirl');
    if (cur) {
      this.fx.inkBurst(cur.pos.x, cur.pos.y + cur.height * 0.6, cur.pos.z, cur.height);
      cur.intent.mx = cur.intent.mz = 0;
    }
    // the swirl closes on where the new body is on screen
    this._v.copy(next.pos).setY(next.pos.y + next.height * 0.6).project(this.R.camera);
    const sx = this._v.z < 1 ? clamp(this._v.x * 0.5 + 0.5, 0.1, 0.9) : 0.5;
    const sy = this._v.z < 1 ? clamp(0.5 - this._v.y * 0.5, 0.1, 0.9) : 0.5;
    await this.overlay.through(
      'swirl',
      () => {
        this.setActive(next);
        this.control.snapBehind(next);
        this.fx.petals(next.pos.x, next.pos.y + next.height * 0.7, next.pos.z, 26, 3.5);
        this.fx.inkBurst(next.pos.x, next.pos.y + next.height * 0.6, next.pos.z, next.height);
        addGust(next.pos.x, next.pos.z, 0.8);
        this.cry(next, 'call');
      },
      { inDur: 0.26, outDur: 0.42, x: sx, y: sy, out: 'bloom' },
    );
    this.switching = false;
  }

  /** Send a pack member to rest at the last sanctuary. */
  dismiss(c: Creature) {
    if (c === this.active || this.pack.length <= 1) return false;
    const i = this.pack.indexOf(c);
    if (i < 0) return false;
    this.pack.splice(i, 1);
    c.ind.hp = c.hp;
    c.ind.home = this.journal.lastSanctuary;
    this.roster.push(c.ind);
    this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, c.height);
    this.removeCreature(c);
    this.reslot();
    return true;
  }
  /** Call a resting creature to the pack. */
  summon(ind: Individual) {
    const a = this.active;
    if (!a || this.pack.length >= 6) return false;
    const i = this.roster.indexOf(ind);
    if (i < 0) return false;
    this.roster.splice(i, 1);
    ind.home = 'pack';
    const ang = Math.random() * 6.28;
    const c = this.spawnPack(ind, a.pos.x + Math.cos(ang) * (2 + a.radius), a.pos.z + Math.sin(ang) * (2 + a.radius), a.yaw);
    this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, c.height);
    this.fx.petals(c.pos.x, c.pos.y + c.height, c.pos.z, 20, 3);
    return true;
  }
  atSanctuary(): SiteDef | null {
    const a = this.active;
    if (!a) return null;
    for (const s of SITES) {
      if (s.kind !== 'sanctuary' && s.kind !== 'spring') continue;
      if (Math.hypot(s.x - a.pos.x, s.z - a.pos.z) < 16) return s;
    }
    return null;
  }

  // ---------------------------------------------------------------- combat outcomes

  private onHit(e: HitEvent) {
    const t = e.target;
    if (e.dodged) {
      if (t === this.active) this.emit('float', { x: e.x, y: e.y + t.height * 0.5, z: e.z, text: 'slip', kind: 'miss' });
      return;
    }
    this.audio?.moveFx(e.move?.fx ?? 'thump', 'hit', e.damage, e);
    if (t === this.active) {
      this.hurt = Math.min(1, this.hurt + 0.25 + e.damage / t.maxHp);
      this.control.addShake(0.25 + (e.damage / t.maxHp) * 1.5);
    }
    if (e.attacker === this.active || t === this.active || t.team === 'pack' || e.attacker?.team === 'pack') {
      this.emit('float', { x: e.x, y: e.y + t.height * 0.4, z: e.z, text: String(e.damage), kind: e.blocked ? 'block' : e.eff > 1.2 ? 'strong' : e.eff < 0.8 ? 'weak' : e.crit ? 'crit' : 'hit' });
    }
    const b = t.brain as Brain | null;
    if (b && e.attacker && t.team === 'wild') b.grudge = e.attacker;
    if (t.hp > 0 && Math.random() < 0.25) this.cry(t, 'hurt');
  }

  private onFaint(t: Creature, by: Creature | null) {
    this.cry(t, 'faint');
    this.fx.inkBurst(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z, t.height * 0.8);
    if (t.team === 'wild') {
      if (by && by.team === 'pack') {
        this.reward(t);
        (t.brain as Brain).mood = 'yield';
        setTimeout(() => this.bond(t), 1500);
      }
    } else {
      this.journal.stats.faints++;
      if (t === this.active) this.downT = 1.2;
    }
  }

  private reward(defeated: Creature) {
    const base = Math.round((16 + defeated.level * 6) * (1 + (defeated.sp.rarity - 1) * 0.35));
    for (const c of this.pack) {
      if (c.fainted) continue;
      this.gainXp(c, c === this.active ? base : Math.round(base * 0.5));
    }
  }

  gainXp(c: Creature, amount: number) {
    c.ind.xp += amount;
    let leveled = false;
    while (c.ind.xp >= xpToNext(c.ind.level) && c.ind.level < 60) {
      c.ind.xp -= xpToNext(c.ind.level);
      c.ind.level++;
      leveled = true;
    }
    if (leveled) {
      c.refreshStats();
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.25);
      this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius, c.radius * 3 + 1, '#d6a94a', 0.7);
      this.fx.petals(c.pos.x, c.pos.y + c.height, c.pos.z, 12, 2.5);
      if (c === this.active) {
        this.toast(`${c.ind.nickname ?? c.sp.name} reached mastery ${c.ind.level}`, 'level');
        this.audio?.stinger('levelup');
      }
      // new moves open up as mastery grows
      const sp = c.sp;
      if (!c.ind.charged2 && sp.charged.length > 1 && c.ind.level >= 10) c.ind.charged2 = sp.charged.find((m) => m !== c.ind.charged);
      this.checkEvolution(c, null);
    }
  }

  /** Bond with a defeated wild creature. */
  private bond(t: Creature) {
    if (!t.alive || t.team !== 'wild') return;
    const j = this.journal;
    j.stats.bonds++;
    j.bonded.add(t.sp.id);
    j.bondedLines.add(t.sp.line);
    t.fainted = false;
    t.action = 'none';
    t.hp = Math.round(t.maxHp * 0.5);
    t.statuses.clear();
    t.energy = 0;
    t.ind.home = 'pack';
    this.fx.petals(t.pos.x, t.pos.y + t.height, t.pos.z, 34, 4);
    this.fx.ring(t.pos.x, t.groundY, t.pos.z, t.radius, t.radius * 3 + 1.5, '#c8553d', 0.8);
    this.audio?.stinger('bond');
    this.cry(t, 'happy');
    if (this.pack.length < 6) {
      t.team = 'pack';
      t.brain = makeBrain(t);
      t.lastHitBy = null;
      this.pack.push(t);
      this.reslot();
      this.toast(`${t.sp.name} joins your pack`, 'bond', t.sp.kanji);
    } else {
      t.ind.hp = t.hp;
      t.ind.home = j.lastSanctuary;
      this.roster.push(t.ind);
      this.toast(`${t.sp.name} will wait at the sanctuary`, 'bond', t.sp.kanji);
      setTimeout(() => {
        if (!t.alive) return;
        this.fx.inkBurst(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z, t.height);
        this.removeCreature(t);
      }, 1200);
    }
    this.emit('bond', t);
    this.save();
  }

  // ---------------------------------------------------------------- evolution and awakening

  private checkEvolution(c: Creature, stone: ElementId | null): boolean {
    const evs = c.sp.evolvesTo;
    if (!evs || c.fainted || c.awakened > 0) return false;
    for (const ev of evs) {
      if (c.ind.level < ev.level || !SPECIES[ev.to]) continue;
      const w = ev.when;
      if (w) {
        if (w.time && w.time !== this.tod) continue;
        if (w.weather && w.weather !== this.weather.current) continue;
        if (w.biome && w.biome !== BIOMES[sampleTerrain(c.pos.x, c.pos.z, this.s).biome]) continue;
        if (w.stone && w.stone !== stone) continue;
      } else if (stone) continue;
      this.evolve(c, SPECIES[ev.to]);
      return true;
    }
    return false;
  }

  private evolve(c: Creature, to: SpeciesDef) {
    const from = c.sp;
    const ratio = c.hp / c.maxHp;
    this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z, c.height * 1.6);
    c.rebuild(to, false);
    c.hp = Math.max(1, Math.round(c.maxHp * Math.max(ratio, 0.6)));
    // carry moves forward where the new form still knows them
    if (!to.fast.includes(c.ind.fast)) c.ind.fast = to.fast[0];
    if (!to.charged.includes(c.ind.charged)) c.ind.charged = to.charged[0];
    c.ind.charged2 = to.charged.find((m) => m !== c.ind.charged);
    this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z, c.height * 1.4, ELEMENT_INK[to.elements[0]]);
    this.fx.petals(c.pos.x, c.pos.y + c.height, c.pos.z, 50, 5);
    this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius, c.radius * 5 + 2, '#1d1a1a', 1);
    addGust(c.pos.x, c.pos.z, 1.2);
    const j = this.journal;
    j.seen.add(to.id);
    j.bonded.add(to.id);
    j.stats.evolutions++;
    this.audio?.stinger('evolve');
    this.cry(c, 'happy');
    this.toast(`${from.name} becomes ${to.name}`, 'evolve', to.kanji);
    if (c === this.active) {
      this.control.addShake(0.5);
      this.emit('active', c);
    }
    this.save();
  }

  /** Awaken the inhabited creature if it holds its seal and its ink is full. */
  awaken(): boolean {
    const c = this.active;
    if (!c || c.fainted || c.awakened > 0) return false;
    const aw = c.sp.awakening;
    if (!aw) {
      this.toast('This form has no seal to answer', 'warn');
      return false;
    }
    if (!this.journal.seals.has(aw.seal)) {
      this.toast('Its seal still lies buried', 'warn');
      return false;
    }
    if (c.energy < 100) {
      this.toast('The ink must be full to awaken', 'warn');
      return false;
    }
    c.energy = 0;
    c.awakened = 45;
    const ratio = c.hp / c.maxHp;
    this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z, c.height * 2);
    c.rebuild(c.sp, true);
    c.hp = Math.round(c.maxHp * Math.min(1, ratio + 0.25));
    this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius, c.radius * 6 + 3, aw.tint, 0.9);
    this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius * 0.5, c.radius * 4 + 2, '#1d1a1a', 1.2);
    this.fx.petals(c.pos.x, c.pos.y + c.height, c.pos.z, 60, 6);
    addGust(c.pos.x, c.pos.z, 1.5);
    this.control.addShake(0.8);
    this.control.snapBehind(c);
    this.R.post.uniforms.uFlash.value = 0.7;
    this.audio?.stinger('awaken');
    this.toast(aw.name, 'evolve', aw.kanji);
    this.emit('active', c);
    return true;
  }

  // ---------------------------------------------------------------- the world you touch

  private findFocus(a: Creature): Interactable | null {
    let best: Interactable | null = null;
    let bd = 1e9;
    const reach = 2.2 + a.radius * 1.5;
    const consider = (it: Interactable) => {
      const d = Math.hypot(it.x - a.pos.x, it.z - a.pos.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    };
    this.chunks.nearProps(a.pos.x, a.pos.z, reach, (p) => {
      if (p.kind !== Flora.Berry) return;
      const key = `${Math.round(p.x)}_${Math.round(p.z)}`;
      if (this.journal.foraged.has(key)) return;
      consider({ kind: 'berry', x: p.x, y: p.y, z: p.z, label: 'Forage berries', ok: true, data: key });
    });
    for (const st of STONES) {
      if (Math.hypot(st.x - a.pos.x, st.z - a.pos.z) > reach + 1.5) continue;
      consider({ kind: 'stone', x: st.x, y: groundAt(st.x, st.z), z: st.z, label: `Touch the ${st.element} stone`, ok: true, data: st });
    }
    for (const [seal, e] of this.sealAt) {
      if (this.journal.seals.has(seal)) continue;
      const al = e.altar;
      if (Math.hypot(al.x - a.pos.x, al.z - a.pos.z) > reach + 2) continue;
      const ok = !al.gate || this.pack.some((c) => c.has(al.gate!) && !c.fainted);
      consider({ kind: 'altar', x: al.x, y: Math.max(groundAt(al.x, al.z), 0), z: al.z, label: ok ? 'Unearth the seal' : `Sealed — needs a spirit that can ${al.gate}`, ok, data: seal });
    }
    return best;
  }

  interact() {
    const a = this.active;
    const f = this.focus;
    if (!a || !f) return;
    if (!f.ok) {
      this.toast(f.label, 'warn');
      this.audio?.ui('error');
      return;
    }
    if (f.kind === 'berry') {
      this.journal.foraged.add(f.data as string);
      a.setAction('eat', 1);
      a.action = 'eat';
      setTimeout(() => a.action === 'eat' && (a.action = 'none'), 900);
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.3);
      for (const c of this.pack) if (!c.fainted) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.12);
      this.fx.leaves(f.x, f.y + 0.6, f.z, 10, '#7d8f5c');
      this.fx.droplets(f.x, f.y + 0.6, f.z, 8, 2, '#c8553d', 6, 0.06);
      this.gainXp(a, 6 + a.level);
      this.audio?.ui('select');
    } else if (f.kind === 'stone') {
      const st = f.data as { element: ElementId; x: number; z: number };
      this.journal.stones.add(`${st.element}_${st.x}`);
      this.fx.ring(f.x, f.y, f.z, 0.5, 4, ELEMENT_INK[st.element], 0.8);
      this.fx.droplets(f.x, f.y + 1, f.z, 16, 2.5, ELEMENT_INK[st.element], -1, 0.08);
      let any = false;
      for (const c of this.pack) if (Math.hypot(c.pos.x - f.x, c.pos.z - f.z) < 8 && this.checkEvolution(c, st.element)) any = true;
      if (!any) this.toast(`The ${st.element} stone hums, then stills`, 'info');
    } else if (f.kind === 'altar') {
      const seal = f.data as string;
      const e = this.sealAt.get(seal)!;
      this.journal.seals.add(seal);
      this.fx.inkBurst(f.x, f.y + 0.6, f.z, 1.6);
      this.fx.ring(f.x, f.y, f.z, 0.5, 6, '#c8553d', 1);
      this.fx.petals(f.x, f.y + 1, f.z, 40, 4);
      this.audio?.stinger('discover');
      this.toast(`Seal of ${e.sp.awakening!.name} unearthed`, 'seal', e.sp.awakening!.kanji);
      this.save();
    }
    this.focus = null;
  }

  /** Heightened senses: reveal buried seals, stones and living things nearby. */
  aura() {
    const a = this.active;
    if (!a || this.auraT > 0.5) return;
    this.auraT = 6;
    this.fx.ring(a.pos.x, a.groundY, a.pos.z, a.radius, 30, '#c79ad1', 1.4);
    this.fx.ring(a.pos.x, a.groundY, a.pos.z, a.radius, 14, '#1d1a1a', 1.0);
    this.audio?.ink('bloom');
    for (const [seal, e] of this.sealAt) {
      if (this.journal.seals.has(seal)) continue;
      const al = e.altar;
      const d = Math.hypot(al.x - a.pos.x, al.z - a.pos.z);
      if (d < 140) {
        const y = Math.max(groundAt(al.x, al.z), 0);
        for (let i = 0; i < 4; i++) setTimeout(() => this.fx.ring(al.x, y, al.z, 0.4, 5, '#c8553d', 1.2), i * 500);
      }
    }
    for (const c of this.creatures) if (c.team === 'wild' && Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z) < 60) c.flash = 0.7;
    this.emit('aura');
  }

  /** Nearest undiscovered seal altar, for the compass while senses are heightened. */
  nearestSeal(): { x: number; z: number; d: number; hint: string } | null {
    const a = this.active;
    if (!a) return null;
    let best: { x: number; z: number; d: number; hint: string } | null = null;
    for (const [seal, e] of this.sealAt) {
      if (this.journal.seals.has(seal)) continue;
      const d = Math.hypot(e.altar.x - a.pos.x, e.altar.z - a.pos.z);
      if (!best || d < best.d) best = { x: e.altar.x, z: e.altar.z, d, hint: e.altar.hint };
    }
    return best;
  }

  private surfaceUnder(c: Creature): string {
    if (c.waterDepth > 0.05) return 'water';
    if (c.groundY > groundAt(c.pos.x, c.pos.z) + 0.05) return 'wood';
    sampleTerrain(c.pos.x, c.pos.z, this.s);
    if (this.s.pathD < 2.4) return 'dirt';
    switch (BIOMES[this.s.biome]) {
      case 'beach': return 'sand';
      case 'snow': return 'snow';
      case 'volcanic': return 'ash';
      case 'marsh': return 'mud';
      case 'deepwood': case 'bamboo': return 'leaves';
      case 'cliff': return 'stone';
      default: return 'grass';
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt: number) {
    const R = this.R;
    const inp = this.input;
    this.fps = damp(this.fps, 1 / Math.max(dt, 1e-3), 2, dt);
    const paused = this.mode === 'menu';
    const sim = this.mode === 'play' && !paused;
    const wdt = paused ? dt * 0.35 : dt;
    windUniforms.uTime.value += wdt;
    resetBlobs();

    if (sim) {
      this.playTime += dt;
      this.hour += dt / this.hourLength;
      if (this.hour >= 24) {
        this.hour -= 24;
        this.day++;
        this.journal.foraged.clear();
      }
    }
    this.tod = timeOfDay(this.hour);

    const a = this.active;
    const cam = R.camera;

    // ---- input → inhabited body
    if (a && sim) {
      this.control.drive(a, this.combat, this.creatures, dt, inp.locked && !this.switching && !a.fainted && !this.wheelOpen);
      if (inp.locked && !this.switching && !this.wheelOpen) {
        for (let i = 0; i < 6; i++) if (inp.hit(('pack' + (i + 1)) as 'pack1')) this.switchTo(i);
        if (inp.hit('interact')) this.interact();
        if (inp.hit('aura')) this.aura();
        if (inp.hit('awaken')) this.awaken();
        if (inp.hit('dodge')) this.audio?.dash(a.pos);
        if (inp.hit('shield') && a.shieldT > 1.2) this.audio?.shield(a.pos);
      }
    } else if (a) {
      a.intent.mx = a.intent.mz = 0;
      a.intent.jump = a.intent.ascend = a.intent.descend = false;
    }

    // ---- minds
    if (sim) {
      const w = this.aiWorld;
      w.hour = this.hour;
      w.tod = this.tod;
      w.weather = this.weather.current;
      this.combat.weather = this.weather.current;
      for (const c of this.creatures) {
        if (c.controlled) continue;
        if (c.team === 'pack') updateFollower(c, w, dt);
        else updateWild(c, w, dt);
      }
      this.spawner.update(dt, {
        creatures: this.creatures,
        add: (c) => this.addCreature(c),
        remove: (c) => this.removeCreature(c),
        player: () => this.active,
        tod: this.tod,
        weather: this.weather.current,
        bondedLines: this.journal.bondedLines,
        maxWild: this.settings.quality === 'low' ? 16 : 26,
      });
    }

    // ---- bodies
    if (this.mode === 'play' || paused) {
      for (const c of this.creatures) {
        if (paused && c.team !== 'pack') continue;
        if (paused) c.intent.mx = c.intent.mz = 0;
        c.step(paused ? dt * 0.6 : dt, this.collision);
        if (c.fainted) c.faintT += dt;
        if (!sim) continue;
        // feet, splashes, landings
        if (c.stepped) {
          const near = !a || Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z) < 40;
          if (near) this.audio?.footstep(this.surfaceUnder(c), c.sp.weight, this.weather.look.wet, Math.min(1, Math.hypot(c.vel.x, c.vel.z) / 7), c.pos);
          if (c === a) this.journal.stats.steps++;
          if (c.waterDepth > 0.03) this.fx.droplets(c.pos.x, c.waterLevel, c.pos.z, 3, 1.5, '#e8f1ee', 8, 0.04);
          else if (c.height > 1.2 || c.intent.sprint) this.fx.dust(c.pos.x, c.groundY, c.pos.z, 1, '#cdbf9c', 0.12 + c.height * 0.08);
        }
        if (c.landed > 4) {
          this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius * 0.6, c.radius * 2 + c.landed * 0.08, '#3a3433', 0.35);
          this.fx.dust(c.pos.x, c.groundY, c.pos.z, 5);
          addGust(c.pos.x, c.pos.z, clamp(c.landed * 0.05 * c.height, 0.2, 1.2));
          if (c === a && c.height > 1.5) this.control.addShake(0.2);
        }
        if (c.waterDepth > 0.08 && c.waterLevel > -1e8 && c.pos.y < c.waterLevel + 0.1) this.water.addWader(c.pos.x, c.pos.z, Math.max(0.35, c.radius * 1.2), Math.hypot(c.vel.x, c.vel.z) > 0.5 ? 1.6 : 0.8);
        // bodies shoulder each other apart
        if (c.team === 'pack' && !c.fainted)
          for (const o of this.pack) {
            if (o === c || o.fainted) continue;
            const dx = c.pos.x - o.pos.x;
            const dz = c.pos.z - o.pos.z;
            const rr = (c.radius + o.radius) * 0.85;
            const d2 = dx * dx + dz * dz;
            if (d2 < rr * rr && d2 > 1e-5) {
              const d = Math.sqrt(d2);
              const k = ((rr - d) / d) * 0.5 * (c.controlled ? 0.15 : 1);
              c.pos.x += dx * k;
              c.pos.z += dz * k;
            }
          }
        // awakening runs out
        if (c.awakened > 0) {
          c.awakened -= dt;
          if (Math.random() < dt * 8) this.fx.spawn({ x: c.pos.x + (Math.random() - 0.5) * c.radius * 2, y: c.pos.y + Math.random() * c.height, z: c.pos.z + (Math.random() - 0.5) * c.radius * 2, vy: 1.5, life: 0.7, size: 0.1 + c.height * 0.05, color: c.sp.awakening?.tint ?? '#c79ad1', shape: 2, drag: 1 });
          if (c.awakened <= 0) {
            const ratio = c.hp / c.maxHp;
            this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, c.height);
            c.rebuild(c.sp, false);
            c.hp = Math.max(1, Math.round(c.maxHp * ratio));
            if (c === a) this.emit('active', c);
          }
        }
        // rest mends: out of a fight, the pack slowly recovers and the fallen rise
        if (c.team === 'pack') {
          if (c.fainted) {
            if (c.faintT > 28 && (!a || a.inCombat <= 0) && c !== a) {
              c.fainted = false;
              c.action = 'none';
              c.hp = Math.round(c.maxHp * 0.35);
              this.fx.petals(c.pos.x, c.pos.y + c.height, c.pos.z, 10, 2);
            }
          } else if (c.inCombat <= 0 && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.012 * dt);
          // followers left far behind arrive in a blot of ink
          if (a && c !== a && !c.fainted && Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z) > 58) {
            const ang = a.yaw + Math.PI + (Math.random() - 0.5);
            c.place(a.pos.x + Math.sin(ang) * (4 + a.radius), a.pos.z + Math.cos(ang) * (4 + a.radius), a.yaw);
            this.fx.inkBurst(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, c.height);
          }
        }
      }
    }
    if (sim) this.combat.update(dt);

    // ---- the inhabited one falls
    if (sim && a && a.fainted && !this.switching) {
      this.downT -= dt;
      if (this.downT <= 0) {
        const next = this.pack.findIndex((c) => !c.fainted);
        if (next >= 0) this.switchTo(next, true);
        else this.blackout();
      }
    }

    // ---- sanctuaries, sites, regions
    if (sim && a) {
      const here = this.atSanctuary();
      if (here) {
        this.journal.lastSanctuary = here.id;
        for (const c of this.pack) {
          if (c.fainted && (a.inCombat <= 0 || c !== a)) {
            if (a.inCombat <= 0) {
              c.fainted = false;
              c.action = 'none';
              c.hp = Math.round(c.maxHp * 0.4);
            }
          } else if (a.inCombat <= 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.1 * dt);
        }
      }
      this.evoTimer -= dt;
      if (this.evoTimer <= 0) {
        this.evoTimer = 2.5;
        for (const c of this.pack) if (c.inCombat <= 0 && this.checkEvolution(c, null)) break;
        sampleTerrain(a.pos.x, a.pos.z, this.s);
        this.biome = BIOMES[this.s.biome];
        const reg = regionAt(a.pos.x, a.pos.z);
        if (this.biome !== 'sea' && reg.id !== this.region) {
          this.region = reg.id;
          this.emit('region', reg);
        }
        for (const s of SITES) {
          if (this.journal.sites.has(s.id)) continue;
          if (Math.hypot(s.x - a.pos.x, s.z - a.pos.z) < Math.max(26, s.pad + 12)) {
            this.journal.sites.add(s.id);
            this.emit('site', s);
            this.audio?.stinger('discover');
          }
        }
      }
      this.focus = this.findFocus(a);
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 30;
        if (a.inCombat <= 0) this.save();
      }
    }
    this.auraT = Math.max(0, this.auraT - dt);
    this.hurt = Math.max(0, this.hurt - dt * 0.7);

    // ---- camera
    if ((this.mode === 'play' || paused) && a) {
      const subject = paused && this.menuFocus && this.menuFocus.alive ? this.menuFocus : a;
      if (subject !== this.camSubject) {
        this.camSubject = subject;
        if (paused) this.control.snapBehind(subject);
      }
      this.control.updateCamera(subject, dt, paused ? 0.07 : 0, paused ? 0.5 : 1);
    } else {
      const st = this.stage;
      st.yaw += dt * 0.05;
      const gy = Math.max(groundAt(st.x, st.z), 0);
      cam.position.set(st.x + Math.sin(st.yaw) * st.dist, gy + st.height, st.z + Math.cos(st.yaw) * st.dist);
      const cg = groundAt(cam.position.x, cam.position.z) + 0.6;
      if (cam.position.y < cg) cam.position.y = cg;
      cam.lookAt(st.x, gy + st.look, st.z);
    }
    // the menu slides the subject to the right-hand side of the sheet
    this.menuK = damp(this.menuK, paused ? 1 : 0, 6, dt);
    if (this.menuK > 0.002) cam.setViewOffset(R.width, R.height, -R.width * 0.25 * this.menuK, R.height * 0.04 * this.menuK, R.width, R.height);
    else if (cam.view && cam.view.enabled) cam.clearViewOffset();

    // ---- sky, weather, light
    const focusPos = a && this.mode !== 'title' && this.mode !== 'starter' ? a.pos : this._v.set(this.stage.x, groundAt(this.stage.x, this.stage.z), this.stage.z);
    if (!a || this.mode === 'title' || this.mode === 'starter') {
      sampleTerrain(this.stage.x, this.stage.z, this.s);
      this.biome = BIOMES[this.s.biome];
    }
    this.weather.update(wdt, cam.position, this.biome, this.hour, cam.position.y);
    const L = this.weather.look;
    this.sky.update(this.hour, L.cover, L.gloom, L.haze, this.weather.hazeTint);
    this.sky.uniforms.uFlashSky.value = this.weather.flash * 0.8;
    const pu = R.post.uniforms;
    pu.uPlate.value.copy(this.sky.plate);
    pu.uMenu.value = this.menuK;
    pu.uUnder.value = damp(pu.uUnder.value, this.control.camUnderwater && this.mode === 'play' ? 1 : 0, 8, dt);
    pu.uHurt.value = this.hurt;
    pu.uFlash.value = Math.max(this.weather.flash * 0.5, pu.uFlash.value - dt * 2.5);
    pu.uFrame.value = this.settings.frame ? 14 * R.dpr : 0;
    R.setShadowRange(a ? clamp(26 + a.height * 22, 34, 90) : 60);
    R.aimSun(this._f.copy(focusPos), this.sky.lightDir);

    // warm pools: the inhabited creature if it glows, plus awakened bodies
    let gi = 0;
    const glows = inkGlobals.uGlows.value;
    for (const c of this.pack) {
      if (gi >= glows.length) break;
      if (c.fainted) continue;
      if (c.has('glow') || c.awakened > 0) glows[gi++].set(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z, 7 + c.height * 3);
    }
    // then the nearest lit lanterns
    for (const g of this.lanterns) {
      if (gi >= glows.length) break;
      glows[gi++].set(g.x, g.y, g.z, g.r);
    }
    for (let i = gi; i < glows.length; i++) glows[i].w = 0;

    // ---- world streaming and effects
    this.chunks.update(cam.position);
    this.water.update(cam.position);
    updatePressers(dt, cam.position.x, cam.position.z);
    this.fx.update(wdt);
    this.overlay.update(dt);

    // ---- sound
    if (this.audio?.ready) {
      cam.getWorldDirection(this._v);
      const still = a ? clamp(1 - Math.hypot(a.vel.x, a.vel.z) / 1.5, 0, 1) : 1;
      this.stillness = damp(this.stillness, still > 0.9 ? 1 : 0, still > 0.9 ? 0.25 : 2, dt);
      const overDeck = a ? a.groundY > groundAt(a.pos.x, a.pos.z) + 0.05 : false;
      let cover: 'open' | 'roof' | 'canopy' = this.biome === 'deepwood' || this.biome === 'bamboo' ? 'canopy' : 'open';
      if (a) for (const s of this.shelters) if (Math.hypot(s.x - a.pos.x, s.z - a.pos.z) < s.r) cover = 'roof';
      this.audio.update({
        dt,
        listener: cam.position,
        forward: this._v,
        windSpeed: windUniforms.uWindStrength.value,
        weather: this.weather.current,
        weatherIntensity: this.weather.intensity,
        cover: overDeck ? 'roof' : cover,
        nearWater: a ? clamp(1 - Math.min(Math.abs(this.s.riverD), 60) / 40, 0, 1) + (a.waterDepth > 0 ? 0.6 : 0) : 0.4,
        underwater: this.control.camUnderwater && this.mode === 'play',
        hour: this.hour,
        stillness: this.mode === 'play' ? this.stillness : 0.9,
        scenic: a ? clamp((a.pos.y - 60) / 200, 0, 1) : 0.6,
        biome: this.biome,
        inCombat: !!a && a.inCombat > 0,
      });
    }
    void hash2;
    void moveDef;
    void species;
    R.render();
    inp.endFrame();
  }
  private stillness = 0;
  private camSubject: Creature | null = null;

  /** Everyone in the pack is down: wake at the last sanctuary. */
  private async blackout() {
    if (this.switching) return;
    this.switching = true;
    this.audio?.stinger('faint');
    await this.overlay.through(
      'bloom',
      () => {
        const site = SITES.find((s) => s.id === this.journal.lastSanctuary) ?? SITES[0];
        this.pack.forEach((c, i) => {
          c.fainted = false;
          c.action = 'none';
          c.hp = Math.round(c.maxHp * 0.6);
          c.energy = 0;
          c.statuses.clear();
          c.place(site.x + Math.cos(i * 1.4) * (2 + i * 0.8), site.z + Math.sin(i * 1.4) * (2 + i * 0.8), 0);
        });
        for (const c of [...this.creatures]) if (c.team === 'wild') this.removeCreature(c);
        this.hour = (this.hour + 2) % 24;
        if (this.active) this.control.snapBehind(this.active);
      },
      { inDur: 1.2, outDur: 1.4, hold: 0.6 },
    );
    this.toast('You wake where the stones keep watch', 'info');
    this.switching = false;
  }

  // ---------------------------------------------------------------- menu

  openMenu() {
    if (this.mode !== 'play' || this.switching) return;
    this.mode = 'menu';
    this.input.unlock();
    this.audio?.ui('open');
    this.emit('menu', true);
  }
  closeMenu() {
    if (this.mode !== 'menu') return;
    this.mode = 'play';
    this.audio?.ui('close');
    this.emit('menu', false);
    this.save();
  }
}
