/**
 * 开锁达人（Lockpick）纯逻辑：锁芯横剖面上的双轴操作——①张力（按住
 * ←/→ 施加：张力大=弹子难顶起但芯稳，且达到最低张力弹子才能卡住设定）
 * ②撬棍顶弹子（数字键选弹子，按住空格施力顶起，弹子随施力上移；进入
 * 设定窗口后松开即卡住；施力过冲窗口上限则弹子弹回，锁芯因张力偏转
 * 崩掉已设定的弹子——张力越高崩得越多，每次崩塌耐久 -1）。全部弹子
 * 设定后锁芯旋转开锁进入下一把锁：共 5 把锁递进（窗口收窄、回弹更快、
 * 崩塌更重）。所有随机参数由注入 seed 经 mulberry32 派生，同 seed 同
 * 局数轨迹完全一致。时间单位毫秒，位移为 0..1 归一化行程。
 */

/** 逻辑画布尺寸（含 HUD 区域）。 */
export const W = 480
export const H = 600
/** 总锁数（过关数）。 */
export const MAX_LOCKS = 5
/** 初始耐久（每崩 -1，耗尽失败）。 */
export const START_DURABILITY = 3
/** 张力上升速率 /s（按住 ←/→）。 */
export const TENSION_RISE = 1.7
/** 张力松开衰减速率 /s。 */
export const TENSION_DECAY = 1.3
/** 弹子能卡住设定所需的最低张力。 */
export const MIN_SET_TENSION = 0.25
/** 无张力时的基础顶起速率（行程/s）。 */
export const LIFT_BASE = 0.62
/** 张力对顶起速率的抑制系数（lift *= 1 - tension * TENSION_DRAG）。 */
export const TENSION_DRAG = 0.55
/** 超出窗口上限多远判为过冲（归一化行程）。 */
export const OVERSHOOT_MARGIN = 0.05
/** 每颗弹子设定得分。 */
export const PIN_SCORE = 20
/** 每把锁开锁得分。 */
export const LOCK_SCORE = 100
/** 开锁旋转动画时长 ms。 */
export const UNLOCK_MS = 900
/** 崩塌抖动时长 ms。 */
export const COLLAPSE_SHAKE_MS = 420

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
 * 第 level 把锁的弹子数（4-6 递进）。
 * @param level - 关卡号（从 1 开始）。
 * @returns 弹子数量。
 */
export function pinsForLock(level: number): number {
  return 4 + Math.floor((level - 1) / 2)
}

/**
 * 第 level 把锁的设定窗口半宽（窗口收窄：0.10 → 0.044）。
 * @param level - 关卡号。
 * @returns 窗口半宽（归一化行程）。
 */
export function windowHalfFor(level: number): number {
  return Math.max(0.044, 0.10 - (level - 1) * 0.014)
}

/**
 * 第 level 把锁未设定弹子的回弹速率（行程/s，回弹更快）。
 * @param level - 关卡号。
 * @returns 回弹速率。
 */
export function reboundSpeedFor(level: number): number {
  return 1.1 + level * 0.35
}

/**
 * 第 level 把锁的崩塌系数：过冲时按 setCount * (0.25 + tension * 系数)
 * 取整决定崩掉几颗已设定弹子（崩塌更重）。
 * @param level - 关卡号。
 * @returns 崩塌系数。
 */
export function collapseFactorFor(level: number): number {
  return 0.35 + level * 0.12
}

/** 一颗弹子的随机参数：设定窗口下/上限（归一化行程 0..1）。 */
export interface PinSpec { windowLow: number, windowHigh: number }

/**
 * 生成某把锁的全部弹子窗口：窗口中心随机分布在 0.55..0.9，同宽半宽。
 * 纯确定性（seed+round+锁号派生）。
 * @param seed - 本局种子。
 * @param round - 局数。
 * @param lockIndex - 锁号（0 起）。
 * @returns 弹子参数数组。
 */
export function buildLockPins(seed: number, round: number, lockIndex: number): PinSpec[] {
  const rng = mulberry32((Math.floor(seed) * 97 + round * 131 + lockIndex * 61) >>> 0)
  const level = lockIndex + 1
  const half = windowHalfFor(level)
  const pins: PinSpec[] = []
  for (let i = 0; i < pinsForLock(level); i += 1) {
    const center = 0.55 + rng() * (0.35 - half)
    pins.push({ windowLow: center - half, windowHigh: center + half })
  }
  return pins
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type LockpickEvent =
  | { type: 'set', pin: number }
  | { type: 'overshoot', pin: number, collapsed: number }
  | { type: 'unlock', lock: number }
  | { type: 'fail' }
  | { type: 'win' }

/** 一局游戏的完整可测状态。 */
export interface LockpickState {
  /** 本局种子与局数（下一把锁的装配依赖，保持确定性）。 */
  seed: number
  round: number
  /** 回合内已流逝 ms。 */
  t: number
  score: number
  /** 剩余耐久（0 = 失败）。 */
  durability: number
  /** 当前锁号（0 起；到达 MAX_LOCKS 即胜利）。 */
  lockIndex: number
  /** 当前锁的弹子参数。 */
  pins: PinSpec[]
  /** 各弹子当前行程 0..1+（施力上移、松开回弹）。 */
  pos: number[]
  /** 各弹子是否已卡住设定。 */
  set: boolean[]
  /** 设定顺序（弹子索引，崩塌从最近的崩起）。 */
  setOrder: number[]
  /** 当前选中的弹子索引。 */
  current: number
  /** 空格是否按住（施力中）。 */
  pressing: boolean
  /** 张力 0..1（按住 ←/→ 上升，松开衰减）。 */
  tension: number
  /** 张力输入（←/→ 任一按住为 true）。 */
  tensionInput: boolean
  /** 最近张力方向（-1 左 / 1 右，仅视觉）。 */
  tensionDir: -1 | 0 | 1
  /** 开锁旋转动画剩余 ms。 */
  unlockMs: number
  /** 崩塌抖动剩余 ms。 */
  shakeMs: number
  events: LockpickEvent[]
  over: boolean
  won: boolean
}

/**
 * 装配第 lockIndex 把锁到状态（重建弹子数组与行程）。
 * @param state - 目标状态。
 * @param lockIndex - 锁号（0 起）。
 */
function setupLock(state: LockpickState, lockIndex: number): void {
  state.lockIndex = lockIndex
  state.pins = buildLockPins(state.seed, state.round, lockIndex)
  state.pos = state.pins.map(() => 0)
  state.set = state.pins.map(() => false)
  state.setOrder = []
  state.current = 0
  state.pressing = false
}

/**
 * 新开一局：同 seed 同 round 的整局轨迹完全一致。
 * @param seed - 外部种子。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createLockpick(seed: number, round = 1): LockpickState {
  const state: LockpickState = {
    seed: Math.floor(seed),
    round,
    t: 0,
    score: 0,
    durability: START_DURABILITY,
    lockIndex: 0,
    pins: [],
    pos: [],
    set: [],
    setOrder: [],
    current: 0,
    pressing: false,
    tension: 0,
    tensionInput: false,
    tensionDir: 0,
    unlockMs: 0,
    shakeMs: 0,
    events: [],
    over: false,
    won: false,
  }
  setupLock(state, 0)
  return state
}

/**
 * 选中一颗弹子（数字键）：越界 / 结束 / 开锁动画中忽略；施力中先取消。
 * @param state - 目标状态。
 * @param index - 弹子索引。
 */
export function selectPin(state: LockpickState, index: number): void {
  if (state.over || state.unlockMs > 0) return
  if (index < 0 || index >= state.pins.length || index === state.current) return
  state.pressing = false
  state.current = index
}

/**
 * 按下空格开始施力顶起当前弹子。
 * @param state - 目标状态。
 */
export function pressPin(state: LockpickState): void {
  if (state.over || state.unlockMs > 0 || state.set[state.current] === true) return
  state.pressing = true
}

/**
 * 松开空格：在设定窗口内且张力足够则卡住设定，否则弹子开始回弹。
 * @param state - 目标状态。
 */
export function releasePin(state: LockpickState): void {
  if (!state.pressing) return
  state.pressing = false
  const i = state.current
  const spec = state.pins[i]!
  const p = state.pos[i]!
  if (!state.set[i] && p >= spec.windowLow && p <= spec.windowHigh && state.tension >= MIN_SET_TENSION) {
    state.set[i] = true
    state.setOrder.push(i)
    state.pos[i] = (spec.windowLow + spec.windowHigh) / 2
    state.score += PIN_SCORE
    state.events.push({ type: 'set', pin: i })
  }
}

/** 过冲处理：弹子弹回、崩塌传播与耐久扣减（返回是否失败）。 */
function handleOvershoot(state: LockpickState, i: number): void {
  state.pos[i] = 0
  state.pressing = false
  state.shakeMs = COLLAPSE_SHAKE_MS
  let collapsed = 0
  // 锁芯只在有张力咬合时才会因偏转崩弹子并损失耐久。
  if (state.tension >= MIN_SET_TENSION) {
    state.durability -= 1
    const factor = collapseFactorFor(state.lockIndex + 1)
    const want = Math.min(state.setOrder.length, Math.max(1, Math.round(state.setOrder.length * (0.25 + state.tension * factor))))
    for (let k = 0; k < want; k += 1) {
      const victim = state.setOrder.pop()
      if (victim === undefined) break
      state.set[victim] = false
      state.pos[victim] = 0
      collapsed += 1
    }
  }
  state.events.push({ type: 'overshoot', pin: i, collapsed })
  if (state.durability <= 0) {
    state.durability = 0
    state.over = true
    state.won = false
    state.events.push({ type: 'fail' })
  }
}

/**
 * 推进一帧：张力积分、当前弹子施力位移积分、其余弹子回弹、过冲崩塌、
 * 全设定开锁与过关切换。事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepLockpick(state: LockpickState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  const dt = dtMs / 1000
  if (state.shakeMs > 0) state.shakeMs = Math.max(0, state.shakeMs - dtMs)

  // 张力积分：按住上升，松开衰减。
  if (state.tensionInput) state.tension = Math.min(1, state.tension + TENSION_RISE * dt)
  else state.tension = Math.max(0, state.tension - TENSION_DECAY * dt)

  // 开锁旋转动画：结束后装配下一把锁或胜利。
  if (state.unlockMs > 0) {
    state.unlockMs = Math.max(0, state.unlockMs - dtMs)
    if (state.unlockMs <= 0) {
      const next = state.lockIndex + 1
      if (next >= MAX_LOCKS) {
        state.over = true
        state.won = true
        state.events.push({ type: 'win' })
      } else {
        setupLock(state, next)
      }
    }
    return
  }

  const level = state.lockIndex + 1
  // 施力位移积分：张力越大越难顶起。
  if (state.pressing) {
    const i = state.current
    if (state.set[i] === true) {
      state.pressing = false
    } else {
      const lift = LIFT_BASE * (1 + (level - 1) * 0.04) * (1 - state.tension * TENSION_DRAG)
      state.pos[i] = state.pos[i]! + lift * dt
      const spec = state.pins[i]!
      if (state.pos[i]! > spec.windowHigh + OVERSHOOT_MARGIN) handleOvershoot(state, i)
      if (state.over) return
    }
  }

  // 未施力的未设定弹子回弹（关卡越高回弹越快）；已设定弹子停在窗口中心。
  const rebound = reboundSpeedFor(level)
  for (let i = 0; i < state.pins.length; i += 1) {
    if (state.set[i] || (state.pressing && i === state.current)) continue
    state.pos[i] = Math.max(0, state.pos[i]! - rebound * dt)
  }

  // 全部设定 → 开锁旋转动画。
  if (state.set.every((s) => s)) {
    state.score += LOCK_SCORE
    state.unlockMs = UNLOCK_MS
    state.events.push({ type: 'unlock', lock: state.lockIndex + 1 })
  }
}

/**
 * 当前弹子在设定窗口内（渲染高亮提示用）。
 * @param state - 目标状态。
 * @returns true 表示当前行程落在窗口内。
 */
export function inWindow(state: LockpickState): boolean {
  const spec = state.pins[state.current]!
  const p = state.pos[state.current]!
  return p >= spec.windowLow && p <= spec.windowHigh
}
