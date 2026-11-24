# 墨霊 Sumirei — Spirits of the Ink Dawn

A third-person creature-ecology RPG that runs in the browser and looks like a
woodblock print. You have no body of your own: you wake at a spring inside one
of four spirits, and from then on you see the archipelago of Yaoshima through
whichever creature you are inhabiting.

Everything is generated in code — terrain, trees, 985 buildings, 111 species,
every sound. There are no model, texture or audio files in the repository.

![Title](docs/shots/title.jpg)

| | |
|---|---|
| ![The scroll: pack](docs/shots/menu-pack.jpg) | ![The scroll: map](docs/shots/menu-map.jpg) |
| ![Hanamura village](docs/shots/village.jpg) | ![Tide gate at dusk](docs/shots/tide-gate.jpg) |
| ![Rain at the deepwood pagoda](docs/shots/pagoda-rain.jpg) | ![The white peaks](docs/shots/snow-peaks.jpg) |
| ![Pack wheel at night](docs/shots/wheel-night.jpg) | ![An awakened form](docs/shots/awakened.jpg) |

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL in Chrome or Safari on a Mac. Click the world to capture
the mouse.

Other scripts: `npm run build` (type-check and bundle), `npm run typecheck`,
and `npx tsx scripts/validate-data.ts` (checks the bestiary for broken
references, unbalanced numbers and a disconnected food web).

## Handling

| | |
|---|---|
| `W A S D` | move |
| `Space` | jump · flap · swim up |
| `Shift` | run |
| `C` | crouch and sneak · dive |
| `LMB` (hold) | Fast move — every landed hit fills the ink well |
| `RMB` | Charged move — spends ink |
| `Q` / `MMB` | swap to the second Charged move |
| `Alt` / right `Shift` | sidestep, with a moment of invulnerability |
| `E` | ink barrier |
| `F` | forage · touch a stone · unearth a seal |
| `V` | heightened senses: reveals buried seals |
| `R` | awaken, when the seal is held and the well is full |
| `1`–`6` | pour yourself into that pack member |
| `Tab` (hold) | pack wheel |
| `M` | map |
| `Esc` | the scroll (menu) |

## What is in it

**The look.** One ink material draws every solid thing: flat woodblock fills,
a two-tone cel split bridged by screen-space halftone dots, and a second render
target of normals and outline weights. A composite pass turns depth, normal and
object-id breaks into variable-weight ink lines, multiplies a generated washi
sheet over the frame, and rules a panel border. Sky, sun and shade swap
together like ink plates as the clock turns.

**The world.** A quadtree streams the archipelago from 1024 m tiles down to
64 m leaves, built off-thread by a small worker pool: terrain with skirts,
four-detail-level flora merged per node, and wind-bent instanced grass that
flattens under feet and springs back. One wind field is shared by grass,
foliage, cloth, petals and audio. Eleven regions, three rivers, seven lakes
and hot springs, eight weathers with regional rules, and a day that lasts 24
minutes.

**Buildings.** 47 kinds of structure — torii, stone lanterns, shrines, three-
and five-storey pagodas, drum bridges, thatched huts, raised storehouses,
ruins, grottos — are laid out as ten villages, shrines, sanctuaries and ruins,
strung along the footpaths, and thrown across rivers where paths meet them.
Bridge decks and shrine floors are walkable; roofs are where creatures wait
out the rain; lanterns throw warm pools at night.

**Creatures.** 111 original species in 59 evolution lines, drawn from Japanese
natural history and folklore: plovers, serow, moon bears, shrine-courier
foxes, husk lanterns, an ink dragon. A parametric builder turns each body plan
into a jointed rig at its true size — a 12 cm moth and a 14 m whale use the
same code — and a procedural animator moves any of them with no keyframes.

**Ecology.** Wild spirits keep the hours their species keeps, graze, travel as
herds and flocks, flee what hunts them and hunt what they eat, warn before
they fight over territory, and take shelter in rain.

**Combat.** Two-move and real-time. Moves exist physically: strikes need
reach, lunges carry the body, shots travel and can be dodged or stopped by a
tree, beams and breath sweep where you aim, pulses expand, fields linger. Ten
elements, weather boosts, statuses, knockback.

**Progress.** Defeat a wild spirit and it bonds: up to six travel with you and
fight alongside, the rest wait at sanctuaries. Mastery brings evolution — some
only at night, in rain, in a certain place, or at an elemental stone. Seventeen
buried seals unlock awakened forms.

**Interface.** An ink-wash menu laid over the live world, which becomes a
sumi-e wash and slides to the right of the sheet: pack, bestiary, map, seals,
journal, settings. Ink bloom, dry-brush wipe and swirl transitions with
screen-space petals.

**Sound.** Fully synthesised with the Web Audio API: wind, rain that changes
under a roof or a canopy, surface-aware footsteps, a voice for every species,
wind chimes, and sparse koto and piano that surfaces when you stand still.

**Saving.** IndexedDB, with JSON export and import from the Settings tab.

## Where things live

```
src/
  data/       bestiary, moves, elements, world layout — all content is plain data
  render/     ink material, composite pass, sky, paper, effects, geometry helpers
  world/      terrain function, chunk worker, streaming, flora, grass, water,
              weather, wind, collision, architecture kit, site builder
  creatures/  parametric body builder, procedural animator
  game/       creature entity and physics, combat, AI, spawner, camera, orchestrator
  audio/      procedural audio engine
  ui/         menu, HUD, title, pack wheel, transitions overlay, map painter
```

Content is separate from engine. Species, moves, regions and sites are data
files read by code that never names one of them; a different roster or map is
a data change.

## State of things

Checked in a Chromium preview on an Apple M5 Pro:

- A full frame — simulation, shadow pass, scene, composite — takes about
  3.9 ms at 2880×1800 with roughly 1.9 million triangles and 270 draw calls.
- The title, starter choice, movement, swimming, combat, bonding, pack
  switching, the wheel, evolution, awakening, save and load, night, rain and
  snow were each exercised through scripted input with no console errors.

Not done, or not verified:

- **Safari** has not been run. The audio engine has Safari guards that are
  untested there.
- **Nobody has listened to the audio.** Levels were balanced from offline
  measurement, not by ear.
- **The renderer is WebGL2**, not WebGPU.
- **Balance is untuned.** Numbers are plausible, not play-tested.
- **Ability gates are set dressing.** A seal that needs a trait checks your
  pack for it; the thorn wall beside the altar does not itself block the way.
- **Burrowing** is a trait in the data with no movement mode behind it yet.
- Only real pointer-lock play by a person will show how the camera and aim
  feel; the checks above drove the game from scripts.

The console handle `__sumi` is there for tinkering: `__sumi.start('inabi')`
skips the title, `__sumi.game` is the whole game.
