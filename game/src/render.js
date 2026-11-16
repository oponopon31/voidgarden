// VOIDGARDEN render: everything the player sees, drawn on one canvas.
// Background garden, entities, HUD, and the title / pause / game-over
// screens. No images, no fonts loaded from anywhere: all art is code.

import { VIEW, PLAYER, COMBO_WINDOW, FLOWERS_PER_HEART } from './config.js';
import { KIND_DRIFTER, KIND_DARTER, KIND_SPITTER, KIND_BRAMBLE, comboMult } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';
export const SCREEN_PAUSED = 'paused';

const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
const ENEMY_COLORS = {
  [KIND_DRIFTER]: '#8b7cf6',
  [KIND_DARTER]: '#ff5d73',
  [KIND_SPITTER]: '#ffb347',
  [KIND_BRAMBLE]: '#c084fc',
};

const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

function drawGlow(ctx, color, x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function drawBackground(ctx, state) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, '#0b1026');
  grad.addColorStop(0.55, '#121a3a');
  grad.addColorStop(1, '#0a0d20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // Soft light well around the wisp, so the light always frames the action.
  drawGlow(ctx, '#1d2f66', state.player.x, state.player.y, 900, 0.5);

  // Garden mounds along the bottom.
  ctx.save();
  ctx.fillStyle = 'rgba(20, 32, 72, 0.55)';
  ctx.beginPath();
  ctx.moveTo(0, VIEW.height);
  for (let x = 0; x <= VIEW.width; x += 80) {
    ctx.quadraticCurveTo(x + 40, VIEW.height - 34 - Math.sin(x * 0.01) * 10, x + 80, VIEW.height);
  }
  ctx.lineTo(VIEW.width, VIEW.height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Drifting spores.
  for (const s of state.ambient) {
    const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(s.phase));
    ctx.save();
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#8fb7ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Vignette.
  const vg = ctx.createRadialGradient(
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42,
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,4,14,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function drawFlower(ctx, f) {
  const sway = Math.sin(f.phase) * 3;
  const alpha = f.life < 3 ? Math.max(0, f.life / 3) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawGlow(ctx, f.hue, f.x, f.y, 46, 0.5);
  ctx.translate(f.x + sway, f.y);
  ctx.fillStyle = f.hue;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + f.phase * 0.2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 9, Math.sin(a) * 9, 6, 3.4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickup(ctx, u, time) {
  const bob = Math.sin(time * 3 + u.x) * 3;
  if (u.kind === 'heart') {
    drawGlow(ctx, '#ff6ec7', u.x, u.y + bob, 54, 0.7);
    ctx.save();
    ctx.translate(u.x, u.y + bob);
    ctx.fillStyle = '#ff6ec7';
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.bezierCurveTo(-11, -2, -8, -11, 0, -5);
    ctx.bezierCurveTo(8, -11, 11, -2, 0, 9);
    ctx.fill();
    ctx.restore();
  } else {
    drawGlow(ctx, '#ffd166', u.x, u.y + bob, 60, 0.8);
    ctx.save();
    ctx.translate(u.x, u.y + bob);
    ctx.rotate(time * 1.2);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 13 : 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawEnemy(ctx, e, time) {
  const color = ENEMY_COLORS[e.kind];
  const flash = e.flash > 0;
  ctx.save();
  ctx.translate(e.x, e.y);
  drawGlow(ctx, color, 0, 0, e.radius * 4.4, 0.75);
  ctx.fillStyle = flash ? '#ffffff' : color;
  ctx.strokeStyle = flash ? '#ffffff' : color;
  if (e.kind === KIND_DRIFTER) {
    // Spiky mote.
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + e.wobble * 0.4;
      const r = i % 2 === 0 ? e.radius + 5 : e.radius - 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b1026';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === KIND_DARTER) {
    const a = Math.atan2(e.vy, e.vx);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(e.radius + 8, 0);
    ctx.lineTo(-e.radius, -e.radius * 0.8);
    ctx.lineTo(-e.radius * 0.4, 0);
    ctx.lineTo(-e.radius, e.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.radius * 0.3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    if (e.mode === 'windup') {
      // Telegraph the lunge: a pulsing red ring while the darter coils.
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 10 + 3 * Math.sin(time * 20), 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  } else if (e.kind === KIND_SPITTER) {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + time * 0.6;
      const x = Math.cos(a) * e.radius;
      const y = Math.sin(a) * e.radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b1026';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Bramble: big thorny ring.
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2 + time * 0.3;
      const r = i % 2 === 0 ? e.radius + 8 : e.radius - 3;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = flash ? '#ffffff' : '#3a2a6e';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath();
    ctx.arc(-7, -4, 4, 0, Math.PI * 2);
    ctx.arc(7, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    // Health bar.
    const w = 44;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-w / 2, -e.radius - 14, w, 5);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(-w / 2, -e.radius - 14, (w * e.hp) / e.maxHp, 5);
  }
  // Pale rim so motes stay visible against the dark garden.
  ctx.beginPath();
  ctx.arc(0, 0, e.radius + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232,236,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx, p, time) {
  const blink = p.invuln > 0 && Math.floor(time * 14) % 2 === 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  drawGlow(ctx, '#5ff2d0', 0, 0, 110, blink ? 0.25 : 0.65);
  // Sprout leaves.
  ctx.strokeStyle = '#5ff2d0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(-8, -22, -16, -20);
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(8, -22, 16, -20);
  ctx.stroke();
  // Body.
  ctx.fillStyle = blink ? 'rgba(95,242,208,0.45)' : '#5ff2d0';
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b1026';
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER.radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER.radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // Aim tick.
  ctx.rotate(p.angle);
  ctx.strokeStyle = 'rgba(232,236,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PLAYER.radius + 4, 0);
  ctx.lineTo(PLAYER.radius + 12, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHeart(ctx, x, y, filled, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = filled ? '#ff6ec7' : 'rgba(255,110,199,0.22)';
  ctx.strokeStyle = 'rgba(255,110,199,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-10, -1, -7, -10, 0, -4);
  ctx.bezierCurveTo(7, -10, 10, -1, 0, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx, state, view) {
  const p = state.player;
  ctx.save();
  ctx.textBaseline = 'top';

  // Score, top left.
  ctx.fillStyle = '#e8ecff';
  ctx.font = `700 30px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${fmt(state.score)}`, 24, 20);
  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = 'rgba(232,236,255,0.65)';
  ctx.fillText(`BEST  ${fmt(Math.max(state.best, state.score))}`, 24, 56);
  if (state.rushTimer > 0) {
    ctx.fillStyle = '#ffd166';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(`BLOOM RUSH x2 — ${state.rushTimer.toFixed(1)}s`, 24, 80);
  }

  // Wave, top centre.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8ecff';
  ctx.font = `700 24px ${FONT}`;
  const remaining = state.enemies.length + state.toSpawn.length;
  ctx.fillText(`WAVE ${Math.max(1, state.wave)}`, VIEW.width / 2, 20);
  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = 'rgba(232,236,255,0.65)';
  ctx.fillText(
    state.phase === 'between' ? 'breathe…' : `${remaining} mote${remaining === 1 ? '' : 's'} left`,
    VIEW.width / 2,
    52,
  );

  // Hearts + dash, top right.
  for (let i = 0; i < p.maxHp; i += 1) {
    drawHeart(ctx, VIEW.width - 36 - i * 30, 40, i < p.hp, 1);
  }
  const dashW = 130;
  const dashX = VIEW.width - 24 - dashW;
  ctx.fillStyle = 'rgba(232,236,255,0.18)';
  ctx.fillRect(dashX, 62, dashW, 6);
  const dashFrac = p.dashCd <= 0 ? 1 : 1 - p.dashCd / 1.6;
  ctx.fillStyle = p.dashCd <= 0 ? '#5ff2d0' : '#8fb7ff';
  ctx.fillRect(dashX, 62, dashW * dashFrac, 6);
  ctx.font = `400 12px ${FONT}`;
  ctx.fillStyle = 'rgba(232,236,255,0.6)';
  ctx.textAlign = 'right';
  ctx.fillText(p.dashCd <= 0 ? 'DASH READY  [SHIFT]' : 'DASH…', VIEW.width - 24, 74);

  // Combo, bottom centre (not on the title screen, which has its own layout).
  if (state.combo > 1 && view.screen !== SCREEN_TITLE) {
    const mult = comboMult(state);
    const w = 220;
    const x = (VIEW.width - w) / 2;
    const y = VIEW.height - 34;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(`COMBO x${mult.toFixed(2)}  ·  ${state.combo} streak`, VIEW.width / 2, y - 26);
    ctx.fillStyle = 'rgba(255,209,102,0.25)';
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x, y, w * (state.comboTimer / COMBO_WINDOW), 6);
  }

  // Flowers gathered, bottom left (not on the title screen).
  if (view.screen !== SCREEN_TITLE) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(232,236,255,0.7)';
    ctx.font = `400 15px ${FONT}`;
    ctx.fillText(
      `✿ ${state.flowersGathered} gathered  ·  ${FLOWERS_PER_HEART - (state.flowersGathered % FLOWERS_PER_HEART)} to mend a heart`,
      24,
      VIEW.height - 28,
    );
  }

  // Wave banner.
  if (state.banner) {
    const a = Math.min(1, state.banner.timer * 2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8ecff';
    ctx.font = `700 54px ${FONT}`;
    ctx.fillText(state.banner.text, VIEW.width / 2, VIEW.height / 2 - 70);
    ctx.font = `400 22px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(state.banner.sub, VIEW.width / 2, VIEW.height / 2 - 6);
    ctx.restore();
  }

  // Damage flash.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 60, 90, ${state.flash * 0.28})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  // Low hearts pulse.
  if (p.hp === 1 && state.phase === 'playing') {
    const pulse = 0.1 + 0.06 * Math.sin(view.time * 5);
    const vg = ctx.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.3,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.8,
    );
    vg.addColorStop(0, 'rgba(255,60,90,0)');
    vg.addColorStop(1, `rgba(255,60,90,${pulse})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  ctx.restore();
}

function centerText(ctx, text, y, font, color) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, VIEW.width / 2, y);
  ctx.restore();
}

function drawTitle(ctx, state, view) {
  ctx.save();
  ctx.fillStyle = 'rgba(7,10,26,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const pulse = 0.65 + 0.35 * Math.sin(view.time * 2.4);

  const grad = ctx.createLinearGradient(0, 130, 0, 230);
  grad.addColorStop(0, '#5ff2d0');
  grad.addColorStop(1, '#ffd166');
  ctx.save();
  ctx.font = `900 96px ${FONT}`;
  ctx.fillStyle = grad;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VOIDGARDEN', VIEW.width / 2, 178);
  ctx.restore();

  centerText(ctx, 'grow light in the dark', 240, `italic 400 30px ${FONT}`, '#ff6ec7');
  centerText(
    ctx,
    'You are the last wisp of a garden overrun by blight. Shoot the motes —',
    312,
    `400 20px ${FONT}`,
    'rgba(232,236,255,0.9)',
  );
  centerText(
    ctx,
    'every one you defeat blooms into a flower. Gather them. Survive the waves.',
    340,
    `400 20px ${FONT}`,
    'rgba(232,236,255,0.9)',
  );

  // Controls.
  const rows = [
    ['MOVE', 'WASD  /  arrow keys'],
    ['AIM', 'mouse'],
    ['SHOOT', 'hold left click  /  Space'],
    ['DASH', 'Shift  /  right click'],
    ['PAUSE', 'P      ·      MUTE  M'],
  ];
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  rows.forEach((row, i) => {
    const y = 408 + i * 30;
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = '#5ff2d0';
    ctx.fillText(row[0], VIEW.width / 2 - 190, y);
    ctx.font = `400 17px ${FONT}`;
    ctx.fillStyle = 'rgba(232,236,255,0.85)';
    ctx.fillText(row[1], VIEW.width / 2 - 100, y);
  });
  ctx.restore();

  if (view.best > 0) {
    centerText(ctx, `BEST  ${fmt(view.best)}`, 590, `700 22px ${FONT}`, '#ffd166');
  }
  ctx.save();
  ctx.globalAlpha = pulse;
  centerText(ctx, 'PRESS ENTER OR CLICK TO PLAY', 640, `700 24px ${FONT}`, '#e8ecff');
  ctx.restore();
  ctx.restore();
}

function drawOver(ctx, state, view) {
  ctx.save();
  ctx.fillStyle = 'rgba(7,10,26,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  centerText(ctx, 'THE GARDEN FADES', 168, `900 64px ${FONT}`, '#ff8fa3');
  centerText(ctx, 'the blight takes the last light — for now', 224, `italic 400 22px ${FONT}`, 'rgba(232,236,255,0.8)');

  const stats = [
    ['SCORE', fmt(state.score)],
    ['WAVE REACHED', String(Math.max(1, state.wave))],
    ['MOTES BLOOMED', String(state.kills)],
    ['FLOWERS GATHERED', String(state.flowersGathered)],
    ['BEST', fmt(Math.max(state.best, state.score))],
  ];
  ctx.save();
  ctx.textBaseline = 'middle';
  stats.forEach((row, i) => {
    const y = 300 + i * 40;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = 'rgba(232,236,255,0.65)';
    ctx.textAlign = 'right';
    ctx.fillText(row[0], VIEW.width / 2 - 20, y);
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = '#e8ecff';
    ctx.textAlign = 'left';
    ctx.fillText(row[1], VIEW.width / 2 + 20, y);
  });
  ctx.restore();

  if (view.newBest) {
    centerText(ctx, '★ NEW BEST ★', 516, `700 26px ${FONT}`, '#ffd166');
  }
  const pulse = 0.65 + 0.35 * Math.sin(view.time * 2.4);
  ctx.save();
  ctx.globalAlpha = pulse;
  centerText(ctx, 'PRESS R OR CLICK TO PLANT AGAIN', 566, `700 24px ${FONT}`, '#e8ecff');
  ctx.restore();
  ctx.restore();
}

function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(7,10,26,0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  centerText(ctx, 'PAUSED', 330, `900 64px ${FONT}`, '#e8ecff');
  centerText(ctx, 'P to resume   ·   M to mute', 400, `400 20px ${FONT}`, 'rgba(232,236,255,0.8)');
  ctx.restore();
}

export function drawWorld(ctx, state, view) {
  ctx.save();
  if (state.shake > 0.2) {
    const s = state.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawBackground(ctx, state);
  for (const f of state.flowers) drawFlower(ctx, f);
  for (const u of state.pickups) drawPickup(ctx, u, view.time);
  for (const e of state.enemies) drawEnemy(ctx, e, view.time);
  for (const s of state.ebolts) {
    drawGlow(ctx, '#ffb347', s.x, s.y, 26, 0.8);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of state.bolts) {
    drawGlow(ctx, '#5ff2d0', b.x, b.y, 30, 0.8);
    ctx.strokeStyle = '#e8ecff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (state.phase !== 'over') drawPlayer(ctx, state.player, view.time);
  for (const pt of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.font = `700 ${f.size}px ${FONT}`;
    ctx.fillStyle = f.color;
    // Keep the text on screen even when the kill happened at an edge, and
    // clear of the top and bottom HUD lines.
    const fx = Math.max(70, Math.min(VIEW.width - 70, f.x));
    const fy = Math.max(110, Math.min(VIEW.height - 90, f.y));
    ctx.fillText(f.text, fx, fy);
  }
  ctx.restore();

  // Aim reticle while playing.
  if (view.screen === SCREEN_PLAY) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,236,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(view.mouseX, view.mouseY, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(view.mouseX - 16, view.mouseY);
    ctx.lineTo(view.mouseX - 6, view.mouseY);
    ctx.moveTo(view.mouseX + 6, view.mouseY);
    ctx.lineTo(view.mouseX + 16, view.mouseY);
    ctx.moveTo(view.mouseX, view.mouseY - 16);
    ctx.lineTo(view.mouseX, view.mouseY - 6);
    ctx.moveTo(view.mouseX, view.mouseY + 6);
    ctx.lineTo(view.mouseX, view.mouseY + 16);
    ctx.stroke();
    ctx.restore();
  }

  drawHud(ctx, state, view);
  ctx.restore();

  if (view.screen === SCREEN_TITLE) drawTitle(ctx, state, view);
  else if (view.screen === SCREEN_OVER) drawOver(ctx, state, view);
  else if (view.screen === SCREEN_PAUSED) drawPaused(ctx);
}
