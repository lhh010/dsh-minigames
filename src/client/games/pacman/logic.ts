/**
 * Pac-Man pure logic: a grid maze of walls, dots and power pellets; the
 * player moves with direction input (only turning at cell centres), the two
 * ghosts chase (or flee while a power pellet is active), eating a ghost
 * scores and sends it home, touching a ghost otherwise costs a life. Eating
 * every dot wins; losing all lives ends the run. Deterministic functions
 * over a plain state object.
 */

export const CELL = 20
export const ROWS = 15
export const COLS = 19
export const PAC_SPEED = 110
export const GHOST_SPEED = 95
export const FRIGHT_TIME = 5
/** Seconds at the start of a round (and after a life) during which the
 * ghosts stay put, so the player can leave the spawn corridor. */
export const GHOST_DELAY = 1.5

// Legend: '#' wall, '.' dot, 'o' power pellet, ' ' open path.
const MAP_ROWS: readonly string[] = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#       #.####',
  '####.#.#####.#.####',
  '#....#...#...#....#',
  '#.##.#.#####.#.##.#',
  '#.................#',
  '#o##.###.#.###.##o#',
  '#........#........#',
  '###################',
]

export const PLAYER_SPAWN: Readonly<{ r: number; c: number }> = { r: 7, c: 9 }
// Ghosts spawn in the upper corridor, away from the player's central one, so
// the opening is not a head-on squeeze.
const GHOST_SPAWNS: ReadonlyArray<Readonly<{ r: number; c: number }>> = [{ r: 5, c: 1 }, { r: 5, c: 17 }]

export type Dir = 0 | 1 | 2 | 3 // 0 up, 1 right, 2 down, 3 left
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]

export interface Ghost {
  x: number
  y: number
  dir: Dir
  /** Home cell centre to respawn at after being eaten. */
  homeX: number
  homeY: number
}

export interface PacmanState {
  /** '#' | '.' | 'o' | ' ' — dots are consumed in place. */
  grid: string[][]
  px: number
  py: number
  /** Current travel direction. */
  dir: Dir
  /** Desired direction; applied at the next cell centre. */
  intent: Dir
  ghosts: Ghost[]
  /** Seconds of power-pellet fright remaining (ghosts flee, can be eaten). */
  fright: number
  score: number
  lives: number
  dotsLeft: number
  /** Countdown before the ghosts start moving (round start / after a life). */
  ghostDelay: number
  over: boolean
  won: boolean
  rng: () => number
}

export function isWall(state: PacmanState, r: number, c: number): boolean {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true
  return state.grid[r]![c] === '#'
}

/** A fresh run: dots placed, player and ghosts at their spawns. */
export function createPacmanState(rng: () => number = Math.random): PacmanState {
  const grid = MAP_ROWS.map(row => row.split(''))
  let dotsLeft = 0
  for (const row of grid) for (const cell of row) if (cell === '.' || cell === 'o') dotsLeft += 1
  // Spawn cells hold no dots (they are part of the maze but not pickups).
  for (const spawn of [PLAYER_SPAWN, ...GHOST_SPAWNS]) {
    const cell = grid[spawn.r]![spawn.c]!
    if (cell === '.' || cell === 'o') {
      grid[spawn.r]![spawn.c] = ' '
      dotsLeft -= 1
    }
  }
  const px = PLAYER_SPAWN.c * CELL + CELL / 2
  const py = PLAYER_SPAWN.r * CELL + CELL / 2
  const ghosts: Ghost[] = GHOST_SPAWNS.map(spawn => {
    const x = spawn.c * CELL + CELL / 2
    const y = spawn.r * CELL + CELL / 2
    return { x, y, dir: 1, homeX: x, homeY: y }
  })
  return {
    grid,
    px,
    py,
    dir: 1,
    intent: 1,
    ghosts,
    fright: 0,
    score: 0,
    lives: 3,
    dotsLeft,
    ghostDelay: GHOST_DELAY,
    over: false,
    won: false,
    rng,
  }
}

function atCentre(v: number): boolean {
  return Math.abs(v % CELL - CELL / 2) < 2
}

/** Snap a coordinate back to the centre of its cell (undoes wall wedging). */
function snapCentre(v: number): number {
  return Math.floor(v / CELL) * CELL + CELL / 2
}

/**
 * Move the player one frame, grid-aligned: it travels between cell centres,
 * lands exactly on the next centre, and only turns at a centre. When the next
 * cell is a wall it parks on the current centre — it never creeps toward the
 * wall edge, so no centre/wall jitter.
 */
function movePlayer(state: PacmanState, dt: number): void {
  // Turn at a centre, toward the intent direction if that cell is open.
  if (atCentre(state.px) && atCentre(state.py) && state.intent !== state.dir) {
    const [idx, idy] = DIRS[state.intent]!
    const gr = Math.floor(state.py / CELL)
    const gc = Math.floor(state.px / CELL)
    if (!isWall(state, gr + idy, gc + idx)) state.dir = state.intent
  }
  const [dx, dy] = DIRS[state.dir]!
  const gr = Math.floor(state.py / CELL)
  const gc = Math.floor(state.px / CELL)
  if (isWall(state, gr + dy, gc + dx)) {
    // Blocked: park exactly on the current centre.
    state.px = snapCentre(state.px)
    state.py = snapCentre(state.py)
  } else {
    const targetX = (gc + dx) * CELL + CELL / 2
    const targetY = (gr + dy) * CELL + CELL / 2
    const step = PAC_SPEED * dt
    let nx = state.px + dx * step
    let ny = state.py + dy * step
    if (dx !== 0 && ((dx > 0 && nx > targetX) || (dx < 0 && nx < targetX))) nx = targetX
    if (dy !== 0 && ((dy > 0 && ny > targetY) || (dy < 0 && ny < targetY))) ny = targetY
    state.px = nx
    state.py = ny
  }
  // Eat what is under the player (grid-snapped, so this always resolves).
  const r = Math.floor(state.py / CELL)
  const c = Math.floor(state.px / CELL)
  const cell = state.grid[r]![c]!
  if (cell === '.') {
    state.grid[r]![c] = ' '
    state.dotsLeft -= 1
    state.score += 10
  } else if (cell === 'o') {
    state.grid[r]![c] = ' '
    state.dotsLeft -= 1
    state.score += 50
    state.fright = FRIGHT_TIME
  }
}

/** Direction that minimises (or maximises) the Manhattan distance to the player. */
function ghostDir(state: PacmanState, ghost: Ghost, flee: boolean): Dir {
  const gr = Math.floor(ghost.y / CELL)
  const gc = Math.floor(ghost.x / CELL)
  const pr = Math.floor(state.py / CELL)
  const pc = Math.floor(state.px / CELL)
  const back: Dir = ((ghost.dir + 2) % 4) as Dir
  let best: Dir | null = null
  let bestScore = flee ? -Infinity : Infinity
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (d === back) continue
    const [dx, dy] = DIRS[d]!
    if (isWall(state, gr + dy, gc + dx)) continue
    const dist = Math.abs(gr + dy - pr) + Math.abs(gc + dx - pc)
    if (flee ? dist > bestScore : dist < bestScore) {
      bestScore = dist
      best = d
    }
  }
  if (best === null) best = back // dead end: turn around
  return best
}

/** Move the ghosts one frame, grid-aligned like the player; frozen during ghostDelay. */
function moveGhosts(state: PacmanState, dt: number): void {
  if (state.ghostDelay > 0) {
    state.ghostDelay -= dt
    return
  }
  const flee = state.fright > 0
  for (const ghost of state.ghosts) {
    if (atCentre(ghost.x) && atCentre(ghost.y)) {
      ghost.dir = ghostDir(state, ghost, flee)
    }
    const [dx, dy] = DIRS[ghost.dir]!
    const gr = Math.floor(ghost.y / CELL)
    const gc = Math.floor(ghost.x / CELL)
    if (isWall(state, gr + dy, gc + dx)) {
      // Blocked: park on the current centre; the next frame re-decides.
      ghost.x = snapCentre(ghost.x)
      ghost.y = snapCentre(ghost.y)
      continue
    }
    const targetX = (gc + dx) * CELL + CELL / 2
    const targetY = (gr + dy) * CELL + CELL / 2
    const step = GHOST_SPEED * dt
    let nx = ghost.x + dx * step
    let ny = ghost.y + dy * step
    if (dx !== 0 && ((dx > 0 && nx > targetX) || (dx < 0 && nx < targetX))) nx = targetX
    if (dy !== 0 && ((dy > 0 && ny > targetY) || (dy < 0 && ny < targetY))) ny = targetY
    ghost.x = nx
    ghost.y = ny
  }
}

/** Player-ghost contacts: eat a frightened ghost or lose a life. */
function collide(state: PacmanState): void {
  if (state.ghostDelay > 0) return // ghosts are inert while paused at spawn
  for (const ghost of state.ghosts) {
    const d = Math.hypot(ghost.x - state.px, ghost.y - state.py)
    if (d < CELL - 2) {
      if (state.fright > 0) {
        ghost.x = ghost.homeX
        ghost.y = ghost.homeY
        ghost.dir = 1
        state.score += 200
      } else {
        // Lose a life and reset the round positions (ghosts stay put briefly).
        state.lives -= 1
        state.px = PLAYER_SPAWN.c * CELL + CELL / 2
        state.py = PLAYER_SPAWN.r * CELL + CELL / 2
        state.dir = 1
        state.intent = 1
        state.fright = 0
        state.ghostDelay = GHOST_DELAY
        for (const g of state.ghosts) {
          g.x = g.homeX
          g.y = g.homeY
          g.dir = 1
        }
        if (state.lives <= 0) state.over = true
        return
      }
    }
  }
}

/** Advance one frame. Returns whether the run ended this frame. */
export function stepPacman(state: PacmanState, dt: number): boolean {
  if (state.over || state.won) return true
  if (state.fright > 0) state.fright = Math.max(0, state.fright - dt)
  movePlayer(state, dt)
  moveGhosts(state, dt)
  collide(state)
  if (state.dotsLeft <= 0) {
    state.won = true
    return true
  }
  return state.over
}
