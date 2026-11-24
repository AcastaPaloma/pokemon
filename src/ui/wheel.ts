// The pack wheel: hold the key and an ensō opens with the pack set around it.
// Push the mouse toward a spirit and let go to pour yourself into it.
import type { Game } from '../game/game';
import { keyLabel } from '../core/input';
import { esc, firstChar, h, sealHtml } from './dom';

export class Wheel {
  readonly root = h('div', 'layer');
  private vx = 0;
  private vy = 0;
  private pick = -1;
  private open = false;
  private key = '';

  constructor(private game: Game, parent: HTMLElement) {
    this.root.id = 'wheel';
    parent.appendChild(this.root);
  }

  private render() {
    const g = this.game;
    const n = g.pack.length;
    const R = 190;
    // an ensō: one breath of the brush, left open
    const enso = `<svg class="enso" viewBox="0 0 420 420"><path d="M 210 40 A 170 170 0 1 1 96 84" fill="none" stroke="#1d1a1a" stroke-width="15" stroke-linecap="round" filter="url(#rough)" opacity="0.9"/><path d="M 210 40 A 170 170 0 0 1 300 68" fill="none" stroke="#1d1a1a" stroke-width="22" stroke-linecap="round" filter="url(#rough)"/></svg>`;
    const slots = g.pack
      .map((c, i) => {
        const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
        return `<div class="slot ${i === this.pick ? 'sel' : ''} ${c.fainted ? 'down' : ''}" style="translate:${(Math.cos(a) * R).toFixed(0)}px ${(Math.sin(a) * R).toFixed(0)}px">${sealHtml(firstChar(c.sp.kanji))}<span class="caps">${esc(c.ind.nickname ?? c.sp.name)}</span></div>`;
      })
      .join('');
    const p = g.pack[this.pick];
    this.root.innerHTML = `${enso}${slots}<div class="mid">${p ? `${p === g.active ? 'Worn now' : p.fainted ? 'Fallen' : 'Inhabit'}<b>${esc(p.sp.name)}</b>` : `Release <span class="key">${keyLabel('wheel')}</span> to choose`}</div>`;
  }

  update() {
    const g = this.game;
    const inp = g.input;
    const want = g.mode === 'play' && inp.held('wheel') && !g.switching && g.pack.length > 1;
    if (want && !this.open) {
      this.open = true;
      g.wheelOpen = true;
      this.vx = this.vy = 0;
      this.pick = -1;
      this.key = '';
      this.root.classList.add('on');
      g.audio?.ui('open');
    }
    if (!this.open) return;
    if (!want) {
      this.open = false;
      g.wheelOpen = false;
      this.root.classList.remove('on');
      if (this.pick >= 0 && g.pack[this.pick] !== g.active) g.switchTo(this.pick);
      return;
    }
    // the mouse pushes a virtual stick; it springs back so small moves re-aim quickly
    this.vx = this.vx * 0.9 + inp.dx;
    this.vy = this.vy * 0.9 + inp.dy;
    const n = g.pack.length;
    let pick = this.pick;
    if (Math.hypot(this.vx, this.vy) > 26) {
      const a = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      pick = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
    }
    const key = `${pick}|${g.pack.map((c) => c.id + (c.fainted ? 'x' : '')).join(',')}`;
    if (key !== this.key) {
      if (pick !== this.pick && this.key) g.audio?.ui('hover');
      this.pick = pick;
      this.key = key;
      this.render();
    }
  }
}
