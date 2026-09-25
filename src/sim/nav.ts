/**
 * Navigation grid for animals: 4 m cells over the 2 m terrain tiles, with a
 * walking cost per cell. Animals travel to points of interest by walking
 * downhill in a precomputed Dijkstra distance field, so no paths are stored in
 * the world state.
 */

export interface NavGrid {
  /** Cell edge length in metres. */
  cellSize: number;
  cols: number;
  rows: number;
  /** Walking cost per cell (Infinity = blocked). Game trails are cheaper. */
  cost: Float32Array;
  /** 1 where a game trail runs through the cell. */
  trail: Uint8Array;
}

const SQRT2 = Math.SQRT2;
/** Neighbour offsets: 4 orthogonal, then 4 diagonal. */
const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DY = [0, 0, 1, -1, 1, -1, 1, -1] as const;

export function cellOf(grid: NavGrid, x: number, y: number): number {
  const cx = Math.floor(x / grid.cellSize);
  const cy = Math.floor(y / grid.cellSize);
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return -1;
  return cy * grid.cols + cx;
}

export function cellCentre(grid: NavGrid, cell: number): { x: number; y: number } {
  return {
    x: ((cell % grid.cols) + 0.5) * grid.cellSize,
    y: (Math.floor(cell / grid.cols) + 0.5) * grid.cellSize,
  };
}

export function isCellOpen(grid: NavGrid, cell: number): boolean {
  return cell >= 0 && Number.isFinite(grid.cost[cell] as number);
}

/**
 * Calls `visit(neighbour, stepLength)` for each open neighbour of `cell`.
 * Diagonal moves need both orthogonal cells open, so paths never cut corners.
 */
export function forEachNeighbour(
  grid: NavGrid,
  cell: number,
  visit: (neighbour: number, stepLength: number) => void,
): void {
  const { cols, rows, cost } = grid;
  const cx = cell % cols;
  const cy = (cell - cx) / cols;
  for (let k = 0; k < 8; k++) {
    const nx = cx + (DX[k] as number);
    const ny = cy + (DY[k] as number);
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const n = ny * cols + nx;
    if (!Number.isFinite(cost[n] as number)) continue;
    if (k >= 4) {
      if (!Number.isFinite(cost[cy * cols + nx] as number)) continue;
      if (!Number.isFinite(cost[ny * cols + cx] as number)) continue;
      visit(n, SQRT2);
    } else {
      visit(n, 1);
    }
  }
}

/** Binary min-heap of cell indices keyed by priority. */
class CellHeap {
  private cells = new Int32Array(1024);
  private keys = new Float64Array(1024);
  size = 0;

  push(cell: number, key: number): void {
    if (this.size === this.cells.length) {
      const cells = new Int32Array(this.size * 2);
      cells.set(this.cells);
      this.cells = cells;
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.keys[parent] as number) <= key) break;
      this.cells[i] = this.cells[parent] as number;
      this.keys[i] = this.keys[parent] as number;
      i = parent;
    }
    this.cells[i] = cell;
    this.keys[i] = key;
  }

  /** Key of the smallest entry. Check `size` first. */
  peekKey(): number {
    return this.keys[0] as number;
  }

  /** Remove the smallest entry; returns its cell. Check `size` first. */
  pop(): number {
    const top = this.cells[0] as number;
    const last = --this.size;
    const cell = this.cells[last] as number;
    const key = this.keys[last] as number;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= last) break;
      if (child + 1 < last && (this.keys[child + 1] as number) < (this.keys[child] as number))
        child++;
      if ((this.keys[child] as number) >= key) break;
      this.cells[i] = this.cells[child] as number;
      this.keys[i] = this.keys[child] as number;
      i = child;
    }
    this.cells[i] = cell;
    this.keys[i] = key;
    return top;
  }
}

/**
 * Cost-weighted distance (in cells) from every cell to the nearest source.
 * Unreachable cells are Infinity.
 */
export function distanceField(
  grid: NavGrid,
  sources: readonly number[],
  cost: Float32Array = grid.cost,
): Float32Array {
  // Float64 while searching: rounding to float32 would make equal paths look shorter.
  const dist = new Float64Array(grid.cols * grid.rows).fill(Number.POSITIVE_INFINITY);
  const heap = new CellHeap();
  for (const s of sources) {
    if (s < 0 || !Number.isFinite(cost[s] as number)) continue;
    dist[s] = 0;
    heap.push(s, 0);
  }
  const g = cost === grid.cost ? grid : { ...grid, cost };
  while (heap.size > 0) {
    const key = heap.peekKey();
    const cell = heap.pop();
    const d = dist[cell] as number;
    if (key > d) continue; // stale entry
    const here = cost[cell] as number;
    forEachNeighbour(g, cell, (n, len) => {
      const nd = d + (len * (here + (cost[n] as number))) / 2;
      if (nd < (dist[n] as number)) {
        dist[n] = nd;
        heap.push(n, nd);
      }
    });
  }
  return new Float32Array(dist);
}

/** Cheapest path from `from` to `to` as a list of cells (inclusive), or null. */
export function findPath(
  grid: NavGrid,
  from: number,
  to: number,
  cost: Float32Array = grid.cost,
  minCost = 0.4,
): number[] | null {
  if (!Number.isFinite(cost[from] as number) || !Number.isFinite(cost[to] as number)) return null;
  const { cols } = grid;
  const n = grid.cols * grid.rows;
  const g = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const tx = to % cols;
  const ty = Math.floor(to / cols);
  const h = (cell: number) => {
    const dx = Math.abs((cell % cols) - tx);
    const dy = Math.abs(Math.floor(cell / cols) - ty);
    return minCost * (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy));
  };
  const heap = new CellHeap();
  const grid2 = cost === grid.cost ? grid : { ...grid, cost };
  g[from] = 0;
  heap.push(from, h(from));
  while (heap.size > 0) {
    const cell = heap.pop();
    if (cell === to) break;
    if (closed[cell]) continue;
    closed[cell] = 1;
    const gc = g[cell] as number;
    const here = cost[cell] as number;
    forEachNeighbour(grid2, cell, (nb, len) => {
      if (closed[nb]) return;
      const ng = gc + (len * (here + (cost[nb] as number))) / 2;
      if (ng < (g[nb] as number)) {
        g[nb] = ng;
        came[nb] = cell;
        heap.push(nb, ng + h(nb));
      }
    });
  }
  if (!Number.isFinite(g[to] as number)) return null;
  const path = [to];
  let c = to;
  while (c !== from) {
    c = came[c] as number;
    path.push(c);
  }
  return path.reverse();
}

/**
 * The cell to head for when walking downhill in `field` from `cell`: the
 * lowest open neighbour, looking two cells ahead for smoother lines. Returns
 * `cell` itself at the bottom of the field.
 */
export function downhill(grid: NavGrid, field: Float32Array, cell: number): number {
  const step = (c: number) => {
    let best = c;
    let bestD = field[c] as number;
    forEachNeighbour(grid, c, (n) => {
      const d = field[n] as number;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    });
    return best;
  };
  const first = step(cell);
  if (first === cell) return cell;
  const second = step(first);
  // Only look ahead in a straight-ish line, so corners aren't cut through blocked cells.
  return lineIsOpen(grid, cell, second) ? second : first;
}

/** True if every cell on the straight line between two cells is open. */
export function lineIsOpen(grid: NavGrid, a: number, b: number): boolean {
  const { cols } = grid;
  let x0 = a % cols;
  let y0 = Math.floor(a / cols);
  const x1 = b % cols;
  const y1 = Math.floor(b / cols);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (!Number.isFinite(grid.cost[y0 * cols + x0] as number)) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Connected component labels (0 = blocked, 1.. = components). */
export function components(grid: NavGrid): Int32Array {
  const label = new Int32Array(grid.cols * grid.rows);
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] !== 0 || !Number.isFinite(grid.cost[start] as number)) continue;
    next++;
    label[start] = next;
    stack.push(start);
    while (stack.length > 0) {
      const c = stack.pop() as number;
      forEachNeighbour(grid, c, (n) => {
        if (label[n] === 0) {
          label[n] = next;
          stack.push(n);
        }
      });
    }
  }
  return label;
}
