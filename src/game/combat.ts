// Real-time two-move combat. A Fast move builds ink energy on every landed hit;
// Charged moves spend it. Every move exists physically: melee needs reach and
// contact, shots travel and can be dodged or blocked by trees, beams and breath
// sweep where they are aimed, pulses expand, fields linger on the ground.
import * as THREE from 'three';
import type { ElementId, MoveDef, StatusId } from '../data/types';
import { move as moveDef } from '../data/moves';
import { KINSHIP, WEATHER, WEATHER_BOOST, effectiveness } from '../data/elements';
import type { WeatherId } from '../data/types';
import { Creature, GRAVITY } from './creature';
import { Fx, beamGeometry, coneGeometry, slashGeometry, strokeMaterial } from '../render/fx';
import { ELEMENT_INK } from '../render/palette';
import type { CollisionWorld } from '../world/colliders';
import { groundAt, waterAt } from '../world/terrain';
import { addGust } from '../world/wind';
import { clamp } from '../core/math';

export interface HitEvent {
  attacker: Creature | null;
  target: Creature;
  damage: number;
  eff: number;
  crit: boolean;
  blocked: boolean;
  dodged: boolean;
  move: MoveDef | null;
  x: number;
  y: number;
  z: number;
}

interface Pending {
  c: Creature;
  m: MoveDef;
  t: number;
}
interface Shot {
  c: Creature;
  m: MoveDef;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  color: string;
}
interface Lasting {
  kind: 'beam' | 'cone' | 'field' | 'pulse' | 'lunge';
  c: Creature;
  m: MoveDef;
  t: number;
  dur: number;
  tick: number;
  hit: Set<number>;
  pos: THREE.Vector3;
  mesh?: THREE.Mesh;
  ticks: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const CORE = '#fbf7ee';

/** melee reach grows with the body, but not linearly — a mouse still needs to touch you */
export const sizeK = (c: Creature) => clamp(Math.sqrt(c.height) * 1.15, 0.7, 3.6);

export class Combat {
  shots: Shot[] = [];
  private pending: Pending[] = [];
  private lasting: Lasting[] = [];
  weather: WeatherId = 'clear';
  onHit: ((e: HitEvent) => void) | null = null;
  onFaint: ((target: Creature, by: Creature | null) => void) | null = null;
  onCast: ((c: Creature, m: MoveDef, phase: 'cast' | 'fire') => void) | null = null;
  /** who may hurt whom */
  hostile: (a: Creature, b: Creature) => boolean = (a, b) => a.team !== b.team;

  constructor(private creatures: () => Creature[], private fx: Fx, private col: CollisionWorld) {}

  // ---------------------------------------------------------------- using moves

  canUse(c: Creature, m: MoveDef): boolean {
    if (c.fainted || c.stunned > 0 || c.dash || c.shieldT > 0) return false;
    if (c.action === 'cast' || c.action === 'strike' || c.action === 'lunge' || c.action === 'hit') return false;
    if (m.kind === 'fast') return c.fastCd <= 0;
    return c.chargedCd <= 0 && c.energy >= m.energy;
  }

  use(c: Creature, moveId: string): boolean {
    const m = moveDef(moveId);
    if (!this.canUse(c, m)) return false;
    if (m.kind === 'fast') c.fastCd = m.cooldown;
    else {
      c.chargedCd = m.cooldown;
      c.fastCd = Math.max(c.fastCd, m.windup + 0.3);
      c.energy -= m.energy;
    }
    const act = m.shape === 'strike' ? 'strike' : m.shape === 'lunge' ? 'lunge' : 'cast';
    c.setAction(act, m.windup + (m.kind === 'charged' ? 0.42 : 0.2) + (m.duration && m.shape !== 'field' ? m.duration : 0));
    c.inCombat = 6;
    this.pending.push({ c, m, t: m.windup });
    this.onCast?.(c, m, 'cast');
    if (m.kind === 'charged') {
      // a charged move announces itself: ink gathers at the feet
      this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius * 2.6, c.radius * 0.6, ELEMENT_INK[m.element], m.windup + 0.1);
    }
    return true;
  }

  dodge(c: Creature, dx: number, dz: number): boolean {
    if (c.dodgeCd > 0 || c.fainted || c.stunned > 0 || c.rooted > 0) return false;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) {
      dx = -Math.sin(c.yaw);
      dz = -Math.cos(c.yaw);
    } else {
      dx /= l;
      dz /= l;
    }
    const speed = 13 + c.runSpeed * 0.9;
    c.dash = { vx: dx * speed, vz: dz * speed, t: 0.22 };
    c.iframes = 0.34;
    c.dodgeCd = 0.75;
    c.action = 'none';
    this.fx.petals(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, 10, 3.5);
    this.fx.blot(c.pos.x, c.pos.y + c.height * 0.4, c.pos.z, c.height * 1.2, '#3a3433', 0.45);
    addGust(c.pos.x, c.pos.z, 0.55);
    return true;
  }

  shield(c: Creature): boolean {
    if (c.shieldCd > 0 || c.fainted || c.stunned > 0) return false;
    c.shieldT = 1.25;
    c.shieldCd = 7;
    this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius * 0.5, c.radius * 2.4 + 0.6, '#1d1a1a', 0.45);
    return true;
  }

  // ---------------------------------------------------------------- damage

  private boost(e: ElementId) {
    return WEATHER[this.weather].boosts.includes(e) ? WEATHER_BOOST : 1;
  }

  damage(attacker: Creature | null, target: Creature, m: MoveDef | null, power: number, at: THREE.Vector3, element?: ElementId): boolean {
    if (target.fainted || !target.alive) return false;
    const ev: HitEvent = { attacker, target, damage: 0, eff: 1, crit: false, blocked: false, dodged: false, move: m, x: at.x, y: at.y, z: at.z };
    if (target.iframes > 0) {
      ev.dodged = true;
      this.onHit?.(ev);
      return false;
    }
    const el = element ?? m?.element;
    let dmg = power;
    if (attacker) {
      dmg *= Math.pow(attacker.atk / Math.max(1, target.def), 0.8) * (0.85 + attacker.level * 0.045);
      if (el && attacker.elements.includes(el)) dmg *= KINSHIP;
      if (attacker.statuses.has('atkUp')) dmg *= 1.3;
      if (attacker.statuses.has('atkDown')) dmg *= 0.75;
    }
    if (el) {
      ev.eff = effectiveness(el, target.elements);
      dmg *= ev.eff * this.boost(el);
    }
    if (target.statuses.has('defUp')) dmg *= 0.72;
    if (target.statuses.has('defDown')) dmg *= 1.3;
    // caught asleep or unawares
    if (attacker && (target.action === 'sleep' || (target.team === 'wild' && target.inCombat <= 0 && attacker.crouch > 0.5))) {
      dmg *= 1.8;
      ev.crit = true;
    } else if (Math.random() < 0.06) {
      dmg *= 1.5;
      ev.crit = true;
    }
    if (target.shieldT > 0) {
      dmg *= 0.12;
      ev.blocked = true;
      this.fx.ring(target.pos.x, target.groundY, target.pos.z, target.radius, target.radius * 2 + 0.5, '#1d1a1a', 0.3);
    }
    dmg = Math.max(1, Math.round(dmg));
    ev.damage = dmg;
    target.hp = Math.max(0, target.hp - dmg);
    target.flash = 1;
    target.inCombat = 8;
    target.lastHitBy = attacker;
    if (target.action === 'sleep' || target.action === 'eat') target.action = 'none';
    if (!ev.blocked && target.action !== 'cast' && target.action !== 'lunge') target.setAction('hit', 0.28);
    target.energy = Math.min(100, target.energy + dmg * 0.12);
    if (attacker) {
      attacker.inCombat = 8;
      if (m?.kind === 'fast') attacker.energy = Math.min(100, attacker.energy + m.energy);
      if (attacker.statuses.has('leech')) attacker.hp = Math.min(attacker.maxHp, attacker.hp + dmg * 0.3);
      // knockback
      if (!ev.blocked && !target.dash) {
        _d.set(target.pos.x - attacker.pos.x, 0, target.pos.z - attacker.pos.z);
        const l = _d.length() || 1;
        const kb = clamp((power / 30) * (attacker.height / Math.max(0.2, target.height)), 0.4, 6);
        target.vel.x += (_d.x / l) * kb;
        target.vel.z += (_d.z / l) * kb;
      }
    }
    if (m?.effect && !ev.blocked && !m.effect.self && Math.random() < m.effect.chance) this.applyStatus(target, m.effect.type, m.effect.duration, m.effect.power ?? 0, attacker);
    if (m) this.impactFx(m, at, ev.eff);
    this.onHit?.(ev);
    if (target.hp <= 0) {
      target.fainted = true;
      target.faintT = 0;
      target.action = 'faint';
      target.actionT = 0;
      target.dash = null;
      this.onFaint?.(target, attacker);
    }
    return true;
  }

  applyStatus(c: Creature, type: StatusId, dur: number, power: number, by: Creature | null) {
    if (type === 'heal') {
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * (power || 0.2));
      this.fx.petals(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z, 8, 1.5, '#aab884');
      return;
    }
    if (type === 'stun') c.stunned = Math.max(c.stunned, dur);
    if (type === 'root') c.rooted = Math.max(c.rooted, dur);
    const cur = c.statuses.get(type);
    c.statuses.set(type, { t: Math.max(cur?.t ?? 0, dur), power: power || (cur?.power ?? 0), tick: cur?.tick ?? 1 });
    void by;
  }

  private impactFx(m: MoveDef, at: THREE.Vector3, eff: number) {
    const col = ELEMENT_INK[m.element];
    const big = m.kind === 'charged' ? 1.8 : 1;
    const fx = this.fx;
    fx.blot(at.x, at.y, at.z, 0.45 * big * (eff > 1 ? 1.4 : 1), eff > 1 ? '#1d1a1a' : '#3a3433', 0.4);
    switch (m.fx) {
      case 'ember': case 'flame': fx.sparks(at.x, at.y, at.z, 6 * big, 5, '#e2603a'); fx.droplets(at.x, at.y, at.z, 6 * big, 3, '#f0a04b', 2, 0.06); break;
      case 'water': case 'bubble': fx.droplets(at.x, at.y, at.z, 12 * big, 4.5, '#7fb3c8', 10, 0.06); break;
      case 'leaf': case 'vine': fx.leaves(at.x, at.y, at.z, 6 * big, '#7d8f5c'); break;
      case 'petal': fx.petals(at.x, at.y, at.z, 8 * big, 3); break;
      case 'spark': case 'bolt': fx.sparks(at.x, at.y, at.z, 10 * big, 8, '#f2d463'); break;
      case 'rock': case 'mud': case 'thump': fx.dust(at.x, at.y, at.z, 6 * big, '#b9a57e', 0.3); break;
      case 'gust': fx.sparks(at.x, at.y, at.z, 6 * big, 6, '#cfe3da'); break;
      case 'shard': case 'needle': fx.sparks(at.x, at.y, at.z, 8 * big, 6, '#cfe6ee'); break;
      case 'wisp': case 'moon': case 'bell': fx.droplets(at.x, at.y, at.z, 10 * big, 2, col, -1, 0.07); break;
      case 'ink': fx.inkBurst(at.x, at.y, at.z, 0.5 * big); break;
      default: fx.sparks(at.x, at.y, at.z, 5 * big, 5, '#1d1a1a');
    }
  }

  // ---------------------------------------------------------------- firing

  private aimDir(c: Creature, out: THREE.Vector3, from: THREE.Vector3): THREE.Vector3 {
    out.copy(c.aim).sub(from);
    if (out.lengthSq() < 0.01) c.forward(out);
    return out.normalize();
  }

  private fire(c: Creature, m: MoveDef) {
    if (c.fainted || !c.alive) return;
    const k = sizeK(c);
    const col = ELEMENT_INK[m.element];
    this.onCast?.(c, m, 'fire');
    const fwd = c.forward(_a);
    switch (m.shape) {
      case 'strike': {
        const reach = c.radius + m.range * k;
        const rad = m.radius * k;
        const cx = c.pos.x + fwd.x * reach;
        const cz = c.pos.z + fwd.z * reach;
        const cy = c.pos.y + c.rig.center.y;
        // the brushed arc
        const mesh = new THREE.Mesh(slashGeometry(reach + rad * 0.3, Math.max(0.12, rad * 0.9)), strokeMaterial(m.kind === 'charged' ? col : '#1d1a1a', CORE, 0));
        mesh.position.set(c.pos.x, cy, c.pos.z);
        mesh.rotation.set((Math.random() - 0.5) * 0.9, c.yaw, (Math.random() - 0.5) * 0.7);
        this.fx.temp(mesh, 0.3, (kk, mm) => ((mm.material as THREE.ShaderMaterial).uniforms.uK.value = kk));
        for (const t of this.creatures()) {
          if (t === c || t.fainted || !this.hostile(c, t)) continue;
          const d = Math.hypot(t.pos.x - cx, t.pos.z - cz);
          if (d > rad + t.radius) continue;
          if (Math.abs(t.pos.y + t.rig.center.y - cy) > rad + t.height * 0.6 + c.height * 0.5) continue;
          this.damage(c, t, m, m.power, t.centerWorld(_b));
        }
        if (m.kind === 'charged') addGust(cx, cz, 0.6);
        break;
      }
      case 'lunge': {
        const dist = m.range * clamp(k, 0.8, 1.8);
        const speed = 20 + dist * 1.5;
        const dir = this.aimDir(c, _d, c.pos);
        const hl = Math.hypot(dir.x, dir.z) || 1;
        c.dash = { vx: (dir.x / hl) * speed, vz: (dir.z / hl) * speed, t: dist / speed };
        this.lasting.push({ kind: 'lunge', c, m, t: 0, dur: dist / speed + 0.05, tick: 0, hit: new Set(), pos: c.pos.clone(), ticks: 1 });
        this.fx.petals(c.pos.x, c.pos.y + c.height * 0.5, c.pos.z, 6, 3);
        addGust(c.pos.x, c.pos.z, 0.5);
        break;
      }
      case 'projectile': {
        const from = c.mouthWorld(_b);
        const dir = this.aimDir(c, _d, from);
        const n = m.count ?? 1;
        const spread = ((m.spread ?? 0) * Math.PI) / 180;
        const speed = m.speed ?? 24;
        // lobbed shots need lift to reach the aim point
        const flat = Math.hypot(c.aim.x - from.x, c.aim.z - from.z);
        const g = (m.arc ?? 0) * GRAVITY * 0.55;
        const tFly = Math.min(m.range, flat) / speed;
        for (let i = 0; i < n; i++) {
          const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const v = new THREE.Vector3(dir.x * ca + dir.z * sa, dir.y, -dir.x * sa + dir.z * ca).multiplyScalar(speed);
          v.y += g * tFly * 0.5;
          this.shots.push({ c, m, pos: from.clone(), vel: v, life: m.range / speed + 0.2, color: col });
        }
        break;
      }
      case 'beam': {
        const dur = m.duration ?? 0.5;
        const mesh = new THREE.Mesh(beamGeometry(m.range, Math.max(0.08, m.radius * 0.9)), strokeMaterial(col, CORE, 1));
        this.fx.group.add(mesh);
        this.lasting.push({ kind: 'beam', c, m, t: 0, dur, tick: 0, hit: new Set(), pos: new THREE.Vector3(), mesh, ticks: Math.max(1, Math.round(dur / 0.12)) });
        break;
      }
      case 'cone': {
        const dur = m.duration ?? 0.5;
        const mesh = new THREE.Mesh(coneGeometry(m.range * clamp(k, 0.8, 2), (m.radius * Math.PI) / 180), strokeMaterial(col, CORE, 2));
        this.fx.group.add(mesh);
        this.lasting.push({ kind: 'cone', c, m, t: 0, dur, tick: 0, hit: new Set(), pos: new THREE.Vector3(), mesh, ticks: Math.max(1, Math.round(dur / 0.12)) });
        addGust(c.pos.x + fwd.x * 2, c.pos.z + fwd.z * 2, 0.7);
        break;
      }
      case 'pulse': {
        const R = m.radius * clamp(k, 0.8, 2.2);
        this.lasting.push({ kind: 'pulse', c, m, t: 0, dur: 0.34, tick: 0, hit: new Set(), pos: c.pos.clone(), ticks: 1 });
        this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius, R, col, 0.4);
        this.fx.ring(c.pos.x, c.groundY, c.pos.z, c.radius * 0.5, R * 0.8, '#1d1a1a', 0.5);
        this.fx.dust(c.pos.x, c.groundY, c.pos.z, 10, '#cdbf9c', 0.35);
        addGust(c.pos.x, c.pos.z, 1);
        break;
      }
      case 'field': {
        const from = c.pos;
        _d.set(c.aim.x - from.x, 0, c.aim.z - from.z);
        const l = _d.length();
        const reach = Math.min(l, m.range);
        const px = from.x + (l > 0.01 ? (_d.x / l) * reach : fwd.x * 3);
        const pz = from.z + (l > 0.01 ? (_d.z / l) * reach : fwd.z * 3);
        const py = Math.max(groundAt(px, pz), waterAt(px, pz));
        const dur = m.duration ?? 4;
        this.lasting.push({ kind: 'field', c, m, t: 0, dur, tick: 0, hit: new Set(), pos: new THREE.Vector3(px, py, pz), ticks: Math.max(1, Math.round(dur / 0.5)) });
        this.fx.ring(px, py, pz, 0.3, m.radius, col, 0.4);
        break;
      }
    }
    if (m.effect?.self) this.applyStatus(c, m.effect.type, m.effect.duration, m.effect.power ?? 0, c);
  }

  // ---------------------------------------------------------------- update

  update(dt: number) {
    const list = this.creatures();

    // statuses
    for (const c of list) {
      if (!c.statuses.size) continue;
      for (const [id, s] of c.statuses) {
        s.t -= dt;
        if (id === 'burn' && !c.fainted) {
          s.tick -= dt;
          if (s.tick <= 0) {
            s.tick = 1;
            this.damage(null, c, null, Math.max(1, s.power) * (1 + c.level * 0.05), c.centerWorld(_b), 'fire');
            this.fx.sparks(c.pos.x, c.pos.y + c.height * 0.6, c.pos.z, 3, 2, '#e2603a');
          }
        }
        if (s.t <= 0) c.statuses.delete(id);
      }
    }

    // wind-ups
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.c.fainted || !p.c.alive || p.c.stunned > 0) {
        this.pending.splice(i, 1);
        continue;
      }
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        this.fire(p.c, p.m);
      }
    }

    // shots in flight
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const m = s.m;
      s.life -= dt;
      s.vel.y -= (m.arc ?? 0) * GRAVITY * 0.55 * dt;
      _a.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      const big = m.kind === 'charged' ? 1.5 : 1;
      // the shot itself is a moving blot with a drying trail
      this.fx.spawn({ x: s.pos.x, y: s.pos.y, z: s.pos.z, life: 0.12, size: m.radius * 2.2 * big, color: s.color, shape: 2 });
      this.fx.spawn({ x: _a.x, y: _a.y, z: _a.z, life: 0.28, size: m.radius * 1.3 * big, grow: -m.radius * 3, color: m.fx === 'ink' ? '#1d1a1a' : CORE, shape: 2 });
      let dead = s.life <= 0;
      // creatures
      if (!dead)
        for (const t of list) {
          if (t === s.c || t.fainted || !this.hostile(s.c, t)) continue;
          t.centerWorld(_b);
          // closest point on this frame's segment
          _d.copy(s.pos).sub(_a);
          const l2 = _d.lengthSq();
          const u = l2 > 0 ? clamp(_b.clone().sub(_a).dot(_d) / l2, 0, 1) : 0;
          const cxp = _a.x + _d.x * u - _b.x;
          const cyp = _a.y + _d.y * u - _b.y;
          const czp = _a.z + _d.z * u - _b.z;
          const rr = m.radius + Math.max(t.radius, t.height * 0.45);
          if (cxp * cxp + cyp * cyp * 0.6 + czp * czp < rr * rr) {
            this.damage(s.c, t, m, m.power, s.pos);
            dead = true;
            break;
          }
        }
      // ground, water, trees
      if (!dead) {
        const g = groundAt(s.pos.x, s.pos.z);
        const w = waterAt(s.pos.x, s.pos.z);
        if (s.pos.y < g) {
          dead = true;
          this.fx.blot(s.pos.x, g + 0.05, s.pos.z, m.radius * 3 * big, '#3a3433', 0.6);
          this.fx.dust(s.pos.x, g, s.pos.z, 3);
        } else if (w > g && s.pos.y < w && _a.y >= w) {
          this.fx.droplets(s.pos.x, w, s.pos.z, 8, 3.5, '#cfe3e6', 10, 0.06);
          this.fx.ring(s.pos.x, w, s.pos.z, 0.2, 1.2, '#f7f5ec', 0.5);
          if (m.element !== 'water') dead = true;
        } else if (this.col.raycast(_a.x, _a.z, s.pos.x, s.pos.z, s.pos.y, m.radius * 0.5)) {
          dead = true;
          this.impactFx(m, s.pos, 1);
        }
      }
      if (dead) this.shots.splice(i, 1);
    }

    // beams, cones, pulses, fields, lunges
    for (let i = this.lasting.length - 1; i >= 0; i--) {
      const L = this.lasting[i];
      const c = L.c;
      const m = L.m;
      L.t += dt;
      const k = sizeK(c);
      const col = ELEMENT_INK[m.element];
      let done = L.t >= L.dur || ((L.kind === 'beam' || L.kind === 'cone' || L.kind === 'lunge') && (c.fainted || !c.alive));
      if (L.kind === 'lunge') {
        const rad = c.radius + m.radius * k * 0.6;
        for (const t of list) {
          if (t === c || t.fainted || L.hit.has(t.id) || !this.hostile(c, t)) continue;
          if (Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z) < rad + t.radius && Math.abs(t.pos.y - c.pos.y) < Math.max(c.height, t.height) + 0.5) {
            L.hit.add(t.id);
            this.damage(c, t, m, m.power, t.centerWorld(_b));
          }
        }
        if (Math.random() < 0.7) this.fx.spawn({ x: c.pos.x, y: c.pos.y + c.height * 0.5, z: c.pos.z, life: 0.3, size: c.height * 0.9, grow: -c.height, color: m.kind === 'charged' ? col : '#3a3433', shape: 1 });
        if (!c.dash) done = true;
      } else if (L.kind === 'pulse') {
        const R = m.radius * clamp(k, 0.8, 2.2) * Math.min(1, L.t / L.dur);
        for (const t of list) {
          if (t === c || t.fainted || L.hit.has(t.id) || !this.hostile(c, t)) continue;
          if (Math.hypot(t.pos.x - L.pos.x, t.pos.z - L.pos.z) < R + t.radius && Math.abs(t.pos.y - L.pos.y) < 2.5 + c.height + t.height) {
            L.hit.add(t.id);
            this.damage(c, t, m, m.power, t.centerWorld(_b));
          }
        }
      } else if (L.kind === 'beam' || L.kind === 'cone') {
        const from = c.mouthWorld(_a);
        const dir = this.aimDir(c, _d, from);
        const mesh = L.mesh!;
        mesh.position.copy(from);
        if (L.kind === 'beam') mesh.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
        else mesh.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
        (mesh.material as THREE.ShaderMaterial).uniforms.uK.value = L.t / L.dur;
        L.tick -= dt;
        if (L.tick <= 0) {
          L.tick = L.dur / L.ticks;
          const per = m.power / L.ticks;
          const range = L.kind === 'beam' ? m.range : m.range * clamp(k, 0.8, 2);
          const cosHalf = Math.cos((m.radius * Math.PI) / 180);
          for (const t of list) {
            if (t === c || t.fainted || !this.hostile(c, t)) continue;
            t.centerWorld(_b);
            const rx = _b.x - from.x;
            const ry = _b.y - from.y;
            const rz = _b.z - from.z;
            const along = rx * dir.x + ry * dir.y + rz * dir.z;
            if (along < -t.radius || along > range + t.radius) continue;
            if (L.kind === 'beam') {
              const px = rx - dir.x * along;
              const py = ry - dir.y * along;
              const pz = rz - dir.z * along;
              const rr = m.radius + Math.max(t.radius, t.height * 0.45);
              if (px * px + py * py + pz * pz > rr * rr) continue;
            } else {
              const d = Math.hypot(rx, rz) || 1;
              const cosA = (rx * dir.x + rz * dir.z) / (d * (Math.hypot(dir.x, dir.z) || 1));
              if (cosA < cosHalf && d > t.radius + c.radius) continue;
              if (Math.abs(ry) > 2 + t.height) continue;
            }
            this.damage(c, t, m, per, _b);
          }
          // spray along the path
          for (let j = 0; j < 4; j++) {
            const u = Math.random() * range;
            const sp = L.kind === 'cone' ? u * Math.tan((m.radius * Math.PI) / 180) : m.radius;
            this.fx.spawn({ x: from.x + dir.x * u + (Math.random() - 0.5) * sp, y: from.y + dir.y * u + (Math.random() - 0.5) * sp * 0.5, z: from.z + dir.z * u + (Math.random() - 0.5) * sp, vx: dir.x * 4, vy: dir.y * 4 + 0.5, vz: dir.z * 4, life: 0.35, size: 0.12 + Math.random() * 0.15, color: col, shape: 2, drag: 2 });
          }
        }
      } else if (L.kind === 'field') {
        L.tick -= dt;
        if (L.tick <= 0) {
          L.tick = L.dur / L.ticks;
          const per = m.power / L.ticks;
          this.fx.ring(L.pos.x, L.pos.y, L.pos.z, m.radius * 0.85, m.radius, col, 0.55);
          for (let j = 0; j < 5; j++) {
            const a = Math.random() * 6.283;
            const r = Math.random() * m.radius;
            this.fx.spawn({ x: L.pos.x + Math.cos(a) * r, y: L.pos.y + 0.1, z: L.pos.z + Math.sin(a) * r, vy: 1.5 + Math.random(), life: 0.6, size: 0.14, color: col, shape: m.fx === 'vine' || m.fx === 'leaf' ? 4 : 2, drag: 1 });
          }
          for (const t of list) {
            if (t === c || t.fainted || !this.hostile(c, t)) continue;
            if (Math.hypot(t.pos.x - L.pos.x, t.pos.z - L.pos.z) < m.radius + t.radius && Math.abs(t.pos.y - L.pos.y) < 3 + t.height) this.damage(c, t, m, per, t.centerWorld(_b));
          }
        }
      }
      if (done) {
        if (L.mesh) {
          this.fx.group.remove(L.mesh);
          L.mesh.geometry.dispose();
          (L.mesh.material as THREE.Material).dispose();
        }
        this.lasting.splice(i, 1);
      }
    }
  }

  /** Drop everything a creature has in flight (despawn, possession swap). */
  forget(c: Creature) {
    this.pending = this.pending.filter((p) => p.c !== c);
    for (const L of this.lasting) if (L.c === c) L.t = L.dur;
  }
}
