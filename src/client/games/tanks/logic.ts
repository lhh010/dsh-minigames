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
  result: GameResult
  t: number
  rng: () => number
}

export const WAVES = 3
export const ENEMIES_PER_WAVE = 5
export const MAX_ALIVE = 3
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
const AI_TICK = 0.7
const PLAYER_HP = 3
const PLAYER_INVULN = 1.5
/** Primary spawn tiles (enemies appear on these). */
const SPAWN_POINTS: readonly [number, number][] = [[0, 0], [14, 0], [7, 0]]
/** 2-wide pockets so a spawned tank can actually drive out of the border. */
const SPAWN_POCKETS: readonly [number, number][] = [[0, 0], [1, 0], [14, 0], [13, 0], [7, 0], [8, 0]]
const PLAYER_START: [number, number] = [7, 11]

/** Symmetric field; the three spawn tiles and the player start are cleared below. */
const BASE_MAP: number[][] = [
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
]

function buildGrid(): Tile[][] {
  const grid = BASE_MAP.map(row => [...row]) as Tile[][]
  for (const [tx, ty] of SPAWN_POCKETS) grid[ty]![tx] = 0
  return grid
}

/** A fresh world at wave 1. */
export function createWorld(rng: () => number = Math.random): WorldState {
  return {
    grid: buildGrid(),
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

/** The tile columns/rows a TILE-size rect at (x, y) overlaps. */
function overlapTiles(x: number, y: number): { tx0: number; tx1: number; ty0: number; ty1: number } {
  return {
    tx0: Math.floor(x / TILE),
    tx1: Math.floor((x + TILE - 1) / TILE),
    ty0: Math.floor(y / TILE),
    ty1: Math.floor((y + TILE - 1) / TILE),
  }
}

/** Whether every tile a rect at (x, y) overlaps is walkable. */
function rectWalkable(grid: Tile[][], x: number, y: number): boolean {
  const { tx0, tx1, ty0, ty1 } = overlapTiles(x, y)
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (tileAt(grid, tx, ty) !== 0) return false
    }
  }
  return true
}

/** AABB overlap between two tanks (slightly shrunk so neighbours can pass). */
function tanksOverlap(a: Tank, b: Tank): boolean {
  const pad = 2
  return a.x + pad < b.x + TILE - pad && a.x + TILE - pad > b.x + pad
    && a.y + pad < b.y + TILE - pad && a.y + TILE - pad > b.y + pad
}

/** Try to move a tank by dist px in dir; blocked by walls and other tanks. */
export function tryMove(state: WorldState, tank: Tank, dir: Dir, dist: number): boolean {
  const nx = tank.x + DIR_DX[dir]! * dist
  const ny = tank.y + DIR_DY[dir]! * dist
  if (!rectWalkable(state.grid, nx, ny)) return false
  for (const other of [state.player, ...state.enemies]) {
    if (other === tank || !other.alive) continue
    const probe: Tank = { ...tank, x: nx, y: ny }
    if (tanksOverlap(probe, other)) return false
  }
  tank.x = nx
  tank.y = ny
  tank.dir = dir
  // Snap to the tile boundary just crossed, so the perpendicular axis always
  // lands exactly on the grid (non-integer per-frame steps would otherwise
  // overshoot the alignment point and wedge the tank mid-lane).
  if (dir === 1) {
    const boundary = Math.floor(tank.x / TILE) * TILE
    if (tank.x - boundary < dist) tank.x = boundary
  } else if (dir === 3) {
    const boundary = Math.ceil(tank.x / TILE) * TILE
    if (boundary - tank.x < dist) tank.x = boundary
  } else if (dir === 2) {
    const boundary = Math.floor(tank.y / TILE) * TILE
    if (tank.y - boundary < dist) tank.y = boundary
  } else {
    const boundary = Math.ceil(tank.y / TILE) * TILE
    if (boundary - tank.y < dist) tank.y = boundary
  }
  return true
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
 * Move a tank toward its desired heading with classic grid-locked turning: a
 * turn only happens once the tank is aligned with the tile grid in the
 * perpendicular axis (x % TILE == 0 for vertical lanes, y % TILE == 0 for
 * horizontal lanes). Until then it keeps driving straight, so it never
 * straddles two lanes and wedges itself against a wall.
 * @param state - the world.
 * @param tank - the tank to move.
 * @param targetDir - the desired heading this frame.
 * @param dist - movement distance in px.
 * @returns whether the tank actually moved.
 */
function moveTank(state: WorldState, tank: Tank, targetDir: Dir, dist: number): boolean {
  if (targetDir !== tank.dir) {
    const perpendicular = tank.x % TILE
    const lateral = tank.y % TILE
    const vertical = targetDir === 0 || targetDir === 2
    const offset = vertical ? perpendicular : lateral
    if (!(offset < 0.5 || offset > TILE - 0.5)) {
      // Not aligned for the turn yet: keep driving straight.
      return tryMove(state, tank, tank.dir, dist)
    }
  }
  return tryMove(state, tank, targetDir, dist)
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

/** One enemy decision: shoot when aligned with a clear lane, else chase. */
function decideEnemy(state: WorldState, enemy: Tank): void {
  const player = state.player
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
  // Chase: prefer the axis with the larger gap; fall back through the others,
  // picking the first direction whose way ahead is actually clear.
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

  // Enemies: AI decisions on a fixed tick, movement every frame.
  state.aiTimer += dt
  const decide = state.aiTimer >= AI_TICK
  if (decide) state.aiTimer = 0
  for (const enemy of state.enemies) {
    if (decide) decideEnemy(state, enemy)
    moveTank(state, enemy, enemy.targetDir, ENEMY_SPEED * dt)
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
      state.spawnQueue = ENEMIES_PER_WAVE
      state.spawnTimer = 0.8
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
