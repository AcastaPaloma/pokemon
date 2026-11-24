// Sumirei's audio engine: fully procedural Web Audio, no files, no dependencies.
//
//   buses      ambience / sfx / music → weather shelf → underwater low-pass →
//              gentle compressor → limiter → master        (core.ts)
//   beds       wind, rain, water, underwater, anchor emitters (beds.ts)
//   wildlife   birds, insects, frogs, owls by hour + biome  (wildlife.ts)
//   foley      footsteps, splashes, thunder, UI, ink        (foley.ts)
//   cries      seeded creature voices                       (cries.ts)
//   moves      cast + hit for every FxStyle                 (moves.ts)
//   music      koto / piano phrases, combat pulse, stingers (music.ts)
//
// Every public method is a silent no-op until unlock() has run inside a user
// gesture, and none of them ever throws into the game loop.

import type { BiomeId, FxStyle, WeatherId } from '../data/types';
import { Beds } from './beds';
import { AudioCore, rnd } from './core';
import { cry } from './cries';
import { Foley } from './foley';
import { moveFx } from './moves';
import { Music } from './music';
import { Wildlife } from './wildlife';

export type Surface = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'snow' | 'water' | 'mud' | 'ash' | 'leaves';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface AudioFrame {
  dt: number;
  /** camera position + unit forward (Y up) */
  listener: P3;
  forward: P3;
  /** 0 calm … 1.5 gale */
  windSpeed: number;
  weather: WeatherId;
  /** 0..1 */
  weatherIntensity: number;
  /** what is over the listener: changes how rain sounds */
  cover: 'open' | 'roof' | 'canopy';
  /** 0..1 proximity to stream / shore */
  nearWater: number;
  underwater: boolean;
  /** 0..24 world clock */
  hour: number;
  /** 0..1, rises while the player stands still */
  stillness: number;
  /** 0..1, how much of an overlook this spot is */
  scenic: number;
  biome: BiomeId;
  inCombat: boolean;
}

export interface AudioAnchor {
  kind: 'chime' | 'fountain' | 'fire' | 'stream' | 'bell';
  x: number;
  y: number;
  z: number;
}

/** continuous beds are steered at this rate, not every frame */
const CONTROL_DT = 1 / 15;

interface Parts {
  core: AudioCore;
  beds: Beds;
  wildlife: Wildlife;
  foley: Foley;
  music: Music;
}

export class AudioEngine {
  /** true after unlock() */
  ready = false;

  private parts: Parts | null = null;
  private paused = false;
  private volMaster = 0.9;
  private volMusic = 0.8;
  private volSfx = 1;
  private lastTick = 0;
  private lastThunder = -1e9;
  private autoThunder = 0;
  private pendingAnchors: AudioAnchor[] | null = null;
  private warned = false;

  // ---------------------------------------------------------------- lifecycle

  /** Create / resume the AudioContext. Call from a user gesture; safe to call again and again. */
  unlock(): Promise<void> {
    try {
      if (!this.parts) {
        if (typeof window === 'undefined') return Promise.resolve();
        const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const AC = w.AudioContext ?? w.webkitAudioContext;
        if (!AC) return Promise.resolve();
        let ctx: AudioContext;
        try {
          ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          ctx = new AC(); // old webkit constructor takes no options
        }
        const core = new AudioCore(ctx);
        this.parts = { core, beds: new Beds(core), wildlife: new Wildlife(core), foley: new Foley(core), music: new Music(core) };
        this.applyVolume(0);
        if (this.pendingAnchors) {
          this.parts.beds.setAnchors(this.pendingAnchors);
          this.pendingAnchors = null;
        }
      }
      const ctx = this.parts.core.ctx;
      if (this.paused) return Promise.resolve();
      if (ctx.state === 'running') {
        this.ready = true;
        return Promise.resolve();
      }
      // a one-sample silent buffer started inside the gesture fully unlocks older Safari
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.onended = () => s.disconnect();
      s.start(0);
      const done = (): void => {
        this.ready = true;
      };
      const p = ctx.resume() as Promise<void> | undefined;
      if (p && typeof p.then === 'function') return p.then(done, () => undefined);
      done();
      return Promise.resolve();
    } catch (e) {
      this.fail(e);
      return Promise.resolve();
    }
  }

  /** each 0..1; applied with a perceptual (squared) taper */
  setVolume(master: number, music: number, sfx: number): void {
    const c01 = (v: number, d: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
    this.volMaster = c01(master, this.volMaster);
    this.volMusic = c01(music, this.volMusic);
    this.volSfx = c01(sfx, this.volSfx);
    try {
      this.applyVolume(0.04);
    } catch (e) {
      this.fail(e);
    }
  }

  private applyVolume(tc: number): void {
    const p = this.parts;
    if (!p) return;
    const c = p.core;
    const now = c.ctx.currentTime;
    const set = (param: AudioParam, v: number): void => {
      if (tc > 0) param.setTargetAtTime(v * v, now, tc);
      else param.value = v * v;
    };
    set(c.master.gain, this.volMaster);
    set(c.music.gain, this.volMusic);
    set(c.sfx.gain, this.volSfx);
    set(c.amb.gain, this.volSfx);
    set(c.ui.gain, this.volSfx);
  }

  suspend(): void {
    this.paused = true;
    try {
      void this.parts?.core.ctx.suspend().catch(() => undefined);
    } catch (e) {
      this.fail(e);
    }
  }

  resume(): void {
    this.paused = false;
    try {
      void this.parts?.core.ctx.resume().catch(() => undefined);
    } catch (e) {
      this.fail(e);
    }
  }

  /** swallow an internal error, saying so once — never throw into the game */
  private fail(e: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('[audio] internal error (further ones are silenced):', e);
  }

  /** the engine parts, but only while sound can actually be scheduled */
  private live(): Parts | null {
    const p = this.parts;
    return p && this.ready && p.core.ctx.state === 'running' ? p : null;
  }

  // ---------------------------------------------------------------- per-frame

  /** Call every frame. Cheap: listener maths and level easing; beds are steered at 15 Hz. */
  update(frame: AudioFrame): void {
    const p = this.live();
    if (!p) return;
    try {
      const { core, beds, wildlife, music } = p;
      core.setListener(frame.listener, frame.forward);
      const dt = frame.dt > 0 ? Math.min(frame.dt, 0.25) : 0;
      music.frame(dt, frame.stillness, frame.scenic, frame.inCombat);

      const now = core.ctx.currentTime;
      const since = now - this.lastTick;
      if (since < CONTROL_DT) return;
      this.lastTick = now;
      const cdt = Math.min(since, 0.25);
      core.sweep(now);
      beds.update(frame, now, cdt);
      wildlife.tick(frame, now, beds.rain, beds.snow, beds.wind);
      music.tick(now, frame);

      // Storms rumble on their own if the game is not already driving thunder() from its lightning.
      if (beds.storm > 0.3 && !frame.underwater) {
        if (now >= this.autoThunder) {
          if (this.autoThunder > 0 && now - this.lastThunder > 25) p.foley.thunder(rnd(900, 4500));
          this.autoThunder = now + rnd(14, 40) / (0.5 + beds.storm);
        }
      }
    } catch (e) {
      this.fail(e); // audio must never take the game loop down
    }
  }

  /** Nearby world emitters. Chimes ring with the wind, fountains tip every ~9 s, fires crackle, streams burble. */
  setAnchors(anchors: AudioAnchor[]): void {
    try {
      if (this.parts) this.parts.beds.setAnchors(anchors);
      else this.pendingAnchors = anchors.slice(0, 24);
    } catch (e) {
      this.fail(e);
    }
  }

  // ---------------------------------------------------------------- one-shots

  footstep(surface: Surface, weightKg: number, wet: number, speed: number, pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      p.foley.footstep(surface, weightKg, wet, speed, pos);
    } catch (e) {
      this.fail(e);
    }
  }

  cry(seed: number, sizeMeters: number, mood: 'call' | 'alarm' | 'hurt' | 'faint' | 'happy', pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      cry(p.core, seed, sizeMeters, mood, pos);
    } catch (e) {
      this.fail(e);
    }
  }

  moveFx(fx: FxStyle, phase: 'cast' | 'hit', power: number, pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      moveFx(p.core, fx, phase, power, pos);
    } catch (e) {
      this.fail(e);
    }
  }

  ui(kind: 'hover' | 'select' | 'back' | 'open' | 'close' | 'tab' | 'error' | 'stamp'): void {
    const p = this.live();
    if (!p) return;
    try {
      p.foley.ui(kind);
    } catch (e) {
      this.fail(e);
    }
  }

  /** screen-transition whooshes: wet brush on paper */
  ink(kind: 'swirl' | 'bloom' | 'wipe'): void {
    const p = this.live();
    if (!p) return;
    try {
      p.foley.ink(kind);
    } catch (e) {
      this.fail(e);
    }
  }

  splash(size: number, pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      p.foley.splash(size, pos);
    } catch (e) {
      this.fail(e);
    }
  }

  /** metres; the sound arrives late and duller the further away the strike was */
  thunder(distance: number): void {
    const p = this.live();
    if (!p) return;
    try {
      this.lastThunder = p.core.ctx.currentTime;
      p.foley.thunder(distance);
    } catch (e) {
      this.fail(e);
    }
  }

  stinger(kind: 'bond' | 'evolve' | 'awaken' | 'discover' | 'levelup' | 'faint'): void {
    const p = this.live();
    if (!p) return;
    try {
      p.music.stinger(kind);
    } catch (e) {
      this.fail(e);
    }
  }

  /** quick air whoosh + petal rustle */
  dash(pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      p.foley.dash(pos);
    } catch (e) {
      this.fail(e);
    }
  }

  /** ink-barrier: taut paper/drum thump */
  shield(pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      p.foley.shield(pos);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Strike the large bronze temple bell. Without `pos` it rings the nearest 'bell' anchor, or at the listener. */
  ringBell(pos?: P3): void {
    const p = this.live();
    if (!p) return;
    try {
      p.beds.ringBell(pos);
    } catch (e) {
      this.fail(e);
    }
  }
}
