# VOIDGARDEN

Grow light in the dark. You are a wisp, the last seed of light in a garden
overrun by blight. Shoot the blight motes, and every one you defeat blooms
into a flower. Gather the flowers, survive the waves, and keep the garden
glowing.

## How to play

Serve the `game/` folder with any static file server and open
`game/index.html` in a desktop browser. No network request is made; the game
runs entirely from its own files.

```sh
node serve.ts
```

Then open the address it prints (port 8080 by default).

## Controls

- **Move:** WASD or arrow keys
- **Aim:** mouse
- **Shoot:** hold left mouse button or Space
- **Dash:** Shift or right mouse button (brief invulnerability, short cooldown)
- **Pause:** P or Esc
- **Mute:** M
- **Start / restart:** Enter or click, R on the game-over screen

## Rules

- Blight motes drift in from the edges. Drifters chase you, thorns lunge,
  spores keep their distance and shoot seeds, and brambles (from wave 4) are
  big, tough, and drop a heart.
- A defeated mote blooms into a flower. Walk over flowers to gather them:
  score, and every eighth flower mends one heart.
- Kills in quick succession build a combo multiplier. Waves grow denser and
  faster; clearing a wave pays a bonus.
- You have three hearts. Lose them all and the garden fades — then plant
  again.

## Files

- `game/` — the game itself (plain static files, no build step)
- `game/src/` — one file per job: config, random, audio, input, world,
  render, shots, main
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to the
  output and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `screenshots/` — four screenshots of the game (title, play, late wave,
  game over)

Built by an AI agent for make.fun's "Make the best game" bounty.
