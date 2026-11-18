/**
 * 淘金者（Boulder Dash 式简化）纯逻辑：seed 生成的矿洞网格（可挖泥土 /
 * 不可挖硬岩 / 金块 / 宝石 / 空腔 / 底部出口），玩家四向逐格移动、走进泥土
 * 即挖开；重力对金块与圆石生效（下方被掏空即逐格下落，圆石下落砸中玩家
 * 损命）；圆石可被水平侧推一格触发连锁——坠落超过一格再砸到硬岩会把硬岩
 * 砸开继续下沉。收齐全部金块后出口开启，抵达出口过关；3 命、每关限时，
 * 5 关递进（矿洞更大、圆石更多）。地形生成后做 BFS 可解性验证（硬岩不
 * 隔断金块与出口），全部随机走注入 seed 的 mulberry32，逻辑本身无随机，
 * 确定性可测、可重放。
 */

/** 单元边长（逻辑像素）。 */
export const CELL = 26
/** HUD 高度（逻辑像素）。 */
export const HUD_H = 30
/** 最大关卡网格（渲染画布按第 5 关尺寸固定，小关居中）。 */
export const MAX_COLS = 21
export const MAX_ROWS = 15
/** 逻辑画布宽。 */
export const LOGICAL_W = MAX_COLS * CELL
/** 逻辑画布高。 */
export const LOGICAL_H = HUD_H + MAX_ROWS * CELL

/** 初始生命数。 */
export const START_LIVES = 3
/** 单块金块得分。 */
export const GOLD_SCORE = 100
/** 单颗宝石得分。 */
export const GEM_SCORE = 150
/** 过关基础奖励。 */
export const LEVEL_SCORE = 300
/** 过关剩余每秒额外奖励。 */
export const TIME_BONUS_PER_S = 2
/** 单格下落动画时长（秒）。 */
export const FALL_ANIM_S = 0.08
/** 圆石砸开硬岩所需的最少下落格数。 */
export const SMASH_FALL = 2

/** 5 关递进参数：网格列 / 行、限时秒、金块 / 宝石 / 圆石数、硬岩与空腔密度。 */
export const LEVELS: ReadonlyArray<Readonly<{
  cols: number, rows: number, time: number, golds: number, gems: number, boulders: number, hardP: number, caveP: number,
}>> = [
  { cols: 13, rows: 11, time: 90, golds: 5, gems: 2, boulders: 4, hardP: 0.05, caveP: 0.08 },
  { cols: 15, rows: 12, time: 100, golds: 7, gems: 3, boulders: 6, hardP: 0.07, caveP: 0.09 },
  { cols: 17, rows: 13, time: 110, golds: 9, gems: 4, boulders: 8, hardP: 0.09, caveP: 0.10 },
  { cols: 19, rows: 14, time: 120, golds: 11, gems: 5, boulders: 11, hardP: 0.11, caveP: 0.11 },
  { cols: 21, rows: 15, time: 130, golds: 13, gems: 6, boulders: 14, hardP: 0.13, caveP: 0.12 },
]

/** 格子内容：空腔 / 可挖泥土 / 金块 / 宝石 / 不可挖硬岩 / 底部出口。 */
export type Cell = 'empty' | 'dirt' | 'hard' | 'gold' | 'gem' | 'exit'

export type Dir = 0 | 1 | 2 | 3 // 0 上，1 右，2 下，3 左
const DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [0, 1], [1, 0], [0, -1]]

/** 圆石：独立实体（可推、可坠、可砸硬岩）。 */
export interface Boulder {
  r: number
  c: number
  /** 本轮连续下落格数（砸硬岩判定用）。 */
  dist: number
}

/** 下落动画条目：某列一实体从 fromR 落到 toR 的插值信息。 */
export interface FallAnim {
  kind: 'boulder' | 'gold'
  c: number
  fromR: number
  toR: number
  t: number
}

export interface GoldmineState {
  level: number
  cols: number
  rows: number
  grid: Cell[][]
  exitC: number
  spawnC: number
  player: { r: number, c: number, dir: Dir }
  boulders: Boulder[]
  goldsLeft: number
  goldsTotal: number
  gemsTotal: number
  score: number
  lives: number
  timeLeft: number
  over: boolean
  won: boolean
  /** 进行中的下落动画。 */
  anims: FallAnim[]
  rng: () => number
}

/**
 * mulberry32 确定性随机数生成器：地形生成的全部随机都走它，同 seed 序列
 * 完全一致，保证可测可重放。
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

/** (r, c) 是否在当前关网格内。 */
export function inBounds(state: GoldmineState, r: number, c: number): boolean {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

/** (r, c) 处是否有圆石。 */
export function boulderAt(state: GoldmineState, r: number, c: number): boolean {
  return state.boulders.some((b) => b.r === r && b.c === c)
}

/** 玩家是否位于 (r, c)。 */
function playerAt(state: GoldmineState, r: number, c: number): boolean {
  return state.player.r === r && state.player.c === c
}

/** 金块能否被支撑在 (r, c)：非空格、圆石、玩家（金块停在玩家头顶不砸人）均算支撑。 */
function goldSupported(state: GoldmineState, r: number, c: number): boolean {
  if (r + 1 >= state.rows) return true
  if (state.grid[r + 1]![c]! !== 'empty') return true
  if (boulderAt(state, r + 1, c)) return true
  return playerAt(state, r + 1, c)
}

/** 圆石能否继续下落：下方为空且无其他圆石（玩家不支撑圆石——会被砸中）。 */
function boulderCanFall(state: GoldmineState, r: number, c: number): boolean {
  if (r + 1 >= state.rows) return false
  if (state.grid[r + 1]![c]! !== 'empty') return false
  return !boulderAt(state, r + 1, c)
}

/** 损一条命：生命耗尽则终局，否则玩家回出生点。 */
function loseLife(state: GoldmineState): void {
  state.lives -= 1
  if (state.lives <= 0) {
    state.lives = 0
    state.over = true
    return
  }
  state.player.r = 0
  state.player.c = state.spawnC
  state.player.dir = 2
}

/**
 * 重力沉降（离散）：自底向上反复扫描直至稳定。金块逐格下落（不落进玩家
 * 格）；圆石逐格下落，连续坠落 ≥ SMASH_FALL 格后砸到硬岩则硬岩碎为空腔并
 * 继续沉降，砸到玩家则损命停驻。每格下落记入动画队列。
 */
function settle(state: GoldmineState): void {
  let moved = true
  while (moved) {
    moved = false
    // 圆石自底向上（同格列表按行降序近似即可，循环直至稳定保证收敛）。
    const sorted = [...state.boulders].sort((a, b) => b.r - a.r)
    for (const b of sorted) {
      if (b.r + 1 >= state.rows) {
        b.dist = 0
        continue
      }
      const below = state.grid[b.r + 1]![b.c]!
      if (below === 'hard' && b.dist >= SMASH_FALL) {
        // 砸开硬岩：硬岩碎为空腔，圆石占其位（连坠距离保留，可继续连锁）。
        state.grid[b.r + 1]![b.c] = 'empty'
        state.anims.push({ kind: 'boulder', c: b.c, fromR: b.r, toR: b.r + 1, t: 0 })
        b.r += 1
        moved = true
        continue
      }
      if (boulderCanFall(state, b.r, b.c)) {
        state.anims.push({ kind: 'boulder', c: b.c, fromR: b.r, toR: b.r + 1, t: 0 })
        b.dist += 1
        b.r += 1
        // 下落中砸中玩家：损命，圆石占其格停驻。
        if (playerAt(state, b.r, b.c)) {
          loseLife(state)
          b.dist = 0
        }
        moved = true
      } else {
        // 支撑面上停驻：连坠距离归零。
        b.dist = 0
      }
    }
    // 金块逐格下落（自底向上）。
    for (let r = state.rows - 2; r >= 0; r -= 1) {
      for (let c = 0; c < state.cols; c += 1) {
        if (state.grid[r]![c] !== 'gold') continue
        if (goldSupported(state, r, c)) continue
        // 不落进玩家格：玩家在下方时金块停驻等待。
        if (playerAt(state, r + 1, c)) continue
        state.grid[r]![c] = 'empty'
        state.grid[r + 1]![c] = 'gold'
        state.anims.push({ kind: 'gold', c, fromR: r, toR: r + 1, t: 0 })
        moved = true
      }
    }
  }
}

/** 过关 / 通关结算：奖励计分，进入下一关或标记 won。 */
function completeLevel(state: GoldmineState): void {
  state.score += LEVEL_SCORE + Math.ceil(state.timeLeft) * TIME_BONUS_PER_S
  if (state.level >= LEVELS.length) {
    state.won = true
    return
  }
  state.level += 1
  loadLevel(state)
}

/** 按关卡参数用 rng 生成地形并写入 state（分数生命保留，动画清空）。 */
function loadLevel(state: GoldmineState): void {
  const cfg = LEVELS[state.level - 1]!
  const rng = state.rng
  const grid: Cell[][] = []
  for (let r = 0; r < cfg.rows; r += 1) {
    const row: Cell[] = []
    for (let c = 0; c < cfg.cols; c += 1) {
      if (r === 0) row.push('empty')
      else if (r === cfg.rows - 1) row.push('hard')
      else {
        const v = rng()
        row.push(v < cfg.hardP ? 'hard' : v < cfg.hardP + cfg.caveP ? 'empty' : 'dirt')
      }
    }
    grid.push(row)
  }
  const spawnC = Math.floor(cfg.cols / 2)
  const exitC = Math.floor(rng() * cfg.cols)
  grid[cfg.rows - 1]![exitC] = 'exit'

  const pick = (): { r: number, c: number } => {
    let guard = 0
    while (guard < 400) {
      guard += 1
      const r = 1 + Math.floor(rng() * (cfg.rows - 2))
      const c = Math.floor(rng() * cfg.cols)
      if (r === cfg.rows - 1) continue
      if (grid[r]![c] !== 'dirt') continue
      return { r, c }
    }
    return { r: 1, c: 0 }
  }

  for (let i = 0; i < cfg.golds; i += 1) {
    const p = pick()
    grid[p.r]![p.c] = 'gold'
  }
  for (let i = 0; i < cfg.gems; i += 1) {
    const p = pick()
    grid[p.r]![p.c] = 'gem'
  }

  const boulders: Boulder[] = []
  let guard = 0
  while (boulders.length < cfg.boulders && guard < 600) {
    guard += 1
    const r = 2 + Math.floor(rng() * (cfg.rows - 3))
    const c = Math.floor(rng() * cfg.cols)
    if (grid[r]![c] === 'hard' || grid[r]![c] === 'gold' || grid[r]![c] === 'gem') continue
    if (boulders.some((b) => b.r === r && b.c === c)) continue
    if (c === spawnC && r <= 2) continue // 出生点正上方留安全区
    if (c === exitC && r === cfg.rows - 2) continue // 出口正上不压死路
    grid[r]![c] = 'empty'
    boulders.push({ r, c, dist: 0 })
  }

  let goldsTotal = 0
  let gemsTotal = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 'gold') goldsTotal += 1
      else if (cell === 'gem') gemsTotal += 1
    }
  }

  state.cols = cfg.cols
  state.rows = cfg.rows
  state.grid = grid
  state.exitC = exitC
  state.spawnC = spawnC
  state.player = { r: 0, c: spawnC, dir: 2 }
  state.boulders = boulders
  state.goldsLeft = goldsTotal
  state.goldsTotal = goldsTotal
  state.gemsTotal = gemsTotal
  state.timeLeft = cfg.time
  state.anims = []

  ensureSolvable(state)
}

/**
 * 可解性验证：从出生点 BFS（泥土 / 空腔 / 金块 / 宝石 / 出口皆可通行——
 * 泥土可挖、圆石可推可坠），要求全部金块与出口可达；不可达时把隔断的
 * 硬岩逐个碎为泥土后复验（确定性：仅由地形决定）。
 */
function ensureSolvable(state: GoldmineState): void {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reachable = reachableCells(state)
    let ok = reachable[state.rows - 1]![state.exitC] === true
    if (ok) {
      outer: for (let r = 0; r < state.rows; r += 1) {
        for (let c = 0; c < state.cols; c += 1) {
          if (state.grid[r]![c] === 'gold' && reachable[r]![c] !== true) { ok = false; break outer }
        }
      }
    }
    if (ok) return
    // 隔断修复：把全部内部硬岩碎为泥土（泥土一定可通），一次性兜底。
    for (let r = 1; r < state.rows - 1; r += 1) {
      for (let c = 0; c < state.cols; c += 1) {
        if (state.grid[r]![c] === 'hard') state.grid[r]![c] = 'dirt'
      }
    }
  }
}

/** 出生点 BFS：玩家视角可达格矩阵（硬岩不通，其余皆通）。 */
function reachableCells(state: GoldmineState): boolean[][] {
  const seen: boolean[][] = []
  for (let r = 0; r < state.rows; r += 1) seen.push(new Array<boolean>(state.cols).fill(false))
  const queue: Array<[number, number]> = [[0, state.spawnC]]
  seen[0]![state.spawnC] = true
  while (queue.length > 0) {
    const [r, c] = queue.shift()!
    for (const [dr, dc] of DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (!inBounds(state, nr, nc)) continue
      if (seen[nr]![nc]) continue
      if (state.grid[nr]![nc] === 'hard') continue
      seen[nr]![nc] = true
      queue.push([nr, nc])
    }
  }
  return seen
}

/** 出口开启判定：金块收齐即开。 */
export function exitOpen(state: GoldmineState): boolean {
  return state.goldsLeft === 0
}

/**
 * 玩家行动（一次一格）：水平走进圆石且其身后为空则侧推；走进泥土即挖开，
 * 金块 / 宝石拾取计分；随后重力沉降（圆石连锁 / 砸中判定）；踏上已开启的
 * 出口即过关。任何行动（含被挡）都会触发沉降，推动后的连锁得以结算。
 * @param state - 游戏状态（就地修改）。
 * @param dir - 方向。
 * @returns 是否发生状态变化（供渲染置脏）。
 */
export function moveGoldmine(state: GoldmineState, dir: Dir): boolean {
  if (state.over || state.won) return false
  const before = snapshot(state)
  const p = state.player
  p.dir = dir
  const [dr, dc] = DIRS[dir]!
  const nr = p.r + dr
  const nc = p.c + dc
  let stepped = false
  if (inBounds(state, nr, nc)) {
    const target = state.grid[nr]![nc]!
    const pushed = boulderAt(state, nr, nc)
    if (pushed) {
      // 侧推：仅水平方向，且圆石身后一格为空且无圆石。
      const br = nr + dr
      const bc = nc + dc
      if (dr === 0 && inBounds(state, br, bc) && state.grid[br]![bc] === 'empty' && !boulderAt(state, br, bc)) {
        const b = state.boulders.find((x) => x.r === nr && x.c === nc)!
        b.r = br
        b.c = bc
        b.dist = 0
        p.r = nr
        p.c = nc
        stepped = true
      }
    } else if (target !== 'hard') {
      p.r = nr
      p.c = nc
      stepped = true
      if (target === 'gold') {
        state.goldsLeft -= 1
        state.score += GOLD_SCORE
      } else if (target === 'gem') {
        state.score += GEM_SCORE
      } else if (target === 'dirt' || target === 'empty') {
        // 挖开 / 通行
      }
      if (target === 'dirt') state.grid[nr]![nc] = 'empty'
      if (target === 'gold' || target === 'gem') state.grid[nr]![nc] = 'empty'
    }
  }
  settle(state)
  if (!state.over && !state.won && exitOpen(state) && state.player.r === state.rows - 1 && state.player.c === state.exitC) {
    completeLevel(state)
  }
  return snapshot(state) !== before
}

/** 状态指纹：判定一次行动是否改变局面（渲染置脏 / 测试用）。 */
function snapshot(state: GoldmineState): string {
  return JSON.stringify({
    g: state.grid, b: state.boulders, p: state.player,
    goldsLeft: state.goldsLeft, score: state.score, lives: state.lives,
    level: state.level, over: state.over, won: state.won, timeLeft: Math.ceil(state.timeLeft),
  })
}

/**
 * 实时推进：倒计时与下落动画。倒计时归零损命并重置本关计时。
 * @param state - 游戏状态（就地修改）。
 * @param dt - 帧间隔秒数。
 * @returns 是否处于终局（over 或 won）。
 */
export function stepGoldmine(state: GoldmineState, dt: number): boolean {
  if (state.over || state.won) return true
  state.timeLeft -= dt
  if (state.timeLeft <= 0) {
    loseLife(state)
    if (!state.over) state.timeLeft = LEVELS[state.level - 1]!.time
    else state.timeLeft = 0
  }
  for (let i = state.anims.length - 1; i >= 0; i -= 1) {
    const anim = state.anims[i]!
    anim.t += dt
    if (anim.t >= FALL_ANIM_S * (anim.toR - anim.fromR)) state.anims.splice(i, 1)
  }
  return state.over || state.won
}

/**
 * 直接构造指定关卡状态（测试 / 调试用；内部走同一生成路径）。
 * @param seed - 32 位种子。
 * @param level - 关卡号（1..LEVELS.length）。
 * @returns 该关初始 GoldmineState。
 */
export function createGoldmineStateAtLevel(seed: number, level: number): GoldmineState {
  const clamped = Math.min(Math.max(level, 1), LEVELS.length)
  const state: GoldmineState = {
    level: clamped,
    cols: 1,
    rows: 1,
    grid: [],
    exitC: 0,
    spawnC: 0,
    player: { r: 0, c: 0, dir: 2 },
    boulders: [],
    goldsLeft: 0,
    goldsTotal: 0,
    gemsTotal: 0,
    score: 0,
    lives: START_LIVES,
    timeLeft: 0,
    over: false,
    won: false,
    anims: [],
    rng: mulberry32(seed),
  }
  loadLevel(state)
  return state
}

/**
 * 创建一次全新冒险：第 1 关、3 条命，地形由 seed 决定。
 * @param seed - 32 位种子，相同种子得到完全相同的关卡序列。
 * @returns 初始 GoldmineState。
 */
export function createGoldmineState(seed: number): GoldmineState {
  return createGoldmineStateAtLevel(seed, 1)
}
