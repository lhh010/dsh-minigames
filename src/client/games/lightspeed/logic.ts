/**
 * 「光速穿梭 Lightspeed」纯逻辑：确定性种子关卡生成 + 固定步长物理。
 *
 * 物理模型：光子以标量速度沿 heading 前进；玩家转向直接旋转 heading；
 * 引力井加速度分解为沿航向分量（改变速度）与垂直航向分量（改变航向，
 * 曲率 = aPerp / speed）。该模型无随机数、固定步长积分，同一输入序列
 * 必然得到同一轨迹，可在 Node 中直接测试。
 */

/** 逻辑坐标宽（渲染与逻辑共用）。 */
export const LS_W = 960
/** 逻辑坐标高。 */
export const LS_H = 600
/** 总关卡数。 */
export const LEVEL_COUNT = 5

/** 可调物理常量（导出供测试引用）。 */
export const PHYSICS = {
  /** 固定物理步长（毫秒），确定性积分的粒度。 */
  fixedDtMs: 1000 / 120,
  /** 玩家转向角速度（rad/s）。 */
  turnRate: 3.0,
  /** 初速（px/s）。 */
  baseSpeed: 170,
  /** 速度下限：引力弹弓后仍保持漂移感。 */
  minSpeed: 110,
  /** 速度上限。 */
  maxSpeed: 520,
  /** 光子碰撞半径。 */
  photonRadius: 5,
  /** 引力井核心致死半径系数（× radius）。 */
  wellCoreFactor: 0.6,
  /** 轨迹拖尾最大点数。 */
  trailMax: 130,
} as const

/** 引力井：位置、可视半径；质量决定引力强度。 */
export interface GravityWell {
  x: number
  y: number
  radius: number
  mass: number
}

/** 小行星：静态圆形障碍。 */
export interface Asteroid {
  x: number
  y: number
  radius: number
}

/** 一关的静态布局：A 点、B 点、引力井群、小行星带。 */
export interface Level {
  /** 0 起的关卡序号。 */
  index: number
  /** 生成本关的种子（渲染星空复用）。 */
  seed: number
  start: { x: number, y: number }
  goal: { x: number, y: number }
  goalRadius: number
  wells: GravityWell[]
  asteroids: Asteroid[]
}

/** 光子运动状态。 */
export interface Photon {
  x: number
  y: number
  /** 航向角（rad，0 = +x）。 */
  heading: number
  /** 标量速度（px/s）。 */
  speed: number
}

/** 一局结果。 */
export type LightspeedResult = 'playing' | 'dead' | 'levelClear' | 'victory'

/** 整局可步进状态（含当前关与累计分数）。 */
export interface LightspeedState {
  level: Level
  photon: Photon
  /** 最近轨迹点（尾在头，头在尾）。 */
  trail: Array<{ x: number, y: number }>
  result: LightspeedResult
  /** 本关已用时间（毫秒）。 */
  elapsedMs: number
  /** 累计分数。 */
  score: number
  /** 固定步长积分的余数累加器（毫秒）。 */
  accumulatorMs: number
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return (): number => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 圆心距。 */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/**
 * 按 index 确定性生成一关：引力井数量与尺寸、小行星带、B 点位置均由
 * seed 派生；A/B 点周边保留安全区，保证出生航向不立即致死。
 * @param index - 0 起的关卡序号。
 * @returns 关卡静态布局。
 */
export function generateLevel(index: number): Level {
  const rng = mulberry32(0x1a957 + index * 7919)
  const level: Level = {
    index,
    seed: 0x1a957 + index * 7919,
    start: { x: 70, y: LS_H / 2 },
    goal: { x: LS_W - 70, y: 150 + rng() * (LS_H - 300) },
    goalRadius: 26,
    wells: [],
    asteroids: [],
  }
  // 引力井：2-3 个，落在中部区域，彼此以及 A/B 点保持距离。
  const wellCount = 2 + (index % 2)
  for (let i = 0; i < wellCount; i += 1) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = LS_W * 0.3 + rng() * LS_W * 0.4
      const y = 110 + rng() * (LS_H - 220)
      const radius = 24 + rng() * 16 + index * 2
      const ok = dist(x, y, level.start.x, level.start.y) > 190
        && dist(x, y, level.goal.x, level.goal.y) > 170
        && level.wells.every(w => dist(x, y, w.x, w.y) > 190)
      if (ok) {
        level.wells.push({ x, y, radius, mass: 9e5 + (radius - 24) * 3e4 + index * 6e4 })
        break
      }
    }
  }
  // 小行星带：一条竖直带（x 抖动），沿 y 展开，数量随关卡上升。
  const beltX = LS_W * (0.42 + rng() * 0.18)
  const count = 5 + index * 2
  for (let i = 0; i < count; i += 1) {
    const y = 70 + ((LS_H - 140) * (i + 0.5)) / count + (rng() - 0.5) * 40
    const x = beltX + (rng() - 0.5) * 90
    const radius = 9 + rng() * 8
    const ok = dist(x, y, level.start.x, level.start.y) > 150
      && dist(x, y, level.goal.x, level.goal.y) > 130
      && level.wells.every(w => dist(x, y, w.x, w.y) > w.radius + 50)
    if (ok) level.asteroids.push({ x, y, radius })
  }
  return level
}

/**
 * 用指定关卡构造可步进状态（测试与开局共用）。
 * @param level - 关卡布局。
 * @returns 初始状态：光子在 A 点，航向 +x。
 */
export function createLightspeedState(level: Level): LightspeedState {
  return {
    level,
    photon: {
      x: level.start.x,
      y: level.start.y,
      heading: 0,
      speed: PHYSICS.baseSpeed,
    },
    trail: [{ x: level.start.x, y: level.start.y }],
    result: 'playing',
    elapsedMs: 0,
    score: 0,
    accumulatorMs: 0,
  }
}

/**
 * 开新的一局（从第 1 关开始）。
 * @param startIndex - 可选 0 起始关卡（测试用）。
 * @returns 初始状态。
 */
export function createLightspeed(startIndex = 0): LightspeedState {
  return createLightspeedState(generateLevel(startIndex))
}

/**
 * 到站得分：到达速度越高、用时越短，分越高。
 * @param speed - 到达 B 点时的速度（px/s）。
 * @param elapsedMs - 本关用时（毫秒）。
 * @returns 该关得分（≥ 50）。
 */
export function arrivalScore(speed: number, elapsedMs: number): number {
  const speedBonus = Math.round(speed * 1.5)
  const timeBonus = Math.round(Math.max(0, 6000 - elapsedMs) / 40)
  return Math.max(50, speedBonus + timeBonus)
}

/** 单个固定步长：引力分解 → 转向/限速 → 位移 → 碰撞与到站判定。 */
function fixedStep(state: LightspeedState, dt: number, steer: number): void {
  const p = state.photon
  const cos = Math.cos(p.heading)
  const sin = Math.sin(p.heading)
  let ax = 0
  let ay = 0
  for (const w of state.level.wells) {
    const dx = w.x - p.x
    const dy = w.y - p.y
    const d = Math.max(1, Math.hypot(dx, dy))
    const d2 = Math.max(d * d, w.radius * w.radius * 0.5)
    const a = w.mass / d2
    ax += (a * dx) / d
    ay += (a * dy) / d
    if (d < w.radius * PHYSICS.wellCoreFactor) {
      state.result = 'dead'
      return
    }
  }
  const along = ax * cos + ay * sin
  const perp = -ax * sin + ay * cos
  p.speed = Math.min(PHYSICS.maxSpeed, Math.max(PHYSICS.minSpeed, p.speed + along * dt))
  p.heading += (perp / Math.max(p.speed, 40)) * dt + steer * PHYSICS.turnRate * dt
  p.x += Math.cos(p.heading) * p.speed * dt
  p.y += Math.sin(p.heading) * p.speed * dt
  if (p.x < 0 || p.x > LS_W || p.y < 0 || p.y > LS_H) {
    state.result = 'dead'
    return
  }
  for (const rock of state.level.asteroids) {
    if (dist(p.x, p.y, rock.x, rock.y) < rock.radius + PHYSICS.photonRadius) {
      state.result = 'dead'
      return
    }
  }
  const g = state.level.goal
  if (dist(p.x, p.y, g.x, g.y) < state.level.goalRadius) {
    state.score += arrivalScore(p.speed, state.elapsedMs)
    state.result = 'levelClear'
  }
}

/**
 * 推进一帧：把 dtMs 切成固定步长确定性积分；转向输入取 -1/0/+1。
 * @param state - 当前状态。
 * @param dtMs - 帧时长（毫秒）。
 * @param steer - 转向：-1 左、0 直行、+1 右。
 */
export function stepLightspeed(state: LightspeedState, dtMs: number, steer: number): void {
  if (state.result !== 'playing') return
  state.elapsedMs += dtMs
  state.accumulatorMs += dtMs
  while (state.accumulatorMs >= PHYSICS.fixedDtMs && state.result === 'playing') {
    state.accumulatorMs -= PHYSICS.fixedDtMs
    fixedStep(state, PHYSICS.fixedDtMs / 1000, steer)
    if (state.result === 'playing') {
      state.trail.push({ x: state.photon.x, y: state.photon.y })
      if (state.trail.length > PHYSICS.trailMax) state.trail.shift()
    }
  }
}

/**
 * 过关后进入下一关；最后一关过关则判胜。
 * @param state - 处于 levelClear 的状态。
 */
export function advanceLevel(state: LightspeedState): void {
  if (state.result !== 'levelClear') return
  if (state.level.index + 1 >= LEVEL_COUNT) {
    state.result = 'victory'
    return
  }
  const next = generateLevel(state.level.index + 1)
  state.level = next
  state.photon = {
    x: next.start.x,
    y: next.start.y,
    heading: 0,
    speed: PHYSICS.baseSpeed,
  }
  state.trail = [{ x: next.start.x, y: next.start.y }]
  state.result = 'playing'
  state.elapsedMs = 0
  state.accumulatorMs = 0
}
