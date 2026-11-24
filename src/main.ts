// Bootstrap: build the game, hang the interface on it, and run the frame loop.
import './ui/ui.css';
import { Game, type AudioPort } from './game/game';
import { installInkFilters } from './ui/dom';
import { Hud } from './ui/hud';
import { TitleScreen } from './ui/title';
import { Menu } from './ui/menu';
import { Wheel } from './ui/wheel';
import { rollIndividual } from './game/creature';
import { SPECIES } from './data/species';

installInkFilters();
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ink = document.getElementById('ink') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const boot = document.getElementById('boot');
const bootSub = document.getElementById('boot-sub');

const game = new Game(canvas, ink);
const hud = new Hud(game, uiRoot);
const title = new TitleScreen(game, uiRoot);
const menu = new Menu(game, uiRoot);
const wheel = new Wheel(game, uiRoot);

// ---- sound: synthesised entirely in the browser, unlocked by the first gesture
let autoMenu = true;
import('./audio/audio')
  .then(({ AudioEngine }) => {
    const engine = new AudioEngine() as unknown as AudioPort;
    game.audio = engine;
    game.applySettings();
  })
  .catch((e) => console.warn('audio unavailable', e));
game.input.onGesture = () => {
  const a = game.audio;
  if (a && !a.ready) a.unlock().then(() => game.applySettings());
};

// ---- pointer capture: clicking the world takes the mouse, losing it opens the scroll
canvas.addEventListener('click', () => {
  if (game.mode === 'play') game.input.lock();
});
game.input.onLockChange = (locked) => {
  if (!locked && autoMenu && game.mode === 'play' && !game.switching && document.hasFocus()) game.openMenu();
};
window.addEventListener('beforeunload', () => game.save());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.save();
});

// ---- frame loop
let last = performance.now();
let booted = false;
let bootT = 0;
function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (!booted) {
    // hold the opening sheet until the land around the spring has streamed in
    bootT += dt;
    if (bootSub) bootSub.textContent = game.chunks.stats.loading > 0 ? 'cutting the blocks' : 'laying the paper';
    if ((game.chunks.settled() && bootT > 1.2) || bootT > 14) {
      booted = true;
      title.show();
      if (boot) {
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 1000);
      }
    }
  }
  const inp = game.input;
  if (game.mode === 'play' && !game.wheelOpen && !game.switching) {
    if (inp.hit('map')) {
      menu.show('map');
      game.openMenu();
    } else if (inp.hit('menu')) game.openMenu();
  }
  title.update(dt);
  wheel.update();
  menu.update();
  game.update(dt);
  hud.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- handles for automated checks and tinkering from the console
const dbg = {
  game,
  menu,
  title,
  /** skip the title and wake as a species (scripted checks: also fakes pointer capture) */
  async start(id = 'kagari', level = 5) {
    await this.play(id, level);
    this.lock();
  },
  /** skip the title and begin a fresh journey as any species; click the world to take the mouse */
  async play(id = 'kagari', level = 5) {
    if (!SPECIES[id]) throw new Error(`unknown species: ${id}`);
    booted = true;
    boot?.remove();
    document.getElementById('title')?.classList.remove('on');
    document.getElementById('starter')?.classList.remove('on');
    game.overlay.rain = 0;
    await game.newGame(id, level);
    return SPECIES[id].name;
  },
  /** add a spirit to the pack mid-journey and step into it */
  async give(id: string, level = 30) {
    if (!SPECIES[id]) throw new Error(`unknown species: ${id}`);
    if (game.mode !== 'play' || !game.active) return 'begin a journey first';
    // make room: the last follower goes to wait at the sanctuary
    if (game.pack.length >= 6) {
      const last = [...game.pack].reverse().find((c) => c !== game.active);
      if (last) game.dismiss(last);
    }
    const ind = rollIndividual(id, level);
    ind.home = 'pack';
    game.roster.push(ind);
    if (!game.summon(ind)) return 'could not call it';
    await game.switchTo(game.pack.length - 1);
    return SPECIES[id].name;
  },
  /** behave as if the pointer were captured */
  lock(v = true) {
    autoMenu = !v;
    game.input.locked = v;
  },
  /** save the current frame to shots/<name>.png through the dev server */
  async shot(name: string) {
    game.R.render();
    const url = game.R.snapshot();
    await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
    return name;
  },
};
(window as unknown as { __sumi: typeof dbg }).__sumi = dbg;
