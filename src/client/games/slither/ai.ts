/**
 * 贪吃蛇大作战 AI：纯函数式单蛇决策（采样式转向，不做整树搜索）。
 * 对每个到期的 AI 蛇，在当前朝向附近采样 9 个候选方向，逐方向沿射线
 * 估算危险（蛇身段密度）、世界边界惩罚与目标增益（光点 / 围堵截击点），
 * 按性格权重合成得分取最优。单次决策的计算量固定（9 方向 x 5 采样点
 * 的危险查询 + 一次光点/猎物线性扫描），配合 logic.ts 的每 tick 决策
 * 条数限额实现分帧，不会卡帧。所有随机取自 state.rng，确定性可重放。
 */
import type { Personality, SlitherSnake, SlitherState } from './logic.ts'

/** 一条 AI 的决策结果。 */
export interface AiDecision {
  /** 期望朝向（弧度）。 */
  angle: number
  /** 是否想加速（长度不足时 logic 层会忽略）。 */
  boost: boolean
}

/** logic 层注入的感知上下文（世界常数 + 危险场采样），避免模块环依赖。 */
export interface AiContext {
  worldR: number
  cx: number
  cy: number
  baseSpeed: number
  /** (x,y) 附近 42px 内的蛇身段数量（危险度）。 */
  danger(x: number, y: number): number
}

/** 三档性格的评分权重：抢点 / 避险 / 围猎。 */
const WEIGHTS: Record<Personality, { food: number; danger: number; hunt: number }> = {
  grazer: { food: 1.0, danger: 1.2, hunt: 0 },
  hunter: { food: 0.5, danger: 1.0, hunt: 1.0 },
  guardian: { food: 0.7, danger: 2.2, hunt: 0.2 },
}

/** 相对当前朝向的候选偏移（弧度）。 */
const OFFSETS: readonly number[] = [-1.5, -1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0, 1.5]
/** 危险射线采样距离（px）。 */
const RAY_DISTS: readonly number[] = [60, 120, 180, 240, 300]
/** 目标（光点 / 猎物）搜索半径（px）。 */
const GOAL_RANGE = 700
/** 围堵加速的距离 / 长度门槛。 */
const HUNT_BOOST_DIST = 340
const HUNT_BOOST_LENGTH = 40

/**
 * 估算一条蛇的当前速度（AI 无法读对方的 boosting 细节，按常速近似）。
 * @param s - 目标蛇。
 * @returns 近似速度 px/s。
 */
function speedEstimate(s: SlitherSnake): number {
  return s.boosting ? 300 : 165
}

/**
 * 选猎物：最近的可压制蛇（长度 < 自身 x0.92，含玩家）。
 * @param state - 目标状态。
 * @param self - 决策蛇。
 * @returns 猎物，或 null。
 */
function pickPrey(state: SlitherState, self: SlitherSnake): SlitherSnake | null {
  let best: SlitherSnake | null = null
  let bestD = Infinity
  for (const o of state.snakes) {
    if (o === self || !o.alive || o.length >= self.length * 0.92) continue
    const d = Math.hypot(o.x - self.x, o.y - self.y)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/**
 * 选最有价值的光点（价值 / 距离）。
 * @param state - 目标状态。
 * @param self - 决策蛇。
 * @returns 光点坐标，或 null。
 */
function pickFood(state: SlitherState, self: SlitherSnake): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  let bestScore = 0
  for (const f of state.foods) {
    const d = Math.hypot(f.x - self.x, f.y - self.y)
    if (d > GOAL_RANGE) continue
    const score = f.value / (70 + d)
    if (score > bestScore) {
      bestScore = score
      best = { x: f.x, y: f.y }
    }
  }
  return best
}

/**
 * 单蛇决策：采样候选方向并按性格加权评分。
 * @param state - 目标状态（读 rng / 其它蛇 / 光点）。
 * @param snake - 决策蛇。
 * @param ctx - 感知上下文。
 * @returns 最优期望朝向与是否加速。
 */
export function decideAi(state: SlitherState, snake: SlitherSnake, ctx: AiContext): AiDecision {
  const w = WEIGHTS[snake.personality]
  let goal: { x: number; y: number } | null = null
  let boost = false
  const prey = w.hunt > 0 ? pickPrey(state, snake) : null
  if (prey !== null) {
    // 围堵截击点：瞄准猎物头前方约 0.55s 的位置。
    const lead = speedEstimate(prey) * 0.55
    goal = { x: prey.x + Math.cos(prey.angle) * lead, y: prey.y + Math.sin(prey.angle) * lead }
    if (Math.hypot(prey.x - snake.x, prey.y - snake.y) < HUNT_BOOST_DIST && snake.length > HUNT_BOOST_LENGTH) boost = true
  }
  if (goal === null || w.hunt === 0) {
    const food = pickFood(state, snake)
    if (food !== null) goal = food
  }
  if (goal === null) goal = { x: snake.x + Math.cos(snake.angle) * 500, y: snake.y + Math.sin(snake.angle) * 500 }
  const goalAngle = Math.atan2(goal.y - snake.y, goal.x - snake.x)
  const edge = ctx.worldR - 120

  let bestAngle = snake.targetAngle
  let bestScore = -Infinity
  for (const off of OFFSETS) {
    const cand = snake.angle + off
    let score = 0
    for (const d of RAY_DISTS) {
      const px = snake.x + Math.cos(cand) * d
      const py = snake.y + Math.sin(cand) * d
      const dg = ctx.danger(px, py)
      if (dg > 0) score -= w.danger * dg * (1 - d / 360)
      const dc = Math.hypot(px - ctx.cx, py - ctx.cy)
      if (dc > edge) score -= w.danger * 6 * ((dc - edge) / 120)
    }
    let diff = cand - goalAngle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const goalWeight = prey !== null ? w.hunt : w.food
    score += Math.cos(diff) * goalWeight * 2
    score += state.rng() * 0.05
    if (score > bestScore) {
      bestScore = score
      bestAngle = cand
    }
  }
  return { angle: bestAngle, boost }
}
