// In-world HUD: the inhabited creature's vitals and ink well, move seals, the
// pack down the left edge, a compass strip, sky block, reticle and target,
// prompts, paper-slip toasts, region banners and brushed damage numbers.
import * as THREE from 'three';
import type { Game, Toast } from '../game/game';
import type { Creature } from '../game/creature';
import { move as moveDef } from '../data/moves';
import { ELEMENTS, WEATHER } from '../data/elements';
import { ELEMENT_INK } from '../render/palette';
import { keyLabel } from '../core/input';
import { SITES, type RegionDef, type SiteDef } from '../data/world';
import { elementTag, esc, firstChar, h, sealHtml } from './dom';
import { wrapAngle } from '../core/math';

const TOD_KANJI = { dawn: '暁', day: '昼', dusk: '夕', night: '夜' } as const;
const _v = new THREE.Vector3();

export class Hud {
  readonly root = h('div', 'layer');
  private el: Record<string, HTMLElement> = {};
  private cache: Record<string, string | number> = {};
  private packEls: HTMLElement[] = [];
  private ticks: { el: HTMLElement; bearing: number }[] = [];
  private marks: HTMLElement[] = [];
  private floats: HTMLElement;

  constructor(private game: Game, parent: HTMLElement) {
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="packlist" data-k="pack"></div>
      <div class="compass" data-k="compass"></div>
      <div class="needle"></div>
      <div class="where caps" data-k="where"></div>
      <div class="skyblock">
        <div class="meta"><div class="caps" data-k="day"></div><div data-k="wname" class="caps"></div><div class="boost" data-k="boost"></div></div>
        <div class="big kanji tate" data-k="sky"></div>
      </div>
      <div class="reticle" data-k="reticle"><i></i></div>
      <div class="target" data-k="target" style="opacity:0">
        <div><span data-k="tname"></span> <small data-k="tlvl"></small></div>
        <div class="bar"><i></i><b data-k="thp"></b></div>
        <div data-k="tel"></div>
      </div>
      <div class="prompt" data-k="prompt" style="opacity:0"><div class="banner"><span class="key" data-k="pkey">F</span><span data-k="ptext"></span></div></div>
      <div class="lockhint" data-k="lock" style="opacity:0"><div class="banner"><span>Click to step back into the world</span></div></div>
      <div class="toasts" data-k="toasts"></div>
      <div class="region" data-k="region"><div class="k kanji tate" data-k="rk"></div><div class="t"><b data-k="rn"></b><span data-k="rb"></span></div></div>
      <div class="vital">
        <div class="name-plate kanji tate" data-k="plate"></div>
        <div class="col">
          <div class="who"><span data-k="name"></span><small data-k="lvl"></small></div>
          <div class="bar" data-k="hpbar"><i></i><b data-k="hp"></b></div>
          <div class="bar thin"><i></i><b data-k="xp"></b></div>
        </div>
        <div class="well">
          <svg viewBox="0 0 64 64">
            <defs><clipPath id="wellclip"><rect data-k="wellrect" x="0" y="64" width="64" height="64"/></clipPath></defs>
            <circle cx="32" cy="32" r="27" fill="rgba(244,233,214,0.82)" stroke="#1d1a1a" stroke-width="2" filter="url(#rough-soft)"/>
            <circle cx="32" cy="32" r="25" fill="#1d1a1a" clip-path="url(#wellclip)" filter="url(#rough-soft)"/>
            <circle data-k="wellring" cx="32" cy="32" r="30.5" fill="none" stroke="#c8553d" stroke-width="2.2" opacity="0"/>
          </svg>
          <div class="num" data-k="energy"></div>
        </div>
        <div class="moves" data-k="moves"></div>
      </div>
      <div class="hints" data-k="hints"></div>
      <div data-k="floats"></div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e));
    this.floats = this.el.floats;

    // compass ticks
    const names: Record<number, string> = { 0: '北', 90: '東', 180: '南', 270: '西' };
    for (let b = 0; b < 360; b += 30) {
      const t = h('div', 'tick ' + (names[b] ? 'kanji' : 'minor'), names[b] ?? '·');
      this.el.compass.appendChild(t);
      this.ticks.push({ el: t, bearing: (b * Math.PI) / 180 });
    }
    for (let i = 0; i < 3; i++) {
      const m = h('div', 'tick mark');
      this.el.compass.appendChild(m);
      this.marks.push(m);
    }
    this.el.hints.innerHTML = [
      ['wheel', 'Pack wheel'],
      ['aura', 'Heightened senses'],
      ['menu', 'Scroll'],
    ]
      .map(([a, t]) => `<div><span class="caps">${t}</span><span class="key">${keyLabel(a as 'wheel')}</span></div>`)
      .join('');

    game.on('toast', (t: Toast) => this.toast(t));
    game.on('region', (r: RegionDef) => this.banner(r.kanji, r.name, r.blurb));
    game.on('site', (s: SiteDef) => this.banner(s.kanji, s.name, 'Found.'));
    game.on('float', (f: { x: number; y: number; z: number; text: string; kind: string }) => this.float(f));
  }

  private set(key: string, v: string | number, apply: (e: HTMLElement, v: string) => void) {
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    apply(this.el[key], String(v));
  }
  private text(key: string, v: string | number) {
    this.set(key, v, (e, s) => (e.textContent = s));
  }
  private html(key: string, v: string) {
    this.set(key, v, (e, s) => (e.innerHTML = s));
  }
  private style(key: string, prop: string, v: string | number, ck = key + prop) {
    if (this.cache[ck] === v) return;
    this.cache[ck] = v;
    this.el[key].style.setProperty(prop, String(v));
  }

  toast(t: Toast) {
    const e = h('div', 'toast ' + t.kind);
    const mark = t.kanji ? firstChar(t.kanji) : t.kind === 'warn' ? '否' : t.kind === 'level' ? '昇' : t.kind === 'seal' ? '印' : '記';
    e.innerHTML = `<span class="hanko">${mark}</span><span>${esc(t.text)}</span>`;
    this.el.toasts.prepend(e);
    while (this.el.toasts.children.length > 5) this.el.toasts.lastElementChild!.remove();
    setTimeout(() => e.classList.add('out'), 3600);
    setTimeout(() => e.remove(), 4100);
  }

  banner(kanji: string, name: string, blurb: string) {
    const r = this.el.region;
    this.el.rk.textContent = kanji;
    this.el.rn.textContent = name;
    this.el.rb.textContent = blurb;
    r.classList.remove('show');
    void r.offsetWidth;
    r.classList.add('show');
  }

  private float(f: { x: number; y: number; z: number; text: string; kind: string }) {
    _v.set(f.x, f.y, f.z).project(this.game.R.camera);
    if (_v.z > 1) return;
    const e = h('div', 'float ' + f.kind, esc(f.text));
    e.style.left = ((_v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30).toFixed(0) + 'px';
    e.style.top = ((0.5 - _v.y * 0.5) * window.innerHeight).toFixed(0) + 'px';
    this.floats.appendChild(e);
    setTimeout(() => e.remove(), 900);
  }

  private moveHtml(c: Creature): string {
    const g = this.game;
    const out: string[] = [];
    const one = (id: string | undefined, action: 'fast' | 'charged' | 'swapCharged', armed: boolean, label: string) => {
      if (!id) return;
      const m = moveDef(id);
      const ready = m.kind === 'fast' ? true : c.energy >= m.energy;
      out.push(`<div class="mv ${ready ? '' : 'wait'} ${armed ? 'armed' : ''}">${sealHtml(m.kanji, ELEMENT_INK[m.element] === '#4a3f5c' ? '#c9b8e6' : ELEMENT_INK[m.element])}<span class="caps">${esc(m.name)}</span><span class="key">${label}</span></div>`);
    };
    one(c.ind.fast, 'fast', false, keyLabel('fast'));
    const slot = g.control.chargedSlot;
    one(c.ind.charged, 'charged', slot === 0, slot === 0 ? keyLabel('charged') : keyLabel('swapCharged'));
    one(c.ind.charged2, 'swapCharged', slot === 1, slot === 1 ? keyLabel('charged') : keyLabel('swapCharged'));
    return out.join('');
  }

  update() {
    const g = this.game;
    const a = g.active;
    const on = (g.mode === 'play' || g.mode === 'menu') && !!a;
    this.root.classList.toggle('on', on && g.mode === 'play');
    const night = g.sky.night > 0.55;
    if (this.cache.night !== (night ? 1 : 0)) {
      this.cache.night = night ? 1 : 0;
      this.root.classList.toggle('night', night);
    }
    if (!on || !a) return;

    // ---- vitals
    this.text('plate', a.sp.kanji);
    this.text('name', a.awakened > 0 && a.sp.awakening ? a.sp.awakening.name : (a.ind.nickname ?? a.sp.name));
    this.text('lvl', `MASTERY ${a.level}`);
    const hp = Math.round((a.hp / a.maxHp) * 100);
    this.style('hp', 'width', hp + '%');
    this.set('hpbar', hp < 28 ? 'low' : '', (e, v) => e.classList.toggle('low', v === 'low'));
    const need = Math.round(40 + a.level * 22 + a.level * a.level * 1.2);
    this.style('xp', 'width', Math.round((a.ind.xp / need) * 100) + '%');
    const en = Math.round(a.energy);
    this.text('energy', en >= 100 ? '満' : en);
    this.set('wellrect', en, (e, v) => e.setAttribute('y', String(64 - (Number(v) / 100) * 58 - 3)));
    const canAwaken = !!a.sp.awakening && g.journal.seals.has(a.sp.awakening.seal) && en >= 100 && a.awakened <= 0;
    this.set('wellring', canAwaken ? 1 : 0, (e, v) => e.setAttribute('opacity', v));
    const ch = moveDef(a.ind.charged);
    const ch2 = a.ind.charged2 ? moveDef(a.ind.charged2) : null;
    const key = `${a.id}|${a.ind.fast}|${a.ind.charged}|${a.ind.charged2}|${g.control.chargedSlot}|${a.energy >= ch.energy}|${ch2 ? a.energy >= ch2.energy : 0}`;
    if (this.cache.moves !== key) {
      this.cache.moves = key;
      this.el.moves.innerHTML = this.moveHtml(a);
    }

    // ---- pack
    const pk = g.pack.map((c) => `${c.id}:${c === a ? 1 : 0}:${c.fainted ? 1 : 0}:${Math.round((c.hp / c.maxHp) * 20)}:${c.sp.id}`).join('|');
    if (this.cache.pack !== pk) {
      this.cache.pack = pk;
      this.el.pack.innerHTML = g.pack
        .map(
          (c, i) =>
            `<div class="pk ${c === a ? 'active' : ''} ${c.fainted ? 'down' : ''}"><span class="n">${i + 1}</span><span class="hanko">${firstChar(c.sp.kanji)}</span><div><div class="caps">${esc(c.ind.nickname ?? c.sp.name)}</div><div class="hp"><b style="width:${Math.round((c.hp / c.maxHp) * 100)}%"></b></div></div></div>`,
        )
        .join('');
    }

    // ---- compass (bearing 0 = north = -z)
    const heading = -g.control.yaw + Math.PI;
    const W = 420;
    const span = 1.9;
    for (const t of this.ticks) {
      const d = wrapAngle(t.bearing - heading);
      const vis = Math.abs(d) < span / 2 + 0.2;
      t.el.style.display = vis ? '' : 'none';
      if (vis) t.el.style.left = (W / 2 + (d / span) * W).toFixed(1) + 'px';
    }
    const marks: { x: number; z: number; k: string }[] = [];
    const home = SITES.find((s) => s.id === g.journal.lastSanctuary);
    if (home) marks.push({ x: home.x, z: home.z, k: '杜' });
    if (g.auraT > 0) {
      const seal = g.nearestSeal();
      if (seal) marks.push({ x: seal.x, z: seal.z, k: '印' });
    }
    this.marks.forEach((m, i) => {
      const mk = marks[i];
      if (!mk) {
        m.style.display = 'none';
        return;
      }
      const bearing = Math.atan2(mk.x - a.pos.x, -(mk.z - a.pos.z));
      const d = wrapAngle(bearing - heading);
      const vis = Math.abs(d) < span / 2;
      m.style.display = vis ? '' : 'none';
      if (vis) {
        m.style.left = (W / 2 + (d / span) * W).toFixed(1) + 'px';
        m.textContent = mk.k;
      }
    });
    const seal = g.auraT > 0 ? g.nearestSeal() : null;
    this.text('where', seal ? `A seal stirs · ${Math.round(seal.d)} m` : '');

    // ---- sky block
    const hh = Math.floor(g.hour);
    const mm = Math.floor((g.hour - hh) * 6) * 10;
    this.text('day', `Day ${g.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const w = WEATHER[g.weather.current];
    this.text('sky', TOD_KANJI[g.tod] + [...w.kanji][0]);
    this.text('wname', w.name);
    this.text('boost', w.boosts.map((b) => ELEMENTS[b].kanji).join(' ') + ' ↑');

    // ---- reticle and target
    const t = g.control.target;
    const ret = this.el.reticle;
    const locked = !!t && g.input.locked;
    if (this.cache.ret !== (locked ? (t!.team !== a.team ? 2 : 1) : 0)) {
      this.cache.ret = locked ? (t!.team !== a.team ? 2 : 1) : 0;
      ret.classList.toggle('locked', locked);
      ret.classList.toggle('hostile', locked && t!.team !== a.team);
    }
    this.style('target', 'opacity', locked ? 1 : 0);
    if (locked && t) {
      this.text('tname', t.sp.name);
      this.text('tlvl', `MASTERY ${t.level}${t.team === 'pack' ? ' · PACK' : ''}`);
      this.style('thp', 'width', Math.round((t.hp / t.maxHp) * 100) + '%');
      this.html('tel', t.elements.map((e) => elementTag(e, false)).join(' '));
    }

    // ---- prompts
    const f = g.focus;
    let ptext = '';
    let pkey = keyLabel('interact');
    if (f) ptext = f.label;
    else if (canAwaken) {
      ptext = `Awaken — ${a.sp.awakening!.name}`;
      pkey = keyLabel('awaken');
    } else if (g.atSanctuary() && a.inCombat <= 0) {
      ptext = 'Sanctuary — the pack rests here';
      pkey = keyLabel('menu');
    }
    this.style('prompt', 'opacity', ptext && g.input.locked ? 1 : 0);
    this.text('ptext', ptext);
    this.text('pkey', pkey);
    this.style('lock', 'opacity', g.mode === 'play' && !g.input.locked && !g.switching ? 1 : 0);
  }
}
