/**
 * 切水果（Fruit Slash）纯逻辑：60 秒一回合，水果从底部按抛物线成波抛出
 * （重力恒定，初速度由 mulberry32(seed, round) 确定性生成）。共 8 种水果，
 * 越小分越高；炸弹概率随关卡从 15% 升至 30%，高关卡还会出现一屏多弹的
 * "炸弹链"。指针按住划动产生刀光轨迹，最近约 120ms 的轨迹线段扫到水果
 * 即切开并得分；切到炸弹 -1 命、清屏并扣分；水果落出底部未切（missed）
 * 直接 -1 命并累计 missed 计数，共 5 条命。一次挥刀（pointerdown→up）内切开
 * ≥2 个同种水果触发同种连击奖励，切开 N 个时整刀得分上浮；奖励由
 * settleSwipe 纯函数结算并产生飘字。时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export const W = 480
export const H = 600
export const HUD_H = 30

/** 重力加速度，px/s^2。 */
export const GRAVITY = 640
/** 回合时长 ms。 */
export const ROUND_MS = 60_000
/** 初始生命（漏接直接扣 1 命，故给 5 条）。 */
export const START_LIVES = 5
/** 连击窗口 ms：窗口内再切则连击 +1。 */
export const COMBO_WINDOW_MS = 900
/** 连击加成上限（封顶后每刀固定加成）。 */
export const COMBO_CAP = 8
/** 轨迹保留时长 ms。 */
export const TRAIL_MS = 120
/** 轨迹点数上限（超出丢最旧）。 */
export const TRAIL_MAX = 24
/** 切到炸弹的扣分。 */
export const BOMB_PENALTY = 50
/** 炸弹爆炸红闪时长 ms。 */
export const FLASH_MS = 300
/** 半块水果最长存活 ms。 */
export const HALF_LIFE_MS = 900
/** 每 100 分升一级。 */
export const SCORE_PER_LEVEL = 100
/** 同种连击奖励比例：同刀 ≥2 个同种水果时，每个按种类分值 ×0.5 加奖。 */
export const SAME_KIND_BONUS_RATE = 0.5
/** 一刀多切上浮比例：切开 N 个时整刀得分 ×(1 + 0.1×(N-1))。 */
export const MULTI_CUT_RATE = 0.1
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 900
/** 炸弹链出现的最低关卡。 */
export const BOMB_CHAIN_MIN_LEVEL = 4

/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 水果种类表：名称 / 主色 / 半块内色 / 半径 px / 分值。索引即 kind。
 * 越小的水果分值越高（西瓜 +5、苹果/橙子/桃子 +10、柠檬/葡萄/草莓 +15、猕猴桃 +20）。
 */
export const FRUIT_KINDS = [
  { name: '西瓜', color: '#3caa5f', inner: '#f26d7d', r: 30, score: 5 },
  { name: '苹果', color: '#e5484d', inner: '#ffd9d0', r: 20, score: 10 },
  { name: '橙子', color: '#ff9330', inner: '#ffc98a', r: 18, score: 10 },
  { name: '桃子', color: '#ffb0c4', inner: '#ffe3d0', r: 22, score: 10 },
  { name: '柠檬', color: '#ffd23f', inner: '#fff0a8', r: 15, score: 15 },
  { name: '葡萄', color: '#8f6fd3', inner: '#d9c6ff', r: 17, score: 15 },
  { name: '草莓', color: '#e5486f', inner: '#ffe0e6', r: 12, score: 15 },
  { name: '猕猴桃', color: '#8a9b3d', inner: '#c7e08a', r: 14, score: 20 },
] as const

/** 一个在空中的水果或炸弹。 */
export interface Fruit {
  kind: number
  x: number, y: number, vx: number, vy: number
  r: number
  bomb: boolean
}

/** 切开后飞散的半块水果。 */
export interface Half {
  kind: number
  x: number, y: number, vx: number, vy: number
  r: number
  rot: number, vrot: number
  life: number
  /** 1 = 右半 / -1 = 左半，决定飞散方向与绘制相位。 */
  side: 1 | -1
}

/** 刀光轨迹点；t 为回合内毫秒钟。 */
export interface TrailPoint { x: number, y: number, t: number }

/** 单步内产生、供渲染层消费的可视事件。 */
export type SlashEvent =
  | { type: 'slice', x: number, y: number, kind: number }
  | { type: 'bomb', x: number, y: number }

/** 上浮渐隐的飘字（同种连击 / 一刀多切提示）。 */
export interface FloatText {
  x: number, y: number
  text: string
  life: number
}

/** 一次挥刀（pointerdown→up）期间累计的切果记录。 */
export interface SwipeCut { kind: number, x: number, y: number }

/** settleSwipe 的结算结果（纯数据，便于测试）。 */
export interface SwipeSettle {
  /** 本刀切果总数。 */
  cuts: number
  /** 切果时已立即入账的基础分（含连击加成）。 */
  base: number
  /** 同种连击奖励分。 */
  sameKindBonus: number
  /** 一刀多切上浮奖励分（乘数带来的增量）。 */
  multiBonus: number
  /** 本刀最终总收益 = base + sameKindBonus + multiBonus。 */
  total: number
}

/** 一局游戏的完整可测状态。 */
export interface FruitSlashState {
  /** 回合内已流逝 ms。 */
  t: number
  timeLeft: number
  score: number
  lives: number
  missed: number
  combo: number
  /** 连击失效时刻 ms（回合钟）。 */
  comboExpire: number
  fruits: Fruit[]
  halves: Half[]
  trail: TrailPoint[]
  events: SlashEvent[]
  floats: FloatText[]
  rng: () => number
  /** 下一波抛出的时刻 ms。 */
  nextWaveAt: number
  /** 炸弹红闪剩余 ms。 */
  flashMs: number
  /** 当前是否处于一次挥刀中。 */
  swiping: boolean
  /** 本次挥刀已切开的水果记录。 */
  swipeCuts: SwipeCut[]
  /** 本次挥刀已立即入账的基础分。 */
  swipeBase: number
  over: boolean
}

/**
 * 当前难度关卡：随分数线性提升。
 * @param score - 当前累计分。
 * @returns 从 1 开始的关卡号。
 */
export function levelOf(score: number): number {
  return 1 + Math.floor(Math.max(0, score) / SCORE_PER_LEVEL)
}

/**
 * 波次间隔 ms：1 级 1500ms，每级 -160ms，下限 420ms（比旧版更密）。
 * @param level - 当前关卡。
 * @returns 相邻两波抛出的间隔毫秒。
 */
export function waveInterval(level: number): number {
  return Math.max(420, 1500 - (level - 1) * 160)
}

/**
 * 新抛出物体是炸弹的概率：1 级 15%，每级 +2%，封顶 30%。
 * @param level - 当前关卡。
 * @returns 该关卡单个物体为炸弹的概率。
 */
export function bombChance(level: number): number {
  return Math.min(0.30, 0.15 + (level - 1) * 0.02)
}

/**
 * 炸弹链触发概率：4 级起从 0 升到封顶 25%，触发时一屏额外连抛多颗炸弹。
 * @param level - 当前关卡。
 * @returns 该关卡一波触发炸弹链的概率。
 */
export function bombChainChance(level: number): number {
  if (level < BOMB_CHAIN_MIN_LEVEL) return 0
  return Math.min(0.25, (level - BOMB_CHAIN_MIN_LEVEL + 1) * 0.03)
}

/**
 * 抛出波生成：数量与初速随关卡更激进；高关卡可能追加"炸弹链"。
 * @param state - 目标状态（使用其 rng）。
 * @param level - 当前关卡（决定数量、初速与炸弹概率）。
 */
function spawnWave(state: FruitSlashState, level: number): void {
  const rng = state.rng
  const bombP = bombChance(level)
  const maxCount = Math.min(7, 1 + Math.floor(level * 0.75))
  const count = 1 + Math.floor(rng() * maxCount)
  for (let i = 0; i < count; i += 1) {
    const bomb = rng() < bombP
    const kind = bomb ? 0 : Math.floor(rng() * FRUIT_KINDS.length)
    const r = bomb ? 16 : FRUIT_KINDS[kind]!.r
    const x = 40 + rng() * (W - 80)
    // 水平速度偏向画布中线，避免贴边直上直下。
    const vx = ((W / 2 - x) / (W / 2)) * (60 + rng() * 80) + (rng() - 0.5) * 60
    const vy = -(500 + rng() * 180 + (level - 1) * 30)
    state.fruits.push({ kind, x, y: H + r + i * 14, vx, vy, r, bomb })
  }
  // 炸弹链：高关卡一波内额外连抛 2~3 颗炸弹。
  if (rng() < bombChainChance(level)) {
    const chain = 2 + Math.floor(rng() * 2)
    for (let i = 0; i < chain; i += 1) {
      const x = 40 + rng() * (W - 80)
      const vx = ((W / 2 - x) / (W / 2)) * (60 + rng() * 80)
      const vy = -(540 + rng() * 160 + (level - 1) * 30)
      state.fruits.push({ kind: 0, x, y: H + 16 + i * 18, vx, vy, r: 16, bomb: true })
    }
  }
}

/**
 * 线段 (x1,y1)-(x2,y2) 与圆 (cx,cy,r) 是否相交。
 */
function segHitsCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let tt = 0
  if (len2 > 0) tt = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2))
  const px = x1 + dx * tt - cx
  const py = y1 + dy * tt - cy
  return px * px + py * py <= r * r
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createFruitSlash(seed: number, round = 1): FruitSlashState {
  return {
    t: 0,
    timeLeft: ROUND_MS,
    score: 0,
    lives: START_LIVES,
    missed: 0,
    combo: 0,
    comboExpire: 0,
    fruits: [],
    halves: [],
    trail: [],
    events: [],
    floats: [],
    rng: mulberry32((Math.floor(seed) * 31 + round) >>> 0),
    nextWaveAt: 400,
    flashMs: 0,
    swiping: false,
    swipeCuts: [],
    swipeBase: 0,
    over: false,
  }
}

/** 清空当前挥刀的累计记录（新挥刀开始或炸弹炸断当前挥刀时）。 */
function resetSwipe(state: FruitSlashState): void {
  state.swiping = false
  state.swipeCuts.length = 0
  state.swipeBase = 0
}

/**
 * 开始一次挥刀（pointerdown 时调用）：丢弃上一刀残留并开始累计。
 * @param state - 目标状态。
 */
export function beginSwipe(state: FruitSlashState): void {
  resetSwipe(state)
  state.swiping = true
}

/**
 * 结算一次挥刀（pointerup 时调用）的奖励，纯函数：
 * 切果基础分在切开瞬间已入账，这里补算同种连击奖励与多切上浮，
 * 把增量加进 score、生成飘字并清空挥刀累计。
 * @param state - 目标状态（就地更新 score / floats / 挥刀字段）。
 * @returns 本刀的统计与奖励明细。
 */
export function settleSwipe(state: FruitSlashState): SwipeSettle {
  const cuts = state.swipeCuts
  const n = cuts.length
  const base = state.swipeBase
  let sameKindBonus = 0
  // 同种计数：kind → 个数与首个位置。
  const byKind = new Map<number, { count: number, x: number, y: number }>()
  for (const c of cuts) {
    const e = byKind.get(c.kind)
    if (e === undefined) byKind.set(c.kind, { count: 1, x: c.x, y: c.y })
    else e.count += 1
  }
  for (const [kind, e] of byKind) {
    if (e.count >= 2) {
      sameKindBonus += Math.round(e.count * FRUIT_KINDS[kind]!.score * SAME_KIND_BONUS_RATE)
      state.floats.push({ x: e.x, y: e.y, text: '同种连击!', life: FLOAT_MS })
    }
  }
  // 一刀多切：整刀收益 ×(1 + 0.1×(N-1))，N<2 时无上浮。
  const gross = base + sameKindBonus
  const total = n >= 2 ? Math.round(gross * (1 + MULTI_CUT_RATE * (n - 1))) : gross
  const multiBonus = total - gross
  if (n >= 3) {
    const cx = cuts.reduce((s, c) => s + c.x, 0) / n
    const cy = cuts.reduce((s, c) => s + c.y, 0) / n
    state.floats.push({ x: cx, y: cy, text: '一刀 ' + n + ' 切!', life: FLOAT_MS })
  }
  state.score += sameKindBonus + multiBonus
  const result: SwipeSettle = { cuts: n, base, sameKindBonus, multiBonus, total }
  resetSwipe(state)
  return result
}

/**
 * 指针按下 / 移动时记录刀光轨迹点。
 * @param state - 目标状态。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export function pushTrail(state: FruitSlashState, x: number, y: number): void {
  const last = state.trail[state.trail.length - 1]
  if (last !== undefined && last.x === x && last.y === y) return
  state.trail.push({ x, y, t: state.t })
  while (state.trail.length > TRAIL_MAX || (state.trail.length > 0 && state.t - state.trail[0]!.t > TRAIL_MS)) {
    state.trail.shift()
  }
}

/**
 * 推进一帧：计时、成波抛出、物理、轨迹切割判定、漏接、飘字与结算。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepFruitSlash(state: FruitSlashState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  const dt = dtMs / 1000
  state.t += dtMs
  state.timeLeft = Math.max(0, state.timeLeft - dtMs)
  if (state.flashMs > 0) state.flashMs = Math.max(0, state.flashMs - dtMs)
  if (state.timeLeft <= 0) { state.over = true; return }

  const level = levelOf(state.score)
  while (state.t >= state.nextWaveAt) {
    spawnWave(state, level)
    state.nextWaveAt += waveInterval(level)
  }

  // 轨迹老化。
  while (state.trail.length > 0 && state.t - state.trail[0]!.t > TRAIL_MS) state.trail.shift()

  // 水果物理 + 底部漏接。
  for (let i = state.fruits.length - 1; i >= 0; i -= 1) {
    const f = state.fruits[i]!
    f.vy += GRAVITY * dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    if (f.vy > 0 && f.y - f.r > H + 8) {
      state.fruits.splice(i, 1)
      if (!f.bomb) {
        // 漏接直接扣 1 命（missed 只作 HUD 计数）。
        state.missed += 1
        state.lives -= 1
        if (state.lives <= 0) { state.lives = 0; state.over = true; return }
      }
    }
  }

  // 轨迹切割：任一新鲜线段碰到的第一个物体先结算。
  if (state.trail.length >= 2) {
    for (let i = state.fruits.length - 1; i >= 0; i -= 1) {
      const f = state.fruits[i]!
      let hit = false
      for (let j = 1; j < state.trail.length && !hit; j += 1) {
        const a = state.trail[j - 1]!
        const b = state.trail[j]!
        // 静止指针不产生刀光：线段要有最小位移。
        if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) < 3) continue
        hit = segHitsCircle(a.x, a.y, b.x, b.y, f.x, f.y, f.r + 2)
      }
      if (!hit) continue
      if (f.bomb) {
        state.lives -= 1
        state.score = Math.max(0, state.score - BOMB_PENALTY)
        state.flashMs = FLASH_MS
        state.events.push({ type: 'bomb', x: f.x, y: f.y })
        state.fruits.length = 0
        state.halves.length = 0
        state.trail.length = 0
        state.combo = 0
        resetSwipe(state)
        if (state.lives <= 0) { state.lives = 0; state.over = true; return }
        break
      }
      const kindScore = FRUIT_KINDS[f.kind]!.score
      state.combo = state.comboExpire > state.t ? Math.min(COMBO_CAP, state.combo + 1) : 1
      state.comboExpire = state.t + COMBO_WINDOW_MS
      const gained = kindScore + (state.combo - 1) * 5
      state.score += gained
      state.events.push({ type: 'slice', x: f.x, y: f.y, kind: f.kind })
      if (state.swiping) {
        state.swipeCuts.push({ kind: f.kind, x: f.x, y: f.y })
        state.swipeBase += gained
      }
      const spd = 120 + state.rng() * 80
      const dir = f.vx >= 0 ? 1 : -1
      for (const side of [1, -1] as const) {
        state.halves.push({
          kind: f.kind,
          x: f.x, y: f.y,
          vx: f.vx + dir * side * spd,
          vy: f.vy - 60 + side * 40,
          r: f.r,
          rot: 0,
          vrot: dir * side * (3 + state.rng() * 3),
          life: HALF_LIFE_MS,
          side,
        })
      }
      state.fruits.splice(i, 1)
    }
  }

  // 半块飞散。
  for (let i = state.halves.length - 1; i >= 0; i -= 1) {
    const h = state.halves[i]!
    h.vy += GRAVITY * dt
    h.x += h.vx * dt
    h.y += h.vy * dt
    h.rot += h.vrot * dt
    h.life -= dtMs
    if (h.life <= 0 || h.y - h.r > H + 40) state.halves.splice(i, 1)
  }

  // 飘字上浮渐隐。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 36 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }
}
