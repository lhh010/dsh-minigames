/**
 * 高山滑雪（Ski）纯逻辑：SkiFree 风格的俯视竖版卷轴。滑雪者固定在屏幕
 * 下部，雪道持续向下卷动（距离随速度增长）；地形按 seed+段号确定性生成，
 * 每段包含成对旗门与若干树木/岩石障碍。穿过旗门 +50，撞障碍 -1 命（共
 * 3 命）并获得短暂无敌；速度随距离每 DIST_PER_GEAR 升一档，越来越快。
 * 横向控制：按住 ←→/AD 施加横向加速度，或跟随指针目标 x。时间单位毫秒，
 * 物理单位 px / s，同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（竖版卷轴）。 */
export const W = 480
export const H = 640
/** 滑雪者在屏幕上的固定 y。 */
export const PLAYER_Y = 470
/** 滑雪者碰撞半径。 */
export const PLAYER_R = 10
/** 每段地形的世界高度 px（段号 i 覆盖世界 y ∈ [i*SEG_H, (i+1)*SEG_H)）。 */
export const SEG_H = 300
/** 基础下滑速度 px/s。 */
export const BASE_SPEED = 175
/** 每升一档增加的速度 px/s。 */
export const GEAR_STEP = 26
/** 速度上限 px/s。 */
export const MAX_SPEED = 430
/** 每滑多远升一档 px。 */
export const DIST_PER_GEAR = 2200
/** 初始生命。 */
export const START_LIVES = 3
/** 穿过旗门得分。 */
export const GATE_SCORE = 50
/** 旗门缺口半宽 px（两杆间距的一半）。 */
export const GAP_HALF = 52
/** 横向转向加速度 px/s^2。 */
export const STEER_AX = 1500
/** 横向速度上限 px/s。 */
export const MAX_VX = 400
/** 松手后横向速度衰减系数（每秒保留比例）。 */
export const VX_DAMP = 0.02
/** 撞障碍后的无敌时长 ms。 */
export const CRASH_INVULN_MS = 1300
/** 身后雪痕点数上限（超出丢最旧）。 */
export const TRAIL_MAX = 110
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 900

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

/** 阶段：滑行 / 一局结束。 */
export type SkiPhase = 'skiing' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type SkiEvent =
  | { type: 'gate', x: number, y: number, gained: number }
  | { type: 'crash', x: number, y: number }

/** 障碍种类：树 / 岩石。 */
export type ObstacleKind = 'tree' | 'rock'

/** 一个障碍（世界坐标）。 */
export interface Obstacle {
  x: number
  worldY: number
  kind: ObstacleKind
  /** 碰撞半径。 */
  r: number
}

/** 一段地形（世界坐标）：一个旗门 + 若干障碍。 */
export interface SkiSegment {
  index: number
  /** 旗门中心线世界 y。 */
  gateY: number
  /** 旗门缺口中心 x。 */
  gapX: number
  /** 是否已结算过（穿门判定只做一次）。 */
  gateDone: boolean
  obstacles: Obstacle[]
}

/** 上浮渐隐的飘字。 */
export interface SkiFloat {
  x: number
  y: number
  text: string
  life: number
}

/** 身后雪痕采样点（世界坐标）。 */
export interface TrailPoint {
  x: number
  worldY: number
}

/** 一局游戏的完整可测状态。 */
export interface SkiState {
  /** 回合内已流逝 ms。 */
  t: number
  seed: number
  score: number
  lives: number
  /** 已下滑的世界距离 px（滑雪者所在世界 y）。 */
  distance: number
  /** 当前速度 px/s。 */
  speed: number
  /** 当前档位（1 起，随距离升）。 */
  gear: number
  /** 滑雪者逻辑 x 与横向速度。 */
  playerX: number
  vx: number
  phase: SkiPhase
  /** 剩余无敌 ms（撞障碍后的保护期）。 */
  invulnMs: number
  events: SkiEvent[]
  floats: SkiFloat[]
  trail: TrailPoint[]
  /** 已生成的地形段，按段号索引。 */
  segments: Map<number, SkiSegment>
}

/** 每帧输入：按键与指针目标（指针存在时优先于按键的松弛模型）。 */
export interface SkiInput {
  left: boolean
  right: boolean
  /** 指针目标逻辑 x；无指针为 null。 */
  pointerX: number | null
}

/**
 * 由种子与段号混合出该段专属的确定性随机流。
 * @param seed - 一局种子。
 * @param index - 段号（≥0）。
 * @returns 该段的随机数函数。
 */
function segmentRng(seed: number, index: number): () => number {
  return mulberry32((Math.imul(seed >>> 0, 374761393) + Math.imul(index + 1, 668265263)) >>> 0)
}

/**
 * 确定性生成一段地形：一个旗门 + 3~5 个障碍。障碍避开旗门缺口附近
 * 与两侧边界，保证每段必有可走路线。
 * @param seed - 一局种子。
 * @param index - 段号（≥0）。
 * @returns 该段地形。
 */
export function generateSegment(seed: number, index: number): SkiSegment {
  const rng = segmentRng(seed, index)
  const gateY = index * SEG_H + SEG_H * 0.5 + (rng() - 0.5) * 120
  const gapX = 70 + rng() * (W - 140)
  const obstacles: Obstacle[] = []
  const count = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < count; i += 1) {
    const kind: ObstacleKind = rng() < 0.65 ? 'tree' : 'rock'
    const r = kind === 'tree' ? 13 : 11
    const x = 26 + rng() * (W - 52)
    const worldY = index * SEG_H + rng() * SEG_H
    // 障碍不压旗门缺口（留一个杆宽的走廊），否则可能无解。
    const nearGate = Math.abs(worldY - gateY) < 80 && Math.abs(x - gapX) < GAP_HALF + 26
    if (nearGate) continue
    obstacles.push({ x, worldY, kind, r })
  }
  return { index, gateY, gapX, gateDone: false, obstacles }
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态（含首屏地形段）。
 */
export function createSki(seed: number): SkiState {
  const state: SkiState = {
    t: 0,
    seed: seed >>> 0,
    score: 0,
    lives: START_LIVES,
    distance: 0,
    speed: BASE_SPEED,
    gear: 1,
    playerX: W / 2,
    vx: 0,
    phase: 'skiing',
    invulnMs: 0,
    events: [],
    floats: [],
    trail: [],
    segments: new Map(),
  }
  ensureSegments(state)
  return state
}

/**
 * 确保屏幕可视范围（世界 y ∈ [distance - PLAYER_Y, distance + H - PLAYER_Y]）
 * 内所有地形段都已生成。
 * @param state - 目标状态。
 */
function ensureSegments(state: SkiState): void {
  const first = Math.floor((state.distance - PLAYER_Y - SEG_H) / SEG_H)
  const last = Math.ceil((state.distance + (H - PLAYER_Y) + SEG_H) / SEG_H)
  for (let i = Math.max(0, first); i <= last; i += 1) {
    if (!state.segments.has(i)) state.segments.set(i, generateSegment(state.seed, i))
  }
}

/**
 * 推进一帧：速度随距离升档、距离增长、横向控制（按键加速度 / 指针跟随）、
 * 旗门过线判定（+50 或错过）、障碍碰撞（-1 命 + 无敌期）、无敌倒计时、
 * 雪痕采样与飘字。事件写入 state.events，调用方每帧消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入。
 */
export function stepSki(state: SkiState, dtMs: number, input: SkiInput): void {
  state.events.length = 0
  const dt = dtMs / 1000
  state.t += dtMs

  // 飘字上浮渐隐（所有阶段共用）。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 34 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }
  if (state.phase === 'over') return

  // 速度档位：每 DIST_PER_GEAR 距离升一档。
  state.gear = 1 + Math.floor(state.distance / DIST_PER_GEAR)
  state.speed = Math.min(MAX_SPEED, BASE_SPEED + (state.gear - 1) * GEAR_STEP)
  const prevDistance = state.distance
  state.distance += state.speed * dt

  // 横向控制：指针优先（比例跟随，直接映射到目标附近）；否则按键加速、
  // 松手指数衰减。
  if (input.pointerX !== null) {
    state.vx = Math.max(-MAX_VX, Math.min(MAX_VX, (input.pointerX - state.playerX) * 9))
  } else if (input.left && !input.right) {
    state.vx = Math.max(-MAX_VX, state.vx - STEER_AX * dt)
  } else if (input.right && !input.left) {
    state.vx = Math.min(MAX_VX, state.vx + STEER_AX * dt)
  } else {
    state.vx *= Math.pow(VX_DAMP, dt)
    if (Math.abs(state.vx) < 4) state.vx = 0
  }
  state.playerX += state.vx * dt
  if (state.playerX < PLAYER_R) {
    state.playerX = PLAYER_R
    state.vx = 0
  } else if (state.playerX > W - PLAYER_R) {
    state.playerX = W - PLAYER_R
    state.vx = 0
  }

  // 身后雪痕采样。
  state.trail.push({ x: state.playerX, worldY: state.distance })
  if (state.trail.length > TRAIL_MAX) state.trail.shift()

  ensureSegments(state)

  // 旗门判定：本帧内滑雪者世界 y 自上而下穿过门线，只结算一次。
  for (const seg of state.segments.values()) {
    if (seg.gateDone) continue
    if (prevDistance < seg.gateY && state.distance >= seg.gateY) {
      seg.gateDone = true
      if (Math.abs(state.playerX - seg.gapX) <= GAP_HALF - 6) {
        state.score += GATE_SCORE
        state.floats.push({ x: seg.gapX, y: PLAYER_Y - 26, text: '+' + GATE_SCORE, life: FLOAT_MS })
        state.events.push({ type: 'gate', x: seg.gapX, y: PLAYER_Y, gained: GATE_SCORE })
      }
    }
  }

  // 障碍碰撞：无敌期内不判定。
  if (state.invulnMs > 0) {
    state.invulnMs -= dtMs
  } else {
    for (const seg of state.segments.values()) {
      for (const obs of seg.obstacles) {
        const dy = obs.worldY - state.distance
        if (dy < -60 || dy > 60) continue
        if (Math.hypot(obs.x - state.playerX, dy) < obs.r + PLAYER_R) {
          state.lives -= 1
          state.invulnMs = CRASH_INVULN_MS
          state.events.push({ type: 'crash', x: state.playerX, y: PLAYER_Y })
          if (state.lives <= 0) {
            state.lives = 0
            state.phase = 'over'
          }
          return
        }
      }
    }
  }
}

/**
 * 当前速度对应的显示速度值（HUD 用，稳定整数）。
 * @param state - 当前状态。
 * @returns 显示速度。
 */
export function displaySpeed(state: SkiState): number {
  return Math.round(state.speed / 4)
}

/**
 * 当前已滑距离（米，HUD 用）：10px 记 1 米。
 * @param state - 当前状态。
 * @returns 距离米数。
 */
export function displayDistance(state: SkiState): number {
  return Math.floor(state.distance / 10)
}
