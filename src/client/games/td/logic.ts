/**
 * Tower-defense pure logic: an 11×9 tile map with a seeded corridor path
 * (left edge → right edge), three tower kinds, waves of enemies following
 * the waypoints, homing/lobbed projectiles, and a gold/lives/score economy.
 * Deterministic given (seed, commands, dt sequence); the game instance in
 * index.ts drives it with the frame loop and the unit tests drive it
 * directly.
 */

/** Deterministic 32-bit rng (map generation + spawn jitter). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const GRID_W = 11
export const GRID_H = 9
/** Waves per level; clearing wave 10 advances the level (levels wrap 1..5). */
export const WAVES_PER_LEVEL = 10
export const LEVEL_WRAP = 5
export const START_GOLD = 120
export const START_LIVES = 3
/** Seconds of build (pre-wave) time before the wave auto-starts. */
export const BUILD_TIME = 15
/**
 * Combat early-call window: once this wave's spawn queue drains, Space calls
 * the NEXT wave immediately — its enemies fight alongside the survivors
 * (overlap = harder). The bonus decays with this window, so calling sooner
 * pays more. The wave never auto-overlaps: at 0 only the bonus is gone.
 */
export const CALL_TIME = 12
const SPAWN_FIRST_DELAY = 0.4
const EARLY_BONUS_PER_SECOND = 10

export type TowerKind = 'arrow' | 'frost' | 'cannon'

/** Static per-kind metadata (cost / upgrade prices / display name). */
export interface TowerInfo {
  cost: number
  /** Upgrade prices for Lv1→2 and Lv2→3. */
  upgrades: readonly [number, number]
  name: string
}

export const TOWER_INFO: Record<TowerKind, TowerInfo> = {
  arrow: { cost: 50, upgrades: [40, 60], name: '箭塔' },
  frost: { cost: 70, upgrades: [50, 75], name: '冰霜塔' },
  cannon: { cost: 90, upgrades: [70, 100], name: '炮塔' },
}

/** Combat stats of one tower at one level (all tiles/seconds). */
export interface TowerStats {
  dmg: number
  /** Seconds between shots. */
  cooldown: number
  /** Range in tiles (center to center). */
  range: number
  /** Cannon only: splash radius in tiles. */
  splash?: number
  /** Frost only: speed reduction 0..1. */
  slowFactor?: number
  /** Frost only: slow duration in seconds. */
  slowDuration?: number
}

const ARROW_STATS: readonly TowerStats[] = [
  { dmg: 8, cooldown: 0.5, range: 2.2 },
  { dmg: 12, cooldown: 0.4, range: 2.2 },
  { dmg: 18, cooldown: 0.3, range: 2.2 },
]
const FROST_STATS: readonly TowerStats[] = [
  { dmg: 2, cooldown: 0.5, range: 2.0, slowFactor: 0.4, slowDuration: 1.2 },
  { dmg: 2, cooldown: 0.5, range: 2.0, slowFactor: 0.55, slowDuration: 1.2 },
  { dmg: 2, cooldown: 0.5, range: 2.0, slowFactor: 0.7, slowDuration: 1.2 },
]
const CANNON_STATS: readonly TowerStats[] = [
  { dmg: 20, cooldown: 1.2, range: 1.8, splash: 0.8 },
  { dmg: 32, cooldown: 1.1, range: 1.8, splash: 1.0 },
  { dmg: 50, cooldown: 1.0, range: 1.8, splash: 1.2 },
]

/** Combat stats of `kind` at `level` (1-3). */
export function towerStats(kind: TowerKind, level: number): TowerStats {
  const table = kind === 'arrow' ? ARROW_STATS : kind === 'frost' ? FROST_STATS : CANNON_STATS
  return table[Math.min(2, Math.max(0, level - 1))]!
}

/** Upgrade price from `level` to the next (0 when already Lv3). */
export function upgradeCost(kind: TowerKind, level: number): number {
  if (level >= 3) return 0
  return TOWER_INFO[kind].upgrades[level - 1]!
}

export interface Waypoint {
  x: number
  y: number
}

/** Map seed for a (base seed, level) pair — the same pair replays identically. */
export function mapSeed(seed: number, level: number): number {
  return (seed + level * 7919) >>> 0
}

/**
 * Dig the fixed corridor path for a map seed: an alternating right/vertical
 * walk from the left edge to the right edge. Consecutive waypoints share a
 * row or column; the walk always ends at x = GRID_W - 1.
 */
export function generatePath(seed: number): Waypoint[] {
  const rng = mulberry32(seed)
  const waypoints: Waypoint[] = []
  let x = 0
  let y = 1 + Math.floor(rng() * (GRID_H - 2))
  waypoints.push({ x, y })
  while (x < GRID_W - 1) {
    const remaining = GRID_W - 1 - x
    const len = Math.min(remaining, 1 + Math.floor(rng() * 3))
    x += len
    waypoints.push({ x, y })
    if (x >= GRID_W - 1) break
    if (rng() < 0.8) {
      const up = rng() < 0.5
      const dy = 1 + Math.floor(rng() * 3)
      const ny = Math.max(0, Math.min(GRID_H - 1, up ? y - dy : y + dy))
      if (ny !== y) {
        y = ny
        waypoints.push({ x, y })
      }
    }
  }
  return waypoints
}

/** Boolean corridor grid (true = path tile; towers cannot be placed there). */
export function pathTilesOf(path: readonly Waypoint[]): boolean[][] {
  const tiles: boolean[][] = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => false))
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i]!
    const b = path[i + 1]!
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) tiles[y]![x] = true
    }
  }
  return tiles
}

/** Total corridor length in tiles (axis-aligned segments). */
export function pathLength(path: readonly Waypoint[]): number {
  let len = 0
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i]!
    const b = path[i + 1]!
    len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
  }
  return len
}

/** Point on the corridor polyline at arc distance `dist` (tile units). */
export function positionAt(path: readonly Waypoint[], dist: number): { x: number; y: number } {
  let remaining = Math.max(0, dist)
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i]!
    const b = path[i + 1]!
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (remaining <= seg || i + 2 === path.length) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= seg
  }
  const last = path[path.length - 1]!
  return { x: last.x, y: last.y }
}

export interface Tower {
  id: number
  kind: TowerKind
  tx: number
  ty: number
  level: number
  /** Seconds until the tower may fire again. */
  cooldown: number
  /** Total gold paid (base + upgrades) — the sell refund base. */
  spent: number
}

export interface Enemy {
  id: number
  hp: number
  maxHp: number
  /** Base speed in tiles/s (already brute/level-scaled). */
  speed: number
  brute: boolean
  /** Arc distance traveled along the corridor, in tiles. */
  dist: number
  /** Remaining slow duration in seconds (0 = not slowed). */
  slowTime: number
  /** Active speed reduction 0..1 (strongest applied magnitude). */
  slowFactor: number
  alive: boolean
}

export interface Projectile {
  kind: 'homing' | 'lob'
  x: number
  y: number
  dmg: number
  /** Homing only: tracked enemy id. */
  targetId: number
  /** Homing only: travel speed in tiles/s. */
  speed: number
  /** Frost only: slow magnitude/duration applied on hit. */
  slowFactor: number
  slowDuration: number
  /** Lob only: launch point, locked impact point, flight seconds, splash radius. */
  fromX: number
  fromY: number
  toX: number
  toY: number
  t: number
  flight: number
  splash: number
}

/** Transient visual explosion (pure state, decayed in step). */
export interface Effect {
  x: number
  y: number
  t: number
  life: number
}

export type TdPhase = 'build' | 'wave'
export type TdResult = 'none' | 'lose'

export interface TdState {
  seed: number
  level: number
  wave: number
  path: Waypoint[]
  pathTiles: boolean[][]
  towers: Tower[]
  enemies: Enemy[]
  projectiles: Projectile[]
  effects: Effect[]
  gold: number
  lives: number
  /** Points = gold spent on towers/upgrades + all wave/early bonuses. */
  score: number
  phase: TdPhase
  /** Seconds left in the build phase before the wave auto-starts. */
  buildTimer: number
  /** Early-call bonus window left during combat (next wave overlap). */
  callTimer: number
  /** Enemies still to spawn this wave. */
  spawnQueue: number
  spawnTimer: number
  /** Whether the final queued enemy of this wave is a brute. */
  brutePending: boolean
  result: TdResult
  t: number
  nextId: number
  rng: () => number
}

/** Enemy count of wave `wave`. */
export function waveSize(wave: number): number {
  return Math.min(4 + wave, 20)
}

function waveHp(wave: number, level: number): number {
  return 30 * (1 + 0.25 * wave) * (1 + 0.6 * (level - 1))
}

function waveSpeed(wave: number, level: number): number {
  return (0.8 + 0.03 * wave) * (1 + 0.12 * (level - 1))
}

/** Gold granted for killing an enemy during wave `wave`. */
export function killGold(wave: number): number {
  return 6 + Math.floor(wave / 2)
}

/** Gold granted for clearing wave `wave`. */
export function waveClearBonus(wave: number): number {
  return 20 + 2 * wave
}

/** Early-send bonus for sending the wave with `remaining` build seconds left. */
export function earlySendBonus(remaining: number): number {
  return Math.max(0, Math.floor(remaining)) * EARLY_BONUS_PER_SECOND
}

function resetBoard(state: TdState, level: number): void {
  state.level = level
  state.wave = 1
  state.path = generatePath(mapSeed(state.seed, level))
  state.pathTiles = pathTilesOf(state.path)
  state.towers = []
  state.enemies = []
  state.projectiles = []
  state.effects = []
  state.phase = 'build'
  state.buildTimer = BUILD_TIME
  state.callTimer = CALL_TIME
  state.spawnQueue = 0
  state.spawnTimer = 0
  state.brutePending = false
}

/** A fresh game state at `level` (defaults to 1) on the seeded map. */
export function createState(seed: number, level = 1): TdState {
  const state: TdState = {
    seed,
    level: 1,
    wave: 1,
    path: [],
    pathTiles: [],
    towers: [],
    enemies: [],
    projectiles: [],
    effects: [],
    gold: START_GOLD,
    lives: START_LIVES,
    score: 0,
    phase: 'build',
    buildTimer: BUILD_TIME,
    callTimer: CALL_TIME,
    spawnQueue: 0,
    spawnTimer: 0,
    brutePending: false,
    result: 'none',
    t: 0,
    nextId: 1,
    rng: mulberry32((mapSeed(seed, level) ^ 0x5bf03635) >>> 0),
  }
  resetBoard(state, level)
  state.rng = mulberry32((mapSeed(seed, level) ^ 0x5bf03635) >>> 0)
  return state
}

/** Restart the current level: same map seed, gold back to start, wave 1. */
export function restartLevel(state: TdState): void {
  state.gold = START_GOLD
  state.lives = START_LIVES
  state.score = 0
  state.result = 'none'
  state.t = 0
  state.nextId = 1
  resetBoard(state, state.level)
  state.rng = mulberry32((mapSeed(state.seed, state.level) ^ 0x5bf03635) >>> 0)
}

/** Arm a fresh wave spawn (wave counter already points at the wave to run). */
function beginWave(state: TdState): void {
  state.phase = 'wave'
  state.spawnQueue = waveSize(state.wave)
  state.spawnTimer = SPAWN_FIRST_DELAY
  state.brutePending = state.wave % 3 === 0
  state.callTimer = CALL_TIME
}

/**
 * Start the wave now. From the build phase this runs the pending wave; from
 * combat (queue drained, a next wave exists) it OVERLAPS: the next wave's
 * enemies join the fight immediately. The early-call bonus is granted by
 * {@link sendWaveEarly}, which routes both paths.
 */
export function startWave(state: TdState): void {
  if (state.result !== 'none') return
  if (state.phase === 'build') {
    beginWave(state)
    return
  }
  if (state.phase === 'wave' && state.spawnQueue === 0 && state.wave < WAVES_PER_LEVEL) {
    state.wave += 1
    beginWave(state)
  }
}

/**
 * Send the next wave early: grants +10 gold per remaining second and starts
 * the wave immediately. In the build phase that just skips the countdown; in
 * combat (queue drained) it overlaps the next wave onto the survivors —
 * harder fight, paid for with the bonus. Calling mid-combat trades the
 * overlapped wave's clear bonus for the early bonus.
 */
export function sendWaveEarly(state: TdState): void {
  if (state.result !== 'none') return
  if (state.phase === 'build') {
    const bonus = earlySendBonus(state.buildTimer)
    state.gold += bonus
    state.score += bonus
    startWave(state)
    return
  }
  if (state.phase === 'wave' && state.spawnQueue === 0 && state.wave < WAVES_PER_LEVEL) {
    const bonus = earlySendBonus(state.callTimer)
    state.gold += bonus
    state.score += bonus
    state.wave += 1
    beginWave(state)
  }
}

function spawnEnemy(state: TdState): void {
  const brute = state.brutePending && state.spawnQueue === 1
  const hp = waveHp(state.wave, state.level) * (brute ? 3 : 1)
  const speed = waveSpeed(state.wave, state.level) * (brute ? 0.7 : 1)
  state.enemies.push({
    id: state.nextId,
    hp,
    maxHp: hp,
    speed,
    brute,
    dist: 0,
    slowTime: 0,
    slowFactor: 0,
    alive: true,
  })
  state.nextId += 1
  state.spawnQueue -= 1
}

/** Whether a tower may be built on tile (tx, ty): in bounds, off the path,
 * on a free tile. Gold is checked separately by {@link buildTower}. */
export function canBuild(state: TdState, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return false
  if (state.pathTiles[ty]![tx]) return false
  return !state.towers.some(tower => tower.tx === tx && tower.ty === ty)
}

/** Build `kind` on (tx, ty) when allowed and affordable; adds cost to score. */
export function buildTower(state: TdState, kind: TowerKind, tx: number, ty: number): boolean {
  const cost = TOWER_INFO[kind].cost
  if (!canBuild(state, tx, ty) || state.gold < cost) return false
  state.gold -= cost
  state.score += cost
  state.towers.push({ id: state.nextId, kind, tx, ty, level: 1, cooldown: 0, spent: cost })
  state.nextId += 1
  return true
}

/** Sell a tower for 60% of everything paid for it. */
export function sellTower(state: TdState, towerId: number): boolean {
  const index = state.towers.findIndex(tower => tower.id === towerId)
  if (index < 0) return false
  const tower = state.towers[index]!
  state.gold += Math.floor(tower.spent * 0.6)
  state.towers.splice(index, 1)
  return true
}

/** Upgrade a tower one level (max Lv3) when affordable; adds price to score. */
export function upgradeTower(state: TdState, towerId: number): boolean {
  const tower = state.towers.find(t => t.id === towerId)
  if (tower === undefined || tower.level >= 3) return false
  const cost = upgradeCost(tower.kind, tower.level)
  if (state.gold < cost) return false
  state.gold -= cost
  state.score += cost
  tower.spent += cost
  tower.level += 1
  return true
}

/** Apply damage (+ optional slow) to an enemy; kills grant gold. Slow stacks
 * duration at the same magnitude; a stronger magnitude replaces and resets. */
export function hitEnemy(state: TdState, enemy: Enemy, dmg: number, slowFactor = 0, slowDuration = 0): void {
  if (!enemy.alive) return
  if (slowFactor > 0 && slowDuration > 0) {
    if (enemy.slowTime > 0 && enemy.slowFactor >= slowFactor) enemy.slowTime += slowDuration
    else if (enemy.slowTime > 0 && enemy.slowFactor < slowFactor) {
      enemy.slowFactor = slowFactor
      enemy.slowTime = slowDuration
    } else {
      enemy.slowFactor = slowFactor
      enemy.slowTime = slowDuration
    }
  }
  enemy.hp -= dmg
  if (enemy.hp <= 0) {
    enemy.alive = false
    state.gold += killGold(state.wave)
  }
}

/** Effective enemy speed in tiles/s (base × slow reduction while slowed). */
export function enemySpeed(enemy: Enemy): number {
  return enemy.slowTime > 0 ? enemy.speed * (1 - enemy.slowFactor) : enemy.speed
}

function findEnemy(state: TdState, id: number): Enemy | undefined {
  return state.enemies.find(enemy => enemy.id === id)
}

/** Tower target: the enemy furthest along the corridor within range. */
function acquireTarget(state: TdState, tower: Tower, stats: TowerStats): Enemy | null {
  let best: Enemy | null = null
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue
    const pos = positionAt(state.path, enemy.dist)
    const dx = pos.x - tower.tx
    const dy = pos.y - tower.ty
    if (dx * dx + dy * dy > stats.range * stats.range) continue
    if (best === null || enemy.dist > best.dist) best = enemy
  }
  return best
}

function fire(state: TdState, tower: Tower, stats: TowerStats, target: Enemy): void {
  tower.cooldown = stats.cooldown
  if (tower.kind === 'cannon') {
    const to = positionAt(state.path, target.dist)
    state.projectiles.push({
      kind: 'lob', x: tower.tx, y: tower.ty, dmg: stats.dmg,
      targetId: target.id, speed: 0,
      slowFactor: 0, slowDuration: 0,
      fromX: tower.tx, fromY: tower.ty, toX: to.x, toY: to.y,
      t: 0, flight: 0.5, splash: stats.splash ?? 0.8,
    })
    return
  }
  state.projectiles.push({
    kind: 'homing', x: tower.tx, y: tower.ty, dmg: stats.dmg,
    targetId: target.id,
    speed: tower.kind === 'arrow' ? 6 : 4,
    slowFactor: stats.slowFactor ?? 0, slowDuration: stats.slowDuration ?? 0,
    fromX: tower.tx, fromY: tower.ty, toX: 0, toY: 0, t: 0, flight: 0, splash: 0,
  })
}

/** Explode a cannon shell at (x, y): every enemy within the splash radius
 * takes the full damage. */
export function explode(state: TdState, x: number, y: number, dmg: number, splash: number): void {
  state.effects.push({ x, y, t: 0, life: 0.3 })
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue
    const pos = positionAt(state.path, enemy.dist)
    const dx = pos.x - x
    const dy = pos.y - y
    if (dx * dx + dy * dy <= splash * splash) hitEnemy(state, enemy, dmg)
  }
}

function advanceLevel(state: TdState): void {
  resetBoard(state, (state.level % LEVEL_WRAP) + 1)
  state.lives = START_LIVES
}

function waveCleared(state: TdState): void {
  const bonus = waveClearBonus(state.wave)
  state.gold += bonus
  state.score += bonus
  if (state.wave >= WAVES_PER_LEVEL) {
    advanceLevel(state)
    return
  }
  state.wave += 1
  state.phase = 'build'
  state.buildTimer = BUILD_TIME
  state.callTimer = CALL_TIME
}

/**
 * Advance the game by dt seconds (clamp to <= 1/20 upstream).
 * @param state - the game state (mutated in place).
 * @param dt - elapsed seconds.
 */
export function step(state: TdState, dt: number): void {
  if (state.result !== 'none') return
  state.t += dt

  if (state.phase === 'build') {
    state.buildTimer -= dt
    if (state.buildTimer <= 0) startWave(state)
  }

  if (state.phase === 'wave' && state.spawnQueue > 0) {
    state.spawnTimer -= dt
    if (state.spawnTimer <= 0) {
      spawnEnemy(state)
      state.spawnTimer = 0.9 + state.rng() * 0.3
    }
  }

  // Combat early-call window: once the queue is drained, the bonus window
  // decays while enemies remain. It never auto-starts the next wave — only
  // the player's Space does (overlap is a chosen risk).
  if (state.phase === 'wave' && state.spawnQueue === 0 && state.enemies.length > 0 && state.callTimer > 0) {
    state.callTimer = Math.max(0, state.callTimer - dt)
  }

  // Enemy movement + leaks.
  let leaked = 0
  const total = pathLength(state.path)
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue
    if (enemy.slowTime > 0) enemy.slowTime = Math.max(0, enemy.slowTime - dt)
    enemy.dist += enemySpeed(enemy) * dt
    if (enemy.dist >= total) {
      enemy.alive = false
      leaked += 1
    }
  }
  if (leaked > 0) {
    state.lives -= leaked
    state.enemies = state.enemies.filter(enemy => enemy.alive)
    if (state.lives <= 0) {
      state.lives = 0
      state.result = 'lose'
      return
    }
  }

  // Towers acquire and fire.
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt)
    if (tower.cooldown > 0) continue
    const stats = towerStats(tower.kind, tower.level)
    const target = acquireTarget(state, tower, stats)
    if (target !== null) fire(state, tower, stats, target)
  }

  // Projectiles.
  const aliveProjectiles: Projectile[] = []
  for (const p of state.projectiles) {
    if (p.kind === 'homing') {
      const target = findEnemy(state, p.targetId)
      if (target === undefined || !target.alive) continue // target gone: fizzles
      const pos = positionAt(state.path, target.dist)
      const dx = pos.x - p.x
      const dy = pos.y - p.y
      const dist = Math.hypot(dx, dy)
      const travel = p.speed * dt
      if (dist <= travel + 0.05) {
        hitEnemy(state, target, p.dmg, p.slowFactor, p.slowDuration)
        continue
      }
      p.x += (dx / dist) * travel
      p.y += (dy / dist) * travel
      aliveProjectiles.push(p)
    } else {
      p.t += dt
      const t = Math.min(1, p.t / p.flight)
      p.x = p.fromX + (p.toX - p.fromX) * t
      p.y = p.fromY + (p.toY - p.fromY) * t
      if (p.t >= p.flight) {
        explode(state, p.toX, p.toY, p.dmg, p.splash)
        continue
      }
      aliveProjectiles.push(p)
    }
  }
  state.projectiles = aliveProjectiles
  state.enemies = state.enemies.filter(enemy => enemy.alive)

  if (state.phase === 'wave' && state.spawnQueue === 0 && state.enemies.length === 0) {
    waveCleared(state)
  }

  for (const effect of state.effects) effect.t += dt
  state.effects = state.effects.filter(effect => effect.t < effect.life)
}
