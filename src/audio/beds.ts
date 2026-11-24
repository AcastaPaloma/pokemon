// Continuous beds: wind, rain, water, underwater, and the always-on parts of world
// anchors (fountain trickle, fire roar, stream). Everything here is built once at
// unlock and then steered at control rate with setTargetAtTime — no per-frame nodes.

import type { BiomeId } from '../data/types';
import type { AudioAnchor, AudioFrame, P3 } from './audio';
import { AudioCore, Ctl, Pan, PanFan, chance, clamp, pick, poisson, rnd } from './core';

/** how much surf (rather than stream burble) `nearWater` means in each biome */
const COASTAL: Partial<Record<BiomeId, number>> = { beach: 1, sea: 1, isle: 0.8, cliff: 0.7 };
/** how much foliage the wind has to play with */
const FOLIAGE: Partial<Record<BiomeId, number>> = {
  vale: 0.7,
  bamboo: 1,
  deepwood: 0.9,
  highland: 0.7,
  marsh: 0.5,
  plains: 0.35,
  isle: 0.5,
};

/** Running water: resonant band-passed noise whose bands wander on a random walk. */
class Burble {
  readonly out: GainNode;
  private readonly bands: BiquadFilterNode[] = [];
  private readonly gains: GainNode[] = [];
  private readonly next: number[] = [];

  constructor(
    c: AudioCore,
    private readonly lo: readonly number[],
    private readonly hi: readonly number[],
    q: number,
    wash: number,
  ) {
    this.out = c.gain(1);
    for (let i = 0; i < lo.length; i++) {
      const g = c.gain(0.6, this.out);
      const bp = c.biquad('bandpass', Math.sqrt((lo[i] as number) * (hi[i] as number)), q, g);
      c.pinkSrc.connect(bp);
      this.bands.push(bp);
      this.gains.push(g);
      this.next.push(0);
    }
    // a steady wash of fine spray under the gurgle
    const wg = c.gain(wash, this.out);
    const lp = c.biquad('lowpass', 6500, 0.5, wg);
    const hp = c.biquad('highpass', 1700, 0.5, lp);
    c.whiteSrc.connect(hp);
  }

  /** retarget bands whose timers ran out; schedules slightly ahead for finer timing than the control tick */
  tick(now: number, mul: number): void {
    for (let i = 0; i < this.bands.length; i++) {
      let t = this.next[i] as number;
      if (t < now) t = now;
      const lo = this.lo[i] as number;
      const hi = this.hi[i] as number;
      while (t < now + 0.12) {
        (this.bands[i] as BiquadFilterNode).frequency.setTargetAtTime(lo * Math.pow(hi / lo, Math.random()) * mul, t, rnd(0.012, 0.06));
        (this.gains[i] as GainNode).gain.setTargetAtTime(rnd(0.2, 1), t, 0.04);
        t += rnd(0.05, 0.24);
      }
      this.next[i] = t;
    }
  }
}

interface Anchor {
  kind: AudioAnchor['kind'];
  x: number;
  y: number;
  z: number;
  /** next scheduled event (chime strike, bamboo knock) */
  next: number;
  /** stable 0..1 derived from the position: tuning of this particular chime / tube */
  seed: number;
  period: number;
}

export class Beds {
  // eased weather amounts
  rain = 0;
  storm = 0;
  snow = 0;
  fog = 0;
  ash = 0;
  gale = 0;
  /** gusting wind actually blowing right now (also read by the engine for dashes etc.) */
  wind = 0;

  // wind
  private gust = 0.4;
  private gustTarget = 0.4;
  private gustNext = 0;
  private wander0 = 0;
  private wander1 = 0;
  private readonly cWindF: Ctl;
  private readonly cWindQ: Ctl;
  private readonly cWindG: Ctl;
  private readonly cLowG: Ctl;
  private readonly cWh0F: Ctl;
  private readonly cWh0G: Ctl;
  private readonly cWh1F: Ctl;
  private readonly cWh1G: Ctl;
  private readonly cLeafG: Ctl;
  private knockT = 0;

  // rain
  private cvOpen = 1;
  private cvRoof = 0;
  private cvCan = 0;
  private clump = 0.5;
  private dropT = 0;
  private eaveT = 0;
  private ashT = 0;
  private readonly cHissHP: Ctl;
  private readonly cHissLP: Ctl;
  private readonly cHissG: Ctl;
  private readonly cBodyF: Ctl;
  private readonly cBodyG: Ctl;
  private readonly cDropLP: Ctl;
  private readonly cDropRoom: Ctl;
  private readonly cShelf: Ctl;
  private readonly dropFan: PanFan;

  // water
  private readonly stream: Burble;
  private readonly trickle: Burble;
  private readonly cNearG: Ctl;
  private readonly cShoreG: Ctl;
  private readonly waveG: GainNode;
  private readonly waveLP: BiquadFilterNode;
  private readonly fizzG: GainNode;
  private readonly fizzHP: BiquadFilterNode;
  private readonly wetFan: PanFan;
  private waveT = 0;
  private plipT = 0;

  // underwater
  private readonly cUnderF: Ctl;
  private readonly cUnderQ: Ctl;
  private readonly cUwG: Ctl;
  private readonly uwFan: PanFan;
  private bubT = 0;

  // anchors
  private anchors: Anchor[] = [];
  private readonly cStreamG: Ctl;
  private readonly cStreamLP: Ctl;
  private readonly streamPan: Pan;
  private readonly cFountG: Ctl;
  private readonly cFountLP: Ctl;
  private readonly fountPan: Pan;
  private readonly fountIn: GainNode;
  private readonly cFireG: Ctl;
  private readonly cFireLP: Ctl;
  private readonly cFireRoar: Ctl;
  private readonly firePan: Pan;
  private readonly fireIn: GainNode;
  private popT = 0;
  private fountPlipT = 0;
  private readonly scratch: P3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly c: AudioCore) {
    const ctx = c.ctx;

    // ---- wind: pink noise through a band-pass that climbs and sharpens with speed
    const windG = c.gain(0, c.amb);
    const windBP = c.biquad('bandpass', 300, 0.6, windG);
    c.pinkSrc.connect(windBP);
    const lowG = c.gain(0, c.amb);
    const lowLP = c.biquad('lowpass', 130, 0.7, lowG);
    c.pinkSrc.connect(lowLP);
    this.cWindF = new Ctl(windBP.frequency, 0.01);
    this.cWindQ = new Ctl(windBP.Q, 0.02);
    this.cWindG = new Ctl(windG.gain, 0.01);
    this.cLowG = new Ctl(lowG.gain, 0.02);
    // whistle: two narrow resonances that only wake above ~1.0
    const mkWhistle = (pan: number): [Ctl, Ctl] => {
      const p = new Pan(ctx, pan);
      p.out.connect(c.amb);
      const g = c.gain(0, p.in);
      const bp = c.biquad('bandpass', 1700, 26, g);
      c.whiteSrc.connect(bp);
      return [new Ctl(bp.frequency, 0.004), new Ctl(g.gain, 0.02)];
    };
    [this.cWh0F, this.cWh0G] = mkWhistle(-0.35);
    [this.cWh1F, this.cWh1G] = mkWhistle(0.4);
    // foliage: grainy hiss of leaves, chopped by a slow noisy LFO so it shivers rather than hisses
    const leafG = c.gain(0, c.amb);
    const leafAM = c.gain(0.45, leafG);
    const leafBP = c.biquad('bandpass', 5200, 0.7, leafAM);
    c.whiteSrc.connect(leafBP);
    const leafLfoG = c.gain(5, undefined);
    leafLfoG.connect(leafAM.gain);
    const leafLfo = c.biquad('lowpass', 14, 0.7, leafLfoG);
    c.pinkSrc.connect(leafLfo);
    this.cLeafG = new Ctl(leafG.gain, 0.02);

    // ---- rain: hiss + body roar + individual drops through a fan of pan positions
    const hissG = c.gain(0, c.amb);
    const hissLP = c.biquad('lowpass', 11000, 0.5, hissG);
    const hissHP = c.biquad('highpass', 1800, 0.5, hissLP);
    c.whiteSrc.connect(hissHP);
    const bodyG = c.gain(0, c.amb);
    const bodyBP = c.biquad('bandpass', 520, 0.45, bodyG);
    c.pinkSrc.connect(bodyBP);
    const dropLP = c.biquad('lowpass', 12000, 0.5, c.amb);
    const dropRoom = c.gain(0, c.room);
    dropLP.connect(dropRoom);
    this.dropFan = new PanFan(ctx, dropLP, 7, 0.9);
    this.cHissHP = new Ctl(hissHP.frequency, 0.01);
    this.cHissLP = new Ctl(hissLP.frequency, 0.01);
    this.cHissG = new Ctl(hissG.gain, 0.01);
    this.cBodyF = new Ctl(bodyBP.frequency, 0.01);
    this.cBodyG = new Ctl(bodyG.gain, 0.01);
    this.cDropLP = new Ctl(dropLP.frequency, 0.01);
    this.cDropRoom = new Ctl(dropRoom.gain, 0.02);
    this.cShelf = new Ctl(c.shelf.gain, 0.01);

    // ---- water: stream burble near the listener, surf on the coast
    this.stream = new Burble(c, [250, 640, 1400], [620, 1350, 2800], 9, 0.02);
    const nearG = c.gain(0, c.amb);
    this.stream.out.connect(nearG);
    this.cNearG = new Ctl(nearG.gain, 0.01);
    const shoreG = c.gain(0, c.amb);
    this.cShoreG = new Ctl(shoreG.gain, 0.01);
    this.waveG = c.gain(0, shoreG);
    this.waveLP = c.biquad('lowpass', 400, 0.6, this.waveG);
    c.pinkSrc.connect(this.waveLP);
    this.fizzG = c.gain(0, shoreG);
    this.fizzHP = c.biquad('highpass', 2600, 0.5, this.fizzG);
    c.whiteSrc.connect(this.fizzHP);
    this.wetFan = new PanFan(ctx, c.amb, 5, 0.75);

    // ---- underwater: a dull pressure bed and slow bubbles, added after the master low-pass
    const uwG = c.gain(0, c.post);
    const uwLP = c.biquad('lowpass', 230, 0.9, uwG);
    c.pinkSrc.connect(uwLP);
    this.cUwG = new Ctl(uwG.gain, 0.02);
    this.cUnderF = new Ctl(c.underLP.frequency, 0.01);
    this.cUnderQ = new Ctl(c.underLP.Q, 0.02);
    const uwBub = c.gain(1, c.post);
    this.uwFan = new PanFan(ctx, uwBub, 5, 0.8);

    // ---- anchor beds: one panned emitter per kind, steered to the blend of nearby anchors
    const mkEmitter = (): [GainNode, Ctl, Ctl, Pan] => {
      const pan = new Pan(ctx, 0);
      pan.out.connect(c.amb);
      const lp = c.biquad('lowpass', 9000, 0.5, pan.in);
      const g = c.gain(0, lp);
      return [g, new Ctl(g.gain, 0.02), new Ctl(lp.frequency, 0.03), pan];
    };
    let g: GainNode;
    [g, this.cStreamG, this.cStreamLP, this.streamPan] = mkEmitter();
    this.stream.out.connect(g);
    [g, this.cFountG, this.cFountLP, this.fountPan] = mkEmitter();
    this.trickle = new Burble(c, [900, 2000], [1900, 3900], 7, 0.035);
    this.fountIn = c.gain(1, g);
    this.trickle.out.connect(this.fountIn);
    [g, this.cFireG, this.cFireLP, this.firePan] = mkEmitter();
    this.fireIn = c.gain(1, g);
    const roar = c.gain(1, this.fireIn);
    const roarLP = c.biquad('lowpass', 420, 0.6, roar);
    c.pinkSrc.connect(roarLP);
    this.cFireRoar = new Ctl(roar.gain, 0.02);
  }

  // ---------------------------------------------------------------- control tick

  update(f: AudioFrame, now: number, dt: number): void {
    const c = this.c;
    const wi = clamp(f.weatherIntensity, 0, 1);
    const wx = f.weather;

    // weather amounts ease towards their targets so a change of weather cross-fades
    const k = 1 - Math.exp(-dt / 1.1);
    this.rain += ((wx === 'rain' || wx === 'storm' ? wi : 0) - this.rain) * k;
    this.storm += ((wx === 'storm' ? wi : 0) - this.storm) * k;
    this.snow += ((wx === 'snow' ? wi : 0) - this.snow) * k;
    this.fog += ((wx === 'fog' ? wi : 0) - this.fog) * k;
    this.ash += ((wx === 'ashfall' ? wi : 0) - this.ash) * k;
    this.gale += ((wx === 'gale' ? wi : 0) - this.gale) * k;
    const kc = 1 - Math.exp(-dt / 0.35);
    this.cvOpen += ((f.cover === 'open' ? 1 : 0) - this.cvOpen) * kc;
    this.cvRoof += ((f.cover === 'roof' ? 1 : 0) - this.cvRoof) * kc;
    this.cvCan += ((f.cover === 'canopy' ? 1 : 0) - this.cvCan) * kc;
    const o = this.cvOpen;
    const r = this.cvRoof;
    const cn = this.cvCan;

    // ---- wind with slow random gusting
    if (now >= this.gustNext) {
      this.gustTarget = Math.pow(Math.random(), 1.4);
      this.gustNext = now + rnd(1.5, 5);
    }
    this.gust += (this.gustTarget - this.gust) * (1 - Math.exp(-dt / 1.1));
    this.wander0 = clamp(this.wander0 + rnd(-0.2, 0.2), -1, 1);
    this.wander1 = clamp(this.wander1 + rnd(-0.2, 0.2), -1, 1);
    const base = clamp(f.windSpeed, 0, 2) + 0.55 * this.gale + 0.3 * this.storm;
    const w = base * (0.62 + 0.76 * this.gust);
    this.wind = w;
    const shelter = 1 - 0.45 * r - 0.15 * cn;
    this.cWindF.to(240 + 430 * Math.pow(w, 1.2), now, 0.35);
    this.cWindQ.to(0.55 + 0.75 * Math.min(w, 1.6), now, 0.4);
    this.cWindG.to((0.012 + 0.34 * Math.pow(w, 1.5)) * shelter * (1 - 0.3 * this.snow), now, 0.3);
    this.cLowG.to(0.18 * Math.pow(Math.max(0, w - 0.45), 1.4) * shelter, now, 0.4);
    const wh = clamp(base - 1, 0, 0.6) * (0.35 + 0.95 * this.gust) * (1 + 0.6 * r);
    this.cWh0F.to(1500 + 620 * this.gust + 240 * this.wander0, now, 0.25);
    this.cWh1F.to(2150 + 800 * this.gust + 320 * this.wander1, now, 0.3);
    this.cWh0G.to(wh * 1.1, now, 0.2);
    this.cWh1G.to(wh * 0.8 * (0.5 + 0.5 * this.wander1 * this.wander1), now, 0.25);
    const foliage = FOLIAGE[f.biome] ?? 0.15;
    this.cLeafG.to(foliage * Math.pow(Math.min(w, 1.8), 1.4) * 0.11 * (1 + 0.6 * cn - 0.6 * r) * (1 - 0.7 * this.snow), now, 0.25);
    // bamboo stalks knocking together when the grove sways
    if (f.biome === 'bamboo' && w > 0.4 && !f.underwater) {
      if (now >= this.knockT) {
        if (this.knockT > 0) this.bambooKnock(w);
        this.knockT = now + rnd(2, 8) / Math.min(w, 1.5);
      }
    }

    // ---- rain: timbre follows what is over the listener
    const R = this.rain;
    const hiss = Math.pow(R, 1.25) * (0.09 * o + 0.045 * r + 0.045 * cn);
    const ashy = this.ash > R;
    this.cHissHP.to(ashy ? 4800 : 1800 * o + 520 * r + 1200 * cn, now, 0.3);
    this.cHissLP.to(ashy ? 9500 : 11000 * o + 2300 * r + 5500 * cn, now, 0.3);
    this.cHissG.to(hiss + this.ash * 0.013, now, 0.3);
    this.cBodyF.to(520 * o + 330 * r + 450 * cn, now, 0.3);
    this.cBodyG.to(Math.pow(R, 1.5) * (0.22 * o + 0.42 * r + 0.16 * cn) * (1 + 0.4 * this.storm), now, 0.3);
    this.cDropLP.to(12000 * o + 3600 * r + 5200 * cn, now, 0.3);
    this.cDropRoom.to(0.3 * r, now, 0.3);
    this.cShelf.to(-10 * this.snow - 4 * this.fog - 2 * this.ash, now, 0.8);
    this.clump = clamp(this.clump + rnd(-0.12, 0.12), 0, 1);
    if (R > 0.02) {
      const rate = R * (34 * o + 12 * r + 16 * cn * (0.35 + 1.5 * this.clump)) * (1 + 0.3 * this.storm);
      if (this.dropT < now) this.dropT = now;
      let n = 0;
      while (this.dropT < now + 0.1 && n++ < 10) {
        this.drop(this.dropT, f.cover, R);
        this.dropT += poisson(Math.max(rate, 0.5));
      }
      // now and then a run of drips lets go of the eaves
      if (f.cover === 'roof' && now >= this.eaveT) {
        if (this.eaveT > 0) this.eaveRun(now + 0.05, R);
        this.eaveT = now + rnd(2.5, 8) / (0.35 + R);
      }
    }
    if (this.ash > 0.05) {
      if (this.ashT < now) this.ashT = now;
      while (this.ashT < now + 0.1) {
        c.blip(pick(c.ticks.pat), this.dropFan.any(), this.ashT, rnd(2.2, 3.2), rnd(0.01, 0.025) * this.ash);
        this.ashT += poisson(4 * this.ash);
      }
    }

    // ---- water near the listener
    const coastal = COASTAL[f.biome] ?? 0;
    const nw = clamp(f.nearWater, 0, 1);
    const streamAmt = nw * (1 - coastal) * (f.biome === 'marsh' ? 0.45 : 1);
    const shoreAmt = nw * coastal;
    this.cNearG.to(Math.pow(streamAmt, 1.4) * 1.2, now, 0.3);
    this.cShoreG.to(Math.pow(shoreAmt, 1.2), now, 0.4);
    if (streamAmt > 0.05) {
      if (this.plipT < now) this.plipT = now;
      while (this.plipT < now + 0.1) {
        c.blip(pick(c.ticks.drip), this.wetFan.any(), this.plipT, rnd(0.8, 2.1), (0.008 + 0.035 * Math.random() ** 3) * streamAmt);
        this.plipT += poisson(3 + 9 * streamAmt);
      }
    }
    if (shoreAmt > 0.02) {
      if (now + 0.2 >= this.waveT) this.wave(Math.max(this.waveT, now + 0.05));
    } else this.waveT = now + 0.4;

    // ---- underwater: close the master low-pass, bring in the pressure bed and bubbles
    const uw = f.underwater;
    this.cUnderF.to(uw ? 500 : 20000, now, uw ? 0.1 : 0.16);
    this.cUnderQ.to(uw ? 1.7 : 0.6, now, 0.2);
    this.cUwG.to(uw ? 0.3 + 0.1 * this.wander0 : 0, now, 0.35);
    if (uw) {
      if (this.bubT < now) this.bubT = now;
      while (this.bubT < now + 0.1) {
        const rate = rnd(0.55, 1.5);
        const n = chance(0.2) ? 4 : 1; // sometimes a little rising string of them
        for (let i = 0; i < n; i++) c.blip(pick(c.ticks.bub), this.uwFan.any(), this.bubT + i * 0.07, rate * (1 + i * 0.12), 0.04 + 0.13 * Math.random() ** 2);
        this.bubT += poisson(2.6);
      }
    }

    this.tickAnchors(now, w, streamAmt);
  }

  // ---------------------------------------------------------------- rain drops

  private drop(t: number, cover: AudioFrame['cover'], R: number): void {
    const c = this.c;
    const lvl = 0.28 + 0.28 * R;
    const dest = this.dropFan.any();
    const u = Math.random();
    if (cover === 'open') {
      if (u < 0.88) c.blip(pick(c.ticks.tick), dest, t, rnd(0.7, 1.6), (0.04 + 0.3 * Math.random() ** 3) * lvl);
      else c.blip(pick(c.ticks.drip), dest, t, rnd(0.9, 1.8), (0.03 + 0.08 * Math.random() ** 2) * lvl);
    } else if (cover === 'roof') {
      if (u < 0.8) c.blip(pick(c.ticks.tap), dest, t, rnd(0.75, 1.5), (0.04 + 0.22 * Math.random() ** 2) * lvl);
      else c.blip(pick(c.ticks.tick), dest, t, rnd(0.5, 0.8), 0.08 * lvl);
    } else {
      if (u < 0.75) c.blip(pick(c.ticks.pat), dest, t, rnd(0.6, 1.3), (0.05 + 0.2 * Math.random() ** 2) * lvl);
      else if (u < 0.87) c.blip(pick(c.ticks.pat), dest, t, rnd(0.42, 0.6), 0.3 * lvl); // a fat drop off a leaf
      else c.blip(pick(c.ticks.tick), dest, t, rnd(0.45, 0.6), 0.06 * lvl);
    }
  }

  private eaveRun(t0: number, R: number): void {
    const c = this.c;
    const dest = this.dropFan.at(rnd(-1, 1));
    const buf = pick(c.ticks.drip);
    const rate = rnd(0.85, 1.3);
    const n = 4 + ((Math.random() * 6) | 0);
    let t = t0;
    let gap = rnd(0.12, 0.2);
    for (let i = 0; i < n; i++) {
      c.blip(buf, dest, t, rate * rnd(0.97, 1.03), rnd(0.07, 0.12) * (0.6 + 0.4 * R));
      t += gap;
      gap *= rnd(1.02, 1.14);
    }
  }

  // ---------------------------------------------------------------- surf

  /** one wave: a low swell builds, breaks open, then drains away as hiss through the sand */
  private wave(t: number): void {
    const p = rnd(7, 11);
    const size = rnd(0.55, 1);
    this.waveG.gain.setTargetAtTime(0.16 * size, t, p * 0.14);
    this.waveLP.frequency.setTargetAtTime(320, t, 0.3);
    const tb = t + p * 0.38;
    this.waveG.gain.setTargetAtTime(0.45 * size, tb, 0.2);
    this.waveLP.frequency.setTargetAtTime(2400 * (0.7 + 0.3 * size), tb, 0.22);
    this.fizzG.gain.setTargetAtTime(0.12 * size, tb + p * 0.04, 0.35);
    this.fizzHP.frequency.setTargetAtTime(2200, tb, 0.2);
    const tr = t + p * 0.5;
    this.waveG.gain.setTargetAtTime(0.05, tr, p * 0.16);
    this.waveLP.frequency.setTargetAtTime(480, tr, p * 0.14);
    this.fizzG.gain.setTargetAtTime(0, tr + p * 0.06, p * 0.17);
    this.fizzHP.frequency.setTargetAtTime(4600, tr, p * 0.2);
    this.waveT = t + p * rnd(0.82, 1);
  }

  // ---------------------------------------------------------------- anchors

  setAnchors(list: AudioAnchor[]): void {
    const cur = this.anchors;
    if (list.length === cur.length) {
      let same = true;
      for (let i = 0; i < list.length; i++) {
        const a = list[i] as AudioAnchor;
        const b = cur[i] as Anchor;
        if (a.kind !== b.kind || a.x !== b.x || a.y !== b.y || a.z !== b.z) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    const next: Anchor[] = [];
    for (const a of list) {
      if (next.length >= 24) break;
      const old = cur.find((b) => b.kind === a.kind && b.x === a.x && b.y === a.y && b.z === a.z);
      const s = Math.sin(a.x * 12.9898 + a.z * 78.233 + a.y * 37.719) * 43758.5453;
      next.push(old ?? { kind: a.kind, x: a.x, y: a.y, z: a.z, next: 0, seed: s - Math.floor(s), period: 9 });
    }
    this.anchors = next;
  }

  private tickAnchors(now: number, w: number, streamAmt: number): void {
    const c = this.c;
    let fG = 0, fP = 0, fC = 0, fBest = 0, fFill = 0;
    let rG = 0, rP = 0, rC = 0;
    let sG = 0, sP = 0, sC = 0;
    for (let i = 0; i < this.anchors.length; i++) {
      const a = this.anchors[i] as Anchor;
      if (a.next < now - 1) a.next = 0; // was out of range for a while: start its timer afresh
      switch (a.kind) {
        case 'chime': {
          if (!c.spatial(a.x, a.y, a.z, 7, 70)) break;
          if (a.next === 0) a.next = now + rnd(0.3, 2.5);
          if (now >= a.next) {
            const rate = clamp(w - 0.05, 0, 1.6) * 1.1;
            if (rate > 0.02) {
              this.chime(a, clamp(0.35 + 0.5 * w, 0, 1) * rnd(0.45, 1));
              a.next = now + clamp(poisson(rate), 0.14, 14);
            } else a.next = now + 1.2;
          }
          break;
        }
        case 'fountain': {
          if (!c.spatial(a.x, a.y, a.z, 5, 60)) break;
          const g = c.sGain;
          fG += g;
          fP += g * c.sPan;
          fC = Math.max(fC, c.sCut);
          if (a.next === 0) {
            a.period = rnd(8, 11);
            a.next = now + rnd(2, a.period);
          }
          if (g > fBest) {
            fBest = g;
            fFill = 1 - clamp((a.next - now) / a.period, 0, 1);
          }
          if (now + 0.45 >= a.next) {
            this.tok(a, a.next);
            a.period = rnd(8, 11);
            a.next += a.period;
          }
          break;
        }
        case 'fire': {
          if (!c.spatial(a.x, a.y, a.z, 4, 55)) break;
          rG += c.sGain;
          rP += c.sGain * c.sPan;
          rC = Math.max(rC, c.sCut);
          break;
        }
        case 'stream': {
          if (!c.spatial(a.x, a.y, a.z, 8, 70)) break;
          sG += c.sGain;
          sP += c.sGain * c.sPan;
          sC = Math.max(sC, c.sCut);
          break;
        }
        default:
          break; // bells only sound when rung
      }
    }

    // stream anchors (shares the burble with the nearWater bed)
    this.cStreamG.to(Math.min(1, sG) * 0.65, now, 0.25);
    if (sG > 0.004) {
      this.streamPan.set(sP / sG, now, 0.15);
      this.cStreamLP.to(Math.max(1200, sC), now, 0.2);
    }
    if (sG > 0.004 || streamAmt > 0.01) this.stream.tick(now, 1);

    // fountain: thin trickle whose pitch climbs as the bamboo tube fills
    this.cFountG.to(Math.min(1, fG) * 0.5, now, 0.25);
    if (fG > 0.004) {
      this.fountPan.set(fP / fG, now, 0.15);
      this.cFountLP.to(Math.max(1500, fC), now, 0.2);
      this.trickle.tick(now, 0.8 + 0.5 * fFill);
      if (this.fountPlipT < now) this.fountPlipT = now;
      while (this.fountPlipT < now + 0.1) {
        c.blip(pick(c.ticks.drip), this.fountIn, this.fountPlipT, rnd(1.1, 2.4), 0.03 + 0.07 * Math.random() ** 2);
        this.fountPlipT += poisson(7);
      }
    }

    // fire: fluttering low roar + crackle pops
    this.cFireG.to(Math.min(1.2, rG), now, 0.25);
    if (rG > 0.004) {
      this.firePan.set(rP / rG, now, 0.15);
      this.cFireLP.to(Math.max(1500, rC), now, 0.2);
      this.cFireRoar.to(rnd(0.1, 0.24), now, 0.12);
      if (this.popT < now) this.popT = now;
      while (this.popT < now + 0.1) {
        c.blip(pick(c.ticks.pop), this.fireIn, this.popT, rnd(0.5, 2.2), 0.012 + 0.1 * Math.random() ** 3);
        this.popT += poisson(9);
      }
    }
  }

  /** furin wind chime: glassy inharmonic partials with a beating twin on the fundamental */
  private chime(a: Anchor, strength: number): void {
    const v = this.c.voice(this.c.amb, 0.1 * strength, { pos: a, ref: 7, maxDist: 70, prio: 1, send: 0.2 });
    if (!v) return;
    const f0 = 2050 + 1500 * a.seed;
    const beat = 2.5 + 4 * ((a.seed * 7.31) % 1);
    const dec = 1.5 + 1.1 * ((a.seed * 3.77) % 1);
    const t = v.t;
    v.modal(t, [f0, f0 + beat, f0 * 1.513, f0 * 2.71, f0 * 4.17], [0.55, 0.4, 0.16, 0.22, 0.07], [dec, dec * 0.92, dec * 0.45, 0.3, 0.12]);
    v.noise(t, 0.012, { type: 'highpass', f: 5000, q: 0.7, peak: 0.14 });
    if (chance(0.3)) {
      // the clapper bounces back for a second, lighter touch
      const t2 = t + rnd(0.07, 0.16);
      v.modal(t2, [f0, f0 + beat, f0 * 2.71], [0.28, 0.2, 0.1], [dec * 0.8, dec * 0.7, 0.2]);
    }
  }

  /** shishi-odoshi: the tube tips and pours, swings back and knocks its stone */
  private tok(a: Anchor, when: number): void {
    const c = this.c;
    const v = c.voice(c.amb, 0.16, { pos: a, ref: 5, maxDist: 60, prio: 1, send: 0.2 });
    if (!v) return;
    const tk = Math.max(when, v.t + 0.02);
    const t0 = Math.max(v.t, tk - 0.42);
    v.noise(t0, 0.4, { type: 'bandpass', f: 1500, f1: 800, q: 1.1, peak: 0.18, a: 0.12, hold: 0.12 });
    for (let i = 0; i < 3; i++) v.play(pick(c.ticks.drip), t0 + 0.1 + i * rnd(0.05, 0.09), 0.08, rnd(0.9, 1.5));
    const fb = 430 + 100 * a.seed;
    v.modal(tk, [fb, fb * 2.31, fb * 3.87, fb * 5.2], [0.9, 0.42, 0.2, 0.08], [0.17, 0.08, 0.045, 0.03]);
    v.noise(tk, 0.07, { type: 'bandpass', f: fb, q: 9, peak: 1.6 }); // the air column inside the tube
    v.noise(tk, 0.014, { type: 'bandpass', f: 2100, q: 1.2, peak: 0.4 });
    v.modal(tk + rnd(0.19, 0.24), [fb * 1.01, fb * 2.31], [0.2, 0.08], [0.1, 0.05]); // small rebound
  }

  /** two bamboo stalks touching in the wind, somewhere in the grove */
  private bambooKnock(w: number): void {
    const c = this.c;
    const pos = c.around(rnd(8, 32), rnd(2, 7), this.scratch);
    const v = c.voice(c.amb, 0.14 * clamp(w, 0.4, 1.2), { pos, ref: 8, prio: 0, send: 0.25 });
    if (!v) return;
    const fb = rnd(250, 430);
    const n = chance(0.45) ? 2 : 1;
    let t = v.t;
    for (let i = 0; i < n; i++) {
      const amp = i === 0 ? 1 : 0.5;
      v.modal(t, [fb, fb * 2.3, fb * 3.9], [0.8 * amp, 0.35 * amp, 0.15 * amp], [0.13, 0.06, 0.03]);
      v.noise(t, 0.01, { type: 'bandpass', f: 1700, q: 1, peak: 0.2 * amp });
      t += rnd(0.09, 0.2);
    }
    if (chance(0.25)) {
      // a long dry creak as a stalk bends
      const g = v.gain(0);
      const bp = v.biquad('bandpass', rnd(600, 900), 7, g);
      const o = v.osc('sawtooth', rnd(60, 95), t, t + 0.5, bp);
      o.frequency.linearRampToValueAtTime(rnd(90, 140), t + 0.45);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.15);
      g.gain.linearRampToValueAtTime(0, t + 0.48);
    }
  }

  /** large bronze temple bell: deep hum with slow beating, struck by a wooden beam */
  ringBell(pos?: P3): void {
    const c = this.c;
    let p = pos;
    if (!p) {
      // default to the nearest bell anchor, if any
      let best = Infinity;
      for (const a of this.anchors) {
        if (a.kind !== 'bell') continue;
        const d = (a.x - c.lx) ** 2 + (a.y - c.ly) ** 2 + (a.z - c.lz) ** 2;
        if (d < best) {
          best = d;
          p = a;
        }
      }
    }
    const v = c.voice(c.amb, 0.12, { pos: p, ref: 28, maxDist: 240, prio: 2, send: 0.4 });
    if (!v) return;
    const t = v.t;
    const f = 104;
    v.modal(
      t,
      [f, f * 2.03, f * 2.76, f * 3.62, f * 4.07, f * 5.2, f * 6.4, f * 8.1],
      [0.55, 0.42, 0.3, 0.2, 0.2, 0.12, 0.08, 0.05],
      [13, 10, 6.5, 4.5, 3.6, 2.4, 1.6, 1],
      1,
      undefined,
      0.006,
    );
    // detuned twins: the slow "unari" beating of a cast bell
    v.modal(t, [f + 0.55, f * 2.03 + 0.9, f * 2.76 + 1.6], [0.45, 0.3, 0.18], [12, 9, 6], 1, undefined, 0.006);
    // the beam: soft thud, then a brief broadband clang
    v.tone(t, 0.12, { f: 150, f1: 70, peak: 0.5 });
    v.noise(t, 0.05, { type: 'lowpass', f: 900, q: 0.7, peak: 0.4 });
    v.noise(t, 0.6, { type: 'bandpass', f: 1500, f1: 700, q: 0.8, peak: 0.12, a: 0.004 });
  }
}
