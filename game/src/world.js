// VOIDGARDEN world: the whole simulation — player, motes, flowers, waves,
// collisions, scoring. Pure fixed-step logic, no drawing, no sound of its
// own (it calls the sound engine passed in, which may be null).

import {
  VIEW,
  STEP,
  PLAYER,
  ENEMY,
  COMBO_WINDOW,
  COMBO_STEP,
  COMBO_MAX,
  FLOWERS_PER_HEART,
  FLOWER_SCORE,
  FLOWER_LIFETIME,
  MAX_FLOWERS,
  WAVE_BONUS,
  BETWEEN_WAVES,
  SPAWN_MARGIN,
  STAR_DROP_CHANCE,
  RUSH_TIME,
  waveSpec,
} from './config.js';
import { mulberry32, range, pick, chance, clamp, dist2, angleTo } from './random.js';

export const KIND_DRIFTER = 'drifter';
export const KIND_DARTER = 'darter';
export const KIND_SPITTER = 'spitter';
export const KIND_BRAMBLE = 'bramble';

export const EVENT_NONE = 0;
export const EVENT_OVER = 1;
export const EVENT_WAVE_CLEAR = 2;
export const EVENT_HIT = 4;

const FLOWER_HUES = ['#ff6ec7', '#ffd166', '#5ff2d0'];

export function createWorld(seed) {
  const state = {
    seed,
    rng: mulberry32(seed),
    time: 0,
    wave: 0,
    phase: 'idle', // idle | playing | between | over
    betweenTimer: 0,
    spawnTimer: 0,
    toSpawn: [],
    player: {
      x: VIEW.width / 2,
      y: VIEW.height / 2,
      angle: -Math.PI / 2,
      hp: PLAYER.startHearts,
      maxHp: PLAYER.maxHearts,
      invuln: 0,
      dashTime: 0,
      dashCd: 0,
      dashX: 1,
      dashY: 0,
      fireTimer: 0,
    },
    bolts: [],
    ebolts: [],
    enemies: [],
    flowers: [],
    pickups: [],
    particles: [],
    floaters: [],
    ambient: [],
    score: 0,
    combo: 0,
    comboTimer: 0,
    flowersGathered: 0,
    kills: 0,
    best: 0,
    shake: 0,
    flash: 0,
    rushTimer: 0,
    banner: null,
    events: EVENT_NONE,
  };
  for (let i = 0; i < 64; i += 1) {
    state.ambient.push({
      x: state.rng() * VIEW.width,
      y: state.rng() * VIEW.height,
      r: range(state.rng, 1, 3),
      drift: range(state.rng, 4, 14),
      phase: state.rng() * Math.PI * 2,
    });
  }
  return state;
}

export function resetWorld(state, seed) {
  const fresh = createWorld(seed === undefined ? state.seed : seed);
  fresh.best = state.best;
  Object.keys(fresh).forEach((key) => {
    state[key] = fresh[key];
  });
}

function showBanner(state, text, sub, seconds) {
  state.banner = { text, sub, timer: seconds };
}

function burst(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const v = range(state.rng, speed * 0.3, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: range(state.rng, 0.3, 0.7),
      maxLife: 0.7,
      size: range(state.rng, 2, 5),
      color,
    });
  }
}

function floater(state, x, y, text, color, size) {
  state.floaters.push({ x, y, text, life: 1.1, color, size: size || 18 });
}

function comboMult(state) {
  let mult = 1 + COMBO_STEP * Math.max(0, state.combo - 1);
  if (mult > COMBO_MAX) mult = COMBO_MAX;
  if (state.rushTimer > 0) mult *= 2;
  return mult;
}

export { comboMult };

function addScore(state, base, x, y, label) {
  const gained = Math.round(base * comboMult(state));
  state.score += gained;
  if (x !== undefined) floater(state, x, y, `+${gained}${label ? ` ${label}` : ''}`, '#ffd166', 18);
  return gained;
}

function bloomFlower(state, x, y) {
  if (state.flowers.length >= MAX_FLOWERS) state.flowers.shift();
  state.flowers.push({
    x: clamp(x, 24, VIEW.width - 24),
    y: clamp(y, 70, VIEW.height - 70), // keep the top and bottom HUD lines clear
    phase: state.rng() * Math.PI * 2,
    hue: pick(state.rng, FLOWER_HUES),
    life: FLOWER_LIFETIME,
  });
}

function spawnEdgePoint(state) {
  const rng = state.rng;
  const side = Math.floor(rng() * 4);
  const m = SPAWN_MARGIN;
  if (side === 0) return { x: range(rng, 0, VIEW.width), y: -m };
  if (side === 1) return { x: VIEW.width + m, y: range(rng, 0, VIEW.height) };
  if (side === 2) return { x: range(rng, 0, VIEW.width), y: VIEW.height + m };
  return { x: -m, y: range(rng, 0, VIEW.height) };
}

function spawnEnemy(state, kind) {
  const def = ENEMY[kind];
  const p = spawnEdgePoint(state);
  const scale = 1 + 0.03 * (state.wave - 1);
  state.enemies.push({
    kind,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    speed: def.speed * scale,
    score: def.score,
    touch: def.touch,
    wobble: state.rng() * Math.PI * 2,
    mode: 'chase',
    timer: range(state.rng, 0.4, 1.2),
    flash: 0,
  });
}

function buildQueue(state, spec) {
  const kinds = [];
  const weights = Object.entries(spec.mix);
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  for (let i = 0; i < spec.count; i += 1) {
    let roll = state.rng() * total;
    let kind = 'drifter';
    for (const [name, w] of weights) {
      roll -= w;
      if (roll <= 0) {
        kind = name;
        break;
      }
    }
    kinds.push(kind);
  }
  // Shuffle so the wave does not arrive in clumps of one kind.
  for (let i = kinds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(state.rng() * (i + 1));
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }
  return kinds;
}

export function startWave(state, n, sound) {
  state.wave = n;
  const spec = waveSpec(n);
  state.toSpawn = buildQueue(state, spec);
  state.spawnTimer = 0.6;
  state.phase = 'playing';
  const subs = [
    'the blight stirs',
    'they come faster now',
    'hold the light',
    'the garden trembles',
    'no rest for the wisp',
  ];
  showBanner(state, `WAVE ${n}`, subs[Math.min(n - 1, subs.length - 1)], 2.2);
  if (sound) sound.wave();
}

export function startGame(state, sound) {
  resetWorld(state, state.seed);
  state.player.hp = PLAYER.startHearts;
  startWave(state, 1, sound);
  if (sound) sound.start();
}

function damagePlayer(state, amount, fromX, fromY, sound) {
  const p = state.player;
  if (p.invuln > 0 || state.phase !== 'playing') return;
  p.hp -= amount;
  p.invuln = PLAYER.invulnTime;
  state.combo = 0;
  state.comboTimer = 0;
  state.flash = 0.4;
  state.shake = 14;
  state.events |= EVENT_HIT;
  const a = angleTo(fromX, fromY, p.x, p.y);
  p.x = clamp(p.x + Math.cos(a) * PLAYER.knockback * 0.12, PLAYER.radius, VIEW.width - PLAYER.radius);
  p.y = clamp(p.y + Math.sin(a) * PLAYER.knockback * 0.12, PLAYER.radius, VIEW.height - PLAYER.radius);
  burst(state, p.x, p.y, '#ff5d73', 14, 260);
  if (sound) sound.hit();
  if (p.hp <= 0) {
    p.hp = 0;
    state.phase = 'over';
    state.events |= EVENT_OVER;
    burst(state, p.x, p.y, '#5ff2d0', 40, 420);
    burst(state, p.x, p.y, '#ffd166', 24, 300);
    if (sound) sound.gameover();
  }
}

function killEnemy(state, index, sound) {
  const e = state.enemies[index];
  state.enemies.splice(index, 1);
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = COMBO_WINDOW;
  addScore(state, e.score, e.x, e.y);
  bloomFlower(state, e.x, e.y);
  burst(state, e.x, e.y, '#ff6ec7', 12, 240);
  burst(state, e.x, e.y, '#ffd166', 6, 160);
  if (sound) sound.bloom();
  if (e.kind === KIND_BRAMBLE) {
    state.pickups.push({ kind: 'heart', x: e.x, y: e.y, vx: 0, vy: -30, life: 12 });
  } else if (e.kind === KIND_DARTER && chance(state.rng, STAR_DROP_CHANCE)) {
    state.pickups.push({ kind: 'star', x: e.x, y: e.y, vx: 0, vy: -30, life: 12 });
  }
}

function stepBolts(state, dt) {
  for (let i = state.bolts.length - 1; i >= 0; i -= 1) {
    const b = state.bolts[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > VIEW.width + 20 || b.y < -20 || b.y > VIEW.height + 20) {
      state.bolts.splice(i, 1);
    }
  }
  for (let i = state.ebolts.length - 1; i >= 0; i -= 1) {
    const s = state.ebolts[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0 || s.x < -20 || s.x > VIEW.width + 20 || s.y < -20 || s.y > VIEW.height + 20) {
      state.ebolts.splice(i, 1);
    }
  }
}

function stepPlayer(state, input, dt, sound) {
  const p = state.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.fireTimer -= dt;

  const mv = input.moveVector();
  const moving = mv.x !== 0 || mv.y !== 0;
  if (input.dashPressed() && p.dashCd <= 0) {
    // Dash along the move keys, or along the aim when standing still.
    p.dashX = moving ? mv.x : Math.cos(p.angle);
    p.dashY = moving ? mv.y : Math.sin(p.angle);
    p.dashTime = PLAYER.dashTime;
    p.dashCd = PLAYER.dashCooldown;
    if (sound) sound.dash();
    burst(state, p.x, p.y, '#5ff2d0', 8, 180);
  }

  let vx;
  let vy;
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    vx = p.dashX * PLAYER.dashSpeed;
    vy = p.dashY * PLAYER.dashSpeed;
  } else {
    vx = mv.x * PLAYER.speed;
    vy = mv.y * PLAYER.speed;
  }
  p.x = clamp(p.x + vx * dt, PLAYER.radius, VIEW.width - PLAYER.radius);
  p.y = clamp(p.y + vy * dt, PLAYER.radius, VIEW.height - PLAYER.radius);
  p.angle = angleTo(p.x, p.y, input.mouse.x, input.mouse.y);

  if (input.firing() && p.fireTimer <= 0) {
    p.fireTimer = PLAYER.fireInterval;
    const a = p.angle;
    state.bolts.push({
      x: p.x + Math.cos(a) * (PLAYER.radius + 6),
      y: p.y + Math.sin(a) * (PLAYER.radius + 6),
      vx: Math.cos(a) * PLAYER.boltSpeed,
      vy: Math.sin(a) * PLAYER.boltSpeed,
      life: 1.2,
    });
    if (sound) sound.shoot();
  }
}

function stepEnemies(state, dt, sound) {
  const p = state.player;
  for (const e of state.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y)) || 1;
    const a = angleTo(e.x, e.y, p.x, p.y);
    e.wobble += dt * 2;
    if (e.kind === KIND_DRIFTER) {
      const wob = Math.sin(e.wobble) * 0.5;
      e.vx = Math.cos(a + wob) * e.speed;
      e.vy = Math.sin(a + wob) * e.speed;
    } else if (e.kind === KIND_DARTER) {
      e.timer -= dt;
      if (e.mode === 'chase') {
        e.vx = Math.cos(a) * e.speed;
        e.vy = Math.sin(a) * e.speed;
        if (d < 190 && e.timer <= 0) {
          e.mode = 'windup';
          e.timer = 0.4;
        }
      } else if (e.mode === 'windup') {
        e.vx *= 0.9;
        e.vy *= 0.9;
        if (e.timer <= 0) {
          e.mode = 'lunge';
          e.timer = 0.35;
          e.vx = Math.cos(a) * 540;
          e.vy = Math.sin(a) * 540;
        }
      } else if (e.mode === 'lunge') {
        if (e.timer <= 0) {
          e.mode = 'rest';
          e.timer = 0.9;
        }
      } else {
        e.vx *= 0.92;
        e.vy *= 0.92;
        if (e.timer <= 0) {
          e.mode = 'chase';
          e.timer = range(state.rng, 0.5, 1.4);
        }
      }
    } else if (e.kind === KIND_SPITTER) {
      const want = 280;
      const toward = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
      e.vx = Math.cos(a) * e.speed * toward;
      e.vy = Math.sin(a) * e.speed * toward;
      e.timer -= dt;
      if (e.timer <= 0 && d < 560) {
        e.timer = Math.max(1.4, 2.4 - state.wave * 0.08);
        state.ebolts.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 230,
          vy: Math.sin(a) * 230,
          life: 3,
          radius: 6,
        });
      }
    } else {
      // bramble: slow, relentless, heavy.
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // Gentle separation so motes do not stack into one blob.
  const list = state.enemies;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const min = a.radius + b.radius - 2;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

function stepCollisions(state, sound) {
  const p = state.player;
  // Bolts against enemies.
  for (let bi = state.bolts.length - 1; bi >= 0; bi -= 1) {
    const b = state.bolts[bi];
    let hit = false;
    for (let ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
      const e = state.enemies[ei];
      const rr = e.radius + PLAYER.boltRadius;
      if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
        hit = true;
        e.hp -= PLAYER.boltDamage;
        e.flash = 0.09;
        burst(state, b.x, b.y, '#e8ecff', 4, 140);
        if (e.hp <= 0) killEnemy(state, ei, sound);
        break;
      }
    }
    if (hit) state.bolts.splice(bi, 1);
  }

  if (state.phase !== 'playing') return;

  // Enemy seeds against the player.
  for (let i = state.ebolts.length - 1; i >= 0; i -= 1) {
    const s = state.ebolts[i];
    const rr = s.radius + PLAYER.radius;
    if (dist2(s.x, s.y, p.x, p.y) < rr * rr) {
      state.ebolts.splice(i, 1);
      damagePlayer(state, 1, s.x, s.y, sound);
    }
  }

  // Enemies against the player.
  for (const e of state.enemies) {
    const rr = e.radius + PLAYER.radius - 2;
    if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
      damagePlayer(state, e.touch, e.x, e.y, sound);
      if (state.phase !== 'playing') return;
    }
  }

  // Flowers and pickups.
  for (let i = state.flowers.length - 1; i >= 0; i -= 1) {
    const f = state.flowers[i];
    if (dist2(f.x, f.y, p.x, p.y) < 28 * 28) {
      state.flowers.splice(i, 1);
      state.flowersGathered += 1;
      addScore(state, FLOWER_SCORE, f.x, f.y, 'bloom');
      burst(state, f.x, f.y, f.hue, 8, 150);
      if (sound) sound.pickup();
      if (state.flowersGathered % FLOWERS_PER_HEART === 0 && p.hp < p.maxHp) {
        p.hp += 1;
        floater(state, p.x, p.y - 30, 'MENDED +1', '#5ff2d0', 20);
        if (sound) sound.heart();
      }
    }
  }
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const u = state.pickups[i];
    if (dist2(u.x, u.y, p.x, p.y) < 30 * 30) {
      state.pickups.splice(i, 1);
      if (u.kind === 'heart') {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        floater(state, p.x, p.y - 30, '+1 HEART', '#ff6ec7', 20);
        if (sound) sound.heart();
      } else {
        state.rushTimer = RUSH_TIME;
        floater(state, p.x, p.y - 30, 'BLOOM RUSH x2', '#ffd166', 22);
        if (sound) sound.heart();
      }
    }
  }
}

export function stepWorld(state, input, dt, sound) {
  state.events = EVENT_NONE;
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 30);
  state.flash = Math.max(0, state.flash - dt);
  state.rushTimer = Math.max(0, state.rushTimer - dt);
  if (state.banner) {
    state.banner.timer -= dt;
    if (state.banner.timer <= 0) state.banner = null;
  }
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  for (const s of state.ambient) {
    s.y -= s.drift * dt;
    s.phase += dt;
    if (s.y < -4) {
      s.y = VIEW.height + 4;
      s.x = state.rng() * VIEW.width;
    }
  }

  // Cosmetic motion keeps running even between waves, so the garden never
  // freezes while the player breathes.
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
    const f = state.floaters[i];
    f.y -= 34 * dt;
    f.life -= dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
  for (let i = state.flowers.length - 1; i >= 0; i -= 1) {
    const f = state.flowers[i];
    f.life -= dt;
    f.phase += dt * 1.5;
    if (f.life <= 0) state.flowers.splice(i, 1);
  }
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const u = state.pickups[i];
    u.y += u.vy * dt;
    u.life -= dt;
    if (u.life <= 0) state.pickups.splice(i, 1);
  }

  if (state.phase === 'between') {
    state.betweenTimer -= dt;
    // The wisp can reposition (and dash) while breathing — the garden
    // freezes for the player otherwise, and a dash test during the
    // breather would find a dead stick.
    stepPlayer(state, input, dt, sound);
    stepBolts(state, dt);
    if (state.betweenTimer <= 0) startWave(state, state.wave + 1, sound);
    return;
  }
  if (state.phase !== 'playing') return;

  if (state.toSpawn.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const spec = waveSpec(state.wave);
      state.spawnTimer = spec.interval * range(state.rng, 0.8, 1.2);
      spawnEnemy(state, state.toSpawn.shift());
    }
  }

  stepPlayer(state, input, dt, sound);
  stepEnemies(state, dt, sound);

  stepBolts(state, dt);

  stepCollisions(state, sound);

  if (state.phase === 'playing' && state.toSpawn.length === 0 && state.enemies.length === 0) {
    const bonus = WAVE_BONUS * state.wave;
    state.score += bonus;
    state.events |= EVENT_WAVE_CLEAR;
    showBanner(state, `WAVE ${state.wave} CLEARED`, `+${bonus} bonus — breathe, wisp`, BETWEEN_WAVES);
    state.phase = 'between';
    state.betweenTimer = BETWEEN_WAVES;
  }
}
