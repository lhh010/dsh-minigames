/**
 * 电流急急棒（Steady Hand）纯逻辑：玩家捏着一枚电环沿弯曲金属轨从
 * 起点走到终点。触电判定：环心到轨道中心折线的最小距离 d 满足
 * d + 轨半径 ≥ 环孔半径（金属轨碰到环沿）即触电——环必须始终套着轨
 * 道并留有裕量；裕量 = 环孔半径 − 轨半径，关卡越高轨越粗、环越小，
 * 裕量越窄。触电 -1 命（共 3 命）并回到最近检查点（中段安全岛或
 * 起点），安全岛内免触电。通关计时：越快通关时间分越高。全部时间
 * 单位毫秒；关卡轨道由固定参数表经确定性贝塞尔采样生成，环以固定
 * 8ms 子步追指针，不含任何随机源，整局轨迹可精确复现。
 */

/** 逻辑画布尺寸（含顶部 HUD 与底部进度条区域）。 */
export const W = 640
export const H = 440
/** 初始生命。 */
export const START_LIVES = 3
/** 关卡总数（参数表长度）。 */
export const LEVEL_COUNT = 5
/** 每条贝塞尔曲线段的确定性采样点数。 */
export const SAMPLES_PER_SEG = 28
/** 固定物理子步 ms：环的移动与判定都按 8ms 离散推进，保证确定性。 */
export const SUBSTEP_MS = 8
/** 环追指针的最大速度 px/s。 */
export const RING_SPEED = 1100
/** 触电后/开局的保护时长 ms（期间免触电判定）。 */
export const GRACE_MS = 500
/** 触电红闪时长 ms。 */
export const FLASH_MS = 380
/** 触电震屏时长 ms。 */
export const SHAKE_MS = 420
/** 终点判定半径 px（环心进入即通关）。 */
export const END_R = 26
/** 检查点（安全岛）半径 px：进入即存档且岛内免触电。 */
export const CHECKPOINT_R = 32
/** 过关基础分。 */
export const LEVEL_BASE_SCORE = 100
/** 时间分上限（每 100ms 递减 1 分，下限 0）。 */
export const TIME_BONUS_MAX = 500

/** 一段三次贝塞尔曲线：8 个归一化坐标 (x0,y0,cx1,cy1,cx2,cy2,x3,y3)，首尾相接成链。 */
export type BezierSeg = readonly [number, number, number, number, number, number, number, number]

/** 单关参数表：贝塞尔链 + 轨半径 + 环孔半径（裕量逐关递减）。 */
export interface LevelSpec {
  /** 贝塞尔链（相邻段首尾点相同）。 */
  segs: BezierSeg[]
  /** 金属轨半厚 px。 */
  railR: number
  /** 电环孔半径 px。 */
  holeR: number
}

/**
 * 5 关轨道参数：越来越弯（段数递增）、越来越窄（裕量 28→12）。
 * 坐标为 0..1 归一化值，装配时乘以画布宽高。
 */
export const LEVEL_SPECS: readonly LevelSpec[] = [
  {
    segs: [
      [0.06, 0.78, 0.42, 0.80, 0.88, 0.84, 0.92, 0.52],
      [0.92, 0.52, 0.95, 0.26, 0.66, 0.16, 0.30, 0.18],
    ],
    railR: 6,
    holeR: 34,
  },
  {
    segs: [
      [0.06, 0.20, 0.40, 0.18, 0.78, 0.20, 0.84, 0.44],
      [0.84, 0.44, 0.88, 0.70, 0.52, 0.82, 0.22, 0.74],
      [0.22, 0.74, 0.06, 0.68, 0.14, 0.46, 0.38, 0.32],
    ],
    railR: 7,
    holeR: 30,
  },
  {
    segs: [
      [0.07, 0.85, 0.35, 0.85, 0.60, 0.78, 0.68, 0.62],
      [0.68, 0.62, 0.76, 0.44, 0.60, 0.32, 0.36, 0.34],
      [0.36, 0.34, 0.14, 0.36, 0.10, 0.52, 0.22, 0.62],
      [0.22, 0.62, 0.32, 0.70, 0.56, 0.76, 0.90, 0.68],
    ],
    railR: 8,
    holeR: 26,
  },
  {
    segs: [
      [0.08, 0.22, 0.36, 0.20, 0.62, 0.22, 0.72, 0.36],
      [0.72, 0.36, 0.80, 0.48, 0.68, 0.60, 0.48, 0.58],
      [0.48, 0.58, 0.28, 0.56, 0.20, 0.64, 0.30, 0.76],
      [0.30, 0.76, 0.40, 0.86, 0.66, 0.86, 0.84, 0.76],
      [0.84, 0.76, 0.94, 0.68, 0.90, 0.52, 0.72, 0.44],
    ],
    railR: 8,
    holeR: 23,
  },
  {
    segs: [
      [0.50, 0.88, 0.20, 0.88, 0.08, 0.78, 0.08, 0.60],
      [0.08, 0.60, 0.08, 0.40, 0.22, 0.30, 0.42, 0.30],
      [0.42, 0.30, 0.62, 0.30, 0.74, 0.38, 0.74, 0.52],
      [0.74, 0.52, 0.74, 0.66, 0.62, 0.72, 0.46, 0.70],
      [0.46, 0.70, 0.32, 0.68, 0.26, 0.60, 0.34, 0.52],
      [0.34, 0.52, 0.44, 0.46, 0.62, 0.44, 0.86, 0.40],
    ],
    railR: 9,
    holeR: 21,
  },
]

/** 平面上一点。 */
export interface Pt { x: number, y: number }

/** 装配好的轨道：折线采样点、累计弧长、检查点与终点。 */
export interface Track {
  /** 确定性采样的折线点（像素坐标，含首尾）。 */
  points: Pt[]
  /** points[i] 的累计弧长（points[0] = 0）。 */
  cumLen: number[]
  /** 轨道总长 px。 */
  totalLen: number
  /** 中段检查点（安全岛圆心）。 */
  checkpoint: Pt
  /** 终点（最后一个采样点）。 */
  end: Pt
  /** 金属轨半厚 px。 */
  railR: number
  /** 电环孔半径 px。 */
  holeR: number
}

/**
 * 三次贝塞尔求值（de Casteljau 展开），t∈[0,1]。
 * @param seg - 曲线段（8 数组）。
 * @param t - 参数。
 * @returns 曲线上的点。
 */
export function bezierAt(seg: BezierSeg, t: number): Pt {
  const x0 = seg[0]!, y0 = seg[1]!, cx1 = seg[2]!, cy1 = seg[3]!, cx2 = seg[4]!, cy2 = seg[5]!, x3 = seg[6]!, y3 = seg[7]!
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return {
    x: a * x0 + b * cx1 + c * cx2 + d * x3,
    y: a * y0 + b * cy1 + c * cy2 + d * y3,
  }
}

/**
 * 装配某一关的轨道：归一化贝塞尔链 → 像素折线 + 弧长表 + 中点检查点。
 * @param level - 关卡号（1 起）。
 * @returns 轨道数据。
 */
export function buildTrack(level: number): Track {
  const spec = LEVEL_SPECS[Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level))) - 1]!
  const points: Pt[] = []
  spec.segs.forEach((seg, i): void => {
    // 链上除首段外都跳过 t=0 的重复点。
    for (let k = i === 0 ? 0 : 1; k <= SAMPLES_PER_SEG; k += 1) {
      const p = bezierAt(seg, k / SAMPLES_PER_SEG)
      points.push({ x: p.x * W, y: p.y * H })
    }
  })
  const cumLen: number[] = [0]
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!, b = points[i]!
    cumLen.push(cumLen[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y))
  }
  return {
    points,
    cumLen,
    totalLen: cumLen[cumLen.length - 1]!,
    checkpoint: points[Math.floor(points.length / 2)]!,
    end: points[points.length - 1]!,
    railR: spec.railR,
    holeR: spec.holeR,
  }
}

/**
 * 点到线段的最小距离（投影裁剪到端点）。
 * @param px - 被测点 x。
 * @param py - 被测点 y。
 * @param ax - 线段端点 A x。
 * @param ay - 线段端点 A y。
 * @param bx - 线段端点 B x。
 * @param by - 线段端点 B y。
 * @returns 欧氏最短距离。
 */
export function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = 0
  if (len2 > 0) t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * 环心到轨道中心折线的最小距离。
 * @param track - 轨道。
 * @param x - 环心 x。
 * @param y - 环心 y。
 * @returns 最小距离 px。
 */
export function minDistanceToTrack(track: Track, x: number, y: number): number {
  let best = Infinity
  const pts = track.points
  for (let i = 1; i < pts.length; i += 1) {
    const d = pointSegmentDistance(x, y, pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y)
    if (d < best) best = d
  }
  return best
}

/**
 * 该位置的电环是否触电：环沿碰到金属轨，即 d + 轨半径 ≥ 环孔半径。
 * @param track - 轨道。
 * @param x - 环心 x。
 * @param y - 环心 y。
 * @returns true 表示触电。
 */
export function isShocked(track: Track, x: number, y: number): boolean {
  return minDistanceToTrack(track, x, y) + track.railR >= track.holeR
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type SteadyHandEvent =
  | { type: 'shock', x: number, y: number }
  | { type: 'armed' }
  | { type: 'checkpoint' }
  | { type: 'clear', level: number, ms: number, gained: number }
  | { type: 'complete', score: number }

/** 一局游戏的完整可测状态。 */
export interface SteadyHandState {
  /** 全局动画时钟 ms（渲染动画用）。 */
  t: number
  /** 本关已用时 ms（计时得分用）。 */
  levelMs: number
  score: number
  lives: number
  /** 当前关卡（1 起）。 */
  level: number
  /** 电环中心。 */
  ringX: number, ringY: number
  /** 指针目标（环向其限速追踪）。 */
  targetX: number, targetY: number
  /** 子步累加余量 ms（固定 8ms 子步）。 */
  acc: number
  /** 免触电剩余 ms。 */
  graceMs: number
  /** 红闪剩余 ms。 */
  flashMs: number
  /** 震屏剩余 ms。 */
  shakeMs: number
  /** 重生点（起点或已触达的检查点）。 */
  respawnX: number, respawnY: number
  /** 本关是否已触达检查点。 */
  checkpointTaken: boolean
  /** 就位阶段：false 时环尚未回到起点标记，不计时也不判触电。 */
  armed: boolean
  /** 指针是否已离开过起点（防开局默认 target 在起点直接就位）。 */
  aimMoved: boolean
  /** 本关沿轨进度 0..1（只增不减）。 */
  progress: number
  /** 本次会话最快单关通关毫秒（无则 null）。 */
  bestMs: number | null
  /** 当前关轨道。 */
  track: Track
  events: SteadyHandEvent[]
  over: boolean
  /** 5 关全部通关。 */
  complete: boolean
}

/**
 * 装配某一关的初始字段：轨道、环归位、计时与进度清零、开局保护。
 * @param state - 目标状态（就地更新）。
 * @param level - 关卡号。
 */
function enterLevel(state: SteadyHandState, level: number): void {
  state.level = level
  state.track = buildTrack(level)
  const start = state.track.points[0]!
  state.ringX = start.x
  state.ringY = start.y
  state.targetX = start.x
  state.targetY = start.y
  state.respawnX = start.x
  state.respawnY = start.y
  state.levelMs = 0
  state.acc = 0
  state.armed = false
  state.aimMoved = false
  state.graceMs = GRACE_MS
  state.checkpointTaken = false
  state.progress = 0
}

/**
 * 新开一局（无随机源，同参数轨迹完全一致）。
 * @param startLevel - 起始关卡（1..5，越界收敛）。
 * @param bestMs - 跨局保留的最佳通关时间（可省略）。
 * @returns 初始状态。
 */
export function createSteadyHand(startLevel = 1, bestMs: number | null = null): SteadyHandState {
  const state: SteadyHandState = {
    t: 0,
    levelMs: 0,
    score: 0,
    lives: START_LIVES,
    level: 1,
    ringX: 0, ringY: 0,
    targetX: 0, targetY: 0,
    acc: 0,
    graceMs: 0,
    flashMs: 0,
    shakeMs: 0,
    respawnX: 0, respawnY: 0,
    checkpointTaken: false,
    armed: false,
    aimMoved: false,
    progress: 0,
    bestMs,
    track: buildTrack(1),
    events: [],
    over: false,
    complete: false,
  }
  enterLevel(state, Math.min(LEVEL_COUNT, Math.max(1, Math.floor(startLevel))))
  return state
}

/**
 * 指针移动：仅更新追踪目标，环在后续 step 中限速追赶。
 * @param state - 目标状态。
 * @param x - 指针逻辑坐标 x。
 * @param y - 指针逻辑坐标 y。
 */
export function setPointer(state: SteadyHandState, x: number, y: number): void {
  state.targetX = x
  state.targetY = y
}

/**
 * 过关得分：基础分 + 时间分（每 100ms 递减 1 分，下限 0）。
 * @param levelMs - 本关用时 ms。
 * @returns 该关得分。
 */
export function levelScore(levelMs: number): number {
  return LEVEL_BASE_SCORE + Math.max(0, TIME_BONUS_MAX - Math.floor(levelMs / 100))
}

/** 触电处理：-1 命、红闪震屏、回重生点并给保护期。 */
function shock(state: SteadyHandState): void {
  state.lives -= 1
  state.flashMs = FLASH_MS
  state.shakeMs = SHAKE_MS
  state.graceMs = GRACE_MS
  const sx = state.ringX, sy = state.ringY
  state.ringX = state.respawnX
  state.ringY = state.respawnY
  state.targetX = state.respawnX
  state.targetY = state.respawnY
  state.acc = 0
  state.events.push({ type: 'shock', x: sx, y: sy })
  if (state.lives <= 0) { state.lives = 0; state.over = true }
}

/**
 * 推进一帧：固定 8ms 子步内环向指针限速移动，逐步判定终点、检查点、
 * 触电；触电立即处理并回到重生点。事件写入 state.events，调用方每帧
 * 消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepSteadyHand(state: SteadyHandState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  if (state.armed) state.levelMs += dtMs
  if (state.flashMs > 0) state.flashMs = Math.max(0, state.flashMs - dtMs)
  if (state.shakeMs > 0) state.shakeMs = Math.max(0, state.shakeMs - dtMs)
  if (state.graceMs > 0) state.graceMs = Math.max(0, state.graceMs - dtMs)

  state.acc += dtMs
  const track = state.track
  while (state.acc >= SUBSTEP_MS) {
    state.acc -= SUBSTEP_MS
    // 环向指针限速移动（固定子步保证确定性）。
    const dx = state.targetX - state.ringX
    const dy = state.targetY - state.ringY
    const dist = Math.hypot(dx, dy)
    const stepLen = (RING_SPEED * SUBSTEP_MS) / 1000
    if (dist > 1e-9) {
      const move = Math.min(stepLen, dist)
      state.ringX += (dx / dist) * move
      state.ringY += (dy / dist) * move
    }

    // 就位阶段：环与指针都贴在起点标记才算就位开跑（计时与触电判定
    // 均未开始）——开局环出生在起点，但玩家指针通常还在别处，必须
    // 刻意把指针移回起点才正式开始。
    if (!state.armed) {
      const startPt = track.points[0]!
      const aimDist = Math.hypot(state.targetX - startPt.x, state.targetY - startPt.y)
      if (aimDist > 60) state.aimMoved = true
      const ringAt = Math.hypot(state.ringX - startPt.x, state.ringY - startPt.y) <= 22
      if (ringAt && state.aimMoved && aimDist <= 30) {
        state.armed = true
        state.events.push({ type: 'armed' })
      }
      continue
    }

    // 终点：进入终点圈即通关（优先于触电判定）。
    if (Math.hypot(state.ringX - track.end.x, state.ringY - track.end.y) <= END_R) {
      const gained = levelScore(state.levelMs)
      state.score += gained
      if (state.bestMs === null || state.levelMs < state.bestMs) state.bestMs = state.levelMs
      state.events.push({ type: 'clear', level: state.level, ms: state.levelMs, gained })
      if (state.level >= LEVEL_COUNT) {
        state.complete = true
        state.over = true
        state.events.push({ type: 'complete', score: state.score })
        return
      }
      enterLevel(state, state.level + 1)
      return
    }

    // 检查点：进入安全岛即存档（每次重新进入都记录，事件只在首次进本关时补发）。
    const cpD = Math.hypot(state.ringX - track.checkpoint.x, state.ringY - track.checkpoint.y)
    if (cpD <= CHECKPOINT_R) {
      if (!state.checkpointTaken) {
        state.checkpointTaken = true
        state.events.push({ type: 'checkpoint' })
      }
      state.respawnX = track.checkpoint.x
      state.respawnY = track.checkpoint.y
      // 岛内免触电。
    } else if (state.graceMs <= 0 && isShocked(track, state.ringX, state.ringY)) {
      shock(state)
      if (state.over) return
    }

    // 进度：环心最近的采样点弧长比例，只增不减。
    let bi = 0, bd = Infinity
    for (let i = 0; i < track.points.length; i += 1) {
      const p = track.points[i]!
      const d = (p.x - state.ringX) * (p.x - state.ringX) + (p.y - state.ringY) * (p.y - state.ringY)
      if (d < bd) { bd = d; bi = i }
    }
    const frac = track.cumLen[bi]! / track.totalLen
    if (frac > state.progress) state.progress = frac
  }
}
