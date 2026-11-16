// VOIDGARDEN main: the game loop, the screen state machine, and the
// staged-screenshot mode behind ?shot=. The game itself lives in world.js
// (rules) and render.js (drawing); this file only wires them together.

import { VIEW, STEP } from './config.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import {
  createWorld,
  resetWorld,
  startGame,
  stepWorld,
  EVENT_OVER,
} from './world.js';
import { drawWorld, SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_PAUSED } from './render.js';
import { stageShot, autopilotInput } from './shots.js';

const BEST_KEY = 'voidgarden.best';

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch (err) {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch (err) {
    // Private mode or no storage: the best score just does not persist.
  }
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const sound = new SoundEngine();

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 7) || 7;

const world = createWorld((Date.now() % 100000) + 1);
world.best = loadBest();

let screen = SCREEN_TITLE;
let newBest = false;
let demo = null; // a self-playing world behind the title screen

function startDemo() {
  demo = createWorld((Date.now() % 100000) + 101);
  demo.best = world.best;
  startGame(demo, null);
}

// Staged screenshot mode: render one deterministic frame and stop.
if (shotName) {
  const staged = stageShot(shotName, world, shotSeed);
  world.best = staged.best;
  screen = staged.screen;
  newBest = screen === SCREEN_OVER && staged.best > 0;
  // Point the reticle at what the wisp is aiming at (the nearest mote), so
  // staged shots read as a player aiming, not a cursor left in the middle.
  let aim = null;
  let aimD = Infinity;
  for (const e of world.enemies) {
    const d = (e.x - world.player.x) ** 2 + (e.y - world.player.y) ** 2;
    if (d < aimD) {
      aimD = d;
      aim = e;
    }
  }
  if (aim) {
    input.mouse.x = aim.x;
    input.mouse.y = aim.y;
  }
  drawWorld(ctx, world, {
    screen,
    mouseX: input.mouse.x || VIEW.width / 2,
    mouseY: input.mouse.y || VIEW.height / 2,
    time: world.time,
    best: staged.best,
    newBest,
  });
  document.title = `VOIDGARDEN — ${shotName}`;
  window.__voidgarden = { screen, state: world, shot: shotName, ready: true };
} else {
  startDemo();
  screen = SCREEN_TITLE;
  window.__voidgarden = { get screen() { return screen; }, state: world, ready: true };

  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    if (input.justPressed('KeyM')) sound.setMuted(!sound.muted);

    if (screen === SCREEN_TITLE) {
      sound.unlock();
      if (demo) {
        stepWorld(demo, autopilotInput(demo, true), STEP, null);
        if (demo.phase === 'over') startDemo();
      }
      if (input.startPressed()) {
        sound.unlock();
        startGame(world, sound);
        screen = SCREEN_PLAY;
        newBest = false;
      }
    } else if (screen === SCREEN_PLAY) {
      if (input.justPressed('KeyP') || input.justPressed('Escape')) {
        screen = SCREEN_PAUSED;
      } else {
        while (acc >= STEP) {
          stepWorld(world, input, STEP, sound);
          acc -= STEP;
          if (world.events & EVENT_OVER) {
            screen = SCREEN_OVER;
            if (world.score > world.best) {
              world.best = world.score;
              newBest = true;
              saveBest(world.best);
            }
            break;
          }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.justPressed('KeyP') || input.justPressed('Escape')) {
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_OVER) {
      if (input.justPressed('KeyR') || input.mousePressed) {
        sound.unlock();
        startGame(world, sound);
        screen = SCREEN_PLAY;
        newBest = false;
      }
    }

    const viewWorld = screen === SCREEN_TITLE && demo ? demo : world;
    drawWorld(ctx, viewWorld, {
      screen,
      mouseX: input.mouse.x,
      mouseY: input.mouse.y,
      time: viewWorld.time,
      best: world.best,
      newBest,
    });
    input.endFrame();
  }
  requestAnimationFrame(frame);
}
