/**
 * 地底挖矿（Dig Dug 式）纯逻辑：种子生成的泥土网格（泥土 / 硬石 / 宝石 /
 * 落石），玩家四向移动、走进泥土格即挖开；落石在下方被掏空后先抖动 0.5 秒
 * 预警再坠落，压死玩家（损命）或压死敌人（得分）；敌人在地道中游荡并偏向
 * 追击玩家（岔路选择由种子决定）；收齐全部宝石后抵达底部出口即过关，
 * 共 5 关递进（层深 / 敌速 / 硬石密度）。全部随机走注入 seed 的 mulberry32，
 * 帧内固定 1/60 子步推进，确定性可测、可重放。
 */

/** 单元边长（逻辑像素）。 */
export const CELL = 24
/** 网格列数。 */
export const COLS = 15
/** 网格行数（第 0 行为地表，末行为基岩+出口）。 */
export const ROWS = 14
/** 玩家移动速度（像素/秒）。 */
export const PLAYER_SPEED = 85
/** 落石抖动预警时长（秒）。 */
export const BOULDER_SHAKE = 0.5
/** 落石坠落速度（像素/秒）。 */
export const BOULDER_SPEED = 260
/** 固定物理子步长（秒）。 */
export const SUB_DT = 1 / 60
/** 敌人出生后的静止倒计时（秒），给玩家逃离窗口。 */
export const ENEMY_DELAY = 1.2
/** 初始生命数。 */
export const START_LIVES = 3
/** 单份宝石得分。 */
export const GEM_SCORE = 50
/** 压死敌人得分。 */
export const CRUSH_SCORE = 150
/** 过关奖励得分。 */
export const LEVEL_SCORE = 500

/** 5 关递进参数：硬石概率、宝石概率、落石数、敌人数、敌速。 */
export const LEVELS: ReadonlyArray<Readonly<{
  hardP: number, gemP: number, boulders: number, enemies: number, enemySpeed: number,
}>> = [
  { hardP: 0.05, gemP: 0.10, boulders: 8, enemies: 2, enemySpeed: 55 },
  { hardP: 0.08, gemP: 0.10, boulders: 9, enemies: 2, enemySpeed: 65 },
  { hardP: 0.11, gemP: 0.11, boulders: 10, enemies: 3, enemySpeed: 72 },
  { hardP: 0.14, gemP: 0.11, boulders: 11, enemies: 3, enemySpeed: 80 },
  { hardP: 0.16, gemP: 0.12, boulders: 12, enemies: 3, enemySpeed: 88 },
]

/** 格子内容：空地道 / 可挖泥土 / 含宝石泥土 / 不可挖硬石 / 底部出口。 */
export type Cell = 'empty' | 'dirt' | 'hard' | 'gem' | 'exit'

export type Dir = 0 | 1 | 2 | 3 // 0 上，1 右，2 下，3 左
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]

/** 落石状态机：支撑 → 抖动（预警）→ 坠落 → 落地/压判定。 */
export type BoulderState = 'rest' | 'shake' | 'fall'

export interface Boulder {
  /** 所在列。 */
  c: number
  /** 顶部 y（逻辑像素）；rest 时恒为整行对齐。 */
  y: number
  state: BoulderState
  /** 抖动剩余秒数。 */
  timer: number
}

export interface Enemy {
  x: number
  y: number
  dir: Dir
  homeX: number
  homeY: number
}

export interface DigState {
  level: number
  grid: Cell[][]
  /** 出口所在列（末行）。 */
  exitCol: number
  player: { x: number, y: number, dir: Dir, intent: Dir }
  enemies: Enemy[]
  boulders: Boulder[]
  gemsLeft: number
  gemsTotal: number
  score: number
  lives: number
  over: boolean
  won: boolean
  /** 敌人出生静止剩余秒数。 */
  enemyDelay: number
  /** 固定子步累积器（秒）。 */
  acc: number
  rng: () => number
}

/**
 * mulberry32 确定性随机数生成器：全部游戏随机（地形、岔路）都走它，
 * 同一 seed 序列完全一致，保证可测可重放。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function centre(rc: number): number {
  return rc * CELL + CELL / 2
}

function atCentre(v: number): boolean {
  return Math.abs(v % CELL - CELL / 2) < 2
}

function snapCentre(v: number): number {
  return Math.floor(v / CELL) * CELL + CELL / 2
}

/** (r, c) 是否在网格内。 */
export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

/** 落石是否正占据 (r, c)（抖动/静止算占据，坠落中按其当前顶行算）。 */
function boulderAt(state: DigState, r: number, c: number, includeFalling: boolean): boolean {
  for (const b of state.boulders) {
    if (b.c !== c) continue
    const br = Math.floor(b.y / CELL)
    if (br === r && (includeFalling || b.state !== 'fall')) return true
  }
  return false
}

/** 落石下落时能否穿过 (r, c)：空地道与出口不阻挡（出口可坠出矿坑）。 */
function solidForBoulder(state: DigState, r: number, c: number): boolean {
  if (!inBounds(r, c)) return true
  const cell = state.grid[r]![c]!
  if (cell !== 'empty' && cell !== 'exit') return true
  return boulderAt(state, r, c, false)
}

/** 玩家能否走进 (r, c)：硬石与静止/抖动落石不可入，泥土宝石靠挖。 */
function enterableForPlayer(state: DigState, r: number, c: number): boolean {
  if (!inBounds(r, c)) return false
  if (state.grid[r]![c] === 'hard') return false
  return !boulderAt(state, r, c, false)
}

/** 敌人能否走进 (r, c)：只认空地道，硬石/泥土/出口/任意落石均不可。 */
function passableForEnemy(state: DigState, r: number, c: number): boolean {
  if (!inBounds(r, c)) return false
  if (state.grid[r]![c] !== 'empty') return false
  return !boulderAt(state, r, c, true)
}

/** 按关卡参数用 rng 生成地形、敌人、落石，并写入 state（分数生命保留）。 */
function loadLevel(state: DigState): void {
  const cfg = LEVELS[state.level - 1]!
  const rng = state.rng
  const grid: Cell[][] = []
  for (let r = 0; r < ROWS; r += 1) {
    const row: Cell[] = []
    for (let c = 0; c < COLS; c += 1) {
      if (r === 0) row.push('empty')
      else if (r === ROWS - 1) row.push('hard')
      else {
        const v = rng()
        row.push(v < cfg.hardP ? 'hard' : v < cfg.hardP + cfg.gemP ? 'gem' : 'dirt')
      }
    }
    grid.push(row)
  }
  const exitCol = Math.floor(rng() * COLS)
  grid[ROWS - 1]![exitCol] = 'exit'
  // 出口正上方保证是可挖泥土，出口永远可达。
  grid[ROWS - 2]![exitCol] = 'dirt'
  // 出生点正下方保证不是硬石，开局一定挖得动。
  const spawnC = Math.floor(COLS / 2)
  if (grid[1]![spawnC] === 'hard') grid[1]![spawnC] = 'dirt'

  const enemies: Enemy[] = []
  for (let i = 0; i < cfg.enemies; i += 1) {
    const r = 3 + Math.floor(rng() * (ROWS - 6))
    const c = Math.floor(rng() * COLS)
    grid[r]![c] = 'empty'
    enemies.push({ x: centre(c), y: centre(r), dir: 1, homeX: centre(c), homeY: centre(r) })
  }

  const boulders: Boulder[] = []
  let guard = 0
  while (boulders.length < cfg.boulders && guard < 200) {
    guard += 1
    const r = 1 + Math.floor(rng() * (ROWS - 3))
    const c = Math.floor(rng() * COLS)
    if (r === ROWS - 2 && c === exitCol) continue
    if (grid[r]![c] === 'empty') continue // 敌人出生窝已占用
    if (boulderAt({ ...state, boulders } as DigState, r, c, true)) continue
    grid[r]![c] = 'empty'
    boulders.push({ c, y: r * CELL, state: 'rest', timer: 0 })
  }

  let gemsTotal = 0
  for (const row of grid) for (const cell of row) if (cell === 'gem') gemsTotal += 1

  state.grid = grid
  state.exitCol = exitCol
  state.player = { x: centre(spawnC), y: centre(0), dir: 2, intent: 2 }
  state.enemies = enemies
  state.boulders = boulders
  state.gemsLeft = gemsTotal
  state.gemsTotal = gemsTotal
  state.enemyDelay = ENEMY_DELAY
  state.acc = 0
}

/**
 * 创建一次全新冒险：第 1 关、3 条命，地形由 seed 决定。
 * @param seed - 32 位种子，相同种子得到完全相同的关卡序列。
 * @returns 初始 DigState。
 */
export function createDigState(seed: number): DigState {
  const state: DigState = {
    level: 1,
    grid: [],
    exitCol: 0,
    player: { x: 0, y: 0, dir: 2, intent: 2 },
    enemies: [],
    boulders: [],
    gemsLeft: 0,
    gemsTotal: 0,
    score: 0,
    lives: START_LIVES,
    over: false,
    won: false,
    enemyDelay: ENEMY_DELAY,
    acc: 0,
    rng: mulberry32(seed),
  }
  loadLevel(state)
  return state
}

/** 玩家网格对齐移动：格心转向、被阻挡时停驻格心；走进泥土/宝石即挖开。 */
function movePlayer(state: DigState, dt: number): void {
  const p = state.player
  if (atCentre(p.x) && atCentre(p.y) && p.intent !== p.dir) {
    const [dx, dy] = DIRS[p.intent]!
    const gr = Math.floor(p.y / CELL)
    const gc = Math.floor(p.x / CELL)
    if (enterableForPlayer(state, gr + dy, gc + dx)) p.dir = p.intent
  }
  const [dx, dy] = DIRS[p.dir]!
  const gr = Math.floor(p.y / CELL)
  const gc = Math.floor(p.x / CELL)
  if (!enterableForPlayer(state, gr + dy, gc + dx)) {
    p.x = snapCentre(p.x)
    p.y = snapCentre(p.y)
  } else {
    const targetX = (gc + dx) * CELL + CELL / 2
    const targetY = (gr + dy) * CELL + CELL / 2
    const step = PLAYER_SPEED * dt
    let nx = p.x + dx * step
    let ny = p.y + dy * step
    if (dx !== 0 && ((dx > 0 && nx > targetX) || (dx < 0 && nx < targetX))) nx = targetX
    if (dy !== 0 && ((dy > 0 && ny > targetY) || (dy < 0 && ny < targetY))) ny = targetY
    p.x = nx
    p.y = ny
  }
  // 挖掘：脚下（所在格）为泥土/宝石即挖开，宝石计分。
  const r = Math.floor(p.y / CELL)
  const c = Math.floor(p.x / CELL)
  const cell = state.grid[r]![c]!
  if (cell === 'dirt' || cell === 'gem') {
    state.grid[r]![c] = 'empty'
    if (cell === 'gem') {
      state.gemsLeft -= 1
      state.score += GEM_SCORE
    }
  }
}

/** 敌人岔路决策：75% 概率选最接近玩家的候选（平手由 rng 决定），否则随机游荡。 */
function enemyDir(state: DigState, enemy: Enemy): Dir {
  const gr = Math.floor(enemy.y / CELL)
  const gc = Math.floor(enemy.x / CELL)
  const pr = Math.floor(state.player.y / CELL)
  const pc = Math.floor(state.player.x / CELL)
  const back = ((enemy.dir + 2) % 4) as Dir
  const candidates: Dir[] = []
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (d === back) continue
    const [dx, dy] = DIRS[d]!
    if (passableForEnemy(state, gr + dy, gc + dx)) candidates.push(d)
  }
  if (candidates.length === 0) return back // 死路：掉头
  if (state.rng() < 0.75) {
    let bestDist = Infinity
    for (const d of candidates) {
      const [dx, dy] = DIRS[d]!
      const dist = Math.abs(gr + dy - pr) + Math.abs(gc + dx - pc)
      if (dist < bestDist) bestDist = dist
    }
    const best = candidates.filter(d => {
      const [dx, dy] = DIRS[d]!
      return Math.abs(gr + dy - pr) + Math.abs(gc + dx - pc) === bestDist
    })
    return best[Math.floor(state.rng() * best.length)]!
  }
  return candidates[Math.floor(state.rng() * candidates.length)]!
}

/** 敌人网格对齐移动（出生倒计时期间静止）。 */
function moveEnemies(state: DigState, dt: number): void {
  if (state.enemyDelay > 0) return
  const cfg = LEVELS[state.level - 1]!
  for (const enemy of state.enemies) {
    if (atCentre(enemy.x) && atCentre(enemy.y)) enemy.dir = enemyDir(state, enemy)
    const [dx, dy] = DIRS[enemy.dir]!
    const gr = Math.floor(enemy.y / CELL)
    const gc = Math.floor(enemy.x / CELL)
    if (!passableForEnemy(state, gr + dy, gc + dx)) {
      enemy.x = snapCentre(enemy.x)
      enemy.y = snapCentre(enemy.y)
      continue
    }
    const targetX = (gc + dx) * CELL + CELL / 2
    const targetY = (gr + dy) * CELL + CELL / 2
    const step = cfg.enemySpeed * dt
    let nx = enemy.x + dx * step
    let ny = enemy.y + dy * step
    if (dx !== 0 && ((dx > 0 && nx > targetX) || (dx < 0 && nx < targetX))) nx = targetX
    if (dy !== 0 && ((dy > 0 && ny > targetY) || (dy < 0 && ny < targetY))) ny = targetY
    enemy.x = nx
    enemy.y = ny
  }
}

/** 落石子步：支撑检测 → 抖动倒计时 → 坠落、压判定与落地归位。 */
function moveBoulders(state: DigState, dt: number): void {
  for (let i = state.boulders.length - 1; i >= 0; i -= 1) {
    const b = state.boulders[i]!
    const row = Math.floor(b.y / CELL)
    if (b.state === 'rest') {
      if (!solidForBoulder(state, row + 1, b.c)) {
        b.state = 'shake'
        b.timer = BOULDER_SHAKE
      }
    } else if (b.state === 'shake') {
      b.timer -= dt
      if (b.timer <= 0) b.state = 'fall'
    } else {
      // 坠落中：推进并先做压判定。
      let newY = b.y + BOULDER_SPEED * dt
      const pc = Math.floor(state.player.x / CELL)
      if (pc === b.c) {
        const py = state.player.y
        if (py > newY - 2 && py < newY + CELL + 2) loseLife(state)
      }
      for (let e = state.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = state.enemies[e]!
        if (Math.floor(enemy.x / CELL) === b.c && enemy.y > newY - 2 && enemy.y < newY + CELL + 2) {
          state.enemies.splice(e, 1)
          state.score += CRUSH_SCORE
        }
      }
      if (state.over || state.won) return
      const landRow = Math.floor((newY + CELL) / CELL)
      if (landRow >= ROWS || solidForBoulder(state, landRow, b.c)) {
        // 落地：贴齐支撑物顶面。
        const restRow = landRow >= ROWS ? ROWS - 1 : landRow - 1
        b.y = restRow * CELL
        b.state = 'rest'
        if (state.grid[restRow]![b.c] === 'exit') {
          // 坠入出口即滚出矿坑，不再挡路。
          state.boulders.splice(i, 1)
        }
      } else {
        b.y = newY
      }
    }
  }
}

/** 敌人贴身碰撞：损一条命并重置站位。 */
function collide(state: DigState): void {
  if (state.enemyDelay > 0 || state.over || state.won) return
  for (const enemy of state.enemies) {
    if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < CELL - 2) {
      loseLife(state)
      return
    }
  }
}

/** 损一条命：清零重置站位；生命耗尽则结束。 */
function loseLife(state: DigState): void {
  state.lives -= 1
  if (state.lives <= 0) {
    state.over = true
    return
  }
  state.player.x = centre(Math.floor(COLS / 2))
  state.player.y = centre(0)
  state.player.dir = 2
  state.player.intent = 2
  for (const enemy of state.enemies) {
    enemy.x = enemy.homeX
    enemy.y = enemy.homeY
    enemy.dir = 1
  }
  state.enemyDelay = ENEMY_DELAY
}

/** 出口判定：宝石收齐后玩家踏上出口格即过关 / 通关。 */
function checkExit(state: DigState): void {
  if (state.over || state.won || state.gemsLeft > 0) return
  const r = Math.floor(state.player.y / CELL)
  const c = Math.floor(state.player.x / CELL)
  if (state.grid[r]![c] !== 'exit') return
  state.score += LEVEL_SCORE
  if (state.level >= LEVELS.length) {
    state.won = true
  } else {
    state.level += 1
    loadLevel(state)
  }
}

/** 推进恰好一个固定子步（1/60 秒），所有随机与判定都在子步内完成。 */
function substep(state: DigState): void {
  if (state.enemyDelay > 0) state.enemyDelay = Math.max(0, state.enemyDelay - SUB_DT)
  movePlayer(state, SUB_DT)
  moveBoulders(state, SUB_DT)
  moveEnemies(state, SUB_DT)
  collide(state)
  checkExit(state)
}

/**
 * 推进游戏：dt 先累积，再按固定 1/60 子步整数次推进（余量留到下一帧），
 * 与帧率无关、确定性可重放。
 * @param state - 游戏状态（就地修改）。
 * @param dt - 帧间隔秒数。
 * @returns 是否处于终局（over 或 won）。
 */
export function stepDig(state: DigState, dt: number): boolean {
  if (state.over || state.won) return true
  state.acc = Math.min(state.acc + dt, 0.1)
  while (state.acc >= SUB_DT) {
    state.acc -= SUB_DT
    substep(state)
    if (state.over || state.won) return true
  }
  return false
}
