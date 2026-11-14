/**
 * 磁极迷宫（Magnet）纯逻辑：钢球携带与活动磁铁相同的极性，同时受
 * 场上所有磁铁的磁力（平方反比，同性相斥异性相吸）与摩擦力作用；
 * 空格翻转活动磁铁极性会同步翻转钢球极性，因此所有固定磁铁的
 * 吸引 / 排斥关系全局反转——全场唯一操作，效果取决于布局。把钢球
 * 引进终点槽过关，碰到尖刺损失一命重来。5 个手工关卡磁铁数 2→5
 * 递进，固定子步确定性物理（合力积分、速度上限、边界反弹）。全部
 * 函数确定性可测，时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸。 */
export const W = 480
export const H = 600

/** 钢球半径 px。 */
export const BALL_R = 7
/** 磁力计算的最小距离平方 px^2（近场限幅，避免奇点爆炸）。 */
export const MIN_D2 = 1600
/** 速度上限 px/s。 */
export const MAX_SPEED = 440
/** 指数摩擦系数（每秒速度衰减率）。 */
export const FRICTION = 0.3
/** 边界反弹恢复系数。 */
export const WALL_BOUNCE = 0.55
/** 每帧固定物理子步数（确定性积分）。 */
export const SUBSTEPS = 4
/** 初始生命。 */
export const START_LIVES = 3
/** 尖刺失败展示 ms。 */
export const DEAD_MS = 1200
/** 过关展示 ms。 */
export const WON_MS = 1500
/** 磁铁视觉半径 px。 */
export const MAGNET_R = 13
/** 手工关卡总数。 */
export const LEVEL_COUNT = 5

/** 磁极：N（红）/ S（蓝）。 */
export type Polarity = 'N' | 'S'

/** 一块磁铁：位置、强度与极性。 */
export interface MagnetDef {
  x: number
  y: number
  /** 磁力强度（加速度比例系数，px^3/s^2）。 */
  strength: number
  polarity: Polarity
}

/** 一枚尖刺：圆形判定区。 */
export interface SpikeDef {
  x: number
  y: number
  r: number
}

/** 终点槽：圆形捕获区。 */
export interface GoalDef {
  x: number
  y: number
  r: number
}

/** 一关的手工布局：活动磁铁 + 固定磁铁 + 尖刺 + 终点 + 出生点。 */
export interface MagnetLevel {
  /** 活动磁铁（玩家可翻转其极性；渲染层高亮）。 */
  player: MagnetDef
  fixed: MagnetDef[]
  spikes: SpikeDef[]
  goal: GoalDef
  start: { x: number, y: number }
}

/**
 * 5 个手工关卡：磁铁总数 2→5（活动 1 + 固定 1..4）递进。固定磁铁
 * 沿通关路线交替极性排布——靠近当前吸引自己的磁铁时翻转极性即可
 * 把自己弹射向下一段；活动磁铁恒为斥力支点，位置塑造弹道。每关
 * 均可由「贴近吸引磁铁即翻转」策略在有限时间内解出。
 */
export const MAGNET_LEVELS: MagnetLevel[] = [
  // L1（2 块）：单段弹射。
  {
    player: { x: 240, y: 540, strength: 2.5e6, polarity: 'N' },
    fixed: [
      { x: 160, y: 320, strength: 8e6, polarity: 'S' },
    ],
    spikes: [],
    goal: { x: 436, y: 320, r: 24 },
    start: { x: 40, y: 320 },
  },
  // L2（3 块）：两段折线 + 中央尖刺。
  {
    player: { x: 240, y: 160, strength: 2.5e6, polarity: 'N' },
    fixed: [
      { x: 150, y: 470, strength: 8e6, polarity: 'S' },
      { x: 330, y: 420, strength: 8e6, polarity: 'N' },
    ],
    spikes: [
      { x: 240, y: 300, r: 12 },
    ],
    goal: { x: 436, y: 470, r: 22 },
    start: { x: 40, y: 520 },
  },
  // L3（4 块）：之字形爬升 + 双尖刺。
  {
    player: { x: 120, y: 300, strength: 2.5e6, polarity: 'N' },
    fixed: [
      { x: 150, y: 500, strength: 8e6, polarity: 'S' },
      { x: 330, y: 440, strength: 8e6, polarity: 'N' },
      { x: 420, y: 250, strength: 8e6, polarity: 'S' },
    ],
    spikes: [
      { x: 240, y: 560, r: 12 },
      { x: 200, y: 180, r: 12 },
    ],
    goal: { x: 320, y: 45, r: 30 },
    start: { x: 40, y: 560 },
  },
  // L4（5 块）：中央斥力支点绕行 + 双尖刺。
  {
    player: { x: 240, y: 300, strength: 5e6, polarity: 'N' },
    fixed: [
      { x: 120, y: 480, strength: 7.5e6, polarity: 'S' },
      { x: 360, y: 440, strength: 7.5e6, polarity: 'N' },
      { x: 400, y: 180, strength: 7.5e6, polarity: 'S' },
      { x: 150, y: 150, strength: 7.5e6, polarity: 'N' },
    ],
    spikes: [
      { x: 240, y: 140, r: 11 },
      { x: 240, y: 460, r: 11 },
    ],
    goal: { x: 240, y: 70, r: 20 },
    start: { x: 40, y: 540 },
  },
  // L5（6 块）：长链绕场一周 + 双尖刺。
  {
    player: { x: 240, y: 330, strength: 3.5e6, polarity: 'N' },
    fixed: [
      { x: 200, y: 120, strength: 7e6, polarity: 'S' },
      { x: 380, y: 200, strength: 7e6, polarity: 'N' },
      { x: 420, y: 420, strength: 7e6, polarity: 'S' },
      { x: 300, y: 540, strength: 7e6, polarity: 'N' },
    ],
    spikes: [
      { x: 150, y: 330, r: 11 },
      { x: 330, y: 330, r: 11 },
    ],
    goal: { x: 90, y: 540, r: 20 },
    start: { x: 40, y: 60 },
  },
]

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
 * 取第 level 关的布局定义。
 * @param level - 关卡号（从 1 起）。
 * @returns 关卡布局。
 */
export function levelAt(level: number): MagnetLevel {
  return MAGNET_LEVELS[Math.min(MAGNET_LEVELS.length, Math.max(1, level)) - 1]!
}

/**
 * 计算某点处钢球受到的磁场合力（平方反比 + 同性相斥异性相吸）。
 * 活动磁铁的极性取当前 polarity 参数（钢球与活动磁铁同极，故其对
 * 钢球恒为斥力，位置构成固定斥力支点）。
 * @param level - 关卡布局。
 * @param x - 钢球横坐标。
 * @param y - 钢球纵坐标。
 * @param polarity - 钢球（= 活动磁铁）当前极性。
 * @returns 合力加速度向量 px/s^2。
 */
export function forceAt(level: MagnetLevel, x: number, y: number, polarity: Polarity): { fx: number, fy: number } {
  let fx = 0
  let fy = 0
  const consider = (mx: number, my: number, strength: number, mpol: Polarity): void => {
    const dx = x - mx
    const dy = y - my
    const d = Math.hypot(dx, dy)
    // 近场限幅：40px 内力大小封顶为 strength / MIN_D2，方向仍取真实方向。
    const dd = Math.max(d, Math.sqrt(MIN_D2))
    const mag = strength / (dd * dd)
    if (d < 1e-6) return
    // pull = -1：异性相吸（力指向磁铁）；+1：同性相斥（力背离磁铁）。
    const pull = mpol === polarity ? 1 : -1
    fx += pull * mag * dx / d
    fy += pull * mag * dy / d
  }
  for (const m of level.fixed) consider(m.x, m.y, m.strength, m.polarity)
  consider(level.player.x, level.player.y, level.player.strength, polarity)
  return { fx, fy }
}

/** 阶段：飞行 / 撞刺展示 / 过关展示 / 全关通关 / 命尽结束。 */
export type MagnetPhase = 'flying' | 'dead' | 'won' | 'cleared' | 'gameover'

/** 单步内产生、供渲染层消费的可视事件。 */
export type MagnetEvent =
  | { type: 'flip', x: number, y: number }
  | { type: 'dead', x: number, y: number }
  | { type: 'won', x: number, y: number, points: number }
  | { type: 'cleared', points: number }

/** 一局游戏的完整可测状态。 */
export interface MagnetState {
  /** 回合内已流逝 ms（渲染动画用）。 */
  t: number
  seed: number
  /** 关卡号（从 1 起）。 */
  level: number
  score: number
  lives: number
  /** 钢球位置 / 速度。 */
  x: number
  y: number
  vx: number
  vy: number
  /** 钢球（= 活动磁铁）当前极性。 */
  polarity: Polarity
  phase: MagnetPhase
  /** 阶段停留剩余 ms。 */
  phaseMs: number
  /** 过关结算展示分（HUD 用）。 */
  lastPoints: number
  /** 翻转动画剩余 ms（>0 时活动磁铁高亮脉冲）。 */
  flipFlash: number
  events: MagnetEvent[]
}

/**
 * 重置钢球到当前关出生点（seed+level+lives 确定性微扰初速）。
 * @param state - 目标状态。
 */
function spawnBall(state: MagnetState): void {
  const level = levelAt(state.level)
  const rng = mulberry32((state.seed * 7 + state.level * 101 + state.lives * 13) >>> 0)
  state.x = level.start.x
  state.y = level.start.y
  state.vx = (rng() - 0.5) * 20
  state.vy = 0
}

/**
 * 新开一局（level 1，极性 N，命回满）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createMagnet(seed: number): MagnetState {
  const state: MagnetState = {
    t: 0,
    seed,
    level: 1,
    score: 0,
    lives: START_LIVES,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    polarity: 'N',
    phase: 'flying',
    phaseMs: 0,
    lastPoints: 0,
    flipFlash: 0,
    events: [],
  }
  spawnBall(state)
  return state
}

/**
 * 翻转活动磁铁（与钢球）极性；仅飞行阶段有效。
 * @param state - 目标状态。
 */
export function flipPolarity(state: MagnetState): void {
  if (state.phase !== 'flying') return
  state.polarity = state.polarity === 'N' ? 'S' : 'N'
  state.flipFlash = 320
  state.events.push({ type: 'flip', x: state.x, y: state.y })
}

/**
 * 推进一帧：固定 SUBSTEPS 子步积分（磁力合力 → 摩擦 → 速度上限 →
 * 位移 → 边界反弹），尖刺 / 终点判定，阶段停留与过关 / 重生切换。
 * 事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepMagnet(state: MagnetState, dtMs: number): void {
  state.events.length = 0
  state.t += dtMs
  if (state.flipFlash > 0) state.flipFlash = Math.max(0, state.flipFlash - dtMs)

  // 阶段停留：撞刺 → 同关重生；过关 → 下一关或通关结算。
  if (state.phase !== 'flying') {
    if (state.phase === 'dead' || state.phase === 'won') {
      state.phaseMs -= dtMs
      if (state.phaseMs <= 0) {
        if (state.phase === 'dead') {
          state.phase = 'flying'
          state.phaseMs = 0
          spawnBall(state)
        } else {
          state.level += 1
          if (state.level > LEVEL_COUNT) {
            state.phase = 'cleared'
            state.phaseMs = 0
            state.events.push({ type: 'cleared', points: state.score })
          } else {
            state.phase = 'flying'
            state.phaseMs = 0
            spawnBall(state)
          }
        }
      }
    }
    return
  }

  const level = levelAt(state.level)
  const dt = dtMs / 1000
  const sdt = dt / SUBSTEPS
  const damp = Math.exp(-FRICTION * sdt)
  for (let sub = 0; sub < SUBSTEPS; sub += 1) {
    // 磁力合力积分。
    const f = forceAt(level, state.x, state.y, state.polarity)
    state.vx += f.fx * sdt
    state.vy += f.fy * sdt
    // 摩擦与速度上限。
    state.vx *= damp
    state.vy *= damp
    const speed = Math.hypot(state.vx, state.vy)
    if (speed > MAX_SPEED) {
      const k = MAX_SPEED / speed
      state.vx *= k
      state.vy *= k
    }
    state.x += state.vx * sdt
    state.y += state.vy * sdt

    // 边界反弹。
    if (state.x < BALL_R) {
      state.x = BALL_R
      state.vx = Math.abs(state.vx) * WALL_BOUNCE
    } else if (state.x > W - BALL_R) {
      state.x = W - BALL_R
      state.vx = -Math.abs(state.vx) * WALL_BOUNCE
    }
    if (state.y < BALL_R) {
      state.y = BALL_R
      state.vy = Math.abs(state.vy) * WALL_BOUNCE
    } else if (state.y > H - BALL_R) {
      state.y = H - BALL_R
      state.vy = -Math.abs(state.vy) * WALL_BOUNCE
    }

    // 尖刺判定：失败，扣命重生或结束。
    for (const sp of level.spikes) {
      const dx = state.x - sp.x
      const dy = state.y - sp.y
      if (dx * dx + dy * dy < (sp.r + BALL_R) * (sp.r + BALL_R)) {
        state.lives -= 1
        state.phase = state.lives <= 0 ? 'gameover' : 'dead'
        state.phaseMs = DEAD_MS
        state.vx = 0
        state.vy = 0
        state.events.push({ type: 'dead', x: state.x, y: state.y })
        return
      }
    }

    // 终点判定：捕获入槽过关。
    const gx = state.x - level.goal.x
    const gy = state.y - level.goal.y
    if (gx * gx + gy * gy < level.goal.r * level.goal.r) {
      const points = 120 * state.level
      state.score += points
      state.lastPoints = points
      state.phase = 'won'
      state.phaseMs = WON_MS
      state.vx = 0
      state.vy = 0
      state.events.push({ type: 'won', x: state.x, y: state.y, points })
      return
    }
  }
}
