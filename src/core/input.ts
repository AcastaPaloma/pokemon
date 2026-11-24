// Keyboard + mouse state with pointer lock. Game code reads actions, never raw
// key codes, so bindings live in one table.

export type ActionId =
  | 'forward' | 'back' | 'left' | 'right'
  | 'jump' | 'sprint' | 'crouch' | 'dodge' | 'shield'
  | 'fast' | 'charged' | 'swapCharged'
  | 'aura' | 'awaken' | 'interact'
  | 'wheel' | 'menu' | 'map'
  | 'pack1' | 'pack2' | 'pack3' | 'pack4' | 'pack5' | 'pack6'
  | 'uiUp' | 'uiDown' | 'uiLeft' | 'uiRight' | 'uiAccept' | 'uiBack' | 'tabPrev' | 'tabNext';

const BINDINGS: Record<ActionId, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  crouch: ['KeyC', 'ControlLeft'],
  dodge: ['AltLeft', 'AltRight', 'ShiftRight'],
  shield: ['KeyE'],
  fast: ['Mouse0'],
  charged: ['Mouse2'],
  swapCharged: ['KeyQ', 'Mouse1'],
  aura: ['KeyV'],
  awaken: ['KeyR'],
  interact: ['KeyF'],
  wheel: ['Tab'],
  menu: ['Escape', 'KeyP'],
  map: ['KeyM'],
  pack1: ['Digit1'], pack2: ['Digit2'], pack3: ['Digit3'], pack4: ['Digit4'], pack5: ['Digit5'], pack6: ['Digit6'],
  uiUp: ['KeyW', 'ArrowUp'],
  uiDown: ['KeyS', 'ArrowDown'],
  uiLeft: ['KeyA', 'ArrowLeft'],
  uiRight: ['KeyD', 'ArrowRight'],
  uiAccept: ['Enter', 'Space', 'KeyF'],
  uiBack: ['Escape', 'Backspace'],
  tabPrev: ['KeyQ'],
  tabNext: ['KeyE'],
};

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  /** accumulated mouse movement since last frame, in CSS pixels */
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  /** screen-space pointer, for menus and the radial wheel */
  px = 0;
  py = 0;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** called on the first key or click so audio can unlock */
  onGesture: (() => void) | null = null;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Alt') || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.onGesture?.();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('mousedown', (e) => {
      const c = 'Mouse' + e.button;
      this.down.add(c);
      this.pressed.add(c);
      this.onGesture?.();
    });
    window.addEventListener('mouseup', (e) => {
      const c = 'Mouse' + e.button;
      this.down.delete(c);
      this.released.add(c);
    });
    window.addEventListener('mousemove', (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
      if (this.locked) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (!this.locked) {
      const p = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    }
  }
  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  held(a: ActionId) {
    for (const k of BINDINGS[a]) if (this.down.has(k)) return true;
    return false;
  }
  hit(a: ActionId) {
    for (const k of BINDINGS[a]) if (this.pressed.has(k)) return true;
    return false;
  }
  up(a: ActionId) {
    for (const k of BINDINGS[a]) if (this.released.has(k)) return true;
    return false;
  }
  anyHit() {
    return this.pressed.size > 0;
  }
  /** Clear per-frame edges. Call at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  // ---- scripted input for automated checks
  press(code: string) {
    this.down.add(code);
    this.pressed.add(code);
  }
  release(code: string) {
    this.down.delete(code);
    this.released.add(code);
  }
  nudge(dx: number, dy: number) {
    this.dx += dx;
    this.dy += dy;
  }
}

export function keyLabel(a: ActionId): string {
  const k = BINDINGS[a][0];
  if (k.startsWith('Key')) return k.slice(3);
  if (k.startsWith('Digit')) return k.slice(5);
  const map: Record<string, string> = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'SPACE', ShiftLeft: 'SHIFT', AltLeft: 'ALT', Escape: 'ESC', Tab: 'TAB', Enter: 'ENTER', ControlLeft: 'CTRL' };
  return map[k] ?? k;
}
