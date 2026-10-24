/**
 * Tank battle pure logic: a Battle-City-style world model over a tile grid —
 * player/enemy movement with wall and tank collisions, bullets that destroy
 * brick (and die on steel), enemy AI (chase + line-of-sight shooting), wave
 * spawning, and win/lose. Deterministic given (dt, input, rng); the game
 * instance in index.ts drives it with rAF and the unit tests drive it
 * directly.
 */

export const TILE = 32
export const GRID_W = 15
export const GRID_H = 13

/** 0 empty, 1 brick (destructible), 2 steel (indestructible). */
export type Tile = 0 | 1 | 2
/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3

export const DIR_DX: readonly number[] = [0, 1, 0, -1]
export const DIR_DY: readonly number[] = [-1, 0, 1, 0]

export interface Tank {
  id: number
  kind: 'player' | 'enemy'
  /** Top-left pixel position. */
  x: number
  y: number
  /** Actual heading (also the fire direction). */
  dir: Dir
  /**
   * Desired heading: the tank only turns onto it once aligned with the tile
   * grid in the perpendicular axis (classic grid-locked turning), so it never
   * wedges itself straddling two lanes.
   */
  targetDir: Dir
  hp: number
  /** Seconds until the tank may fire again. */
  cooldown: number
  alive: boolean
  /** Seconds of post-hit invulnerability (player only; enemies die in one hit). */
  invuln: number
  /**
   * Per-enemy sidestep chance against an incoming player bullet (0 = never;
   * the player tank leaves this unset).
   */
  dodge?: number
  /**
   * Remaining decision ticks the enemy stays on its chosen chase direction.
   * Anti-oscillation: mid-lane tile flips and near-equal flow distances used
   * to make the heading flip every tick (visual jitter / corner stuck).
   */
  commitTicks?: number
  /** Ticks spent stuck (no position change) while chasing; forces a re-plan. */
  stuckTicks?: number
}

export interface Bullet {
  x: number
  y: number
  dir: Dir
  owner: 'player' | 'enemy'
}

export interface PlayerInput {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  /** Fire is level-triggered; the world respects the cooldown. */
  fire: boolean
}

export type GameResult = 'none' | 'win' | 'lose'

/** Transient visual effect (explosion) — pure model state, decayed in step. */
export interface Effect {
  x: number
  y: number
  /** Elapsed seconds. */
  t: number
  /** Total lifetime in seconds. */
  life: number
}

export interface WorldState {
  grid: Tile[][]
  /** Which battle map the current wave plays on (index into {@link MAPS}). */
  mapIndex: number
  player: Tank
  enemies: Tank[]
  bullets: Bullet[]
  effects: Effect[]
  score: number
  wave: number
  /** Enemies still to spawn this wave. */
  spawnQueue: number
  spawnTimer: number
  /** Enemy decision accumulator (seconds since last decision). */
  aiTimer: number
  /**
   * BFS flow field toward the player's tile, refreshed on each decision tick
   * (null before the first tick). Enemies chase by walking the gradient.
   */
  flow: Int16Array | null
  result: GameResult
  t: number
  rng: () => number
}

export const WAVES = 3
export const ENEMIES_PER_WAVE = 5
export const MAX_ALIVE = 3
/** Tank collision inset in px: the effective body is TILE - 2*INSET, letting
 * tanks fit and turn in lanes a hair tighter than a full tile. */
const TANK_INSET = 3
/** Perpendicular-axis snap range after a turn (px) — keeps the tank on-grid. */
const LANE_SNAP = 4
const SPAWN_INTERVAL = 1.6
const PLAYER_SPEED = 120
const ENEMY_SPEED = 82
/** Seconds of invulnerability a freshly spawned enemy gets (spawn flash). */
const ENEMY_SPAWN_INVULN = 0.7
const PLAYER_FIRE_CD = 0.4
const ENEMY_FIRE_CD_MIN = 1.2
const ENEMY_FIRE_CD_MAX = 2.6
const BULLET_SPEED_PLAYER = 260
const BULLET_SPEED_ENEMY = 170
export const AI_TICK = 0.45
const PLAYER_HP = 3
const PLAYER_INVULN = 1.5
/** Primary spawn tiles (enemies appear on these). */
export const SPAWN_POINTS: readonly [number, number][] = [[0, 0], [14, 0], [7, 0]]
/** 2-wide pockets so a spawned tank can actually drive out of the border. */
export const SPAWN_POCKETS: readonly [number, number][] = [[0, 0], [1, 0], [14, 0], [13, 0], [7, 0], [8, 0]]
export const PLAYER_START: [number, number] = [7, 11]

/** Symmetric fields; the three spawn tiles and the player start are cleared below. */
const MAPS: number[][][] = [
  // 经典阵地（原版地图）
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
    [1, 0, 0, 1, 0, 1, 2, 0, 2, 1, 0, 1, 0, 0, 1],
    [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
    [1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  // 长廊要塞：纵向走廊 + 中央钢心
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 1, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 1, 1],
    [1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  // 钢角堡垒：四角钢阵 + 中央砖环
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 2, 2, 0, 1, 1, 0, 1, 1, 0, 2, 2, 0, 1],
    [1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1],
    [1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1],
    [1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 1],
    [1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1],
    [1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1],
    [1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1],
    [1, 0, 2, 2, 0, 1, 1, 0, 1, 1, 0, 2, 2, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
]

/** Number of battle maps; waves rotate through them in order. */
export const MAP_COUNT = MAPS.length

/** Map index played by a wave (1-based wave number). */
export function mapIndexForWave(wave: number): number {
  return (wave - 1) % MAPS.length
}

function buildGrid(mapIndex: number): Tile[][] {
  const grid = MAPS[mapIndex % MAPS.length]!.map(row => [...row]) as Tile[][]
  for (const [tx, ty] of SPAWN_POCKETS) grid[ty]![tx] = 0
  return grid
}
export { buildGrid }

/** A fresh world at wave 1. */
export function createWorld(rng: () => number = Math.random): WorldState {
  return {
    grid: buildGrid(0),
    mapIndex: 0,
    player: {
      id: 0,
      kind: 'player',
      x: PLAYER_START[0] * TILE,
      y: PLAYER_START[1] * TILE,
      dir: 0,
      targetDir: 0,
      hp: PLAYER_HP,
      cooldown: 0,
      alive: true,
      invuln: 0,
    },
    enemies: [],
    bullets: [],
    effects: [],
    score: 0,
    wave: 1,
    spawnQueue: ENEMIES_PER_WAVE,
    spawnTimer: 1.0,
    aiTimer: 0,
    flow: null,
    result: 'none',
    t: 0,
    rng,
  }
}

/** Grid tile at tile coords; out of bounds counts as solid steel. */
export function tileAt(grid: Tile[][], tx: number, ty: number): Tile {
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return 2
  return grid[ty]![tx]!
}

/**
 * Tile span of a tank's effective collision body: the full tile inset by
 * {@link TANK_INSET} on every side, so the tank fits lanes that are a hair
 * tighter than a full tile and can still turn there.
 */
function insetTiles(x: number, y: number): { tx0: number; tx1: number; ty0: number; ty1: number } {
  return {
    tx0: Math.floor((x + TANK_INSET) / TILE),
    tx1: Math.floor((x + TILE - 1 - TANK_INSET) / TILE),
    ty0: Math.floor((y + TANK_INSET) / TILE),
    ty1: Math.floor((y + TILE - 1 - TANK_INSET) / TILE),
  }
}

/** Whether every tile the tank's (inset) body overlaps is walkable. */
function rectWalkable(grid: Tile[][], x: number, y: number): boolean {
  const { tx0, tx1, ty0, ty1 } = insetTiles(x, y)
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (tileAt(grid, tx, ty) !== 0) return false
    }
  }
  return true
}

/** AABB overlap between two tanks (shrunk so neighbours can pass). */
function tanksOverlap(a: Tank, b: Tank): boolean {
  const pad = TANK_INSET
  return a.x + pad < b.x + TILE - pad && a.x + TILE - pad > b.x + pad
    && a.y + pad < b.y + TILE - pad && a.y + TILE - pad > b.y + pad
}

/** Try to move a tank by dist px in dir; blocked by walls and other tanks. */
export function tryMove(state: WorldState, tank: Tank, dir: Dir, dist: number): boolean {
  const nx = tank.x + DIR_DX[dir]! * dist
  const ny = tank.y + DIR_DY[dir]! * dist
  if (!rectWalkable(state.grid, nx, ny)) {
    // Wall-blocked: pull the tank to the tile boundary it was approaching so
    // it never parks at a half-tile offset where a turn is impossible.
    snapToNextBoundary(tank, dir, dist + TANK_INSET)
    return false
  }
  for (const other of [state.player, ...state.enemies]) {
    if (other === tank || !other.alive) continue
    const probe: Tank = { ...tank, x: nx, y: ny }
    if (tanksOverlap(probe, other)) {
      // Tank-blocked: same snap as a wall stop, so a tank parked right
      // behind another one is never stuck at a half-tile offset.
      snapToNextBoundary(tank, dir, dist + TANK_INSET)
      return false
    }
  }
  tank.x = nx
  tank.y = ny
  tank.dir = dir
  // Snap to the next boundary in the driving direction, so the tank arrives
  // exactly on-grid (non-integer per-frame steps would otherwise overshoot
  // the alignment point and wedge the tank mid-lane).
  snapToNextBoundary(tank, dir, dist)
  return true
}

/** Snap the tank to the next boundary in its driving direction when within
 * `range` px of it (the "boundary ahead"): the tank arrives exactly on-grid
 * instead of overshooting or parking at a half-tile offset. */
function snapToNextBoundary(tank: Tank, dir: Dir, range: number): void {
  if (dir === 1) { // right: next boundary is the right edge of the current tile
    const boundary = Math.floor(tank.x / TILE) * TILE + TILE
    if (boundary - tank.x <= range) tank.x = boundary
  } else if (dir === 3) { // left: next boundary is the left edge
    const boundary = Math.floor(tank.x / TILE) * TILE
    if (tank.x - boundary <= range) tank.x = boundary
  } else if (dir === 2) { // down: next boundary is the bottom edge
    const boundary = Math.floor(tank.y / TILE) * TILE + TILE
    if (boundary - tank.y <= range) tank.y = boundary
  } else { // up: next boundary is the top edge
    const boundary = Math.floor(tank.y / TILE) * TILE
    if (tank.y - boundary <= range) tank.y = boundary
  }
}

/** Whether the tank can advance nearly a full tile in dir (walls + tanks clear). */
function canAdvance(state: WorldState, tank: Tank, dir: Dir): boolean {
  const step = TILE * 0.95
  const nx = tank.x + DIR_DX[dir]! * step
  const ny = tank.y + DIR_DY[dir]! * step
  if (!rectWalkable(state.grid, nx, ny)) return false
  for (const other of [state.player, ...state.enemies]) {
    if (other === tank || !other.alive) continue
    const probe: Tank = { ...tank, x: nx, y: ny }
    if (tanksOverlap(probe, other)) return false
  }
  return true
}

/**
 * Move a tank toward its desired heading. Turning is free: the tank turns the
 * moment its (inset) body fits the new lane — no waiting for grid alignment.
 * When it turns near a tile boundary it is snapped onto the grid, so the tank
 * stays visually lane-aligned whenever it is close; driving straight still
 * snaps at every boundary crossing. The collision body is TILE - 2*INSET, so
 * a mid-lane turn is only blocked when the body genuinely pokes into a wall.
 * @param state - the world.
 * @param tank - the tank to move.
 * @param targetDir - the desired heading this frame.
 * @param dist - movement distance in px.
 * @returns whether the tank actually moved.
 */
function moveTank(state: WorldState, tank: Tank, targetDir: Dir, dist: number): boolean {
  const turning = targetDir !== tank.dir
  if (turning) {
    // Turn-in-place alignment: a body straddling two lanes cannot enter a
    // perpendicular lane (the far half pokes into the neighbouring wall), so
    // the tank used to stall at an offset and the AI paced forever. Before
    // stepping, slide the perpendicular axis onto the nearest lane centre
    // when that position is walkable; only then attempt the turn.
    const vertical = targetDir === 0 || targetDir === 2
    if (vertical) {
      const gx = Math.round(tank.x / TILE) * TILE
      if (rectWalkable(state.grid, gx, tank.y)) tank.x = gx
    } else {
      const gy = Math.round(tank.y / TILE) * TILE
      if (rectWalkable(state.grid, tank.x, gy)) tank.y = gy
    }
  }
  const moved = tryMove(state, tank, targetDir, dist)
  if (turning && moved) snapPerpendicularIfClose(tank, targetDir)
  return moved
}

/** Snap a just-turned tank's perpendicular axis onto the nearest grid line. */
function snapPerpendicularIfClose(tank: Tank, newDir: Dir): void {
  const vertical = newDir === 0 || newDir === 2
  const value = vertical ? tank.x : tank.y
  const boundary = Math.round(value / TILE) * TILE
  if (Math.abs(value - boundary) <= LANE_SNAP) {
    if (vertical) tank.x = boundary
    else tank.y = boundary
  }
}

/** Spawn a bullet just outside the tank's front face in its facing direction. */
function fire(state: WorldState, tank: Tank, speed: number): void {
  const cx = tank.x + TILE / 2
  const cy = tank.y + TILE / 2
  const x = tank.dir === 1 ? tank.x + TILE + 2
    : tank.dir === 3 ? tank.x - 8
      : cx - 3
  const y = tank.dir === 2 ? tank.y + TILE + 2
    : tank.dir === 0 ? tank.y - 8
      : cy - 3
  state.bullets.push({ x, y, dir: tank.dir, owner: tank.kind })
  tank.cooldown = tank.kind === 'player' ? PLAYER_FIRE_CD
    : ENEMY_FIRE_CD_MIN + state.rng() * (ENEMY_FIRE_CD_MAX - ENEMY_FIRE_CD_MIN)
}

/** Whether tank a is aligned with b on one axis with no solid tile between. */
function losClear(state: WorldState, a: Tank, b: Tank): boolean {
  const ax = a.x + TILE / 2
  const ay = a.y + TILE / 2
  const bx = b.x + TILE / 2
  const by = b.y + TILE / 2
  const sameCol = Math.abs(ax - bx) < TILE / 2
  const sameRow = Math.abs(ay - by) < TILE / 2
  if (!sameCol && !sameRow) return false
  if (sameCol) {
    const tx = Math.floor(ax / TILE)
    const r0 = Math.min(Math.floor(ay / TILE), Math.floor(by / TILE))
    const r1 = Math.max(Math.floor(ay / TILE), Math.floor(by / TILE))
    for (let ty = r0 + 1; ty < r1; ty += 1) {
      if (tileAt(state.grid, tx, ty) !== 0) return false
    }
    return true
  }
  const ty = Math.floor(ay / TILE)
  const c0 = Math.min(Math.floor(ax / TILE), Math.floor(bx / TILE))
  const c1 = Math.max(Math.floor(ax / TILE), Math.floor(bx / TILE))
  for (let tx = c0 + 1; tx < c1; tx += 1) {
    if (tileAt(state.grid, tx, ty) !== 0) return false
  }
  return true
}

/** Flow-field distance at tile coords (-1 = wall/unreachable/out of grid). */
export function flowAt(flow: Int16Array, tx: number, ty: number): number {
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return -1
  return flow[ty * GRID_W + tx]!
}

/**
 * BFS flow field of walking distances from one tile over open tiles (brick
 * counts as open: it is shootable, and the field is rebuilt every decision
 * tick anyway). Used by the enemy AI to route around walls toward the player.
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
 * Perpendicular escape direction from a player bullet sharing this tank's
 * lane and approaching within ~4 tiles; null when nothing threatens or both
 * sides are walled.
 */
function incomingBulletSide(state: WorldState, enemy: Tank): Dir | null {
  const ecx = enemy.x + TILE / 2
  const ecy = enemy.y + TILE / 2
  for (const bullet of state.bullets) {
    if (bullet.owner !== 'player') continue
    const bcx = bullet.x + 3
    const bcy = bullet.y + 3
    if (bullet.dir === 0 || bullet.dir === 2) {
      if (Math.abs(bcx - ecx) > TILE / 2) continue
      const approaching = bullet.dir === 2 ? bcy < ecy : bcy > ecy
      if (!approaching || Math.abs(ecy - bcy) >= TILE * 4) continue
      // Bullet travels vertically: escape sideways.
      const leftOk = canAdvance(state, enemy, 3)
      const rightOk = canAdvance(state, enemy, 1)
      if (leftOk && rightOk) return state.rng() < 0.5 ? 3 : 1
      return leftOk ? 3 : rightOk ? 1 : null
    }
    if (Math.abs(bcy - ecy) > TILE / 2) continue
    const approaching = bullet.dir === 1 ? bcx < ecx : bcx > ecx
    if (!approaching || Math.abs(ecx - bcx) >= TILE * 4) continue
    // Bullet travels horizontally: escape vertically.
    const upOk = canAdvance(state, enemy, 0)
    const downOk = canAdvance(state, enemy, 2)
    if (upOk && downOk) return state.rng() < 0.5 ? 0 : 2
    return upOk ? 0 : downOk ? 2 : null
  }
  return null
}

/** A perpendicular direction that actually advances (used for un-sticking). */
function perpendicularEscape(state: WorldState, enemy: Tank): Dir | null {
  const perpendicular: Dir[] = (enemy.dir === 0 || enemy.dir === 2) ? [3, 1] : [0, 2]
  for (const dir of perpendicular) {
    if (canAdvance(state, enemy, dir)) return dir
  }
  // Also allow reversing out.
  const back = ((enemy.dir + 2) % 4) as Dir
  if (canAdvance(state, enemy, back)) return back
  return null
}

/** One enemy decision: dodge an incoming bullet, shoot when a lane is clear,
 * else follow the BFS flow field toward the player (greedy as a fallback). */
function decideEnemy(state: WorldState, enemy: Tank): void {
  const player = state.player
  const dodge = enemy.dodge ?? 0
  if (dodge > 0 && state.rng() < dodge) {
    const side = incomingBulletSide(state, enemy)
    if (side !== null) {
      enemy.targetDir = side
      enemy.commitTicks = 0
      return
    }
  }
  // Stuck detection: the AI picked a heading but the tank has not actually
  // moved for several decision ticks (wall-grazed body, tank gridlock, or a
  // commitment that outlived its usefulness). Force a re-plan and prefer a
  // perpendicular escape so it never wedges against geometry forever.
  if ((enemy.stuckTicks ?? 0) >= 3) {
    enemy.stuckTicks = 0
    enemy.commitTicks = 0
    const escape = perpendicularEscape(state, enemy)
    if (escape !== null) {
      enemy.targetDir = escape
      enemy.commitTicks = 2
      return
    }
  }
  if (losClear(state, enemy, player)) {
    // Face the player and fire down the clear lane: set the heading (and the
    // desired heading) so the bullet leaves toward the player immediately.
    const ex = enemy.x + TILE / 2
    const ey = enemy.y + TILE / 2
    const px = player.x + TILE / 2
    const py = player.y + TILE / 2
    const facing: Dir = Math.abs(ex - px) < Math.abs(ey - py)
      ? (py < ey ? 0 : 2)
      : (px > ex ? 1 : 3)
    enemy.dir = facing
    enemy.targetDir = facing
    if (enemy.cooldown <= 0) fire(state, enemy, BULLET_SPEED_ENEMY)
    return
  }
  // Flow-field chase: walk the BFS distance gradient toward the player's
  // tile; prefer continuing straight when it also improves (less jitter).
  const flow = state.flow
  if (flow !== null) {
    const etx = Math.floor((enemy.x + TILE / 2) / TILE)
    const ety = Math.floor((enemy.y + TILE / 2) / TILE)
    const here = flowAt(flow, etx, ety)
    if (here > 0) {
      // Commitment: keep the heading while it does not make the flow
      // distance WORSE (equal is fine — corridor flats); a strictly worse
      // step ends the commitment so the tank never runs past a junction
      // into a dead-end spur. Physically blocked headings always end it.
      const commit = enemy.commitTicks ?? 0
      if (commit > 0) {
        const ndx = etx + DIR_DX[enemy.targetDir]!
        const ndy = ety + DIR_DY[enemy.targetDir]!
        const ahead = flowAt(flow, ndx, ndy)
        const passable = ahead >= 0 && ahead <= here && canAdvance(state, enemy, enemy.targetDir)
        if (passable) {
          enemy.commitTicks = commit - 1
          return
        }
        enemy.commitTicks = 0 // worse or blocked: re-plan now
      }
      let best: Dir | null = null
      let bestKey = ''
      // Two-step lookahead: raw one-step flow distance is locally noisy in
      // corridors (BFS distance can decrease by moving "away" first), which
      // made the tank pace between neighbours. Score each candidate by the
      // distance two tiles ahead along that heading (plus the one-step
      // distance as a tie-break), so the plan follows the real corridor.
      // A candidate that only fits after the perpendicular axis snaps to the
      // lane centre is judged on the SNAPPED position: a tank straddling two
      // lanes physically cannot enter a perpendicular lane, and ignoring
      // that made the planner reject the correct turn and pace forever.
      const ex = enemy.x + TILE / 2
      const ey = enemy.y + TILE / 2
      const px = player.x + TILE / 2
      const py = player.y + TILE / 2
      const gapX = Math.abs(px - ex)
      const gapY = Math.abs(py - ey)
      const preferAxis: 'x' | 'y' = gapX >= gapY ? 'x' : 'y'
      const axisRank = (dir: Dir): number => {
        const horizontal = dir === 1 || dir === 3
        return (preferAxis === 'x') === horizontal ? 0 : 1
      }
      const bias = (dir: Dir): number => {
        if (dir === 1) return px - ex
        if (dir === 3) return ex - px
        if (dir === 2) return py - ey
        return ey - py
      }
      // Alignment probe: where the tank would sit after snapping the
      // perpendicular axis to the nearest lane centre.
      const gx = Math.round(enemy.x / TILE) * TILE
      const gy = Math.round(enemy.y / TILE) * TILE
      const aligned: Tank = {
        ...enemy,
        x: rectWalkable(state.grid, gx, enemy.y) ? gx : enemy.x,
        y: rectWalkable(state.grid, enemy.x, gy) ? gy : enemy.y,
      }
      for (const dir of [enemy.dir, 0, 1, 2, 3] as Dir[]) {
        const nx1 = etx + DIR_DX[dir]!
        const ny1 = ety + DIR_DY[dir]!
        if (flowAt(flow, nx1, ny1) < 0) continue
        if (!canAdvance(state, aligned, dir)) continue
        const d1 = flowAt(flow, nx1, ny1)!
        // Look one more tile along the same heading.
        let d2 = d1
        const nx2 = nx1 + DIR_DX[dir]!
        const ny2 = ny1 + DIR_DY[dir]!
        const ahead2 = flowAt(flow, nx2, ny2)
        if (ahead2 >= 0) d2 = ahead2
        // Flow distance leads; the axis preference and the player-side bias
        // are tie-breaks only (they used to outrank the distance and trap the
        // tank pacing in dead-end shafts).
        const key = `${String(d2).padStart(4, '0')}|${String(d1).padStart(4, '0')}|${axisRank(dir)}|${String(Math.round(bias(dir))).padStart(5, '0')}`
        if (best === null || key < bestKey) { best = dir; bestKey = key }
      }
      if (best !== null) {
        enemy.targetDir = best
        // Hold the plan for a couple of decision ticks (~0.9s): long enough
        // to cross a tile boundary so per-tile flow noise cannot flip the
        // plan, short enough that a junction appears before the tank runs
        // past it into a dead-end spur. Turn-in-place alignment (moveTank)
        // keeps the body from wedging when the plan changes mid-lane.
        enemy.commitTicks = 2
        return
      }
    }
  }
  // Greedy fallback: prefer the axis with the larger gap; fall back through
  // the others, picking the first direction whose way ahead is actually clear.
  const ex = enemy.x + TILE / 2
  const ey = enemy.y + TILE / 2
  const px = player.x + TILE / 2
  const py = player.y + TILE / 2
  const dx = px - ex
  const dy = py - ey
  const axisFirst = Math.abs(dx) > Math.abs(dy)
  const candidates: Dir[] = axisFirst
    ? [dx > 0 ? 1 : 3, dy > 0 ? 2 : 0, dx > 0 ? 3 : 1, dy > 0 ? 0 : 2]
    : [dy > 0 ? 2 : 0, dx > 0 ? 1 : 3, dy > 0 ? 0 : 2, dx > 0 ? 3 : 1]
  for (const dir of candidates) {
    if (canAdvance(state, enemy, dir)) {
      enemy.targetDir = dir
      return
    }
  }
}

function spawnEnemy(state: WorldState): void {
  for (const [tx, ty] of SPAWN_POINTS) {
    const x = tx * TILE
    const y = ty * TILE
    const busy = state.enemies.some(enemy =>
      Math.abs(enemy.x - x) < TILE && Math.abs(enemy.y - y) < TILE)
    if (busy) continue
    state.enemies.push({
      id: state.enemies.length + 1,
      kind: 'enemy',
      x,
      y,
      dir: 2,
      targetDir: 2,
      hp: 1,
      cooldown: 0.5 + state.rng(),
      alive: true,
      invuln: ENEMY_SPAWN_INVULN,
      // Per-enemy sidestep personality: some enemies actively dodge.
      dodge: 0.25 + state.rng() * 0.4,
      commitTicks: 0,
      stuckTicks: 0,
    })
    state.spawnQueue -= 1
    return
  }
}

function killEnemy(state: WorldState, index: number): void {
  const enemy = state.enemies[index]!
  state.enemies.splice(index, 1)
  state.score += 100
  state.effects.push({ x: enemy.x + TILE / 2, y: enemy.y + TILE / 2, t: 0, life: 0.45 })
}

/**
 * Advance the world by dt seconds under the player's held inputs.
 * @param state - the world (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - player held keys this frame.
 */
export function stepWorld(state: WorldState, dt: number, input: PlayerInput): void {
  if (state.result !== 'none') return
  state.t += dt

  // Player movement: pick one direction from the held keys; grid-aligned turns.
  const player = state.player
  if (player.alive) {
    let dir: Dir | null = null
    if (input.up) dir = 0
    else if (input.down) dir = 2
    else if (input.left) dir = 3
    else if (input.right) dir = 1
    if (dir !== null) {
      player.targetDir = dir
      moveTank(state, player, player.targetDir, PLAYER_SPEED * dt)
    } else {
      player.targetDir = player.dir
    }
    if (input.fire) {
      player.cooldown = Math.max(0, player.cooldown - dt)
      if (player.cooldown <= 0) fire(state, player, BULLET_SPEED_PLAYER)
    }
    player.invuln = Math.max(0, player.invuln - dt)
  }

  // Enemies: AI decisions on a fixed tick, movement every frame. Each tick
  // also rebuilds the BFS flow field from the player's current tile.
  state.aiTimer += dt
  const decide = state.aiTimer >= AI_TICK
  if (decide) {
    state.aiTimer = 0
    const ptx = Math.floor((state.player.x + TILE / 2) / TILE)
    const pty = Math.floor((state.player.y + TILE / 2) / TILE)
    state.flow = buildFlowField(state.grid, ptx, pty)
  }
  for (const enemy of state.enemies) {
    if (decide) decideEnemy(state, enemy)
    const bx = enemy.x
    const by = enemy.y
    moveTank(state, enemy, enemy.targetDir, ENEMY_SPEED * dt)
    // Lane-centring for AI tanks: a body straddling two lanes grazes the
    // neighbouring wall and wedges. Gently pull the perpendicular axis onto
    // the lane centre (bounded so it never tunnels through a wall).
    if (enemy.kind === 'enemy') {
      const vertical = enemy.dir === 0 || enemy.dir === 2
      if (vertical) {
        const gx = Math.round(enemy.x / TILE) * TILE
        const dx = gx - enemy.x
        if (Math.abs(dx) > 0.5) {
          const pull = Math.sign(dx) * Math.min(Math.abs(dx), ENEMY_SPEED * dt * 0.5)
          if (rectWalkable(state.grid, enemy.x + pull, enemy.y)) enemy.x += pull
        }
      } else {
        const gy = Math.round(enemy.y / TILE) * TILE
        const dy = gy - enemy.y
        if (Math.abs(dy) > 0.5) {
          const pull = Math.sign(dy) * Math.min(Math.abs(dy), ENEMY_SPEED * dt * 0.5)
          if (rectWalkable(state.grid, enemy.x, enemy.y + pull)) enemy.y += pull
        }
      }
    }
    // Stuck tracking: no meaningful movement since the last decision tick
    // means the chosen heading is geometrically impossible — the AI must
    // re-plan (see decideEnemy's stuck branch).
    const moved = Math.abs(enemy.x - bx) + Math.abs(enemy.y - by) > 0.5
    if (decide || moved) enemy.stuckTicks = moved ? 0 : (enemy.stuckTicks ?? 0) + 1
    // Grid re-alignment: a tank whose body straddles two lanes cannot turn
    // (any step pokes the body into the neighbouring wall). After a couple of
    // stuck ticks, hard-align it to the nearest lane so the chase can resume.
    if ((enemy.stuckTicks ?? 0) >= 2 && !moved) {
      const gx = Math.round(enemy.x / TILE) * TILE
      const gy = Math.round(enemy.y / TILE) * TILE
      if (rectWalkable(state.grid, gx, gy)) { enemy.x = gx; enemy.y = gy }
    }
    enemy.cooldown = Math.max(0, enemy.cooldown - dt)
    enemy.invuln = Math.max(0, enemy.invuln - dt)
  }

  // Spawning.
  if (state.spawnQueue > 0 && state.enemies.length < MAX_ALIVE) {
    state.spawnTimer -= dt
    if (state.spawnTimer <= 0) {
      spawnEnemy(state)
      state.spawnTimer = SPAWN_INTERVAL
    }
  }

  // Bullets.
  const aliveBullets: Bullet[] = []
  for (const bullet of state.bullets) {
    const speed = bullet.owner === 'player' ? BULLET_SPEED_PLAYER : BULLET_SPEED_ENEMY
    bullet.x += DIR_DX[bullet.dir]! * speed * dt
    bullet.y += DIR_DY[bullet.dir]! * speed * dt
    let dead = false
    // Wall collision at the bullet's center tile.
    const tx = Math.floor(bullet.x / TILE)
    const ty = Math.floor(bullet.y / TILE)
    const tile = tileAt(state.grid, tx, ty)
    if (tile === 1) {
      state.grid[ty]![tx] = 0
      state.effects.push({ x: bullet.x, y: bullet.y, t: 0, life: 0.3 })
      dead = true
    } else if (tile === 2 || (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H)) {
      state.effects.push({ x: bullet.x, y: bullet.y, t: 0, life: 0.25 })
      dead = true
    }
    // Tank collisions: player bullets hit enemies; enemy bullets hit the player.
    if (!dead && bullet.owner === 'player') {
      for (let i = 0; i < state.enemies.length; i += 1) {
        const enemy = state.enemies[i]!
        if (bulletHitsTank(bullet, enemy)) {
          killEnemy(state, i)
          dead = true
          break
        }
      }
    } else if (!dead && bullet.owner === 'enemy' && player.alive) {
      if (bulletHitsTank(bullet, player) && player.invuln <= 0) {
        player.hp -= 1
        player.invuln = PLAYER_INVULN
        state.effects.push({ x: bullet.x, y: bullet.y, t: 0, life: 0.35 })
        dead = true
        if (player.hp <= 0) player.alive = false
      }
    }
    if (!dead) aliveBullets.push(bullet)
  }
  state.bullets = aliveBullets

  // Decay visual effects.
  if (state.effects.length > 0) {
    for (const effect of state.effects) effect.t += dt
    state.effects = state.effects.filter(effect => effect.t < effect.life)
  }

  // Wave/result progression.
  if (!player.alive) {
    state.result = 'lose'
    return
  }
  if (state.enemies.length === 0 && state.spawnQueue === 0) {
    if (state.wave < WAVES) {
      state.wave += 1
      // Rotate to the next battle map: fresh bricks, empty lanes, player
      // back at the start with a short grace period.
      state.mapIndex = mapIndexForWave(state.wave)
      state.grid = buildGrid(state.mapIndex)
      state.bullets = []
      state.effects = []
      state.spawnQueue = ENEMIES_PER_WAVE
      state.spawnTimer = 0.8
      state.flow = null
      state.player.x = PLAYER_START[0] * TILE
      state.player.y = PLAYER_START[1] * TILE
      state.player.dir = 0
      state.player.targetDir = 0
      state.player.invuln = Math.max(state.player.invuln, 1.2)
    } else {
      state.result = 'win'
    }
  }
}

/** Whether a bullet's rect overlaps a tank's rect (shrunk by 2px). */
function bulletHitsTank(bullet: Bullet, tank: Tank): boolean {
  return bullet.x + 2 < tank.x + TILE - 2 && bullet.x + 6 - 2 > tank.x + 2
    && bullet.y + 2 < tank.y + TILE - 2 && bullet.y + 6 - 2 > tank.y + 2
}
