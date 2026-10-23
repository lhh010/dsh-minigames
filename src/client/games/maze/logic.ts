/**
 * Pure maze logic: seeded perfect-maze generation (randomized DFS spanning
 * tree — every cell reachable, exactly one path between any two cells), wall
 * queries, and BFS distances. No DOM, no state; the same seed always yields
 * the identical maze.
 */

/** Wall bits set in each Maze cell (bitwise OR of open directions). */
export const N = 1
export const E = 2
export const S = 4
export const W = 8
/** All four walls present (a fresh un-carved cell). */
const ALL_WALLS = N | E | S | W

/** Direction → (dx, dy, my wall bit, neighbor's opposite wall bit). */
const DIRS: ReadonlyArray<{ dx: number; dy: number; bit: number; opp: number }> = [
  { dx: 0, dy: -1, bit: N, opp: S },
  { dx: 1, dy: 0, bit: E, opp: W },
  { dx: 0, dy: 1, bit: S, opp: N },
  { dx: -1, dy: 0, bit: W, opp: E },
]

/**
 * A perfect maze on a w×h cell grid.
 *
 * `walls` holds one byte per cell (row-major, index y*w+x): the bitmask of
 * OPEN passages — bit 1 = north open, 2 = east, 4 = south, 8 = west. Border
 * walls never open, so neighbor pairs stay symmetric (A's E open ⇔ the
 * east neighbor's W open).
 */
export interface Maze {
  w: number
  h: number
  walls: Uint8Array
}

/** Mulberry32: tiny deterministic 32-bit PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate a perfect maze of w×h cells with randomized DFS (iterative, own
 * stack). Same seed → identical wall bitmask.
 * @param seed deterministic RNG seed
 * @param w cell columns (≥ 3)
 * @param h cell rows (≥ 3)
 */
export function generateMaze(seed: number, w: number, h: number): Maze {
  const walls = new Uint8Array(w * h) // 0 = all four walls still closed
  const rand = rng(seed)
  const visited = new Uint8Array(w * h)
  const stack: number[] = [0] // start carving at (0,0)
  visited[0] = 1
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!
    const cx = cur % w
    const cy = (cur / w) | 0
    // Collect unvisited in-bounds neighbors.
    const options: number[] = [] // DIRS indices
    for (let d = 0; d < 4; d += 1) {
      const { dx, dy } = DIRS[d]!
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (visited[ny * w + nx] === 1) continue
      options.push(d)
    }
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const d = options[Math.floor(rand() * options.length)]!
    const { dx, dy, bit, opp } = DIRS[d]!
    const next = (cy + dy) * w + (cx + dx)
    walls[cur] = walls[cur]! | bit // open both sides of the shared wall
    walls[next] = walls[next]! | opp
    visited[next] = 1
    stack.push(next)
  }
  return { w, h, walls }
}

/** Direction names as used by canMove. */
export type MazeDir = 'up' | 'right' | 'down' | 'left'

/**
 * Whether the player at cell (x, y) may step one cell toward `dir`.
 * @returns true when the shared wall is open and the target is in bounds.
 */
export function canMove(maze: Maze, x: number, y: number, dir: MazeDir): boolean {
  const dirIndex = { up: 0, right: 1, down: 2, left: 3 }[dir] as 0 | 1 | 2 | 3
  const { dx, dy, bit } = DIRS[dirIndex]!
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= maze.w || ny >= maze.h) return false
  return (maze.walls[y * maze.w + x]! & bit) !== 0
}

/**
 * BFS shortest-path length in cells between two cells of a perfect maze
 * (always connected, so every pair resolves).
 * @param from start cell {x,y}
 * @param to target cell {x,y}
 * @returns number of steps; -1 only if a cell is out of bounds
 */
export function bfsDistance(maze: Maze, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const { w, h } = maze
  if (from.x < 0 || from.y < 0 || from.x >= w || from.y >= h) return -1
  if (to.x < 0 || to.y < 0 || to.x >= w || to.y >= h) return -1
  const dist = new Int32Array(w * h).fill(-1)
  const queue: number[] = [from.y * w + from.x]
  dist[queue[0]!] = 0
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head]!
    if (cur === to.y * w + to.x) return dist[cur]!
    const cx = cur % w
    const cy = (cur / w) | 0
    const mask = maze.walls[cur]!
    for (let d = 0; d < 4; d += 1) {
      const { dx, dy, bit } = DIRS[d]!
      if ((mask & bit) === 0) continue
      const next = (cy + dy) * w + (cx + dx)
      if (dist[next] !== -1) continue
      dist[next] = dist[cur]! + 1
      queue.push(next)
    }
  }
  return dist[to.y * w + to.x]!
}

/**
 * Shortest solution length: top-left (0,0) → bottom-right (w-1,h-1).
 * @returns BFS distance in steps; positive for any w,h ≥ 2
 */
export function solveLength(maze: Maze): number {
  return bfsDistance(maze, { x: 0, y: 0 }, { x: maze.w - 1, y: maze.h - 1 })
}
