// A living creature in the world: species + individual data, a built rig, and
// a kinematic body that walks, hops, swims, dives, flies or hovers at its true
// scale. Player and AI both drive it through the same `intent` fields.
import * as THREE from 'three';
import type { Individual, SpeciesDef, StatusId } from '../data/types';
import { species } from '../data/species';
import { buildCreature, type Rig } from '../creatures/builder';
import { Animator, makeAnimState, type Action, type AnimState } from '../creatures/animator';
import { groundAt, groundNormal, waterAt } from '../world/terrain';
import type { CollisionWorld, Solid } from '../world/colliders';
import { pressGrass } from '../world/wind';
import { addBlob } from '../render/inkMaterial';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math';

export const GRAVITY = 22;
export const WORLD_LIMIT = 4040;

export interface Intent {
  /** desired horizontal movement in world space, length 0..1 */
  mx: number;
  mz: number;
  jump: boolean;
  /** held: flap upward / swim up */
  ascend: boolean;
  /** held: dive / descend */
  descend: boolean;
  sprint: boolean;
  crouch: boolean;
  /** yaw to face when not moving freely (aiming); NaN = face movement */
  faceYaw: number;
}

export interface Status {
  t: number;
  power: number;
  tick: number;
}

let nextId = 1;
const _n = { x: 0, y: 1, z: 0 };
const _hit: { solid: Solid | null } = { solid: null };
const _p = { x: 0, z: 0 };

export function maxHpOf(sp: SpeciesDef, level: number, vigor: number) {
  return Math.round((sp.stats.hp * 1.3 + 50) * (1 + level * 0.055) * vigor);
}
export function xpToNext(level: number) {
  return Math.round(40 + level * 22 + level * level * 1.2);
}

export class Creature {
  readonly id = nextId++;
  sp: SpeciesDef;
  rig: Rig;
  anim: Animator;
  readonly st: AnimState = makeAnimState();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** world-space point this creature is aiming at */
  readonly aim = new THREE.Vector3();
  yaw = 0;
  yawVel = 0;
  readonly intent: Intent = { mx: 0, mz: 0, jump: false, ascend: false, descend: false, sprint: false, crouch: false, faceYaw: NaN };

  // ---- body state
  grounded = true;
  swimming = false;
  underwater = false;
  flying = false;
  /** metres of water above the ground here (0 if dry) */
  waterDepth = 0;
  waterLevel = -Infinity;
  groundY = 0;
  crouch = 0;
  height: number;
  radius: number;
  stepTimer = 0;
  /** set when a footfall happened this frame (for audio) */
  stepped = false;
  landed = 0;
  touching: Solid | null = null;

  // ---- combat state
  hp: number;
  maxHp: number;
  energy = 0;
  atk = 1;
  def = 1;
  spdStat = 1;
  fastCd = 0;
  chargedCd = 0;
  dodgeCd = 0;
  shieldCd = 0;
  shieldT = 0;
  iframes = 0;
  stunned = 0;
  rooted = 0;
  statuses = new Map<StatusId, Status>();
  action: Action = 'none';
  actionT = 0;
  actionDur = 0;
  /** dash displacement in progress (lunges, dodges) */
  dash: { vx: number; vz: number; t: number } | null = null;
  fainted = false;
  faintT = 0;
  flash = 0;
  /** seconds of awakened form remaining */
  awakened = 0;
  team: 'pack' | 'wild' = 'wild';
  controlled = false;
  lastHitBy: Creature | null = null;
  inCombat = 0;
  /** arbitrary slot for the AI brain */
  brain: unknown = null;
  alive = true;

  constructor(public ind: Individual) {
    this.sp = species(ind.species);
    this.rig = buildCreature(this.sp, { shiny: ind.shiny });
    this.anim = new Animator(this.rig);
    this.height = this.rig.height;
    this.radius = Math.min(this.rig.radius, 2.6);
    this.maxHp = 1;
    this.hp = 1;
    this.refreshStats();
    this.hp = Math.min(this.maxHp, ind.hp > 0 ? ind.hp : this.maxHp);
  }

  get level() {
    return this.ind.level;
  }
  get elements() {
    const aw = this.awakened > 0 ? this.sp.awakening : undefined;
    return aw?.addElement && !this.sp.elements.includes(aw.addElement) ? [...this.sp.elements, aw.addElement] : this.sp.elements;
  }
  has(trait: string) {
    return (this.sp.traits as string[]).includes(trait);
  }
  get canFly() {
    return this.has('fly') || this.sp.ecology.locomotion === 'fly';
  }
  get aquatic() {
    return this.sp.ecology.locomotion === 'swim';
  }
  get canSwim() {
    return this.has('swim') || this.has('dive') || this.aquatic || this.sp.ecology.locomotion === 'amphibious';
  }
  get floats() {
    return this.rig.hover > 0 || this.sp.ecology.locomotion === 'float';
  }

  refreshStats() {
    const s = this.sp.stats;
    const v = this.ind.vigor;
    const L = this.ind.level;
    const aw = this.awakened > 0 && this.sp.awakening ? this.sp.awakening.statMul : 1;
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.maxHp = maxHpOf(this.sp, L, v[0]);
    this.hp = Math.max(this.hp > 0 ? 1 : 0, Math.round(this.maxHp * ratio));
    this.atk = s.atk * (1 + L * 0.03) * v[1] * aw;
    this.def = s.def * (1 + L * 0.03) * v[2] * aw;
    this.spdStat = s.spd * v[3];
  }

  /** Swap the rig for another species or form (evolution, awakening). */
  rebuild(sp: SpeciesDef, awakened: boolean) {
    const parent = this.rig.root.parent;
    parent?.remove(this.rig.root);
    this.rig.dispose();
    this.sp = sp;
    this.ind.species = sp.id;
    this.rig = buildCreature(sp, { awakened, shiny: this.ind.shiny });
    this.anim = new Animator(this.rig);
    this.height = this.rig.height;
    this.radius = Math.min(this.rig.radius, 2.6);
    parent?.add(this.rig.root);
    this.refreshStats();
    this.syncRig();
  }

  get runSpeed() {
    let v = 4.2 + this.spdStat * 0.028 + Math.min(3, this.height * 0.9);
    if (this.statuses.has('chill')) v *= 0.55;
    return v;
  }
  get jumpSpeed() {
    const h = clamp(this.height * 1.5 + 0.7, 0.9, 4.2) * (this.rig.arch === 'hopper' ? 1.7 : 1);
    return Math.sqrt(2 * GRAVITY * h);
  }

  setAction(a: Action, dur: number) {
    this.action = a;
    this.actionT = 0;
    this.actionDur = Math.max(0.01, dur);
  }

  /** Place on the ground at (x,z). */
  place(x: number, z: number, yaw = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    const g = groundAt(x, z);
    const w = waterAt(x, z);
    this.pos.y = this.aquatic && w > g ? Math.max(g + this.height * 0.5, w - this.height * 1.2) : Math.max(g, this.canSwim && w > g ? w - this.height * 0.6 : g) + this.rig.hover;
    this.syncRig();
  }

  syncRig() {
    const r = this.rig.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
  }

  // ---------------------------------------------------------------- physics

  step(dt: number, col: CollisionWorld) {
    const it = this.intent;
    const H = this.height;
    this.stepped = false;
    this.landed = 0;

    // timers
    this.fastCd = Math.max(0, this.fastCd - dt);
    this.chargedCd = Math.max(0, this.chargedCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.shieldCd = Math.max(0, this.shieldCd - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    this.rooted = Math.max(0, this.rooted - dt);
    this.inCombat = Math.max(0, this.inCombat - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.action !== 'none' && this.action !== 'sleep' && this.action !== 'faint' && this.action !== 'eat') {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) this.action = 'none';
    } else if (this.action === 'faint') this.actionT = Math.min(1, this.actionT + dt * 2);

    const frozen = this.fainted || this.stunned > 0 || this.action === 'sleep';
    let mx = frozen || this.rooted > 0 ? 0 : it.mx;
    let mz = frozen || this.rooted > 0 ? 0 : it.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }

    // ---- environment
    const x = this.pos.x;
    const z = this.pos.z;
    let ground = groundAt(x, z);
    const deck = col.deckAt(x, z, this.pos.y - this.rig.hover);
    if (deck > ground) ground = deck;
    this.groundY = ground;
    const wl = deck > -1e8 && deck >= ground ? -Infinity : waterAt(x, z);
    this.waterLevel = wl;
    this.waterDepth = wl > ground ? wl - ground : 0;
    const hover = this.rig.hover;
    const canStand = this.waterDepth < H * 0.62;
    const inWater = wl > -1e8 && this.pos.y - hover < wl - H * 0.25 && !canStand;
    this.swimming = inWater && !this.flying && hover === 0;
    this.underwater = wl > -1e8 && this.pos.y + H * 0.8 < wl;

    // ---- desired speed
    this.crouch = damp(this.crouch, it.crouch && this.grounded && !this.swimming ? 1 : 0, 12, dt);
    let top = this.runSpeed * (it.sprint ? 1.45 : 1) * (1 - this.crouch * 0.55);
    if (this.swimming) top *= this.canSwim ? 0.95 : 0.4;
    else if (this.aquatic && !inWater) top *= 0.25;
    if (this.flying) top *= 1.25;
    if (this.action === 'cast' || this.action === 'roar') top *= 0.45;
    if (this.shieldT > 0) top *= 0.35;

    // ---- horizontal velocity
    if (this.dash) {
      this.vel.x = this.dash.vx;
      this.vel.z = this.dash.vz;
      this.dash.t -= dt;
      if (this.dash.t <= 0) {
        this.dash = null;
        this.vel.x *= 0.25;
        this.vel.z *= 0.25;
      }
    } else {
      const accel = this.grounded ? 14 : this.flying || this.swimming ? 6 : 4;
      this.vel.x = damp(this.vel.x, mx * top, accel, dt);
      this.vel.z = damp(this.vel.z, mz * top, accel, dt);
    }

    // ---- vertical
    const feet = this.pos.y - hover;
    if (this.swimming) {
      this.flying = false;
      const surfaceY = wl - H * 0.62;
      let target = surfaceY;
      const canDive = this.has('dive') || this.aquatic;
      if (canDive) {
        if (it.descend) target = feet - 3;
        else if (it.ascend) target = surfaceY + 0.2;
        else if (this.underwater) target = feet + (this.aquatic ? 0 : 0.6);
      }
      target = Math.min(target, surfaceY);
      if (this.aquatic && !it.ascend) target = Math.min(target, wl - H * 1.1);
      this.vel.y = damp(this.vel.y, clamp((target - feet) * 4, -5, 5), 8, dt);
      // jump out at the surface
      if (it.jump && feet > surfaceY - 0.2 && !canDive) this.vel.y = this.jumpSpeed * 0.7;
      this.grounded = false;
    } else if (hover > 0) {
      // spirits ride a cushion of air over ground and water alike
      const base = Math.max(ground, wl > -1e8 ? wl : -1e9);
      const target = base + hover + (it.ascend ? H * 1.5 : 0);
      this.vel.y = damp(this.vel.y, (target - this.pos.y) * 6, 10, dt);
      this.grounded = true;
    } else {
      if (this.grounded) {
        if (it.jump && !frozen) {
          this.vel.y = this.jumpSpeed;
          this.grounded = false;
          if (this.canFly) this.flying = true;
        }
      } else if (this.canFly && (it.ascend || it.jump) && !frozen) {
        this.flying = true;
        this.vel.y = damp(this.vel.y, 5.5 + H, 5, dt);
      }
      if (this.flying) {
        if (it.descend) this.vel.y = damp(this.vel.y, -7, 5, dt);
        else if (!it.ascend) this.vel.y = damp(this.vel.y, ml > 0.1 ? -0.9 : -1.8, 2.5, dt);
        if (frozen) this.flying = false;
      } else if (!this.grounded) {
        const glide = this.has('glide') && it.ascend && this.vel.y < 0;
        this.vel.y -= GRAVITY * dt;
        if (glide) this.vel.y = Math.max(this.vel.y, -2.2);
        else this.vel.y = Math.max(this.vel.y, -45);
      }
    }

    // ---- slopes: too steep to stand on means sliding back down
    if (this.grounded && hover === 0 && !this.swimming) {
      groundNormal(x, z, _n);
      if (_n.y < 0.62 && !this.has('climb') && deck < ground) {
        const k = (0.62 - _n.y) * 26;
        this.vel.x += _n.x * k * dt * 6;
        this.vel.z += _n.z * k * dt * 6;
        const up = this.vel.x * -_n.x + this.vel.z * -_n.z;
        if (up > 0) {
          this.vel.x += _n.x * up * 0.85;
          this.vel.z += _n.z * up * 0.85;
        }
      }
    }

    // ---- integrate + collide
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    _p.x = this.pos.x;
    _p.z = this.pos.z;
    const bodyH = H * (1 - this.crouch * 0.45);
    col.resolve(_p, Math.max(0.08, this.radius * 0.8), this.pos.y - hover, bodyH, _hit);
    this.touching = _hit.solid;
    this.pos.x = clamp(_p.x, -WORLD_LIMIT, WORLD_LIMIT);
    this.pos.z = clamp(_p.z, -WORLD_LIMIT, WORLD_LIMIT);

    // ---- ground contact
    if (!this.swimming && hover === 0) {
      let g = groundAt(this.pos.x, this.pos.z);
      const d2 = col.deckAt(this.pos.x, this.pos.z, this.pos.y);
      if (d2 > g) g = d2;
      // fish and divers may go below the surface; everyone else stands on the bed
      if (this.pos.y <= g) {
        if (!this.grounded && this.vel.y < -3) this.landed = -this.vel.y;
        this.pos.y = g;
        this.vel.y = 0;
        this.grounded = true;
        this.flying = false;
      } else if (this.grounded && !this.flying) {
        // stick to gentle downhill ground instead of hopping off every bump
        if (this.pos.y - g < 0.35 + H * 0.2 && this.vel.y <= 0) this.pos.y = g;
        else this.grounded = false;
      }
      this.groundY = g;
    } else if (this.swimming) {
      const g = groundAt(this.pos.x, this.pos.z);
      if (this.pos.y < g) this.pos.y = g;
    }

    // ---- facing
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let want = this.yaw;
    if (!Number.isNaN(it.faceYaw)) want = it.faceYaw;
    else if (ml > 0.05 && !this.dash) want = Math.atan2(mx, mz);
    else if (this.dash) want = Math.atan2(this.dash.vx, this.dash.vz);
    const prev = this.yaw;
    if (!frozen) this.yaw = dampAngle(this.yaw, want, this.grounded ? 13 : 8, dt);
    this.yawVel = wrapAngle(this.yaw - prev) / Math.max(dt, 1e-4);

    // ---- footfalls, pressed grass, contact shadow
    if (this.grounded && speed > 0.4 && hover === 0 && !this.swimming) {
      this.stepTimer -= dt * speed;
      if (this.stepTimer <= 0) {
        this.stepTimer = Math.max(0.22, H * 0.85);
        this.stepped = true;
        pressGrass(this.pos.x, this.pos.z, Math.max(0.3, this.radius * 1.4), 1, 2.2);
      }
    }
    if (hover === 0 && !this.swimming && this.pos.y - this.groundY < 1.5) pressGrass(this.pos.x, this.pos.z, Math.max(0.28, this.radius * 1.5), 1, 9);
    if (!this.swimming && !this.underwater) addBlob(this.pos.x, this.pos.z, Math.max(0.12, this.radius * 0.95), this.pos.y - hover);

    // ---- animation
    const s = this.st;
    s.speed = speed;
    s.turn = this.yawVel;
    s.vy = this.vel.y;
    s.grounded = this.grounded;
    s.swimming = this.swimming || this.underwater;
    s.flying = this.flying || (hover > 0 && this.sp.body.wings?.type !== undefined && this.sp.body.wings.type !== 'none');
    s.crouch = this.crouch;
    s.action = this.fainted ? 'faint' : this.action;
    s.actionT = this.actionT;
    s.alert = this.inCombat > 0 ? 1 : 0;
    this.anim.update(dt, s);
    this.syncRig();
    const u = this.rig.mat.uniforms;
    u.uFlash.value = this.flash;
  }

  /** World-space point shots leave from. */
  mouthWorld(out: THREE.Vector3) {
    const m = this.rig.mouth;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(this.pos.x + m.x * c + m.z * s, this.pos.y + m.y, this.pos.z - m.x * s + m.z * c);
  }
  /** World-space body centre, for targeting and hit effects. */
  centerWorld(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + this.rig.center.y, this.pos.z);
  }
  forward(out: THREE.Vector3) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  dispose() {
    this.alive = false;
    this.rig.root.parent?.remove(this.rig.root);
    this.rig.dispose();
  }
}

let uidSeq = Date.now() % 1e9;
/** Roll a fresh individual of a species at a level. */
export function rollIndividual(speciesId: string, level: number, rand: () => number = Math.random): Individual {
  const sp = species(speciesId);
  const v = () => 0.92 + rand() * 0.16;
  const vig: [number, number, number, number] = [v(), v(), v(), v()];
  const pick = (list: string[]) => list[Math.min(list.length - 1, Math.floor(rand() * Math.min(list.length, 1 + level / 14)))];
  const charged = pick(sp.charged);
  return {
    uid: uidSeq++,
    species: speciesId,
    level,
    xp: 0,
    hp: maxHpOf(sp, level, vig[0]),
    vigor: vig,
    fast: pick(sp.fast),
    charged,
    charged2: sp.charged.find((m) => m !== charged),
    home: 'wild',
    bond: 0,
    shiny: rand() < 1 / 320,
  };
}
