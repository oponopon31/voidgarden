// VOIDGARDEN screenshot scenes behind ?shot=start|play|late|over. Each one
// plays the real rules forward from a fresh world for a fixed amount of
// simulated time, steered by a simple autopilot, so the frame is what a real
// game looks like and the same seed always gives the same frame.

import { VIEW, STEP } from './config.js';
import { dist2 } from './random.js';
import { resetWorld, startGame, stepWorld } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER } from './render.js';

// An input-shaped object the world can step with: flee what is close, gather
// the nearest flower, aim at the nearest mote and keep firing. Careless mode
// walks into the nearest mote instead, and never shoots or dashes.
export function autopilotInput(state, careful, casual = false) {
  const p = state.player;
  let near = null;
  let nd = Infinity;
  for (const e of state.enemies) {
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 < nd) {
      nd = d2;
      near = e;
    }
  }
  let fl = null;
  let fd = Infinity;
  for (const f of state.flowers) {
    const d2 = dist2(p.x, p.y, f.x, f.y);
    if (d2 < fd) {
      fd = d2;
      fl = f;
    }
  }
  const ndist = Math.sqrt(nd);
  let mx = 0;
  let my = 0;
  // A casual pilot lets motes get closer before fleeing — the way a human
  // actually plays, so staged frames show a real fight with motes closing
  // in instead of a perfect autopilot clearing the field at range.
  const fleeRange = casual ? 80 : 120;
  if (!careful && near) {
    mx = (near.x - p.x) / (ndist || 1);
    my = (near.y - p.y) / (ndist || 1);
  } else if (near && ndist < fleeRange) {
    mx = (p.x - near.x) / ndist;
    my = (p.y - near.y) / ndist;
  } else if (fl && fd < 380 * 380) {
    const fdist = Math.sqrt(fd);
    mx = (fl.x - p.x) / fdist;
    my = (fl.y - p.y) / fdist;
  } else {
    const cx = VIEW.width / 2 - p.x;
    const cy = VIEW.height / 2 - p.y;
    const cl = Math.hypot(cx, cy) || 1;
    if (cl > 60) {
      mx = cx / cl;
      my = cy / cl;
    }
  }
  // Keep the wisp near the middle of the garden: a steady pull toward the
  // centre, so staged scenes (and the title demo) do not end up cornered
  // against an edge where nothing is happening.
  mx += ((VIEW.width / 2 - p.x) / VIEW.width) * 0.9;
  my += ((VIEW.height / 2 - p.y) / VIEW.height) * 0.9;
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }
  const aim = near ? { x: near.x, y: near.y } : { x: p.x, y: p.y - 100 };
  if (casual && near) {
    // Sloppy aim: the bolts land around the mote, not on it.
    aim.x += (state.rng() - 0.5) * 110;
    aim.y += (state.rng() - 0.5) * 110;
  }
  const dash = careful && !casual && near !== null && ndist < 70 && p.dashCd <= 0;
  return {
    moveVector: () => ({ x: mx, y: my }),
    dashPressed: () => dash,
    firing: () => (casual ? state.rng() < 0.6 : careful),
    mouse: aim,
  };
}

function runFor(world, seconds, careful) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, autopilotInput(world, careful), STEP, null);
    if (world.phase === 'over') return false;
  }
  return true;
}

// How busy a frame looks: motes closing in on the wisp (the real fight),
// bolts in the air, a combo going, flowers on the ground. Motes merely
// alive but still at the far edge score almost nothing — a frame right
// after a wave spawns looks empty even when twenty are alive.
function frameDensity(world) {
  const p = world.player;
  const centre = Math.hypot(p.x - VIEW.width / 2, p.y - VIEW.height / 2);
  let near = 0;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < 420) near += 4 * (1 - d / 420);
    if (d < 200) near += 6 * (1 - d / 200);
  }
  return (
    near +
    world.enemies.length * 0.2 +
    world.bolts.length +
    world.particles.length * 0.3 +
    world.flowers.length * 0.4 +
    world.combo * 0.4 +
    (world.score > 500 ? 2 : 0) -
    centre / 60
  );
}

// The simulation is deterministic for a seed, so the busiest frame can be
// found by one pass and then re-played exactly: run forward once, remember
// the best time, reset, and run again to that time.
function bestFrame(world, seed, maxSeconds, gate, casual) {
  let bestT = 0;
  let bestScore = -Infinity;
  resetWorld(world, seed);
  startGame(world, null);
  for (let t = 0; t < maxSeconds; t += STEP) {
    stepWorld(world, autopilotInput(world, true, casual), STEP, null);
    if (world.phase === 'over') break;
    if (gate && !gate(world)) continue;
    const s = frameDensity(world);
    if (s > bestScore) {
      bestScore = s;
      bestT = t;
    }
  }
  resetWorld(world, seed);
  startGame(world, null);
  for (let t = 0; t < bestT; t += STEP) {
    stepWorld(world, autopilotInput(world, true, casual), STEP, null);
  }
  return bestScore > -Infinity;
}

// Set `world` to the named scene and return the screen to draw over it and
// the best score to show. Any unknown name stages the title.
export function stageShot(name, world, seed) {
  if (name === 'play') {
    // The busiest frame of waves 3–4, so darters and spitters are in the
    // mix, played by a casual pilot so the frame shows a real fight in
    // full swing, not a perfect autopilot clearing the field before
    // anything gets close.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (bestFrame(world, seed + attempt, 90, (w) => w.wave >= 3 && w.wave <= 4, true)) {
        return { screen: SCREEN_PLAY, best: world.score };
      }
    }
    return { screen: SCREEN_PLAY, best: world.score };
  }
  if (name === 'late') {
    // The busiest frame of wave 4 or later, with a garden full of flowers,
    // played by a casual pilot. A different seed base from the play shot,
    // so the two searches cannot land on the same frame.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (bestFrame(world, seed + 100 + attempt, 150, (w) => w.wave >= 4 && w.flowers.length >= 10, true)) {
        return { screen: SCREEN_PLAY, best: world.score };
      }
    }
    return { screen: SCREEN_PLAY, best: world.score };
  }
  if (name === 'over') {
    // Play well first so the game-over screen shows a real run — score,
    // wave, blooms and flowers — then throw the run away carelessly.
    resetWorld(world, seed);
    startGame(world, null);
    runFor(world, 25, true);
    if (world.phase !== 'over') {
      for (let t = 0; t < 300; t += STEP) {
        stepWorld(world, autopilotInput(world, false), STEP, null);
        if (world.phase === 'over') break;
      }
    }
    return { screen: SCREEN_OVER, best: world.score };
  }
  resetWorld(world, seed);
  startGame(world, null);
  runFor(world, 6, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
