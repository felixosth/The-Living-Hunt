/**
 * Keyboard input, turned into simulation commands. A move command is only
 * sent when the intent changes, which keeps command logs small.
 */
import type { Command } from '../sim/commands';
import type { Gait } from '../sim/state';

const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const MOVE_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]);

export class Input {
  private down = new Set<string>();
  /** Keys pressed since the last poll, so taps shorter than a tick still register. */
  private tapped = new Set<string>();
  private sneaking = false;
  private lastSent = '';

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
      if (e.code === 'KeyC' && !e.repeat) this.sneaking = !this.sneaking;
      this.down.add(e.code);
      this.tapped.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    // Releasing keys while the window is unfocused would leave them stuck.
    target.addEventListener('blur', () => this.down.clear());
  }

  get sneakToggled(): boolean {
    return this.sneaking;
  }

  /** The move command for the current key state, or null if nothing changed. */
  poll(): Command | null {
    const x = this.axis(RIGHT) - this.axis(LEFT);
    const y = this.axis(DOWN) - this.axis(UP);
    const running = this.held('ShiftLeft') || this.held('ShiftRight');
    const gait: Gait = running ? 'run' : this.sneaking ? 'sneak' : 'walk';
    this.tapped.clear();
    const key = `${x},${y},${gait}`;
    if (key === this.lastSent) return null;
    this.lastSent = key;
    return { type: 'move', x, y, gait };
  }

  /** Forget the last sent intent, so the next poll re-sends it (e.g. after loading). */
  resync(): void {
    this.lastSent = '';
  }

  private held(code: string): boolean {
    return this.down.has(code) || this.tapped.has(code);
  }

  private axis(codes: string[]): number {
    return codes.some((c) => this.held(c)) ? 1 : 0;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
