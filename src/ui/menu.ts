// The scroll: an ink-wash pause menu laid over the live world, which the post
// pass turns to a sumi-e wash and slides to the right-hand side of the sheet.
// A brushed list runs down the left, tabs are underlined with a stroke across
// the top, and content sits between in ruled panels.
import type { Game } from '../game/game';
import type { Creature } from '../game/creature';
import { maxHpOf, xpToNext } from '../game/creature';
import type { ElementId, Individual, SpeciesDef } from '../data/types';
import { SPECIES, SPECIES_LIST, species } from '../data/species';
import { move as moveDef } from '../data/moves';
import { ELEMENTS, ELEMENT_IDS, WEATHER, WEATHER_IDS } from '../data/elements';
import { ELEMENT_INK } from '../render/palette';
import { REGIONS, SITES } from '../data/world';
import { exportSave, importSave } from '../core/save';
import { keyLabel, type ActionId } from '../core/input';
import { elementTag, esc, firstChar, fmtTime, h, sealHtml } from './dom';
import { paintBase, paintMap } from './mapPainter';

const TABS = [
  { id: 'pack', name: 'Pack', kanji: '群' },
  { id: 'bestiary', name: 'Bestiary', kanji: '図鑑' },
  { id: 'map', name: 'Map', kanji: '地図' },
  { id: 'seals', name: 'Seals', kanji: '印' },
  { id: 'journal', name: 'Journal', kanji: '記' },
  { id: 'settings', name: 'Settings', kanji: '設' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const HABITATS: [string, string][] = [
  ['vale', 'Vale'], ['bamboo', 'Thicket'], ['deepwood', 'Deepwood'], ['plains', 'Plains'], ['highland', 'Heights'], ['volcanic', 'Caldera'],
  ['snow', 'Peaks'], ['marsh', 'Marsh'], ['beach', 'Shore'], ['sea', 'Open Sea'], ['isle', 'Isle'], ['cliff', 'Crags'],
];
const JOURNAL = ['Journey', 'Controls', 'The Ten Currents', 'Weather'];
const SETTINGS = ['Picture', 'Sound', 'Handling', 'Journey'];
const SEALS = ['Awakening Seals', 'Element Stones'];

type PackEntry = { c: Creature; ind: Individual; rest: false } | { c: null; ind: Individual; rest: true };

const inkFor = (e: ElementId) => (e === 'shadow' ? '#c9b8e6' : ELEMENT_INK[e]);

export class Menu {
  readonly root = h('div', 'layer interactive');
  private tab = 0;
  private sel: Record<TabId, number> = { pack: 0, bestiary: 0, map: 0, seals: 0, journal: 0, settings: 0 };
  private pickedSpecies: string | null = null;
  private note = '';
  private openFrame = false;
  private el: Record<string, HTMLElement> = {};

  constructor(private game: Game, parent: HTMLElement) {
    this.root.id = 'menu';
    this.root.innerHTML = `
      <div class="purse" data-k="purse"></div>
      <div class="tabs" data-k="tabs"></div>
      <div class="side" data-k="side"></div>
      <div class="main" data-k="main"></div>
      <div class="caption kanji tate" data-k="caption"></div>
      <div class="hint"><div class="banner"><span data-k="hint"></span></div></div>
      <div class="keys">
        <span><span class="key">ENTER</span>Select</span>
        <span><span class="key">${keyLabel('tabPrev')}</span><span class="key">${keyLabel('tabNext')}</span>Turn</span>
        <span data-act="close" style="cursor:pointer"><span class="key">ESC</span>Close</span>
      </div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e));
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('mouseover', (e) => this.onHover(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    game.on('menu', (open: boolean) => (open ? this.open() : this.hide()));
    game.on('atlas', (a) => paintBase(a));
    // Escape must close and re-capture the pointer inside the key event itself
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && game.mode === 'menu' && !this.openFrame) {
        this.close();
        e.preventDefault();
      }
    });
  }

  private get tabId(): TabId {
    return TABS[this.tab].id;
  }

  open() {
    this.openFrame = true;
    this.note = '';
    this.root.classList.add('on');
    this.render();
    this.game.overlay.burst(window.innerWidth * 0.72, window.innerHeight * 0.3, 14, 220);
  }
  private hide() {
    this.root.classList.remove('on');
    this.game.menuFocus = null;
  }
  close() {
    this.game.closeMenu();
    this.game.input.lock();
  }

  // ---------------------------------------------------------------- data

  private packEntries(): PackEntry[] {
    const g = this.game;
    return [...g.pack.map((c) => ({ c, ind: c.ind, rest: false as const })), ...g.roster.map((ind) => ({ c: null, ind, rest: true as const }))];
  }
  private habitatSpecies(biome: string): SpeciesDef[] {
    return SPECIES_LIST.filter((s) => s.ecology.habitats[0] === biome).sort((a, b) => a.line.localeCompare(b.line) || a.stage - b.stage);
  }
  private sideCount(): number {
    switch (this.tabId) {
      case 'pack': return this.packEntries().length;
      case 'bestiary': return HABITATS.length;
      case 'map': return REGIONS.length;
      case 'seals': return SEALS.length;
      case 'journal': return JOURNAL.length;
      case 'settings': return SETTINGS.length;
    }
  }

  // ---------------------------------------------------------------- render

  render() {
    const g = this.game;
    const id = this.tabId;
    const n = this.sideCount();
    if (this.sel[id] >= n) this.sel[id] = Math.max(0, n - 1);
    const s = this.sel[id];

    this.el.purse.innerHTML = `<span><span class="hanko">縁</span>${g.pack.length + g.roster.length} bonded</span><span><span class="hanko" style="background:var(--sumi)">印</span>${g.journal.seals.size} / ${g.sealAt.size}</span>`;
    this.el.tabs.innerHTML =
      `<span class="key">${keyLabel('tabPrev')}</span>` +
      TABS.map((t, i) => `<div class="tab ${i === this.tab ? 'sel' : ''}" data-act="tab" data-i="${i}"><span class="kanji">${t.kanji}</span>${t.name}</div>`).join('') +
      `<span class="key">${keyLabel('tabNext')}</span>`;

    let side = '';
    let main = '';
    let caption = `${TABS[this.tab].kanji}<small>${TABS[this.tab].name}</small>`;
    let hint = '';
    let focus = 0.3;
    g.menuFocus = null;
    const item = (i: number, label: string, mark: string, sub = '', cls = '') =>
      `<div class="inkitem ${i === s ? 'sel' : ''} ${cls}" data-act="side" data-i="${i}"><span class="hanko">${mark}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;

    if (id === 'pack') {
      const list = this.packEntries();
      let restHead = false;
      side = `<div class="inklist compact">`;
      list.forEach((e, i) => {
        if (e.rest && !restHead) {
          restHead = true;
          side += `<div class="divider">Resting at the sanctuary</div>`;
        }
        const sp = species(e.ind.species);
        side += item(i, e.ind.nickname ?? sp.name, firstChar(sp.kanji), e.rest ? `M${e.ind.level}` : e.c === g.active ? 'you' : e.c!.fainted ? 'fallen' : `M${e.ind.level}`, e.c?.fainted ? 'off' : '');
      });
      side += `</div>`;
      const cur = list[s];
      if (cur) {
        main = this.sheet(cur);
        const sp = species(cur.ind.species);
        caption = `${sp.kanji}<small>${esc(sp.name)}</small>`;
        if (cur.c) {
          g.menuFocus = cur.c;
          focus = 1;
        }
        hint = cur.rest
          ? g.atSanctuary()
            ? g.pack.length < 6 ? 'Call it to walk with the pack.' : 'The pack is full. <em>Send one to rest</em> first.'
            : 'Visit a <em>sanctuary</em> to call resting spirits.'
          : cur.c === g.active
            ? 'This is the body you are wearing. Press <em>1–6</em> in the world to change.'
            : 'Choose <em>Inhabit</em> to see through its eyes.';
      }
    } else if (id === 'bestiary') {
      side = `<div class="inklist compact">` + HABITATS.map(([b, name], i) => {
        const all = this.habitatSpecies(b);
        const got = all.filter((sp) => g.journal.bonded.has(sp.id)).length;
        return item(i, name, firstChar(name), `${got}/${all.length}`);
      }).join('') + `</div>`;
      const list = this.habitatSpecies(HABITATS[s][0]);
      if (!this.pickedSpecies || !list.some((sp) => sp.id === this.pickedSpecies)) this.pickedSpecies = (list.find((sp) => g.journal.seen.has(sp.id)) ?? list[0])?.id ?? null;
      const grid = list
        .map((sp) => {
          const bonded = g.journal.bonded.has(sp.id);
          const seen = g.journal.seen.has(sp.id);
          return `<div class="cell ${bonded ? '' : seen ? 'seen' : ''} ${sp.id === this.pickedSpecies ? 'sel' : ''}" data-act="species" data-id="${sp.id}">${sealHtml(seen || bonded ? firstChar(sp.kanji) : '？', bonded ? inkFor(sp.elements[0]) : '', seen || bonded ? '' : 'dim')}</div>`;
        })
        .join('');
      main = `<div class="split"><div><div class="grid">${grid}</div></div><div class="sheet">${this.entry(this.pickedSpecies)}</div></div>`;
      hint = 'Ink fills in as you <em>meet</em> a spirit, and colour when you <em>bond</em>.';
    } else if (id === 'map') {
      side = `<div class="inklist compact">` + REGIONS.map((r, i) => {
        const found = SITES.filter((st) => g.journal.sites.has(st.id) && Math.hypot(st.x - r.x, st.z - r.z) < r.r).length;
        return item(i, r.name.replace(/ (Vale|Plains|Thicket|Deepwood|Heights|Caldera|Peaks|Marsh|Shore|Isle|Skerry)$/, ''), firstChar(r.kanji), found ? `${found} found` : '');
      }).join('') + `</div>`;
      const r = REGIONS[s];
      main = `<div class="split" style="grid-template-columns:auto 1fr"><div class="mapwrap"><canvas data-k="mapcanvas"></canvas></div><div class="sheet"><h2 style="font-size:28px">${esc(r.name)}</h2><div class="ttl kanji" style="font-size:20px;letter-spacing:0.2em">${r.kanji}</div><p class="lore">${esc(r.blurb)}</p><h3>Found here</h3><div class="maplegend">${SITES.filter((st) => g.journal.sites.has(st.id) && Math.hypot(st.x - r.x, st.z - r.z) < r.r).map((st) => `<div>${st.kanji} · ${esc(st.name)}</div>`).join('') || '<div style="opacity:.6">Nothing yet. Follow the footpaths.</div>'}</div></div></div>`;
      hint = 'Places are inked onto the sheet once you have <em>stood in them</em>.';
    } else if (id === 'seals') {
      side = `<div class="inklist compact">` + SEALS.map((n2, i) => item(i, n2, i === 0 ? '印' : '石')).join('') + `</div>`;
      if (s === 0) {
        const rows = [...g.sealAt.entries()]
          .sort((a, b) => Number(g.journal.seals.has(b[0])) - Number(g.journal.seals.has(a[0])) || a[1].sp.name.localeCompare(b[1].sp.name))
          .map(([seal, e]) => {
            const has = g.journal.seals.has(seal);
            const aw = e.sp.awakening!;
            const known = g.journal.bondedLines.has(e.line);
            return `<div class="sealrow ${has ? '' : 'lost'}"><span class="hanko" ${has ? `style="background:${aw.tint}"` : ''}>${has ? firstChar(aw.kanji) : '？'}</span><div>${has ? `${esc(aw.name)} — ${esc(e.sp.name)}` : known ? `A seal for the line of ${esc(SPECIES[e.line]?.name ?? '…')}` : 'An unknown seal'}<small>${has ? 'Fill the ink well, then press ' + keyLabel('awaken') + ' to awaken.' : esc(e.altar.hint)}</small></div></div>`;
          })
          .join('');
        main = `<div class="sheet"><h3 style="margin-top:0">Buried at old altars</h3>${rows}</div>`;
        hint = `Heighten your senses with <em>${keyLabel('aura')}</em> near an altar to find where a seal lies.`;
      } else {
        const rows = ELEMENT_IDS.map((e) => {
          const touched = [...g.journal.stones].some((k) => k.startsWith(e + '_'));
          return `<div class="sealrow ${touched ? '' : 'lost'}"><span class="hanko" ${touched ? `style="background:${ELEMENT_INK[e]}"` : ''}>${ELEMENTS[e].kanji}</span><div>${ELEMENTS[e].name} stone<small>${touched ? 'Touched. Some spirits change only at its side.' : 'Not yet found.'}</small></div></div>`;
        }).join('');
        main = `<div class="sheet"><h3 style="margin-top:0">Outcrops that wake a change</h3>${rows}</div>`;
        hint = 'Some spirits only <em>change form</em> beside a stone of the right current.';
      }
    } else if (id === 'journal') {
      side = `<div class="inklist compact">` + JOURNAL.map((n2, i) => item(i, n2, ['旅', '技', '流', '天'][i])).join('') + `</div>`;
      main = `<div class="sheet">${this.journal(s)}</div>`;
      hint = 'The world keeps its own hours. So do the spirits in it.';
    } else {
      side = `<div class="inklist compact">` + SETTINGS.map((n2, i) => item(i, n2, ['画', '音', '操', '旅'][i])).join('') + `</div>`;
      main = `<div class="sheet">${this.settings(s)}</div>`;
      hint = 'Your journey is kept in this browser. <em>Export</em> it to carry it elsewhere.';
    }
    if (this.note) hint = this.note;
    this.el.side.innerHTML = side;
    this.el.side.classList.toggle('top', id === 'pack' && this.packEntries().length > 9);
    this.el.main.innerHTML = main;
    this.el.main.classList.toggle('wide', id === 'bestiary' || id === 'map');
    this.el.caption.innerHTML = caption;
    this.el.caption.style.display = id === 'pack' ? '' : 'none';
    this.el.hint.innerHTML = hint;
    // text-heavy tabs let the picture recede almost to bare paper
    g.R.post.uniforms.uFocus.value = id === 'bestiary' || id === 'map' ? 0.1 : focus;
    this.el.side.querySelector('.inkitem.sel')?.scrollIntoView({ block: 'nearest' });
    if (id === 'map') {
      const cv = this.el.main.querySelector('canvas') as HTMLCanvasElement | null;
      const a = g.active;
      if (cv) paintMap(cv, { sites: g.journal.sites, player: a ? { x: a.pos.x, z: a.pos.z, yaw: a.yaw } : null, seal: null, half: g.chunks.atlas?.half ?? 4096 });
    }
  }

  private bar(v: number, cls = ''): string {
    return `<div class="bar ${cls}"><i></i><b style="width:${Math.max(0, Math.min(100, Math.round(v * 100)))}%"></b></div>`;
  }

  private sheet(e: PackEntry): string {
    const g = this.game;
    const ind = e.ind;
    const sp = species(ind.species);
    const maxHp = e.c ? e.c.maxHp : maxHpOf(sp, ind.level, ind.vigor[0]);
    const hp = e.c ? e.c.hp : Math.min(ind.hp, maxHp);
    const st = sp.stats;
    const stat = (label: string, base: number, vig: number) => `<span>${label}</span>${this.bar((base * vig) / 200)}<span class="v">${Math.round(base * vig * (1 + ind.level * 0.03))}</span>`;
    const node = (id: string, slot: string, current: boolean) => {
      const m = moveDef(id);
      return `<div class="node" data-act="move" data-slot="${slot}" data-id="${id}">${sealHtml(m.kanji, inkFor(m.element), current ? '' : 'dim')}<em>${esc(m.name)}</em>${current ? `<small>${m.kind === 'fast' ? `+${m.energy} ink` : `${m.energy} ink`}</small>` : ''}</div>`;
    };
    const col = (title: string, slot: string, cur: string | undefined, pool: string[]) => {
      const alts = pool.filter((m) => m !== cur);
      return `<div class="col"><b>${title}</b>${cur ? node(cur, slot, true) : `<div class="node">${sealHtml('—', '', 'dim')}<em style="opacity:.5">Mastery 10</em></div>`}${alts.length ? `<div class="stem"></div><div class="alts">${alts.map((m) => node(m, slot, false)).join('')}</div>` : ''}</div>`;
    };
    const next = sp.evolvesTo?.[0];
    const evo = next
      ? `<div class="row" style="font-size:13.5px"><span class="hanko" style="width:22px;height:22px;font-size:12px;background:var(--sumi)">変</span>${next.hint ? esc(next.hint) : `Changes at mastery ${next.level}`}${next.when ? '' : ind.level >= next.level ? ' — soon' : ''}</div>`
      : sp.awakening
        ? `<div class="row" style="font-size:13.5px"><span class="hanko" style="width:22px;height:22px;font-size:12px">${firstChar(sp.awakening.kanji)}</span>${g.journal.seals.has(sp.awakening.seal) ? `Can awaken as ${esc(sp.awakening.name)}` : 'Its awakening seal still lies buried.'}</div>`
        : '';
    const actions: string[] = [];
    if (e.rest) actions.push(`<button class="btn ${g.atSanctuary() && g.pack.length < 6 ? '' : 'off'}" data-act="call">Call to the pack</button>`);
    else {
      if (e.c !== g.active) actions.push(`<button class="btn ${e.c!.fainted ? 'off' : ''}" data-act="inhabit"><span class="key" style="border-color:currentColor">ENTER</span>Inhabit</button>`);
      if (e.c !== g.active && g.pack.length > 1) actions.push(`<button class="btn" data-act="rest">Send to rest</button>`);
    }
    return `<div class="sheet">
      <h2>${esc(ind.nickname ?? sp.name)}${ind.shiny ? ' <span style="font-size:.5em;color:var(--gold)">✦</span>' : ''}</h2>
      <div class="ttl">${esc(sp.title)} · ${sp.height} m · ${sp.weight} kg</div>
      <div class="row">${sp.elements.map((x) => elementTag(x)).join('')}</div>
      <h3>Mastery ${ind.level}</h3>
      <div class="stats">
        <span>Vigour</span>${this.bar(hp / maxHp, hp / maxHp < 0.28 ? 'low' : '')}<span class="v">${Math.round(hp)}/${maxHp}</span>
        <span>Mastery</span>${this.bar(ind.xp / xpToNext(ind.level), 'thin')}<span class="v">${ind.xp}/${xpToNext(ind.level)}</span>
        ${stat('Force', st.atk, ind.vigor[1])}${stat('Guard', st.def, ind.vigor[2])}${stat('Swift', st.spd, ind.vigor[3])}
      </div>
      ${evo}
      <h3>Moves</h3>
      <div class="tree">${col('Fast', 'fast', ind.fast, sp.fast)}${col('Charged', 'charged', ind.charged, sp.charged.filter((m) => m !== ind.charged2))}${col('Second', 'charged2', ind.charged2, ind.level >= 10 ? sp.charged.filter((m) => m !== ind.charged) : [])}</div>
      <div class="movenote" data-k="movenote">${this.moveNote(ind.fast)}</div>
      <div class="actions">${actions.join('')}</div>
    </div>`;
  }

  private moveNote(id: string): string {
    const m = moveDef(id);
    const shape: Record<string, string> = { strike: 'close strike', lunge: 'lunging charge', projectile: 'travelling shot', beam: 'sustained beam', pulse: 'expanding ring', cone: 'breath cone', field: 'lingering ground' };
    return `<b>${esc(m.name)}</b> · ${ELEMENTS[m.element].name} · ${shape[m.shape]} · power ${m.power}${m.count ? '×' + m.count : ''}<br>${esc(m.desc)}`;
  }

  private entry(id: string | null): string {
    const g = this.game;
    const sp = id ? SPECIES[id] : null;
    if (!sp) return '';
    const bonded = g.journal.bonded.has(sp.id);
    const seen = g.journal.seen.has(sp.id);
    if (!seen && !bonded) return `<h2 style="opacity:.4">？？？</h2><div class="ttl">Not yet met</div><p class="lore" style="opacity:.6">Something lives here that you have not seen. Look at other hours, in other weather.</p>`;
    const eco = sp.ecology;
    const prey = eco.prey.map((l) => (g.journal.seen.has(l) || g.journal.bondedLines.has(l) ? SPECIES[l]?.name : '？')).filter(Boolean);
    return `<h2 style="font-size:32px">${esc(sp.name)} <span class="kanji" style="font-size:.6em;letter-spacing:.12em">${sp.kanji}</span></h2>
      <div class="ttl">${esc(sp.title)}</div>
      <div class="row">${sp.elements.map((x) => elementTag(x)).join('')}</div>
      ${bonded ? `<p class="lore">${esc(sp.lore)}</p>
      <h3>Ways</h3>
      <dl class="kv">
        <dt>Stands</dt><dd>${sp.height} m · ${sp.weight} kg</dd>
        <dt>Keeps</dt><dd>${eco.activity} hours, ${eco.social === 'solitary' ? 'alone' : `in a ${eco.social} of ${eco.group[0]}–${eco.group[1]}`}</dd>
        <dt>Temper</dt><dd>${eco.temperament}</dd>
        <dt>Eats</dt><dd>${[...eco.foods, ...prey].join(', ') || '—'}</dd>
        ${eco.weatherLove?.length ? `<dt>Loves</dt><dd>${eco.weatherLove.map((w) => WEATHER[w].name.toLowerCase()).join(', ')}</dd>` : ''}
        ${sp.traits.length ? `<dt>Can</dt><dd>${sp.traits.join(', ')}</dd>` : ''}
      </dl>` : `<p class="lore" style="opacity:.7">Seen, but not yet known. Bond with one to learn its ways.</p>`}`;
  }

  private journal(i: number): string {
    const g = this.game;
    const j = g.journal;
    if (i === 0) {
      return `<h3 style="margin-top:0">Day ${g.day}</h3><dl class="kv">
        <dt>Time walked</dt><dd>${fmtTime(g.playTime)}</dd>
        <dt>Bonds</dt><dd>${g.pack.length + g.roster.length} spirits · ${j.bonded.size} of ${SPECIES_LIST.length} kinds</dd>
        <dt>Met</dt><dd>${j.seen.size} kinds</dd>
        <dt>Changes of form</dt><dd>${j.stats.evolutions}</dd>
        <dt>Seals unearthed</dt><dd>${j.seals.size} of ${g.sealAt.size}</dd>
        <dt>Places found</dt><dd>${j.sites.size} of ${SITES.length}</dd>
        <dt>Footfalls</dt><dd>${j.stats.steps.toLocaleString()}</dd>
        <dt>Times fallen</dt><dd>${j.stats.faints}</dd>
      </dl>`;
    }
    if (i === 1) {
      const rows: [ActionId | ActionId[], string][] = [
        [['forward', 'left', 'back', 'right'], 'Move'], ['jump', 'Jump · flap · swim up'], ['sprint', 'Run'], ['crouch', 'Crouch · sneak · dive'],
        ['fast', 'Fast move (hold)'], ['charged', 'Charged move'], ['swapCharged', 'Swap charged move'], ['dodge', 'Sidestep'], ['shield', 'Ink barrier'],
        ['interact', 'Forage · touch · unearth'], ['aura', 'Heightened senses'], ['awaken', 'Awaken'], ['wheel', 'Pack wheel (hold)'], [['pack1', 'pack6'], 'Inhabit pack member'], ['menu', 'Open the scroll'],
      ];
      return `<h3 style="margin-top:0">Handling</h3><dl class="kv" style="grid-template-columns:230px 1fr">${rows
        .map(([a, t]) => `<dt style="opacity:1;display:flex;gap:5px">${(Array.isArray(a) ? a : [a]).map((x) => `<span class="key">${keyLabel(x)}</span>`).join(Array.isArray(a) && a.length === 2 ? '–' : '')}</dt><dd>${t}</dd>`)
        .join('')}</dl>`;
    }
    if (i === 2) {
      return `<h3 style="margin-top:0">Each current and what it overcomes</h3><div class="chart">${ELEMENT_IDS.map((e) => `<div><span class="hanko" style="background:${ELEMENT_INK[e]}">${ELEMENTS[e].kanji}</span><span><b style="font-weight:400;letter-spacing:.14em;text-transform:uppercase">${ELEMENTS[e].name}</b> › ${ELEMENTS[e].strong.map((x) => ELEMENTS[x].kanji).join(' ')}<br><span style="opacity:.7;font-size:12px">${ELEMENTS[e].blurb}</span></span></div>`).join('')}</div>`;
    }
    return `<h3 style="margin-top:0">What the sky lends</h3><div class="chart">${WEATHER_IDS.map((w) => `<div><span class="hanko" style="background:var(--sumi)">${firstChar(WEATHER[w].kanji)}</span><span><b style="font-weight:400;letter-spacing:.14em;text-transform:uppercase">${WEATHER[w].name}</b> ↑ ${WEATHER[w].boosts.map((x) => ELEMENTS[x].kanji).join(' ')}<br><span style="opacity:.7;font-size:12px">${WEATHER[w].blurb}</span></span></div>`).join('')}</div>`;
  }

  private settings(i: number): string {
    const s = this.game.settings;
    const opt = (key: string, val: string | boolean, label: string, cur: unknown) => `<button class="btn ${cur === val ? 'sel' : ''}" data-act="set" data-key="${key}" data-val="${val}">${label}</button>`;
    const range = (key: string, min: number, max: number, v: number) => `<input type="range" min="${min}" max="${max}" step="0.05" value="${v}" data-key="${key}">`;
    if (i === 0)
      return `<h3 style="margin-top:0">Picture</h3>
        <div class="setrow"><span>Detail</span><div class="opts">${opt('quality', 'low', 'Low', s.quality)}${opt('quality', 'medium', 'Medium', s.quality)}${opt('quality', 'high', 'High', s.quality)}</div></div>
        <div class="setrow"><span>Panel frame</span><div class="opts">${opt('frame', true, 'On', s.frame)}${opt('frame', false, 'Off', s.frame)}</div></div>
        <div class="setrow"><span>Ink line weight</span><div class="opts">${range('lineWeight', 0.5, 1.8, s.lineWeight)}</div></div>`;
    if (i === 1)
      return `<h3 style="margin-top:0">Sound</h3>
        <div class="setrow"><span>Everything</span><div class="opts">${range('master', 0, 1, s.master)}</div></div>
        <div class="setrow"><span>Koto &amp; piano</span><div class="opts">${range('music', 0, 1, s.music)}</div></div>
        <div class="setrow"><span>World &amp; foley</span><div class="opts">${range('sfx', 0, 1, s.sfx)}</div></div>`;
    if (i === 2)
      return `<h3 style="margin-top:0">Handling</h3>
        <div class="setrow"><span>Look speed</span><div class="opts">${range('sensitivity', 0.3, 2.5, s.sensitivity)}</div></div>
        <div class="setrow"><span>Invert look</span><div class="opts">${opt('invertY', true, 'On', s.invertY)}${opt('invertY', false, 'Off', s.invertY)}</div></div>`;
    return `<h3 style="margin-top:0">Journey</h3>
      <div class="actions" style="margin-top:6px"><button class="btn" data-act="save">Save now</button><button class="btn" data-act="export">Export to file</button><button class="btn" data-act="import">Import from file</button></div>
      <div class="actions"><button class="btn" data-act="title">Return to title</button></div>`;
  }

  // ---------------------------------------------------------------- input

  private onHover(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'move') {
      const n = this.root.querySelector('[data-k="movenote"]');
      if (n) n.innerHTML = this.moveNote(t.dataset.id!);
    }
  }

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    const key = t.dataset.key as keyof typeof this.game.settings | undefined;
    if (!key) return;
    (this.game.settings as unknown as Record<string, number>)[key] = Number(t.value);
    this.game.applySettings();
  }

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    this.act(t.dataset.act!, t.dataset);
  }

  private act(act: string, d: DOMStringMap = {}) {
    const g = this.game;
    const id = this.tabId;
    this.note = '';
    switch (act) {
      case 'close': this.close(); return;
      case 'tab': this.tab = Number(d.i); g.audio?.ui('tab'); break;
      case 'side': this.sel[id] = Number(d.i); g.audio?.ui('hover'); break;
      case 'species': this.pickedSpecies = d.id!; g.audio?.ui('hover'); break;
      case 'move': {
        const cur = this.packEntries()[this.sel.pack];
        if (!cur) break;
        const slot = d.slot as 'fast' | 'charged' | 'charged2';
        const mv = d.id!;
        if (slot === 'charged' && cur.ind.charged2 === mv) cur.ind.charged2 = cur.ind.charged;
        if (slot === 'charged2' && cur.ind.charged === mv) cur.ind.charged = cur.ind.charged2 ?? cur.ind.charged;
        cur.ind[slot] = mv;
        g.audio?.ui('stamp');
        break;
      }
      case 'inhabit': {
        const cur = this.packEntries()[this.sel.pack];
        if (cur?.c && cur.c !== g.active && !cur.c.fainted) {
          const idx = g.pack.indexOf(cur.c);
          this.close();
          g.switchTo(idx);
          return;
        }
        break;
      }
      case 'rest': {
        const cur = this.packEntries()[this.sel.pack];
        if (cur?.c && g.dismiss(cur.c)) {
          g.audio?.ui('stamp');
          this.note = 'It goes ahead to the sanctuary to wait.';
        }
        break;
      }
      case 'call': {
        const cur = this.packEntries()[this.sel.pack];
        if (cur?.rest && g.atSanctuary() && g.summon(cur.ind)) {
          g.audio?.ui('stamp');
          this.sel.pack = g.pack.length - 1;
        } else g.audio?.ui('error');
        break;
      }
      case 'set': {
        const v = d.val === 'true' ? true : d.val === 'false' ? false : d.val!;
        (g.settings as unknown as Record<string, unknown>)[d.key!] = v;
        g.applySettings();
        g.audio?.ui('select');
        break;
      }
      case 'save': g.save(); this.note = 'Kept.'; g.audio?.ui('stamp'); break;
      case 'export': exportSave(g.snapshot()); this.note = 'A copy has been set down.'; break;
      case 'import':
        importSave().then((sv) => {
          if (!sv) {
            this.note = 'That file is not a Sumirei journey.';
            this.render();
            return;
          }
          this.close();
          g.overlay.through('wipe', () => g.loadSave(sv), { inDur: 0.6, outDur: 0.9 });
        });
        return;
      case 'title': g.save(); location.reload(); return;
    }
    this.render();
  }

  update() {
    const g = this.game;
    if (g.mode !== 'menu') return;
    if (this.openFrame) {
      this.openFrame = false;
      return;
    }
    const inp = g.input;
    const id = this.tabId;
    const n = this.sideCount();
    if (inp.hit('tabNext') || (inp.hit('uiRight') && !(document.activeElement instanceof HTMLInputElement))) this.act('tab', { i: String((this.tab + 1) % TABS.length) });
    else if (inp.hit('tabPrev') || (inp.hit('uiLeft') && !(document.activeElement instanceof HTMLInputElement))) this.act('tab', { i: String((this.tab + TABS.length - 1) % TABS.length) });
    else if (inp.hit('uiDown') && n) this.act('side', { i: String((this.sel[id] + 1) % n) });
    else if (inp.hit('uiUp') && n) this.act('side', { i: String((this.sel[id] + n - 1) % n) });
    else if (inp.hit('uiAccept') && id === 'pack') {
      const cur = this.packEntries()[this.sel.pack];
      if (cur?.rest) this.act('call');
      else if (cur?.c && cur.c !== g.active) this.act('inhabit');
    } else if (inp.hit('map')) this.close();
  }

  /** Jump straight to a tab when opening (the map key). */
  show(tab: TabId) {
    this.tab = TABS.findIndex((t) => t.id === tab);
  }
}
