// Title screen and the choosing at the spring. Both sit over the live world:
// the title drifts around the dawn-lit spring under falling petals; the
// choosing stands the four spring-born spirits at the water's edge and walks
// the camera from one to the next.
import type { Game } from '../game/game';
import { Creature, rollIndividual } from '../game/creature';
import { SPECIES, STARTER_IDS } from '../data/species';
import { move as moveDef } from '../data/moves';
import { ELEMENT_INK } from '../render/palette';
import { LAKES, SPAWN_POINT } from '../data/world';
import { clearGame, importSave, loadGame, type SaveData } from '../core/save';
import { keyLabel } from '../core/input';
import { elementTag, esc, firstChar, h, sealHtml } from './dom';
import { damp, dampAngle } from '../core/math';

export class TitleScreen {
  readonly root = h('div', 'layer interactive');
  readonly starter = h('div', 'layer');
  private sel = 0;
  private items: { label: string; sub?: string; run: () => void; off?: boolean }[] = [];
  private list!: HTMLElement;
  private save: SaveData | null = null;
  private stand: Creature[] = [];
  private pick = 0;
  private busy = false;
  private el: Record<string, HTMLElement> = {};

  constructor(private game: Game, parent: HTMLElement) {
    this.root.id = 'title';
    this.root.innerHTML = `
      <div class="head">
        <h1>SUMIREI</h1>
        <div class="rule"></div>
        <div class="sub">Spirits of the Ink Dawn</div>
      </div>
      <div class="choices inklist" data-k="list"></div>
      <div class="foot caps">An original ink-and-paper creature world · best with sound</div>
      <div class="panel">
        <span class="cap tate caps">Yaoshima</span>
        <div class="mark kanji tate">墨霊</div>
        <span class="hanko">霊</span>
      </div>`;
    this.starter.id = 'starter';
    this.starter.innerHTML = `
      <div class="head">At the first spring<b>Whose eyes will you open?</b></div>
      <div class="card">
        <div class="k kanji tate" data-k="k"></div>
        <div>
          <h2 data-k="n"></h2>
          <div class="ttl" data-k="t"></div>
          <div class="els" data-k="e"></div>
          <p data-k="l"></p>
          <div style="display:flex;gap:14px" data-k="m"></div>
        </div>
      </div>
      <div class="pips" data-k="pips"></div>
      <div class="go" data-k="go"><div class="banner"><span class="key">ENTER</span><span>Wake as this spirit</span></div></div>`;
    parent.append(this.root, this.starter);
    this.list = this.root.querySelector('[data-k="list"]')!;
    this.starter.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e));
    this.el.go.addEventListener('click', () => this.confirm());
  }

  async show() {
    const g = this.game;
    g.mode = 'title';
    const spring = LAKES[0];
    Object.assign(g.stage, { x: spring.x, z: spring.z, dist: 30, height: 7, look: 2.4 });
    g.hour = 6.1;
    g.overlay.rain = 9;
    this.save = await loadGame();
    this.build();
    this.root.classList.add('on');
  }

  private build() {
    const s = this.save;
    this.items = [];
    if (s) {
      const lead = SPECIES[s.pack[Math.min(s.active, s.pack.length - 1)]?.species];
      this.items.push({ label: 'Continue', sub: `Day ${s.day} · ${lead ? lead.name : ''} · ${s.pack.length + s.roster.length} bonded`, run: () => this.continue() });
    }
    this.items.push({ label: 'New Journey', run: () => this.begin() });
    this.items.push({ label: 'Load from file', run: () => this.import() });
    this.sel = 0;
    this.render();
  }

  private render() {
    this.list.innerHTML = this.items
      .map((it, i) => `<div class="inkitem ${i === this.sel ? 'sel' : ''} ${it.off ? 'off' : ''}" data-i="${i}"><span class="hanko">${i === 0 ? '始' : '墨'}</span><span>${it.label}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></div>`)
      .join('');
    this.list.querySelectorAll<HTMLElement>('.inkitem').forEach((e) => {
      const i = Number(e.dataset.i);
      e.addEventListener('mouseenter', () => {
        if (this.sel !== i) {
          this.sel = i;
          this.game.audio?.ui('hover');
          this.render();
        }
      });
      e.addEventListener('click', () => this.items[i].run());
    });
  }

  private async continue() {
    if (this.busy || !this.save) return;
    this.busy = true;
    const g = this.game;
    g.audio?.ui('stamp');
    g.audio?.ink('wipe');
    this.root.classList.remove('on');
    await g.overlay.through('wipe', () => {
      g.overlay.rain = 0;
      g.loadSave(this.save!);
    }, { inDur: 0.7, outDur: 0.9, hold: 0.25, out: 'bloom' });
    g.input.lock();
    this.busy = false;
  }

  private async import() {
    const d = await importSave();
    if (!d) {
      this.game.toast('That file is not a Sumirei journey', 'warn');
      return;
    }
    this.save = d;
    this.continue();
  }

  /** Stand the four starters around the spring and move to the choosing. */
  private async begin() {
    if (this.busy) return;
    this.busy = true;
    const g = this.game;
    g.audio?.ui('stamp');
    g.audio?.ink('wipe');
    this.root.classList.remove('on');
    await g.overlay.through('wipe', async () => {
      await clearGame();
      const spring = LAKES[0];
      STARTER_IDS.forEach((id, i) => {
        const a = Math.PI * 0.5 + (i - (STARTER_IDS.length - 1) / 2) * 0.62;
        const r = spring.r + 2.6;
        const c = new Creature(rollIndividual(id, 5));
        c.ind.shiny = false;
        c.team = 'pack';
        c.place(spring.x + Math.cos(a) * r, spring.z + Math.sin(a) * r, a + Math.PI * 0.5 + Math.PI);
        // face outward from the water, toward the viewer
        c.yaw = Math.atan2(Math.cos(a), Math.sin(a));
        c.syncRig();
        g.R.scene.add(c.rig.root);
        this.stand.push(c);
      });
      g.mode = 'starter';
      g.hour = 6.6;
      this.pick = 0;
      this.focus(true);
      this.renderStarter();
      this.starter.classList.add('on');
    }, { inDur: 0.7, outDur: 0.9, hold: 0.2 });
    this.busy = false;
  }

  private focus(snap = false) {
    const c = this.stand[this.pick];
    if (!c) return;
    const g = this.game;
    const st = g.stage;
    const out = Math.atan2(c.pos.x - LAKES[0].x, c.pos.z - LAKES[0].z);
    const want = { x: c.pos.x, z: c.pos.z, dist: 1.25 + c.height * 2.1, height: c.height * 1.05 + 0.22, look: c.height * 0.55 };
    if (snap) {
      Object.assign(st, want);
      st.yaw = out + 0.5;
    }
    this.want = { ...want, yaw: out + 0.75 };
  }
  private want: { x: number; z: number; dist: number; height: number; look: number; yaw: number } | null = null;

  private renderStarter() {
    const c = this.stand[this.pick];
    if (!c) return;
    const sp = c.sp;
    this.el.k.textContent = sp.kanji;
    this.el.n.textContent = sp.name;
    this.el.t.textContent = sp.title;
    this.el.e.innerHTML = sp.elements.map((e) => elementTag(e)).join('');
    this.el.l.textContent = sp.lore;
    this.el.m.innerHTML = [sp.fast[0], sp.charged[0]]
      .map((id) => {
        const m = moveDef(id);
        return `<div style="display:flex;align-items:center;gap:6px;font-size:12px" class="caps">${sealHtml(m.kanji, ELEMENT_INK[m.element])}<span style="text-shadow:0 0 5px var(--washi),0 0 2px var(--washi)">${esc(m.name)}</span></div>`;
      })
      .join('');
    this.el.pips.innerHTML = `<span class="key">${keyLabel('left')}</span>` + this.stand.map((s, i) => sealHtml(firstChar(s.sp.kanji), '', i === this.pick ? 'sel' : '').replace('class="seal', `data-i="${i}" class="seal`)).join('') + `<span class="key">${keyLabel('right')}</span>`;
    this.el.pips.querySelectorAll<HTMLElement>('.seal').forEach((e) => e.addEventListener('click', () => this.choose(Number(e.dataset.i))));
  }

  private choose(i: number) {
    const n = this.stand.length;
    this.pick = ((i % n) + n) % n;
    this.game.audio?.ui('tab');
    this.game.audio?.cry(this.pick * 97 + 11, this.stand[this.pick].height, 'call', this.stand[this.pick].pos);
    this.focus();
    this.renderStarter();
  }

  private async confirm() {
    if (this.busy) return;
    this.busy = true;
    const g = this.game;
    const id = this.stand[this.pick].sp.id;
    g.audio?.ui('stamp');
    g.audio?.ink('bloom');
    this.starter.classList.remove('on');
    await g.overlay.through('bloom', async () => {
      for (const c of this.stand) c.dispose();
      this.stand.length = 0;
      g.overlay.rain = 0;
      await g.newGame(id);
    }, { inDur: 0.8, outDur: 1.3, hold: 0.35 });
    g.input.lock();
    g.overlay.burst(window.innerWidth / 2, window.innerHeight * 0.55, 40, 360);
    this.busy = false;
  }

  update(dt: number) {
    const g = this.game;
    const inp = g.input;
    if (g.mode === 'title' && !this.busy) {
      if (inp.hit('uiDown')) this.move(1);
      if (inp.hit('uiUp')) this.move(-1);
      if (inp.hit('uiAccept')) this.items[this.sel]?.run();
    } else if (g.mode === 'starter') {
      for (const c of this.stand) c.step(dt, g.collision);
      const w = this.want;
      if (w) {
        const st = g.stage;
        st.x = damp(st.x, w.x, 4, dt);
        st.z = damp(st.z, w.z, 4, dt);
        st.dist = damp(st.dist, w.dist, 4, dt);
        st.height = damp(st.height, w.height, 4, dt);
        st.look = damp(st.look, w.look, 4, dt);
        // hold the three-quarter view instead of the title's slow drift
        st.yaw = dampAngle(st.yaw, w.yaw + Math.sin(performance.now() * 0.0004) * 0.25, 3, dt);
      }
      if (!this.busy) {
        if (inp.hit('uiRight')) this.choose(this.pick + 1);
        if (inp.hit('uiLeft')) this.choose(this.pick - 1);
        if (inp.hit('uiAccept')) this.confirm();
      }
    }
    void SPAWN_POINT;
  }

  private move(d: number) {
    const n = this.items.length;
    this.sel = (this.sel + d + n) % n;
    this.game.audio?.ui('hover');
    this.render();
  }
}
