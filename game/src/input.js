// VOIDGARDEN input: keyboard and mouse state, in canvas coordinates.
// Edge presses are tracked per frame so the game can react to "just
// pressed" (start, dash, pause) without repeats.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, rightDown: false };
    this.mousePressed = false;
    this.rightPressed = false;
    this.anyPressed = false;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressed.add(e.code);
        this.anyPressed = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.mouse.rightDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mousePressed = true;
      } else if (e.button === 2) {
        this.mouse.rightDown = true;
        this.rightPressed = true;
      }
      this.anyPressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  justPressed(code) {
    return this.pressed.has(code);
  }

  // Movement vector from WASD / arrows, normalized.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  firing() {
    return this.mouse.down || this.down('Space');
  }

  dashPressed() {
    return this.justPressed('ShiftLeft') || this.justPressed('ShiftRight') || this.rightPressed;
  }

  startPressed() {
    return (
      this.justPressed('Enter') ||
      this.justPressed('Space') ||
      this.mousePressed ||
      this.anyPressed
    );
  }

  // Call once per frame, after the game has read the edges.
  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
    this.rightPressed = false;
    this.anyPressed = false;
  }
}
