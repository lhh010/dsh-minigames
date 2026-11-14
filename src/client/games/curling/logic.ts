/**
 * 冰壶 Curling 纯逻辑：俯视赛道上的分队对抗。双方每局各掷 4 枚壶
 * （8 壶局，玩家先手），掷壶分两段锁定（方向摆针 → 力度往复条），
 * 滑行途中玩家可消耗擦冰次数（共 3 次）降低摩擦。壶受指数摩擦
 * 减速，壶间为等质量圆-圆弹性碰撞（法向速度交换 + 位置分离）。
 * 全部随机（AI 瞄准噪声）来自注入的 mulberry32 种子，同种子重放
 * 完全一致。渲染层（render.ts）只画状态；粘合层（index.ts）管输入。
 */

/** 赛道长度（世界单位，x 方向 0..210，掷壶朝 +x）。 */
export const SHEET_LEN = 210
/** 赛道宽度（世界单位，y 方向 0..60）。 */
export const SHEET_WID = 60
/** 壶半径。 */
export const STONE_R = 2.6
/** 营垒圆心（12 英尺圈圆心）。 */
export const HOUSE_X = 160
export const HOUSE_Y = 30
/** 计分半径：壶心距圆心 ≤ 此值即在营内。 */
export const HOUSE_R = 15
/** 同心圈半径（外 12ft / 中 8ft / 内 4ft，仅渲染）。 */
export const RINGS = [15, 10, 5] as const
/** 出发点（hack）位置。 */
export const HACK_X = 8
export const HACK_Y = 30
/** 满力对应初速。 */
export const MAX_THROW_SPEED = 62
/** 基础摩擦率（每秒指数衰减 v *= exp(-k·dt)）。 */
export const BASE_FRICTION_K = 0.35
/** 擦冰时的摩擦倍率（越小越滑）。 */
export const SWEEP_K_FACTOR = 0.45
/** 擦冰单次持续时长（秒）。 */
export const SWEEP_DURATION = 1.2
/** 每次掷壶的擦冰次数上限。 */
export const SWEEP_CHARGES = 3
/** 低于该速度判定静止并清零。 */
export const STOP_SPEED = 1.2
/** 侧挡板恢复系数。 */
export const WALL_RESTITUTION = 0.55
/** 后挡板恢复系数（壶撞尾板几乎停住）。 */
export const BACK_RESTITUTION = 0.12
/** 壶-壶碰撞恢复系数（等质量）。 */
export const STONE_RESTITUTION = 0.92
/** 固定物理子步长上限（防穿透）。 */
export const MAX_SUBSTEP_DT = 1 / 60
/** 方向摆针最大偏角（弧度，0 = 中线直掷）。 */
export const AIM_MAX_ANGLE = 0.45
/** 方向摆动角速度。 */
export const AIM_SWING_SPEED = 1.1
/** 力度条往复角速度。 */
export const POWER_SWING_SPEED = 1.3
/** 每方每局掷壶数。 */
export const STONES_PER_SIDE = 4
/** 总局数。 */
export const ENDS_TOTAL = 3

export type Side = 'P' | 'A'

export interface Stone {
  side: Side
  x: number
  y: number
  vx: number
  vy: number
  atRest: boolean
  /** 手柄朝向（弧度），随滑行累计，供渲染旋转。 */
  rot: number
}

export type CurlingPhase =
  | 'aimDir' | 'aimPower' | 'sliding' | 'endScore' | 'gameOver' | 'paused'

export type CurlingEvent =
  | { kind: 'hit'; x: number; y: number; speed: number }
  | { kind: 'end'; p: number; a: number; end: number }
  | { kind: 'game'; pTotal: number; aTotal: number }
  | { kind: 'throw'; side: Side }

export interface CurlingState {
  phase: CurlingPhase
  /** 暂停前的阶段（恢复用）。 */
  pausedFrom: CurlingPhase | null
  /** 当前局序号（1 起）。 */
  end: number
  stones: Stone[]
  thrownP: number
  thrownA: number
  playerTotal: number
  aiTotal: number
  /** 每局得分（{p, a}）。 */
  endScores: { p: number; a: number }[]
  /** 方向摆针时间。 */
  aimT: number
  aimAngle: number
  /** 力度往复时间。 */
  powerT: number
  power: number
  /** 本次掷壶剩余擦冰次数（仅玩家）。 */
  sweepCharges: number
  sweepActive: boolean
  sweepTimer: number
  /** 正在滑行的本回合掷出壶（擦冰只作用于它）。 */
  thrownStone: Stone | null
  events: CurlingEvent[]
  rng: () => number
  msg: string
}

/** mulberry32 种子随机（与其他游戏一致）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 新建一整场比赛（3 局，玩家先掷）。 */
export function createGame(seed: number): CurlingState {
  return {
    phase: 'aimDir',
    pausedFrom: null,
    end: 1,
    stones: [],
    thrownP: 0,
    thrownA: 0,
    playerTotal: 0,
    aiTotal: 0,
    endScores: [],
    aimT: 0,
    aimAngle: 0,
    powerT: 0,
    power: 0,
    sweepCharges: SWEEP_CHARGES,
    sweepActive: false,
    sweepTimer: 0,
    thrownStone: null,
    events: [],
    rng: mulberry32((seed >>> 0) || 1),
    msg: '点击锁定方向',
  }
}

/** 方向摆针角度：t 时刻在 ±AIM_MAX_ANGLE 间正弦摆动。 */
export function swingAngle(t: number): number {
  return AIM_MAX_ANGLE * Math.sin(t * AIM_SWING_SPEED)
}

/** 力度往复值：t 时刻在 0..1 间余弦摆动（从 0 起）。 */
export function powerAt(t: number): number {
  return 0.5 - 0.5 * Math.cos(t * POWER_SWING_SPEED)
}

/**
 * 等质量圆-圆弹性碰撞：沿接触法向交换法向速度分量（按恢复系数 e
 * 缩放，正碰 e=1 时完全交换），切向分量不变；重叠时沿法向各退一半。
 * @param a - 第一枚壶（被原地修改）。
 * @param b - 第二枚壶（被原地修改）。
 * @param e - 恢复系数 [0,1]。
 * @returns 是否发生了碰撞（接近中的接触对被化解）。
 */
export function resolveStoneCollision(a: Stone, b: Stone, e: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d2 = dx * dx + dy * dy
  const minD = STONE_R * 2
  if (d2 >= minD * minD || d2 === 0) return false
  const d = Math.sqrt(d2)
  const nx = dx / d
  const ny = dy / d
  const van = a.vx * nx + a.vy * ny
  const vbn = b.vx * nx + b.vy * ny
  if (van - vbn <= 0) return false // 已在分离
  const c1 = (1 - e) / 2
  const c2 = (1 + e) / 2
  const van2 = c1 * van + c2 * vbn
  const vbn2 = c2 * van + c1 * vbn
  a.vx += (van2 - van) * nx
  a.vy += (van2 - van) * ny
  b.vx += (vbn2 - vbn) * nx
  b.vy += (vbn2 - vbn) * ny
  const overlap = (minD - d) / 2
  a.x -= nx * overlap
  a.y -= ny * overlap
  b.x += nx * overlap
  b.y += ny * overlap
  a.atRest = false
  b.atRest = false
  return true
}

/** 挡板：侧板反弹、后板（x 上限）近乎吸能、前沿（x 下限）挡回。 */
function applyWalls(s: Stone): void {
  if (s.y - STONE_R < 0 && s.vy < 0) {
    s.y = STONE_R
    s.vy = -s.vy * WALL_RESTITUTION
    s.atRest = false
  }
  if (s.y + STONE_R > SHEET_WID && s.vy > 0) {
    s.y = SHEET_WID - STONE_R
    s.vy = -s.vy * WALL_RESTITUTION
    s.atRest = false
  }
  if (s.x + STONE_R > SHEET_LEN && s.vx > 0) {
    s.x = SHEET_LEN - STONE_R
    s.vx = -s.vx * BACK_RESTITUTION
    s.atRest = false
  }
  if (s.x - STONE_R < 0 && s.vx < 0) {
    s.x = STONE_R
    s.vx = -s.vx * BACK_RESTITUTION
    s.atRest = false
  }
}

/**
 * 推进模拟 dt 秒：固定子步积分位置、挡板、两两碰撞、指数摩擦（擦冰
 * 激活时只对本回合掷出壶降低摩擦）、低速归零。仅在 sliding 阶段运行。
 */
export function step(state: CurlingState, dt: number): void {
  state.events = []
  if (state.phase === 'paused' || state.phase === 'gameOver') return
  if (state.phase === 'aimDir') {
    state.aimT += dt
    state.aimAngle = swingAngle(state.aimT)
    return
  }
  if (state.phase === 'aimPower') {
    state.powerT += dt
    state.power = powerAt(state.powerT)
    return
  }
  if (state.phase !== 'sliding') return
  if (state.sweepActive) {
    state.sweepTimer -= dt
    if (state.sweepTimer <= 0) state.sweepActive = false
  }
  const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_DT))
  const h = dt / n
  const kSweep = BASE_FRICTION_K * SWEEP_K_FACTOR
  const dampPlain = Math.exp(-BASE_FRICTION_K * h)
  const dampSweep = Math.exp(-kSweep * h)
  for (let s = 0; s < n; s += 1) {
    for (const st of state.stones) {
      st.x += st.vx * h
      st.y += st.vy * h
      applyWalls(st)
    }
    for (let i = 0; i < state.stones.length; i += 1) {
      const a = state.stones[i]!
      for (let j = i + 1; j < state.stones.length; j += 1) {
        const b = state.stones[j]!
        if (resolveStoneCollision(a, b, STONE_RESTITUTION)) {
          const impact = Math.hypot(a.vx - b.vx, a.vy - b.vy)
          if (impact > 4) state.events.push({ kind: 'hit', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, speed: impact })
        }
      }
    }
    for (const st of state.stones) {
      const swept = state.sweepActive && st === state.thrownStone
      const damp = swept ? dampSweep : dampPlain
      st.vx *= damp
      st.vy *= damp
      const sp = Math.hypot(st.vx, st.vy)
      if (sp < STOP_SPEED) {
        st.vx = 0
        st.vy = 0
        st.atRest = true
      } else {
        st.atRest = false
        st.rot += (sp * h) / STONE_R * 0.4
      }
    }
  }
  if (state.stones.every(st => st.atRest)) finishThrow(state)
}

/** 内部共用：以当前 aimAngle/power 为 side 方掷出一壶并进入滑行。 */
function throwStone(state: CurlingState, side: Side): void {
  const p = Math.min(1, Math.max(0.1, state.power))
  const v = p * MAX_THROW_SPEED
  const stone: Stone = {
    side,
    x: HACK_X,
    y: HACK_Y,
    vx: Math.cos(state.aimAngle) * v,
    vy: Math.sin(state.aimAngle) * v,
    atRest: false,
    rot: 0,
  }
  state.stones.push(stone)
  state.thrownStone = stone
  state.sweepActive = false
  state.sweepTimer = 0
  if (side === 'P') {
    state.thrownP += 1
    state.sweepCharges = SWEEP_CHARGES
    state.msg = '空格擦冰减阻'
  } else {
    state.thrownA += 1
    state.msg = 'AI 掷壶…'
  }
  state.events.push({ kind: 'throw', side })
  state.phase = 'sliding'
}

/** 锁定方向：aimDir → aimPower，力度从 0 重新起摆。 */
export function lockAim(state: CurlingState): boolean {
  if (state.phase !== 'aimDir') return false
  state.phase = 'aimPower'
  state.powerT = 0
  state.power = 0
  state.msg = '点击锁定力度'
  return true
}

/** 锁定力度并掷壶（按双方已掷数决定该谁掷，玩家先手）。 */
export function lockPower(state: CurlingState): boolean {
  if (state.phase !== 'aimPower') return false
  throwStone(state, state.thrownP <= state.thrownA ? 'P' : 'A')
  return true
}

/**
 * 开始一次擦冰：仅当己方壶滑行中、无进行中的擦冰且次数有余量。
 * @returns 是否成功开始（消耗一次次数）。
 */
export function startSweep(state: CurlingState): boolean {
  if (state.phase !== 'sliding') return false
  if (state.thrownStone === null || state.thrownStone.side !== 'P') return false
  if (state.sweepActive || state.sweepCharges <= 0) return false
  state.sweepCharges -= 1
  state.sweepActive = true
  state.sweepTimer = SWEEP_DURATION
  return true
}

/** 提前结束当前擦冰（松开空格；不返还次数）。 */
export function endSweep(state: CurlingState): void {
  state.sweepActive = false
  state.sweepTimer = 0
}

/**
 * 营垒计分：营内（距圆心 ≤ HOUSE_R）壶按距离升序，最近一壶所属方
 * 得分，个数为该方在对方最近壶之前的营内壶数；空营双方 0 分。
 * @param stones - 全部壶。
 * @returns {p, a} 本局双方得分。
 */
export function scoreHouse(stones: readonly Stone[]): { p: number; a: number } {
  const inHouse = stones
    .map(st => ({ st, d: Math.hypot(st.x - HOUSE_X, st.y - HOUSE_Y) }))
    .filter(e => e.d <= HOUSE_R)
    .sort((u, v) => u.d - v.d)
  if (inHouse.length === 0) return { p: 0, a: 0 }
  const winner: Side = inHouse[0]!.st.side
  let count = 0
  for (const e of inHouse) {
    if (e.st.side !== winner) break
    count += 1
  }
  return winner === 'P' ? { p: count, a: 0 } : { p: 0, a: count }
}

/** 一回合壶全部静止后的收尾：结算或安排下一掷（AI 立即自动掷）。 */
function finishThrow(state: CurlingState): void {
  state.thrownStone = null
  state.sweepActive = false
  if (state.thrownP >= STONES_PER_SIDE && state.thrownA >= STONES_PER_SIDE) {
    const sc = scoreHouse(state.stones)
    state.playerTotal += sc.p
    state.aiTotal += sc.a
    state.endScores.push(sc)
    state.phase = 'endScore'
    state.msg = '第 ' + state.end + ' 局 ' + sc.p + ' : ' + sc.a
    state.events.push({ kind: 'end', p: sc.p, a: sc.a, end: state.end })
    if (state.end >= ENDS_TOTAL) {
      state.events.push({ kind: 'game', pTotal: state.playerTotal, aTotal: state.aiTotal })
    }
    return
  }
  if (state.thrownP <= state.thrownA) {
    state.phase = 'aimDir'
    state.aimT = 0
    state.aimAngle = 0
    state.powerT = 0
    state.power = 0
    state.msg = '点击锁定方向'
  } else {
    aiThrow(state)
  }
}

/** AI 掷壶：按 aiPlan 决定方向力度并立即掷出（seed 确定性）。 */
export function aiThrow(state: CurlingState): void {
  const plan = aiPlan(state.stones, state.rng)
  state.aimAngle = plan.angle
  state.power = plan.power
  throwStone(state, 'A')
}

export interface AiPlan {
  angle: number
  power: number
  /** 'draw' 进营伏壶；'takeout' 顶掉对方最近营内壶。 */
  mode: 'draw' | 'takeout'
}

/**
 * AI 策略：对方有营内壶 → 高力瞄准它顶出（takeout）；否则中等力度
 * 向圆心轻摆落壶（draw）。噪声全部来自注入 rng，同 seed 同决策。
 * @param stones - 当前赛道上的壶。
 * @param rng - 种子随机源。
 */
export function aiPlan(stones: readonly Stone[], rng: () => number): AiPlan {
  const foes = stones
    .filter(st => st.side === 'P')
    .map(st => ({ st, d: Math.hypot(st.x - HOUSE_X, st.y - HOUSE_Y) }))
    .filter(e => e.d <= HOUSE_R)
    .sort((u, v) => u.d - v.d)
  if (foes.length > 0) {
    const target = foes[0]!.st
    const angle = Math.max(-AIM_MAX_ANGLE, Math.min(AIM_MAX_ANGLE,
      Math.atan2(target.y - HACK_Y, target.x - HACK_X) + (rng() * 2 - 1) * 0.05))
    return { angle, power: 0.86 + (rng() * 2 - 1) * 0.08, mode: 'takeout' }
  }
  const angle = (rng() * 2 - 1) * 0.14
  const power = 0.86 + (rng() * 2 - 1) * 0.07
  return { angle, power, mode: 'draw' }
}

/** 局间确认：进入下一局（清壶、玩家先掷）或结束比赛。 */
export function beginNext(state: CurlingState): void {
  if (state.phase !== 'endScore') return
  if (state.end >= ENDS_TOTAL) {
    state.phase = 'gameOver'
    state.msg = state.playerTotal > state.aiTotal ? '胜利！'
      : state.playerTotal < state.aiTotal ? '惜败' : '平局'
    return
  }
  state.end += 1
  state.stones = []
  state.thrownP = 0
  state.thrownA = 0
  state.thrownStone = null
  state.phase = 'aimDir'
  state.aimT = 0
  state.aimAngle = 0
  state.powerT = 0
  state.power = 0
  state.msg = '第 ' + state.end + ' 局 · 点击锁定方向'
}

/** 重开整场比赛（同种子 → 完全一致的 AI 与摆针时序）。 */
export function restartMatch(state: CurlingState, seed: number): void {
  Object.assign(state, createGame(seed))
}

/** 暂停 / 恢复切换（记录暂停前阶段）。 */
export function togglePause(state: CurlingState): void {
  if (state.phase === 'paused') {
    state.phase = state.pausedFrom ?? 'aimDir'
    state.pausedFrom = null
  } else if (state.phase === 'aimDir' || state.phase === 'aimPower' || state.phase === 'sliding') {
    state.pausedFrom = state.phase
    state.phase = 'paused'
  }
}
