/**
 * 切水果（Fruit Slash）纯逻辑：60 秒一回合，水果从底部按抛物线成波抛出
 * （重力恒定，初速度由 mulberry32(seed, round) 确定性生成，约 15% 是炸弹）。
 * 指针按住划动产生刀光轨迹，最近约 120ms 的轨迹线段扫到水果即切开：
 * +10 分并有连击加成；切到炸弹 -1 命、清屏并扣分；水果落出底部未切计一次
 * missed，missed 满 3 次再 -1 命。分数越高关卡越高，波次更密、上抛更快。
 * 全部状态可测：时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export const W = 480
export const H = 600
export const HUD_H = 30

/** 重力加速度，px/s^2。 */
export const GRAVITY = 640
/** 回合时长 ms。 */
export const ROUND_MS = 60_000
/** 初始生命。 */
export const START_LIVES = 3
/** 漏接多少次扣一条命。 */
export const MISS_LIMIT = 3
/** 新抛出物体是炸弹的概率。 */
export const BOMB_CHANCE = 0.15
/** 切开一个水果的基础分。 */
export const SLICE_SCORE = 10
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

/** 水果种类表：主色 / 半块内色 / 半径 px。索引即 kind。 */
export const FRUIT_KINDS = [
  { color: '#e5484d', inner: '#ffd9d0', r: 20 }, // 苹果
  { color: '#ff9330', inner: '#ffc98a', r: 18 }, // 橙子
  { color: '#ffd23f', inner: '#fff0a8', r: 15 }, // 柠檬
  { color: '#3caa5f', inner: '#f26d7d', r: 26 }, // 西瓜
  { color: '#8f6fd3', inner: '#d9c6ff', r: 17 }, // 葡萄
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
  rng: () => number
  /** 下一波抛出的时刻 ms。 */
  nextWaveAt: number
  /** 炸弹红闪剩余 ms。 */
  flashMs: number
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
 * 波次间隔 ms：1 级 1700ms，每级 -130ms，下限 550ms。
 * @param level - 当前关卡。
 * @returns 相邻两波抛出的间隔毫秒。
 */
export function waveInterval(level: number): number {
  return Math.max(550, 1700 - (level - 1) * 130)
}

/**
 * 抛出波生成：count 个物体依次从底部弹出。
 * @param state - 目标状态（使用其 rng）。
 * @param level - 当前关卡（决定数量与初速）。
 */
function spawnWave(state: FruitSlashState, level: number): void {
  const rng = state.rng
  const maxCount = Math.min(4, 1 + Math.floor(level / 2))
  const count = 1 + Math.floor(rng() * maxCount)
  for (let i = 0; i < count; i += 1) {
    const bomb = rng() < BOMB_CHANCE
    const kind = bomb ? 0 : Math.floor(rng() * FRUIT_KINDS.length)
    const r = bomb ? 16 : FRUIT_KINDS[kind]!.r
    const x = 40 + rng() * (W - 80)
    // 水平速度偏向画布中线，避免贴边直上直下。
    const vx = ((W / 2 - x) / (W / 2)) * (60 + rng() * 80) + (rng() - 0.5) * 60
    const vy = -(500 + rng() * 180 + (level - 1) * 22)
    state.fruits.push({ kind, x, y: H + r + i * 14, vx, vy, r, bomb })
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
    rng: mulberry32((Math.floor(seed) * 31 + round) >>> 0),
    nextWaveAt: 400,
    flashMs: 0,
    over: false,
  }
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
 * 推进一帧：计时、成波抛出、物理、轨迹切割判定、漏接与结算。
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
        state.missed += 1
        if (state.missed >= MISS_LIMIT) {
          state.missed = 0
          state.lives -= 1
          if (state.lives <= 0) { state.lives = 0; state.over = true; return }
        }
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
        if (state.lives <= 0) { state.lives = 0; state.over = true; return }
        break
      }
      state.combo = state.comboExpire > state.t ? Math.min(COMBO_CAP, state.combo + 1) : 1
      state.comboExpire = state.t + COMBO_WINDOW_MS
      state.score += SLICE_SCORE + (state.combo - 1) * 5
      state.events.push({ type: 'slice', x: f.x, y: f.y, kind: f.kind })
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
}
