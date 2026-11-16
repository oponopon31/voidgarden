// VOIDGARDEN tuning: every number that shapes how the game feels.
// One place to tune, so the game can be balanced without touching logic.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 350,
  fireInterval: 0.14,
  boltSpeed: 780,
  boltRadius: 5,
  boltDamage: 1,
  dashSpeed: 980,
  dashTime: 0.16,
  dashCooldown: 1.6,
  maxHearts: 5,
  startHearts: 3,
  invulnTime: 1.2,
  knockback: 320,
};

export const COMBO_WINDOW = 3.0;
export const COMBO_STEP = 0.25;
export const COMBO_MAX = 3.0;
export const FLOWERS_PER_HEART = 8;
export const FLOWER_SCORE = 20;
export const FLOWER_LIFETIME = 30;
export const MAX_FLOWERS = 140;

// Enemy kinds. speed is the base drift speed; waves scale it.
export const ENEMY = {
  drifter: { radius: 15, speed: 62, hp: 1, score: 10, touch: 1 },
  darter: { radius: 12, speed: 95, hp: 1, score: 25, touch: 1 },
  spitter: { radius: 17, speed: 48, hp: 2, score: 40, touch: 1 },
  bramble: { radius: 30, speed: 38, hp: 6, score: 100, touch: 2 },
};

// Wave n fields: how many motes, how fast they arrive, and the mix.
export function waveSpec(n) {
  const count = 6 + 4 * n;
  const interval = Math.max(0.35, 1.15 - 0.07 * n);
  const mix = { drifter: 1.0 };
  if (n >= 2) mix.darter = 0.22 + 0.03 * n;
  if (n >= 3) mix.spitter = 0.14 + 0.02 * n;
  if (n >= 4) mix.bramble = Math.min(0.12, 0.02 * (n - 2));
  return { count, interval, mix };
}

export const WAVE_BONUS = 25; // score per wave on clear, times the wave number
export const BETWEEN_WAVES = 3.0; // seconds of breather between waves
export const SPAWN_MARGIN = 40; // enemies spawn this far outside the view
export const STAR_DROP_CHANCE = 0.06; // darter kill drops a star
export const RUSH_TIME = 6.0; // seconds of double score from a star
