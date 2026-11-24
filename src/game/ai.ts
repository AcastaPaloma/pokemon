// Ecology brains. Wild creatures keep the hours their species keeps, graze and
// forage, move as herds and flocks, flee what hunts them, hunt what they eat,
// warn off intruders before they fight, and look for cover when it rains.
// Bonded pack members use the same steering to follow and to fight alongside
// whichever of them you are currently inhabiting.
import * as THREE from 'three';
import type { TimeOfDay, WeatherId } from '../data/types';
import { move as moveDef } from '../data/moves';
import type { Creature } from './creature';
import type { Combat } from './combat';
import { sizeK } from './combat';
import { groundAt, groundNormal, waterAt } from '../world/terrain';
import { clamp, wrapAngle } from '../core/math';

export type Mood = 'idle' | 'wander' | 'graze' | 'sleep' | 'flee' | 'hunt' | 'fight' | 'warn' | 'shelter' | 'follow' | 'watch' | 'eat' | 'yield' | 'return';

export interface Brain {
  mood: Mood;
  t: number;
  decide: number;
  target: Creature | null;
  homeX: number;
  homeZ: number;
  goalX: number;
  goalZ: number;
  herd: number;
  leader: Creature | null;
  /** seconds until it wants to hunt again */
  hunger: number;
  /** sideways steering when blocked */
  veer: number;
  veerT: number;
  /** pack formation slot */
  slot: number;
  /** remembered attacker */
  grudge: Creature | null;
  cried: number;
  fireDelay: number;
}

export function makeBrain(c: Creature, herd = 0, leader: Creature | null = null): Brain {
  return {
    mood: 'idle', t: 0, decide: Math.random() * 0.5, target: null,
    homeX: c.pos.x, homeZ: c.pos.z, goalX: c.pos.x, goalZ: c.pos.z,
    herd, leader, hunger: 20 + Math.random() * 60, veer: 0, veerT: 0, slot: 0, grudge: null, cried: 0, fireDelay: 0,
  };
}

export interface AiWorld {
  creatures: Creature[];
  combat: Combat;
  player: () => Creature | null;
  hour: number;
  tod: TimeOfDay;
  weather: WeatherId;
  /** roofed places creatures can wait out the rain: x, z, radius */
  shelters: { x: number; z: number; r: number }[];
  onCry: (c: Creature, mood: 'call' | 'alarm' | 'hurt' | 'faint' | 'happy') => void;
}

const _n = { x: 0, y: 1, z: 0 };
const _v = new THREE.Vector3();

export function isAsleepHour(c: Creature, tod: TimeOfDay): boolean {
  switch (c.sp.ecology.activity) {
    case 'diurnal': return tod === 'night';
    case 'nocturnal': return tod === 'day';
    case 'crepuscular': return false;
    default: return false;
  }
}

const brainOf = (c: Creature) => c.brain as Brain;
const dist = (a: Creature, b: Creature) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const preysOn = (a: Creature, b: Creature) => a.sp.ecology.prey.includes(b.sp.line);
const rivalOf = (a: Creature, b: Creature) => a.sp.ecology.rivals.includes(b.sp.line);

/** Walk toward a point, steering around trouble. Returns distance remaining. */
function steer(c: Creature, b: Brain, x: number, z: number, speed: number, dt: number): number {
  let dx = x - c.pos.x;
  let dz = z - c.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) {
    c.intent.mx = 0;
    c.intent.mz = 0;
    return d;
  }
  dx /= d;
  dz /= d;
  // look a body-length ahead for water we cannot swim and slopes we cannot climb
  const look = Math.max(1.2, c.radius * 3);
  const ax = c.pos.x + dx * look;
  const az = c.pos.z + dz * look;
  const g = groundAt(ax, az);
  const w = waterAt(ax, az);
  let blocked = false;
  if (c.aquatic) {
    if (!(w > g + c.height * 0.6)) blocked = true;
  } else if (!c.canSwim && !c.canFly && !c.floats && w > g + c.height * 0.6) blocked = true;
  if (!blocked && !c.canFly && !c.floats && !c.has('climb')) {
    groundNormal(ax, az, _n);
    if (_n.y < 0.6 && g > c.pos.y) blocked = true;
  }
  if (c.touching && c.touching.solid) blocked = true;
  if (blocked && b.veerT <= 0) {
    b.veer = Math.random() < 0.5 ? 1.2 : -1.2;
    b.veerT = 0.7 + Math.random() * 0.6;
  }
  if (b.veerT > 0) {
    b.veerT -= dt;
    const ca = Math.cos(b.veer);
    const sa = Math.sin(b.veer);
    const nx = dx * ca - dz * sa;
    dz = dx * sa + dz * ca;
    dx = nx;
  }
  c.intent.mx = dx * speed;
  c.intent.mz = dz * speed;
  // fliers lift off for anything longer than a hop
  if (c.canFly) {
    const alt = c.pos.y - Math.max(g, w);
    c.intent.ascend = speed > 0.55 && d > 6 && alt < 3 + c.height * 2;
    c.intent.jump = c.grounded && speed > 0.55 && d > 6;
    c.intent.descend = d < 4 && alt > 0.5;
  }
  return d;
}

function stop(c: Creature) {
  c.intent.mx = 0;
  c.intent.mz = 0;
  c.intent.ascend = false;
  c.intent.jump = false;
  c.intent.descend = c.flying;
  c.intent.sprint = false;
}

function setMood(c: Creature, b: Brain, mood: Mood) {
  if (b.mood === mood) return;
  if (b.mood === 'sleep' || b.mood === 'graze' || b.mood === 'eat') c.action = 'none';
  b.mood = mood;
  b.t = 0;
}

/** Pick and use moves against a target; keeps melee close and ranged at standoff. */
function fight(c: Creature, b: Brain, t: Creature, w: AiWorld, dt: number, eagerness = 1) {
  const fast = moveDef(c.ind.fast);
  const k = sizeK(c);
  const d = dist(c, t);
  const melee = fast.shape === 'strike' || fast.shape === 'lunge' || fast.shape === 'pulse';
  const reach = fast.shape === 'strike' ? c.radius + fast.range * k + t.radius + fast.radius * k * 0.6 : fast.shape === 'lunge' ? fast.range * 0.8 : fast.shape === 'pulse' ? fast.radius * k * 0.8 : Math.min(fast.range * 0.55, 11);
  t.centerWorld(c.aim);
  const face = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
  c.intent.faceYaw = face;
  c.intent.sprint = d > reach * 2.5;
  if (melee) {
    if (d > reach * 0.85) steer(c, b, t.pos.x, t.pos.z, 1, dt);
    else stop(c);
  } else {
    // hold a standoff and circle
    if (d > reach * 1.2) steer(c, b, t.pos.x, t.pos.z, 1, dt);
    else if (d < reach * 0.55) steer(c, b, c.pos.x - (t.pos.x - c.pos.x), c.pos.z - (t.pos.z - c.pos.z), 0.8, dt);
    else {
      const side = (c.id % 2 ? 1 : -1) * 0.6;
      c.intent.mx = Math.cos(face) * side;
      c.intent.mz = -Math.sin(face) * side;
    }
  }
  b.fireDelay -= dt;
  if (b.fireDelay > 0) return;
  const facing = Math.abs(wrapAngle(face - c.yaw)) < 0.5;
  // charged when the ink is there
  const ch = moveDef(c.ind.charged);
  const chReach = ch.shape === 'strike' ? c.radius + ch.range * k + t.radius + 0.5 : ch.shape === 'lunge' ? ch.range : ch.shape === 'pulse' ? ch.radius * k * 0.85 : ch.shape === 'cone' ? ch.range * 0.9 : ch.range;
  if (c.energy >= ch.energy && d < chReach && facing && w.combat.use(c, ch.id)) {
    b.fireDelay = 0.5 + Math.random() * 0.6;
    return;
  }
  if (d < (melee ? reach * 1.15 : fast.range * 0.9) && facing && w.combat.use(c, fast.id)) {
    b.fireDelay = (0.15 + Math.random() * 0.5) / eagerness;
    return;
  }
  // sometimes slip aside when the target winds up something big
  if (t.action === 'cast' && t.actionT < 0.4 && c.dodgeCd <= 0 && Math.random() < 0.012 * (c.spdStat / 60)) {
    w.combat.dodge(c, Math.cos(face), -Math.sin(face));
  }
}

export function updateWild(c: Creature, w: AiWorld, dt: number) {
  const b = brainOf(c);
  const e = c.sp.ecology;
  b.t += dt;
  b.decide -= dt;
  b.hunger -= dt;
  b.cried -= dt;
  c.intent.faceYaw = NaN;
  c.intent.crouch = false;
  if (c.fainted) {
    stop(c);
    return;
  }

  // ---- decide
  if (b.decide <= 0) {
    b.decide = 0.35 + Math.random() * 0.3;
    const asleep = b.mood === 'sleep';
    const sense = e.territory * (asleep ? 0.35 : 1.4) + c.radius;
    let threat: Creature | null = null;
    let threatD = 1e9;
    let prey: Creature | null = null;
    let preyD = 1e9;
    let intruder: Creature | null = null;
    let intruderD = 1e9;
    let rival: Creature | null = null;
    for (const o of w.creatures) {
      if (o === c || o.fainted || !o.alive) continue;
      const d = dist(c, o);
      if (d > 60) continue;
      const quiet = o.crouch > 0.5 ? 0.45 : 1;
      if (preysOn(o, c) && d < (sense + 8) * quiet && d < threatD) {
        threat = o;
        threatD = d;
      }
      if (o.team === 'pack') {
        if (d < sense * quiet && d < intruderD) {
          intruder = o;
          intruderD = d;
        }
      } else {
        if (preysOn(c, o) && d < 34 && d < preyD) {
          prey = o;
          preyD = d;
        }
        if (rivalOf(c, o) && d < e.territory * 1.2) rival = o;
      }
    }
    const hurt = c.hp < c.maxHp * 0.3;
    const grudge = b.grudge && !b.grudge.fainted && b.grudge.alive && dist(c, b.grudge) < 40 ? b.grudge : null;
    if (!grudge) b.grudge = null;

    if (b.mood === 'yield') {
      // bonded: handled by the game
    } else if (threat) {
      b.target = threat;
      setMood(c, b, 'flee');
    } else if (grudge) {
      b.target = grudge;
      const timid = e.temperament === 'skittish' || (e.temperament === 'docile' && hurt);
      setMood(c, b, timid && hurt ? 'flee' : timid && e.temperament === 'skittish' ? 'flee' : 'fight');
    } else if (b.mood === 'fight' || b.mood === 'hunt') {
      const t = b.target;
      if (!t || t.fainted || !t.alive || dist(c, t) > 42 || Math.hypot(c.pos.x - b.homeX, c.pos.z - b.homeZ) > 70) {
        if (t && t.fainted && b.mood === 'hunt') {
          setMood(c, b, 'eat');
          b.hunger = 90 + Math.random() * 90;
        } else setMood(c, b, 'return');
        b.target = null;
      }
    } else if (intruder && !asleep) {
      b.target = intruder;
      switch (e.temperament) {
        case 'skittish': setMood(c, b, 'flee'); break;
        case 'aggressive': setMood(c, b, 'fight'); break;
        case 'territorial':
          if (b.mood !== 'warn') setMood(c, b, 'warn');
          else if (b.t > 2.6 && intruderD < e.territory) setMood(c, b, 'fight');
          break;
        case 'curious': if (b.mood !== 'watch') setMood(c, b, 'watch'); break;
        default: break; // docile: carries on
      }
    } else if (intruder && asleep && intruderD < c.radius + 1.2 && intruder.crouch < 0.5) {
      // woken by something blundering into it
      b.target = intruder;
      setMood(c, b, e.temperament === 'skittish' || e.temperament === 'docile' ? 'flee' : 'warn');
    } else if (rival && !asleep) {
      b.target = rival;
      setMood(c, b, 'fight');
    } else if (prey && b.hunger <= 0 && !asleep && e.diet === 'predator') {
      b.target = prey;
      setMood(c, b, 'hunt');
    } else if (b.mood === 'flee' || b.mood === 'warn' || b.mood === 'watch') {
      if (b.t > 2.5) setMood(c, b, 'return');
    } else if (isAsleepHour(c, w.tod) && c.inCombat <= 0) {
      if (b.mood !== 'sleep' && b.t > 2) setMood(c, b, 'sleep');
    } else if (b.mood === 'sleep') {
      setMood(c, b, 'idle');
    } else if ((w.weather === 'rain' || w.weather === 'storm') && e.shelters && !(e.weatherLove ?? []).includes(w.weather)) {
      if (b.mood !== 'shelter') {
        // nearest roof, else stay under whatever tree we are near
        let best: { x: number; z: number; r: number } | null = null;
        let bd = 90;
        for (const s of w.shelters) {
          const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        if (best) {
          const a = Math.random() * 6.283;
          b.goalX = best.x + Math.cos(a) * best.r * 0.6;
          b.goalZ = best.z + Math.sin(a) * best.r * 0.6;
          setMood(c, b, 'shelter');
        }
      }
    } else if (b.mood === 'shelter') {
      setMood(c, b, 'idle');
    } else if (b.mood === 'eat' && b.t > 6) {
      setMood(c, b, 'idle');
    } else if (b.mood === 'idle' && b.t > 2 + (c.id % 5)) {
      // herd members drift with their leader; leaders and loners choose a patch
      const L = b.leader && b.leader.alive && !b.leader.fainted ? b.leader : null;
      const r = L ? 4 + c.radius * 4 : 6 + e.territory * 0.9;
      const ox = L ? L.pos.x : b.homeX;
      const oz = L ? L.pos.z : b.homeZ;
      const a = Math.random() * 6.283;
      b.goalX = ox + Math.cos(a) * r * Math.random();
      b.goalZ = oz + Math.sin(a) * r * Math.random();
      setMood(c, b, 'wander');
    } else if (b.mood === 'graze' && b.t > 5 + (c.id % 4)) {
      setMood(c, b, 'idle');
    } else if (b.mood === 'return' && Math.hypot(c.pos.x - b.homeX, c.pos.z - b.homeZ) < 8) {
      setMood(c, b, 'idle');
    }
  }

  // ---- act
  const t = b.target;
  switch (b.mood) {
    case 'sleep':
      stop(c);
      c.action = 'sleep';
      if (c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.02 * dt);
      break;
    case 'idle':
    case 'yield':
      stop(c);
      if (c.hp < c.maxHp && c.inCombat <= 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.01 * dt);
      break;
    case 'wander': {
      const d = steer(c, b, b.goalX, b.goalZ, 0.42, dt);
      if (d < 1 + c.radius || b.t > 14) {
        const grazes = e.diet === 'grazer' || e.diet === 'forager' || e.diet === 'filter';
        setMood(c, b, grazes && Math.random() < 0.6 ? 'graze' : 'idle');
      }
      break;
    }
    case 'graze':
    case 'eat':
      stop(c);
      c.action = 'eat';
      break;
    case 'shelter': {
      const d = steer(c, b, b.goalX, b.goalZ, 0.8, dt);
      if (d < 1.5) stop(c);
      break;
    }
    case 'flee':
      if (t) {
        const dx = c.pos.x - t.pos.x;
        const dz = c.pos.z - t.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        c.intent.sprint = true;
        steer(c, b, c.pos.x + (dx / l) * 14, c.pos.z + (dz / l) * 14, 1, dt);
        if (b.cried <= 0) {
          b.cried = 4;
          w.onCry(c, 'alarm');
        }
      }
      break;
    case 'warn':
      stop(c);
      if (t) {
        c.intent.faceYaw = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
        if (b.cried <= 0) {
          b.cried = 2.2;
          c.setAction('roar', 0.8);
          w.onCry(c, 'alarm');
        }
        c.inCombat = Math.max(c.inCombat, 0.5);
      }
      break;
    case 'watch':
      if (t) {
        const d = dist(c, t);
        c.intent.faceYaw = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
        if (d > e.territory * 0.9) steer(c, b, t.pos.x, t.pos.z, 0.4, dt);
        else if (d < 2.5 + c.radius + t.radius) steer(c, b, c.pos.x - (t.pos.x - c.pos.x), c.pos.z - (t.pos.z - c.pos.z), 0.5, dt);
        else stop(c);
        if (b.cried <= 0 && Math.random() < 0.01) {
          b.cried = 6;
          w.onCry(c, 'call');
        }
      }
      break;
    case 'hunt':
    case 'fight':
      if (t && !t.fainted) fight(c, b, t, w, dt);
      else stop(c);
      break;
    case 'return': {
      const d = steer(c, b, b.homeX, b.homeZ, 0.6, dt);
      if (d < 6) setMood(c, b, 'idle');
      if (c.inCombat <= 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.04 * dt);
      break;
    }
    default:
      stop(c);
  }
  // occasional calls give the land its voice
  if (b.cried <= 0 && (b.mood === 'idle' || b.mood === 'graze') && Math.random() < 0.0015) {
    b.cried = 10 + Math.random() * 20;
    w.onCry(c, 'call');
  }
  void _v;
}

/** A bonded pack member that is not being inhabited: follow in formation, help in fights. */
export function updateFollower(c: Creature, w: AiWorld, dt: number) {
  const b = brainOf(c);
  const lead = w.player();
  c.intent.faceYaw = NaN;
  c.intent.crouch = false;
  if (c.fainted || !lead) {
    stop(c);
    return;
  }
  b.t += dt;
  b.decide -= dt;
  if (b.decide <= 0) {
    b.decide = 0.3;
    // help against whatever the leader is fighting, or whatever is hurting us
    let tgt: Creature | null = null;
    if (lead.inCombat > 0 || c.inCombat > 0) {
      let bd = 26;
      for (const o of w.creatures) {
        if (o.team !== 'wild' || o.fainted || !o.alive || o.inCombat <= 0) continue;
        const ob = o.brain as Brain | null;
        if (!ob || (ob.mood !== 'fight' && ob.mood !== 'hunt' && o.lastHitBy?.team !== 'pack')) continue;
        if (ob.target && ob.target.team !== 'pack' && o.lastHitBy?.team !== 'pack') continue;
        const d = dist(lead, o);
        if (d < bd) {
          bd = d;
          tgt = o;
        }
      }
    }
    b.target = tgt;
    b.mood = tgt ? 'fight' : 'follow';
  }
  const dl = dist(c, lead);
  if (b.mood === 'fight' && b.target && !b.target.fainted) {
    fight(c, b, b.target, w, dt, 0.6);
    return;
  }
  // formation: a loose fan behind the leader, wider for bigger bodies
  const n = b.slot;
  const row = Math.floor(n / 2) + 1;
  const side = n % 2 === 0 ? -1 : 1;
  const back = 1.3 + lead.radius * 2 + row * (1.1 + c.radius * 1.6);
  const out = side * (0.9 + c.radius + lead.radius) * row * 0.9;
  const cy = Math.cos(lead.yaw);
  const sy = Math.sin(lead.yaw);
  const gx = lead.pos.x - sy * back + cy * out;
  const gz = lead.pos.z - cy * back - sy * out;
  const d = Math.hypot(gx - c.pos.x, gz - c.pos.z);
  const leadSpeed = Math.hypot(lead.vel.x, lead.vel.z);
  if (d > 1.2 + c.radius || leadSpeed > 0.5) {
    c.intent.sprint = d > 6;
    steer(c, b, gx, gz, clamp(d / 3.5, 0.3, 1), dt);
    if (lead.crouch > 0.5) c.intent.crouch = true;
  } else stop(c);
  // keep up over water and cliffs a follower cannot cross
  if (lead.flying && c.canFly) c.intent.ascend = c.pos.y < lead.pos.y - 0.5;
  void dl;
}
