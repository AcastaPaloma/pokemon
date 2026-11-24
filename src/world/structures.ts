// Procedural architecture kit. Every structure is generated in code as one
// merged, painted geometry in the shared vertex format (render/geo.ts) together
// with the colliders, walkable platforms and anchors the game needs.
//
// Conventions: local space, origin on the ground at the structure's centre
// (the pier alone starts at its shore end and runs out along +Z), +Y up, +Z
// front, metres. Bridges and stairs run along X; gates span X and are crossed
// along Z. Box colliders and platforms use `rot` in the same sense as three.js
// `rotation.y` (and world/colliders.ts). Wind phase (sway.y) is 0..1.
// Deterministic for (kind, seed, opts); no DOM, no caching — safe in a worker.
import * as THREE from 'three';
import { hashStr } from '../core/math';
import type { StructureBuild, StructureKind, StructureOpts } from './structureTypes';
import { Kit, type Builder } from './structures/kit';
import { jizo, monolith, signpost, torii, toriiGrand, toriiStone, toro } from './structures/gates';
import { altar, bellTower, hokora, sanctuary } from './structures/sacred';
import { shrine } from './structures/shrine';
import { pagoda3, pagoda5 } from './structures/pagoda';
import { drumBridge, pier, plankBridge, stairs } from './structures/crossings';
import { hut, longhouse, storehouse, teaHouse, watchtower } from './structures/dwellings';
import { boat, campfire, fence, riceRack, waterwheel, well } from './structures/yard';
import { furinFrame, lanternPost, norenFrame, prayerFlags, shishiOdoshi } from './structures/dressing';
import { ruinArch, ruinPillars, ruinWall, stoneCircle } from './structures/ruins';
import { crystalCluster, grotto, hollowLog, stoneOutcrop } from './structures/natural';
import { boulderGate, brambleGate, conduit, vineAnchor, wardGate } from './structures/abilityGates';

/** One builder per kind; the Record type makes a missing kind a compile error. */
const BUILDERS: Record<StructureKind, Builder> = {
  torii, toriiStone, toriiGrand, toro, jizo, signpost, monolith,
  hokora, shrine, pagoda3, pagoda5, bellTower, sanctuary, altar,
  drumBridge, plankBridge, pier, stairs,
  hut, longhouse, storehouse, watchtower, waterwheel, well, fence, riceRack, campfire, boat, teaHouse,
  lanternPost, norenFrame, furinFrame, shishiOdoshi, prayerFlags,
  ruinPillars, ruinArch, ruinWall, stoneCircle,
  grotto, crystalCluster, hollowLog, stoneOutcrop,
  brambleGate, boulderGate, wardGate, conduit, vineAnchor,
};

/** Every kind implemented. */
export const STRUCTURE_KINDS: StructureKind[] = Object.keys(BUILDERS) as StructureKind[];

function emptyBuild(): StructureBuild {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(0), 2));
  return { geometry, colliders: [], platforms: [], anchors: [], radius: 0, height: 0 };
}

/**
 * Build one structure. Never throws: an unknown kind or an internal failure
 * yields an empty build rather than taking the chunk worker down.
 */
export function buildStructure(kind: StructureKind, seed: number, opts?: StructureOpts): StructureBuild {
  try {
    const build = BUILDERS[kind];
    if (typeof build !== 'function') return emptyBuild();
    const k = new Kit(seed, opts, hashStr(kind));
    build(k);
    return k.finish();
  } catch {
    return emptyBuild();
  }
}

/** Dev sanity check: every kind built with seed 1. */
export function structureStats(): { kind: StructureKind; tris: number; radius: number; height: number }[] {
  return STRUCTURE_KINDS.map((kind) => {
    const b = buildStructure(kind, 1);
    const tris = b.geometry.attributes.position.count / 3;
    b.geometry.dispose();
    return { kind, tris, radius: b.radius, height: b.height };
  });
}
