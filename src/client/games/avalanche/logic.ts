/**
 * 滑雪大冒险（Avalanche）纯逻辑：Ski Safari 式横版逃亡。玩家沿起伏雪坡
 * 向右持续加速下滑（地形由 seed+段号确定性生成，段内折线起伏并随机出现
 * 跳台凸起），身后雪崩墙以略低于玩家满速的速度推进；撞岩石/树会翻滚
 * 减速（雪崩追近），↑/空格起跳（跳台上更高），空中 ←→ 控制姿态，落地
 * 姿态过倾则翻滚；空中滞空超过阈值自动计翻滚特技 +50/次；坡上随机出现
 * 企鹅（加速+一次免撞）与雪人（两次免撞）可骑乘，被撞掉后可再捡；沿途
 * 金币 +10。玩家与雪崩墙距离 < 0 即结束。时间单位 ms，物理单位 px/s，
 * 同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（横版卷轴）。 */
export const W = 960
export const H = 540
/** 玩家在屏幕上的固定位置。 */
export const PLAYER_X = 220
export const PLAYER_Y = 300
/** 玩家碰撞半径。 */
export const PLAYER_R = 12
/** 每段地形的世界宽度 px（段号 i 覆盖世界 x ∈ [i*SEG_W, (i+1)*SEG_W)）。 */
export const SEG_W = 600
/** 段内折线采样间距 px。 */
export const STEP = 60
/** 第 0 段起点的世界 y。 */
export const START_Y = 210
/** 基础坡降（每 px 世界 y 增量，正 = 下坡加速）。 */
export const BASE_SLOPE = 0.3
/** 段内起伏幅度 px。 */
export const WOBBLE = 34
/** 跳台凸起高度 px。 */
export const RAMP_H = 74
/** 跳台判定半径 px（在此范围内起跳获得更高初速）。 */
export const RAMP_RADIUS = 100
/** 重力加速度 px/s^2（y 向下为正）。 */
export const GRAVITY = 1500
/** 普通起跳初速 px/s。 */
export const JUMP_V = 430
/** 跳台额外起跳初速 px/s。 */
export const RAMP_BOOST = 300
/** 撞击/翻滚后的最低回复速度 px/s。 */
export const MIN_SPEED = 140
/** 速度回复加速度 px/s^2。 */
export const RECOVER_ACCEL = 280
/** 基础满速 px/s。 */
export const BASE_MAX_SPEED = 360
/** 骑企鹅的满速加成 px/s。 */
export const PENGUIN_BONUS = 80
/** 骑雪人的满速加成 px/s。 */
export const YETI_BONUS = 20
/** 坡度→加速度系数（vx += grade*SLOPE_ACCEL*dt）。 */
export const SLOPE_ACCEL = 900
/** 雪崩基础速度 px/s（低于玩家基础满速）。 */
export const AVA_BASE_SPEED = 332
/** 雪崩每前进这么多 px 提速一次。 */
export const AVA_GROW_DIST = 6000
/** 雪崩每次提速增量 px/s。 */
export const AVA_GROW = 10
/** 雪崩速度上限 px/s。 */
export const AVA_MAX_SPEED = 392
/** 开局雪崩墙在玩家身后的距离 px。 */
export const AVA_START_GAP = 900
/** 撞障碍后的速度保留比例。 */
export const CRASH_VX_KEEP = 0.42
/** 翻滚失控时长 ms。 */
export const TUMBLE_MS = 750
/** 撞击后的无敌宽限 ms（避免连环判定）。 */
export const CRASH_GRACE_MS = 900
/** 空中姿态旋转速率 rad/s。 */
export const ROT_SPEED = 4.2
/** 空中姿态最大倾角 rad。 */
export const MAX_TILT = 1.5
/** 落地安全倾角上限 rad（超过则翻滚）。 */
export const LAND_TILT_MAX = 1.05
/** 计入特技的最短滞空 ms。 */
export const TRICK_MIN_MS = 750
/** 每多翻一次的滞空增量 ms。 */
export const FLIP_MS = 450
/** 每次翻滚特技得分。 */
export const TRICK_SCORE = 50
/** 每枚金币得分。 */
export const COIN_SCORE = 10
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 900
/** 距离换算：10px 记 1 米 / 1 分。 */
export const DIST_UNIT = 10

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

/** 阶段：滑行逃亡 / 一局结束。 */
export type AvaPhase = 'run' | 'over'

/** 骑乘状态：无 / 企鹅 / 雪人。 */
export type MountKind = 'none' | 'penguin' | 'yeti'

/** 障碍种类：树 / 岩石。 */
export type ObstacleKind = 'tree' | 'rock'

/** 单步内产生、供渲染层消费的可视事件（世界坐标）。 */
export type AvaEvent =
  | { type: 'jump', x: number, y: number }
  | { type: 'land', x: number, y: number }
  | { type: 'crash', x: number, y: number }
  | { type: 'shield', x: number, y: number }
  | { type: 'coin', x: number, y: number }
  | { type: 'trick', x: number, y: number, gained: number }
  | { type: 'mount', x: number, y: number, kind: MountKind }
  | { type: 'over', x: number, y: number }

/** 一个障碍（世界坐标，坐落于坡面上）。 */
export interface AvaObstacle {
  x: number
  kind: ObstacleKind
  /** 碰撞半径。 */
  r: number
}

/** 一枚金币（世界坐标，悬浮于坡面上方）。 */
export interface AvaCoin {
  x: number
  y: number
  taken: boolean
}

/** 一个可骑乘伙伴（世界坐标，坐落于坡面上）。 */
export interface AvaMount {
  x: number
  kind: Exclude<MountKind, 'none'>
  taken: boolean
}

/**
 * 一段地形：起点世界 y、按 STEP 采样的折线高度（含段尾共享点）、可选
 * 跳台（rampK 为折线索引，-1 表示无）、障碍/金币/伙伴。
 */
export interface AvaSegment {
  index: number
  /** 段起点（折线第 0 点）的世界 y。 */
  startY: number
  /** 折线高度，长度 SEG_W/STEP + 1，末点即下一段起点。 */
  heights: number[]
  /** 跳台中心折线索引，-1 表示本段无跳台。 */
  rampK: number
  obstacles: AvaObstacle[]
  coins: AvaCoin[]
  mounts: AvaMount[]
}

/** 上浮渐隐的飘字（世界坐标）。 */
export interface AvaFloat {
  x: number
  y: number
  text: string
  life: number
}

/** 一局游戏的完整可测状态。 */
export interface AvaState {
  /** 回合内已流逝 ms。 */
  t: number
  seed: number
  phase: AvaPhase
  /** 玩家世界坐标（y 向下为正）。 */
  px: number
  py: number
  /** 水平速度 px/s 与垂直速度 px/s。 */
  vx: number
  vy: number
  /** 是否在坡面上。 */
  onGround: boolean
  /** 本轮滞空累计 ms。 */
  airMs: number
  /** 空中姿态倾角 rad（正 = 前仰）。 */
  tilt: number
  /** 剩余翻滚失控 ms。 */
  tumbleMs: number
  /** 撞击后无敌剩余 ms。 */
  crashGraceMs: number
  /** 当前骑乘与剩余免撞次数。 */
  mount: MountKind
  shields: number
  coinScore: number
  trickScore: number
  /** 雪崩墙前沿的世界 x。 */
  avalancheX: number
  events: AvaEvent[]
  floats: AvaFloat[]
  /** 已生成的地形段，按段号索引。 */
  segments: Map<number, AvaSegment>
  /** 已连续生成到的最大段号（地形按序生成以保证折线连续）。 */
  maxSeg: number
}

/** 每帧输入：跳跃为边沿触发（本帧按下），空中 ←→ 控制姿态。 */
export interface AvaInput {
  jump: boolean
  left: boolean
  right: boolean
}

/** 空闲输入（不放任何键）。 */
export const IDLE_INPUT: AvaInput = { jump: false, left: false, right: false }

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
 * 在一段已生成的折线上取世界 x 处的地面 y（线性插值；x 超出段范围时
 * 钳到段两端）。
 * @param seg - 目标段。
 * @param worldX - 世界 x。
 * @returns 地面世界 y。
 */
export function segmentGroundY(seg: AvaSegment, worldX: number): number {
  const local = Math.max(0, Math.min(SEG_W, worldX - seg.index * SEG_W))
  const k = Math.min(seg.heights.length - 2, Math.floor(local / STEP))
  const t = (local - k * STEP) / STEP
  return seg.heights[k]! + (seg.heights[k + 1]! - seg.heights[k]!) * t
}

/**
 * 确定性生成一段地形：折线起伏（末点落在趋势线上保证与下一段连续）、
 * 可选跳台凸起、随段号递增的障碍（开局 0~1 个热身，20 段后 2~5 个）、
 * 一组金币、偶发一个骑乘伙伴。
 * @param seed - 一局种子。
 * @param index - 段号（≥0）。
 * @param startY - 段起点世界 y（= 上一段末点）。
 * @returns 该段地形。
 */
export function generateSegment(seed: number, index: number, startY: number): AvaSegment {
  const rng = segmentRng(seed, index)
  const K = SEG_W / STEP
  const drop = SEG_W * BASE_SLOPE + (rng() - 0.5) * 80
  const heights: number[] = []
  for (let k = 0; k <= K; k += 1) {
    let y = startY + drop * (k / K)
    if (k > 0 && k < K) y += (rng() - 0.5) * 2 * WOBBLE
    heights.push(y)
  }
  const hasRamp = rng() < 0.45
  const rampK = hasRamp ? 2 + Math.floor(rng() * (K - 3)) : -1
  if (rampK >= 0) {
    for (let off = -2; off <= 2; off += 1) {
      const k = rampK + off
      if (k < 0 || k > K) continue
      heights[k] = heights[k]! - (1 - Math.abs(off) / 2.4) * RAMP_H
    }
  }
  const rampX = rampK >= 0 ? index * SEG_W + rampK * STEP : -1
  const obstacles: AvaObstacle[] = []
  // 障碍密度随段号（滑行距离）递增：前 4 段 0~1 个热身，4-12 段 1~2 个，
  // 12-24 段 2~3 个，之后 2~5 个满配。
  let obstacleCount: number
  if (index < 4) obstacleCount = Math.floor(rng() * 2)
  else if (index < 12) obstacleCount = 1 + Math.floor(rng() * 2)
  else if (index < 24) obstacleCount = 2 + Math.floor(rng() * 2)
  else obstacleCount = 2 + Math.floor(rng() * 4)
  for (let i = 0; i < obstacleCount; i += 1) {
    const kind: ObstacleKind = rng() < 0.6 ? 'tree' : 'rock'
    const r = kind === 'tree' ? 13 : 11
    const x = index * SEG_W + (0.06 + rng() * 0.88) * SEG_W
    if (rampK >= 0 && Math.abs(x - rampX) < 110) continue
    obstacles.push({ x, kind, r })
  }
  const coins: AvaCoin[] = []
  if (rng() < 0.75) {
    const n = 3 + Math.floor(rng() * 3)
    const cx0 = index * SEG_W + (0.1 + rng() * 0.5) * SEG_W
    const spacing = 44 + rng() * 14
    for (let i = 0; i < n; i += 1) {
      const x = cx0 + i * spacing
      if (x >= (index + 1) * SEG_W) break
      const arc = rampK >= 0 ? Math.max(0, 1 - Math.abs(x - rampX) / 130) * 26 : 0
      coins.push({ x, y: segmentGroundY({ index, startY, heights, rampK, obstacles, coins, mounts: [] }, x) - 34 - arc, taken: false })
    }
  }
  const mounts: AvaMount[] = []
  if (rng() < 0.16) {
    const kind: Exclude<MountKind, 'none'> = rng() < 0.55 ? 'penguin' : 'yeti'
    let x = index * SEG_W + (0.15 + rng() * 0.7) * SEG_W
    if (rampK >= 0 && Math.abs(x - rampX) < 130) x = rampX + 150
    mounts.push({ x, kind, taken: false })
  }
  return { index, startY, heights, rampK, obstacles, coins, mounts }
}

/**
 * 新开一局：玩家立于世界原点坡面上，雪崩墙在身后 AVA_START_GAP px。
 * @param seed - 外部种子（如日期+局号）。
 * @returns 初始状态（含首屏地形段）。
 */
export function createAvalanche(seed: number): AvaState {
  const state: AvaState = {
    t: 0,
    seed: seed >>> 0,
    phase: 'run',
    px: 0,
    py: START_Y,
    vx: 220,
    vy: 0,
    onGround: true,
    airMs: 0,
    tilt: 0,
    tumbleMs: 0,
    crashGraceMs: 0,
    mount: 'none',
    shields: 0,
    coinScore: 0,
    trickScore: 0,
    avalancheX: -AVA_START_GAP,
    events: [],
    floats: [],
    segments: new Map(),
    maxSeg: -1,
  }
  ensureSegments(state, 3)
  state.py = groundYAt(state, 0)
  return state
}

/**
 * 按需顺序生成直到段号 to（含）的所有地形段；地形折线通过"上段末点 =
 * 下段起点"保证跨段连续，因此只能按序生成。
 * @param state - 目标状态。
 * @param to - 需要保证存在的最大段号。
 */
function ensureSegments(state: AvaState, to: number): void {
  for (let i = state.maxSeg + 1; i <= to; i += 1) {
    const startY = i === 0 ? START_Y : state.segments.get(i - 1)!.heights[SEG_W / STEP]!
    state.segments.set(i, generateSegment(state.seed, i, startY))
    state.maxSeg = i
  }
}

/**
 * 取世界 x 处的地面 y（自动生成所需段）。
 * @param state - 目标状态。
 * @param worldX - 世界 x。
 * @returns 地面世界 y。
 */
export function groundYAt(state: AvaState, worldX: number): number {
  const i = Math.max(0, Math.floor(worldX / SEG_W))
  if (i > state.maxSeg) ensureSegments(state, i)
  return segmentGroundY(state.segments.get(i)!, worldX)
}

/**
 * 取世界 x 处的坡度（dy/dx，正 = 下坡）。
 * @param state - 目标状态。
 * @param worldX - 世界 x。
 * @returns 坡度。
 */
export function gradeAt(state: AvaState, worldX: number): number {
  return (groundYAt(state, worldX + 10) - groundYAt(state, worldX - 10)) / 20
}

/**
 * 当前满速（含骑乘加成）。
 * @param state - 当前状态。
 * @returns 满速 px/s。
 */
export function maxSpeed(state: AvaState): number {
  if (state.mount === 'penguin') return BASE_MAX_SPEED + PENGUIN_BONUS
  if (state.mount === 'yeti') return BASE_MAX_SPEED + YETI_BONUS
  return BASE_MAX_SPEED
}

/**
 * 玩家与雪崩墙的距离（px，正 = 安全余量）。
 * @param state - 当前状态。
 * @returns 距离。
 */
export function avalancheGap(state: AvaState): number {
  return state.px - state.avalancheX
}

/** 在当前状态给玩家加一条飘字（世界坐标）。 */
function addFloat(state: AvaState, text: string): void {
  state.floats.push({ x: state.px, y: state.py - 46, text, life: FLOAT_MS })
}

/** 撞障碍：有免撞则抵消一次（耗尽即落骑），否则翻滚减速并短暂失控。 */
function crash(state: AvaState): void {
  if (state.shields > 0) {
    state.shields -= 1
    if (state.shields === 0) state.mount = 'none'
    state.crashGraceMs = CRASH_GRACE_MS
    state.events.push({ type: 'shield', x: state.px, y: state.py })
    addFloat(state, state.shields > 0 ? '免撞!' : '落骑!')
    return
  }
  state.vx = Math.max(MIN_SPEED * 0.7, state.vx * CRASH_VX_KEEP)
  state.tumbleMs = TUMBLE_MS
  state.crashGraceMs = CRASH_GRACE_MS
  state.tilt = 0
  state.events.push({ type: 'crash', x: state.px, y: state.py })
  addFloat(state, '摔!')
}

/**
 * 推进一帧：坡度加速与速度恢复、起跳（跳台更高）、空中姿态与重力、
 * 落地判定（特技计分 + 姿态检查）、障碍碰撞（骑乘抵消/翻滚）、金币与
 * 伙伴拾取、雪崩推进与追尾结束。事件写入 state.events，调用方每帧消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（jump 为本帧按下）。
 */
export function stepAvalanche(state: AvaState, dtMs: number, input: AvaInput): void {
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

  if (state.tumbleMs > 0) state.tumbleMs -= dtMs
  if (state.crashGraceMs > 0) state.crashGraceMs -= dtMs

  // 坡度加速 + 满速钳制 + 低速恢复。
  const cap = maxSpeed(state)
  if (state.onGround) state.vx += gradeAt(state, state.px) * SLOPE_ACCEL * dt
  state.vx = Math.min(cap, state.vx)
  if (state.vx < MIN_SPEED) state.vx = Math.min(cap, state.vx + RECOVER_ACCEL * dt)
  state.px += state.vx * dt
  if (state.px > (state.maxSeg - 1) * SEG_W) ensureSegments(state, Math.floor(state.px / SEG_W) + 2)

  // 起跳：在坡面上且未失控时；跳台范围内初速更高。
  if (input.jump && state.onGround && state.tumbleMs <= 0) {
    const seg = state.segments.get(Math.floor(state.px / SEG_W))!
    const rampX = seg.rampK >= 0 ? seg.index * SEG_W + seg.rampK * STEP : -1
    const boost = rampX >= 0 && Math.abs(state.px - rampX) < RAMP_RADIUS ? RAMP_BOOST : 0
    state.vy = -(JUMP_V + boost)
    state.onGround = false
    state.airMs = 0
    state.events.push({ type: 'jump', x: state.px, y: state.py })
  }

  if (state.onGround) {
    // 贴地跟随折线。
    state.py = groundYAt(state, state.px)
    state.tilt = 0
  } else {
    // 空中：←→ 控制姿态倾角，重力下坠。
    if (state.tumbleMs <= 0) {
      if (input.left && !input.right) state.tilt = Math.max(-MAX_TILT, state.tilt - ROT_SPEED * dt)
      if (input.right && !input.left) state.tilt = Math.min(MAX_TILT, state.tilt + ROT_SPEED * dt)
    }
    state.vy += GRAVITY * dt
    state.py += state.vy * dt
    state.airMs += dtMs
    const gy = groundYAt(state, state.px)
    if (state.vy >= 0 && state.py >= gy) {
      state.py = gy
      state.onGround = true
      state.events.push({ type: 'land', x: state.px, y: state.py })
      // 特技：滞空超过阈值，按超出量折算翻滚次数。
      if (state.airMs > TRICK_MIN_MS) {
        const flips = Math.floor((state.airMs - TRICK_MIN_MS) / FLIP_MS) + 1
        const gained = flips * TRICK_SCORE
        state.trickScore += gained
        state.events.push({ type: 'trick', x: state.px, y: state.py, gained })
        addFloat(state, 'Trick! +' + gained)
      }
      // 落地姿态过倾 → 翻滚减速。
      if (Math.abs(state.tilt) > LAND_TILT_MAX) crash(state)
      state.tilt = 0
      state.airMs = 0
    }
  }

  // 附近段的实体交互：障碍碰撞（无敌宽限内跳过）、金币、伙伴。
  const segIndex = Math.floor(state.px / SEG_W)
  for (let i = Math.max(0, segIndex - 1); i <= segIndex + 1 && i <= state.maxSeg; i += 1) {
    const seg = state.segments.get(i)!
    if (state.crashGraceMs <= 0 && state.py > groundYAt(state, state.px) - 18) {
      for (const obs of seg.obstacles) {
        const oy = segmentGroundY(seg, obs.x)
        if (Math.hypot(state.px - obs.x, state.py - oy) < obs.r + PLAYER_R - 2) {
          crash(state)
          break
        }
      }
    }
    for (const coin of seg.coins) {
      if (!coin.taken && Math.abs(state.px - coin.x) < 22 && Math.abs(state.py - coin.y) < 46) {
        coin.taken = true
        state.coinScore += COIN_SCORE
        state.events.push({ type: 'coin', x: coin.x, y: coin.y })
        addFloat(state, '+' + COIN_SCORE)
      }
    }
    for (const m of seg.mounts) {
      if (!m.taken && state.onGround && Math.abs(state.px - m.x) < 24) {
        m.taken = true
        state.mount = m.kind
        state.shields = m.kind === 'yeti' ? 2 : 1
        state.events.push({ type: 'mount', x: m.x, y: state.py, kind: m.kind })
        addFloat(state, m.kind === 'penguin' ? '骑企鹅!' : '骑雪人!')
      }
    }
  }

  // 雪崩推进：略低于玩家满速，随距离缓慢提速；追尾即结束。
  const avaSpeed = Math.min(AVA_MAX_SPEED, AVA_BASE_SPEED + Math.floor(state.px / AVA_GROW_DIST) * AVA_GROW)
  state.avalancheX += avaSpeed * dt
  if (avalancheGap(state) < 0) {
    state.phase = 'over'
    state.events.push({ type: 'over', x: state.px, y: state.py })
  }
}

/**
 * 总分 = 距离分（每 10px 1 分）+ 金币分 + 特技分。
 * @param state - 当前状态。
 * @returns 总分。
 */
export function totalScore(state: AvaState): number {
  return Math.floor(state.px / DIST_UNIT) + state.coinScore + state.trickScore
}

/**
 * 当前已滑距离（米，HUD 用）：10px 记 1 米。
 * @param state - 当前状态。
 * @returns 距离米数。
 */
export function displayDistance(state: AvaState): number {
  return Math.floor(state.px / DIST_UNIT)
}
