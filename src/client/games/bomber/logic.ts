/**
 * Bomberman pure logic: a 13×11 tile-grid world — player/enemy movement with
 * wall, brick and actor collisions (grid-fraction dir/targetDir movement in
 * the tanks-engine spirit), cross-shaped bombs with a 2.2s fuse and chain
 * detonation, flow-field-chasing enemy AI, level progression (5 levels then
 * wrap) and scoring (100 per enemy, 10 per brick). Deterministic given
 * (dt, input, rng); the game instance in index.ts drives it with rAF and the
 * unit tests drive it directly.
 */

export const TILE = 32
export const GRID_W = 13
export const GRID_H = 11
/** 0 empty, 1 brick (destructible), 2 wall (indestructible border/pillar). */
export type Tile = 0 | 1 | 2
/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3
export const DIR_DX: readonly number[] = [0, 1, 0, -1]
export const DIR_DY: readonly number[] = [-1, 0, 1, 0]

export const FUSE_S = 2.2
export const BLAST_RANGE = 2
export const MAX_BOMBS = 2
export const LEVELS = 5
/** Seconds the "level cleared" overlay waits before auto-advancing. */
export const ADVANCE_DELAY = 1.5
export const AI_TICK = 0.45
const PLAYER_SPEED = 110
const ENEMY_SPEED = 66
/** Actor collision inset in px: the effective body is TILE - 2*INSET. */
const INSET = 3
/** Perpendicular-axis snap range after a turn (px) — keeps actors on-grid. */
const LANE_SNAP = 4
/** Flame visual lifetime in seconds. */
const FLAME_LIFE = 0.4

export interface Actor {
  /** Top-left pixel position. */
  x: number
  y: number
  dir: Dir
  /** Desired heading; applied like tanks (turn once the lane fits). */
  targetDir: Dir
  alive: boolean
}

export interface Bomb {
  tx: number
  ty: number
  /** Seconds remaining until detonation. */
  fuse: number
}

/** Transient flame visual — pure model state, decayed in step. */
export interface Flame {
  tx: number
  ty: number
  t: number
}

export interface PlayerInput {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

/** 'none' playing; 'cleared' all enemies dead (advance countdown); 'lose' player dead. */
export type GameResult = 'none' | 'cleared' | 'lose'

export interface WorldState {
  grid: Tile[][]
  level: number
  player: Actor
  enemies: Actor[]
  bombs: Bomb[]
  flames: Flame[]
  score: number
  result: GameResult
  /** Countdown to the next level while {@link result} is 'cleared'. */
  advanceTimer: number
  t: number
  /** AI decision accumulator (seconds since last tick). */
  aiTimer: number
  /** BFS flow field toward the player's tile, rebuilt each decision tick. */
  flow: Int16Array | null
  rng: () => number
}

/** Player spawn corner (bottom-left pocket). */
export const PLAYER_START: readonly [number, number] = [1, GRID_H - 2]
/** Enemy spawn tiles (3 far corners + center), used in order. */
export const ENEMY_SPAWNS: readonly [number, number][] = [
  [GRID_W - 2, 1], [1, 1], [GRID_W - 2, GRID_H - 2], [Math.floor(GRID_W / 2), Math.floor(GRID_H / 2)],
]
/** 3×3 corner pockets kept clear so spawns are never walled in. */
export const CORNER_POCKETS: readonly [number, number][] = [[1, 1], [GRID_W - 2, 1], [1, GRID_H - 2], [GRID_W - 2, GRID_H - 2]]

/** Deterministic mulberry32 PRNG (same construction as lightsout/logic.ts). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Brick density for a level: denser bricks on higher levels (0.32 → 0.56). */
export function brickDensity(level: number): number {
  return Math.min(0.32 + (level - 1) * 0.06, 0.56)
}

/**
 * Seeded level layout: indestructible border, fixed pillars on even/even
 * inner tiles, rng-scattered bricks, clear 3×3 spawn pockets.
 * @param level - 1-based level number (drives density).
 * @param rng - injected seeded rng (layout is deterministic per seed).
 */
export function generateLayout(level: number, rng: () => number): Tile[][] {
  const grid: Tile[][] = []
  for (let ty = 0; ty < GRID_H; ty += 1) {
    const row: Tile[] = []
    for (let tx = 0; tx < GRID_W; tx += 1) {
      if (tx === 0 || tx === GRID_W - 1 || ty === 0 || ty === GRID_H - 1) row.push(2)
      else if (tx % 2 === 0 && ty % 2 === 0) row.push(2)
      else row.push(rng() < brickDensity(level) ? 1 : 0)
    }
    grid.push(row)
  }
  for (const [cx, cy] of CORNER_POCKETS) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tx = cx + dx
        const ty = cy + dy
        if (tx > 0 && tx < GRID_W - 1 && ty > 0 && ty < GRID_H - 1) grid[ty]![tx] = 0
      }
    }
  }
  return grid
}

/** Enemies fielded on a level (2 at level 1, 3 at 2, 4 at 3+). */
export function enemiesForLevel(level: number): number {
  return Math.min(1 + level, 4)
}

/**
 * A fresh world at `level` (score starts at 0; use {@link startLevel} to
 * advance while keeping the accumulated score).
 * @param level - 1-based level number.
 * @param rng - injected seeded rng, stored on the world for AI decisions.
 */
export function createWorld(level: number, rng: () => number): WorldState {
  const state: WorldState = {
    grid: generateLayout(level, rng),
    level,
    player: {
      x: PLAYER_START[0] * TILE,
      y: PLAYER_START[1] * TILE,
      dir: 0,
      targetDir: 0,
      alive: true,
    },
    enemies: [],
    bombs: [],
    flames: [],
    score: 0,
    result: 'none',
    advanceTimer: 0,
    t: 0,
    aiTimer: 0,
    flow: null,
    rng,
  }
  const count = enemiesForLevel(level)
  for (let i = 0; i < count; i += 1) {
    const [tx, ty] = ENEMY_SPAWNS[i % ENEMY_SPAWNS.length]!
    state.enemies.push({ x: tx * TILE, y: ty * TILE, dir: 2, targetDir: 2, alive: true })
  }
  // The 4th spawn is the board centre, which the rng layout may have filled
  // with a brick — clear it so that enemy is not born inside solid rock.
  if (count > 3) {
    const [ctx0, cty] = ENEMY_SPAWNS[3]!
    state.grid[cty]![ctx0] = 0
  }
  return state
}

/** Reset to `nextLevel` keeping the score (auto-advance uses it). */
export function startLevel(state: WorldState, nextLevel: number, rng: () => number): void {
  const fresh = createWorld(nextLevel, rng)
  fresh.score = state.score
  Object.assign(state, fresh)
}

/** Restart a level from scratch: same layout seed, score back to 0 (R and
 * death-restart both use it — a fresh attempt must not inherit the aborted
 * run's score). */
export function resetLevel(state: WorldState, rng: () => number): void {
  const fresh = createWorld(state.level, rng)
  Object.assign(state, fresh)
}

/** Grid tile at tile coords; out of bounds counts as solid wall. */
export function tileAt(grid: Tile[][], tx: number, ty: number): Tile {
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return 2
  return grid[ty]![tx]!
}

/** Tile an actor's center sits on. */
export function actorTile(actor: Actor): [number, number] {
  return [Math.floor((actor.x + TILE / 2) / TILE), Math.floor((actor.y + TILE / 2) / TILE)]
}

/** Tile span of an actor's (inset) collision body. */
function insetTiles(x: number, y: number): { tx0: number; tx1: number; ty0: number; ty1: number } {
  return {
    tx0: Math.floor((x + INSET) / TILE),
    tx1: Math.floor((x + TILE - 1 - INSET) / TILE),
    ty0: Math.floor((y + INSET) / TILE),
    ty1: Math.floor((y + TILE - 1 - INSET) / TILE),
  }
}

/** Whether every tile the actor's (inset) body overlaps is open ground. */
function rectWalkable(grid: Tile[][], x: number, y: number): boolean {
  const { tx0, tx1, ty0, ty1 } = insetTiles(x, y)
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (tileAt(grid, tx, ty) !== 0) return false
    }
  }
  return true
}

/** AABB overlap between two actors (shrunk so neighbours can pass). */
function actorsOverlap(a: Actor, b: Actor): boolean {
  const pad = INSET
  return a.x + pad < b.x + TILE - pad && a.x + TILE - pad > b.x + pad
    && a.y + pad < b.y + TILE - pad && a.y + TILE - pad > b.y + pad
}

/**
 * Lethal touch: centers closer than ~0.94 tile on both axes. Deliberately
 * more generous than the movement overlap — the inset movement bodies can
 * block each other with a few px of air left, and that must still kill.
 */
function touching(a: Actor, b: Actor): boolean {
  const threshold = TILE * 0.94
  return Math.abs((a.x + TILE / 2) - (b.x + TILE / 2)) < threshold
    && Math.abs((a.y + TILE / 2) - (b.y + TILE / 2)) < threshold
}

/** Actors that block movement (living enemies + player, minus the mover). */
function blockers(state: WorldState, self: Actor): Actor[] {
  const all: Actor[] = [state.player, ...state.enemies]
  return all.filter(other => other !== self && other.alive)
}

/** Whether a candidate (x, y) is free of walls/bricks and other actors. */
function positionFree(state: WorldState, self: Actor, x: number, y: number): boolean {
  if (!rectWalkable(state.grid, x, y)) return false
  const probe: Actor = { ...self, x, y }
  for (const other of blockers(state, self)) {
    if (actorsOverlap(probe, other)) return false
  }
  return true
}

/** Snap an actor to the next boundary in its driving direction when within
 * `range` px of it, so it arrives exactly on-grid instead of parking at a
 * half-tile offset where a turn is impossible. */
function snapToNextBoundary(actor: Actor, dir: Dir, range: number): void {
  if (dir === 1) {
    const boundary = Math.floor(actor.x / TILE) * TILE + TILE
    if (boundary - actor.x <= range) actor.x = boundary
  } else if (dir === 3) {
    const boundary = Math.floor(actor.x / TILE) * TILE
    if (actor.x - boundary <= range) actor.x = boundary
  } else if (dir === 2) {
    const boundary = Math.floor(actor.y / TILE) * TILE + TILE
    if (boundary - actor.y <= range) actor.y = boundary
  } else {
    const boundary = Math.floor(actor.y / TILE) * TILE
    if (actor.y - boundary <= range) actor.y = boundary
  }
}

/**
 * Try to move an actor by `dist` px in `dir`; blocked by walls, bricks and
 * other living actors. A blocked move still snaps to the approached tile
 * boundary (tanks-engine convention).
 * @returns whether the actor actually moved.
 */
export function tryMove(state: WorldState, actor: Actor, dir: Dir, dist: number): boolean {
  const nx = actor.x + DIR_DX[dir]! * dist
  const ny = actor.y + DIR_DY[dir]! * dist
  if (!rectWalkable(state.grid, nx, ny)) {
    // Wall-blocked: pull to the tile boundary being approached so the actor
    // never parks at a half-tile offset where a turn is impossible.
    snapToNextBoundary(actor, dir, dist + INSET)
    return false
  }
  const probe: Actor = { ...actor, x: nx, y: ny }
  for (const other of blockers(state, actor)) {
    if (actorsOverlap(probe, other)) {
      // Actor-blocked: no boundary snap — it would shove this actor into the
      // blocker's tile (for the player, that is an unfair touch death).
      return false
    }
  }
  actor.x = nx
  actor.y = ny
  actor.dir = dir
  snapToNextBoundary(actor, dir, dist)
  return true
}

/** Whether the actor can advance nearly a full tile in dir (geometry clear). */
function canAdvance(state: WorldState, actor: Actor, dir: Dir): boolean {
  const step = TILE * 0.95
  return positionFree(state, actor, actor.x + DIR_DX[dir]! * step, actor.y + DIR_DY[dir]! * step)
}

/** Snap a just-turned actor's perpendicular axis onto the nearest grid line. */
function snapPerpendicularIfClose(actor: Actor, newDir: Dir): void {
  const vertical = newDir === 0 || newDir === 2
  const value = vertical ? actor.x : actor.y
  const boundary = Math.round(value / TILE) * TILE
  if (Math.abs(value - boundary) <= LANE_SNAP) {
    if (vertical) actor.x = boundary
    else actor.y = boundary
  }
}

/**
 * Move an actor toward its desired heading. Turning is free: the actor turns
 * the moment its (inset) body fits the new lane; before stepping, the
 * perpendicular axis slides onto the nearest lane centre when walkable.
 * @returns whether the actor actually moved.
 */
export function moveActor(state: WorldState, actor: Actor, targetDir: Dir, dist: number): boolean {
  const turning = targetDir !== actor.dir
  if (turning) {
    const vertical = targetDir === 0 || targetDir === 2
    if (vertical) {
      const gx = Math.round(actor.x / TILE) * TILE
      if (rectWalkable(state.grid, gx, actor.y)) actor.x = gx
    } else {
      const gy = Math.round(actor.y / TILE) * TILE
      if (rectWalkable(state.grid, actor.x, gy)) actor.y = gy
    }
  }
  const moved = tryMove(state, actor, targetDir, dist)
  if (turning && moved) snapPerpendicularIfClose(actor, targetDir)
  return moved
}

/** Flow-field distance at tile coords (-1 = wall/unreachable/out of grid). */
export function flowAt(flow: Int16Array, tx: number, ty: number): number {
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return -1
  return flow[ty * GRID_W + tx]!
}

/**
 * BFS flow field of walking distances from one tile over OPEN tiles only
 * (bricks block the enemies — they cannot dig). Used by the enemy AI to
 * chase the player around walls.
 */
export function buildFlowField(grid: Tile[][], tx: number, ty: number): Int16Array {
  const flow = new Int16Array(GRID_W * GRID_H).fill(-1)
  if (tileAt(grid, tx, ty) !== 0) return flow
  flow[ty * GRID_W + tx] = 0
  const queue: number[] = [ty * GRID_W + tx]
  for (let qi = 0; qi < queue.length; qi += 1) {
    const cur = queue[qi]!
    const cx = cur % GRID_W
    const cy = (cur / GRID_W) | 0
    for (let dir = 0 as Dir; dir < 4; dir += 1) {
      const nx = cx + DIR_DX[dir]!
      const ny = cy + DIR_DY[dir]!
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue
      const ni = ny * GRID_W + nx
      if (flow[ni] !== -1 || grid[ny]![nx] !== 0) continue
      flow[ni] = (flow[cur]! + 1) as number
      queue.push(ni)
    }
  }
  return flow
}

/**
 * The blast of a bomb at (tx, ty): a cross of `range` tiles per arm. Walls
 * stop an arm with no flame; the first brick on an arm is destroyed and the
 * flame stops there. Pure — returns the flame tiles and the bricks hit.
 */
export function computeBlast(
  grid: Tile[][], tx: number, ty: number, range: number = BLAST_RANGE,
): { tiles: [number, number][]; bricks: [number, number][] } {
  const tiles: [number, number][] = [[tx, ty]]
  const bricks: [number, number][] = []
  for (let dir = 0 as Dir; dir < 4; dir += 1) {
    for (let step = 1; step <= range; step += 1) {
      const nx = tx + DIR_DX[dir]! * step
      const ny = ty + DIR_DY[dir]! * step
      const tile = tileAt(grid, nx, ny)
      if (tile === 2) break // wall: no flame, arm stops
      tiles.push([nx, ny])
      if (tile === 1) {
        bricks.push([nx, ny])
        break // brick burns, arm stops there
      }
    }
  }
  return { tiles, bricks }
}

/**
 * Recursive core of a detonation: consume `bomb` (plus any bombs
 * chain-caught by its blast) and accumulate their flame tiles and hit
 * bricks; effects are applied once by {@link explode}.
 */
function detonate(state: WorldState, bomb: Bomb, tiles: [number, number][], bricks: [number, number][]): void {
  const index = state.bombs.indexOf(bomb)
  if (index < 0) return // already consumed by an earlier chain
  state.bombs.splice(index, 1)
  const blast = computeBlast(state.grid, bomb.tx, bomb.ty)
  tiles.push(...blast.tiles)
  bricks.push(...blast.bricks)
  // Chain: other bombs whose tile is inside this blast go off immediately.
  const chained = state.bombs.filter(other => blast.tiles.some(([fx, fy]) => other.tx === fx && other.ty === fy))
  for (const other of chained) detonate(state, other, tiles, bricks)
}

/** Detonate `bomb` (plus chained bombs), then apply bricks, flames and kills. */
function explode(state: WorldState, bomb: Bomb): void {
  const tiles: [number, number][] = []
  const bricks: [number, number][] = []
  detonate(state, bomb, tiles, bricks)
  for (const [bx, by] of bricks) {
    state.grid[by]![bx] = 0
    state.score += 10
  }
  for (const [fx, fy] of tiles) state.flames.push({ tx: fx, ty: fy, t: 0 })
  // Kills: any living actor whose center tile is on a flame tile.
  const inBlast = (actor: Actor): boolean => {
    const [ax, ay] = actorTile(actor)
    return tiles.some(([fx, fy]) => ax === fx && ay === fy)
  }
  const before = state.enemies.length
  state.enemies = state.enemies.filter(enemy => enemy.alive && !inBlast(enemy))
  state.score += (before - state.enemies.length) * 100
  if (state.player.alive && inBlast(state.player)) state.player.alive = false
}

/**
 * Place a bomb at the player's tile (max {@link MAX_BOMBS} active, one per
 * tile). Called by the instance on Space keydown and directly by tests.
 * @returns whether a bomb was placed.
 */
export function placeBomb(state: WorldState): boolean {
  if (!state.player.alive || state.result !== 'none') return false
  if (state.bombs.length >= MAX_BOMBS) return false
  const [tx, ty] = actorTile(state.player)
  if (state.bombs.some(bomb => bomb.tx === tx && bomb.ty === ty)) return false
  state.bombs.push({ tx, ty, fuse: FUSE_S })
  return true
}

/** One enemy decision: follow the flow-field gradient toward the player;
 * random walk among advanceable dirs when the player is unreachable. */
function decideEnemy(state: WorldState, enemy: Actor): void {
  const flow = state.flow
  if (flow !== null) {
    const [etx, ety] = actorTile(enemy)
    const here = flowAt(flow, etx, ety)
    if (here > 0) {
      // Keep the heading while it does not worsen the distance.
      const ndx = etx + DIR_DX[enemy.targetDir]!
      const ndy = ety + DIR_DY[enemy.targetDir]!
      const ahead = flowAt(flow, ndx, ndy)
      if (ahead >= 0 && ahead <= here && canAdvance(state, enemy, enemy.targetDir)) return
      let best: Dir | null = null
      let bestDist = Number.POSITIVE_INFINITY
      for (let dir = 0 as Dir; dir < 4; dir += 1) {
        const nx = etx + DIR_DX[dir]!
        const ny = ety + DIR_DY[dir]!
        const dist = flowAt(flow, nx, ny)
        if (dist < 0 || dist >= bestDist) continue
        if (!canAdvance(state, enemy, dir)) continue
        best = dir
        bestDist = dist
      }
      if (best !== null) {
        enemy.targetDir = best
        return
      }
    }
  }
  // Unreachable (or off-field): random walk among clear dirs.
  const open: Dir[] = []
  for (let dir = 0 as Dir; dir < 4; dir += 1) {
    if (canAdvance(state, enemy, dir)) open.push(dir)
  }
  if (open.length > 0) enemy.targetDir = open[Math.floor(state.rng() * open.length)]!
}

/**
 * Advance the world by dt seconds under the player's held inputs. Inert once
 * the player is dead ('lose'): the world only ticks visual flame decay.
 * @param state - the world (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - player held keys this frame.
 */
export function stepWorld(state: WorldState, dt: number, input: PlayerInput): void {
  state.t += dt

  // Decay flame visuals even after the round is decided.
  if (state.flames.length > 0) {
    for (const flame of state.flames) flame.t += dt
    state.flames = state.flames.filter(flame => flame.t < FLAME_LIFE)
  }

  if (state.result === 'lose') return

  if (state.result === 'cleared') {
    state.advanceTimer -= dt
    if (state.advanceTimer <= 0) {
      // Deterministic per-level seed: the auto-advanced level replays identically.
      const next = (state.level % LEVELS) + 1
      startLevel(state, next, mulberry32((next * 2654435761) >>> 0))
    }
    return
  }

  // Player movement: one direction from the held keys, grid-aligned turns.
  const player = state.player
  if (player.alive) {
    let dir: Dir | null = null
    if (input.up) dir = 0
    else if (input.down) dir = 2
    else if (input.left) dir = 3
    else if (input.right) dir = 1
    if (dir !== null) {
      player.targetDir = dir
      moveActor(state, player, player.targetDir, PLAYER_SPEED * dt)
    } else {
      player.targetDir = player.dir
    }
  }

  // Enemies: AI decisions on a fixed tick, movement every frame.
  state.aiTimer += dt
  const decide = state.aiTimer >= AI_TICK
  if (decide) {
    state.aiTimer = 0
    const [ptx, pty] = actorTile(state.player)
    state.flow = buildFlowField(state.grid, ptx, pty)
  }
  for (const enemy of state.enemies) {
    if (decide) decideEnemy(state, enemy)
    moveActor(state, enemy, enemy.targetDir, ENEMY_SPEED * dt)
    // Touching the player kills the player.
    if (player.alive && touching(enemy, player)) player.alive = false
  }

  // Bomb fuses; expired bombs detonate (with chaining).
  for (const bomb of [...state.bombs]) {
    bomb.fuse -= dt
  }
  for (const bomb of [...state.bombs]) {
    if (bomb.fuse <= 0) explode(state, bomb)
  }

  // Result progression.
  if (!player.alive) {
    state.result = 'lose'
    return
  }
  if (state.enemies.length === 0) {
    state.result = 'cleared'
    state.advanceTimer = ADVANCE_DELAY
  }
}
