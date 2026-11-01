/**
 * 悠闲钓鱼（Fishing）纯逻辑：一局 120 秒或断线 3 次结束。流程为
 * 待咬（idle）→ 咬钩窗口（bite）→ 搏斗（fight）→ 结算浮字，循环往复。
 * 鱼群由 seed+round 经 mulberry32 确定性生成：品种决定重量区间、拉力
 * 基础/波动频率、体力上限与分值系数（小鱼 1~3kg 温顺，鲨鱼 15~30kg
 * 狂暴）。搏斗阶段：按住 = 收线（距离减少、线张力随鱼瞬时拉力上升、
 * 鱼体力消耗），松开 = 张力回落、鱼按拉力缓慢逃跑；张力 ≥ 100 断线
 * （记 1 次失败），距离收到 0 即捕获（得分 = 重量 × 品种系数），
 * 距离超出上限则跑鱼。全部函数确定性可测，时间单位毫秒。
 */

/** 逻辑画布尺寸。 */
export const W = 480
export const H = 600
/** 水面分界线 y（上为天空，下为水下）。 */
export const WATER_Y = 140

/** 一局时长 ms。 */
export const ROUND_MS = 120_000
/** 断线次数上限，达到即结束。 */
export const MAX_BREAKS = 3
/** 咬钩窗口 ms：期间按住才能刺鱼进入搏斗。 */
export const BITE_MS = 1600
/** 搏斗初始收线距离（"米"，渲染深度也用它）。 */
export const DIST_START = 100
/** 跑线判定：距离超过该值则跑鱼。 */
export const DIST_ESCAPE = 135
/** 张力上限，达到即断线。 */
export const TENSION_MAX = 100
/** 收线速度 m/s（按住时距离减少速率）。 */
export const REEL_SPEED = 13
/** 松开时张力回落速率 /s。 */
export const TENSION_FALL = 58
/** 张力对拉力的增益系数（按住时张力变化 = (pull - REEL_EASE) * K）。 */
export const TENSION_GAIN = 1.9
/** 按住时的张力缓解基值（拉力低于它收线反而降压）。 */
export const REEL_EASE = 22
/** 按住时的张力保底增益（拉力再低也至少涨这么多/s）——死按不放必然断线，
 * 必须在张力高时松线回落，形成收-放节奏。 */
export const HOLD_MIN_GAIN = 7
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 1400

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

/** 鱼种表：名称 / 重量区间 kg / 拉力基础 / 拉力波动角速度 / 体力 / 分值系数。索引即 kind。 */
export const FISH_KINDS = [
  { name: '小鲫鱼', wMin: 1, wMax: 3, pull: 26, omega: 1.6, stamina: 34, factor: 10 },
  { name: '鲤鱼', wMin: 3, wMax: 8, pull: 36, omega: 2.1, stamina: 55, factor: 8 },
  { name: '大嘴鲈', wMin: 5, wMax: 12, pull: 44, omega: 2.6, stamina: 70, factor: 9 },
  { name: '金枪鱼', wMin: 20, wMax: 45, pull: 62, omega: 3.0, stamina: 120, factor: 12 },
  { name: '灰鲨', wMin: 15, wMax: 30, pull: 80, omega: 3.8, stamina: 105, factor: 15 },
] as const

/** 咬钩的那条鱼（品种 + 确定性属性）。 */
export interface HookedFish {
  kind: number
  /** 重量 kg（区间内确定性取值）。 */
  weight: number
  /** 拉力正弦相位（波动起点）。 */
  phase: number
  /** 剩余体力。 */
  stamina: number
  /** 体力上限。 */
  staminaMax: number
}

/** 阶段：待咬 / 咬钩窗口 / 搏斗 / 结束。 */
export type FishingPhase = 'idle' | 'bite' | 'fight' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type FishingEvent =
  | { type: 'bite', x: number }
  | { type: 'hook', x: number }
  | { type: 'catch', x: number, y: number, kind: number, weight: number, points: number }
  | { type: 'break', x: number }
  | { type: 'escape', x: number }

/** 上浮渐隐的结算浮字（鱼名+重量+分 / 断线 / 跑鱼）。 */
export interface FloatText {
  x: number, y: number
  text: string
  life: number
}

/** 一局游戏的完整可测状态。 */
export interface FishingState {
  /** 回合内已流逝 ms。 */
  t: number
  timeLeft: number
  score: number
  /** 已断线次数。 */
  breaks: number
  /** 已捕获条数。 */
  catches: number
  phase: FishingPhase
  /** 待咬剩余 ms（倒计时到 0 触发咬钩）。 */
  waitMs: number
  /** 咬钩窗口剩余 ms。 */
  biteMs: number
  /** 搏斗中的鱼（fight 阶段非空）。 */
  fish: HookedFish | null
  /** 搏斗内已流逝 ms（拉力波动钟）。 */
  fightT: number
  /** 收线距离（越大越深；收到 0 捕获）。 */
  distance: number
  /** 线张力 0~100。 */
  tension: number
  /** 最近一次瞬时拉力 0~100（HUD / 渲染用）。 */
  pullNow: number
  /** 玩家当前是否按住（step 入参的镜像，渲染用）。 */
  holding: boolean
  events: FishingEvent[]
  floats: FloatText[]
  rng: () => number
}

/**
 * 待咬时长 ms：1500~4500 均匀确定性取值。
 * @param rng - 局内随机源。
 * @returns 下一次咬钩前的等待毫秒。
 */
function nextWait(rng: () => number): number {
  return 1500 + rng() * 3000
}

/**
 * 确定性抽一条咬钩的鱼：品种均匀，重量在区间内取值。
 * @param rng - 局内随机源。
 * @returns 咬钩的鱼。
 */
function rollFish(rng: () => number): HookedFish {
  const kind = Math.floor(rng() * FISH_KINDS.length)
  const spec = FISH_KINDS[kind]!
  const weight = Math.round((spec.wMin + rng() * (spec.wMax - spec.wMin)) * 10) / 10
  const stamina = spec.stamina * (0.85 + rng() * 0.3)
  return { kind, weight, phase: rng() * Math.PI * 2, stamina, staminaMax: stamina }
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createFishing(seed: number, round = 1): FishingState {
  const rng = mulberry32((Math.floor(seed) * 37 + round * 101) >>> 0)
  return {
    t: 0,
    timeLeft: ROUND_MS,
    score: 0,
    breaks: 0,
    catches: 0,
    phase: 'idle',
    waitMs: nextWait(rng),
    biteMs: 0,
    fish: null,
    fightT: 0,
    distance: DIST_START,
    tension: 0,
    pullNow: 0,
    holding: false,
    events: [],
    floats: [],
    rng,
  }
}

/** 浮标 x（画布中部固定，事件定位用）。 */
export const BOBBER_X = W * 0.42

/**
 * 鱼的瞬时拉力 0~100：品种基础 × 正弦波动 × 体力衰减，体力耗尽后只剩微弱死拽。
 * @param fish - 搏斗中的鱼。
 * @param fightT - 搏斗内毫秒钟。
 * @returns 瞬时拉力（0~100 标度）。
 */
export function pullOf(fish: HookedFish, fightT: number): number {
  const spec = FISH_KINDS[fish.kind % FISH_KINDS.length]!
  const wave = 0.62 + 0.38 * Math.sin(fightT / 1000 * spec.omega + fish.phase)
  const vigor = Math.max(0.18, fish.stamina / fish.staminaMax)
  return Math.max(2, spec.pull * wave * (0.35 + 0.65 * vigor))
}

/**
 * 松开时鱼的逃跑速度 m/s：拉力越大跑越快，体力耗尽后近乎拖行。
 * @param fish - 搏斗中的鱼。
 * @param pull - 当前瞬时拉力。
 * @returns 距离增加速率。
 */
export function escapeSpeed(fish: HookedFish, pull: number): number {
  const vigor = Math.max(0.1, fish.stamina / fish.staminaMax)
  return 1.5 + (pull / TENSION_MAX) * 6 * vigor
}

/**
 * 捕获结算分：重量 × 品种系数。
 * @param fish - 被捕获的鱼。
 * @returns 得分。
 */
export function catchPoints(fish: HookedFish): number {
  return Math.round(fish.weight * FISH_KINDS[fish.kind % FISH_KINDS.length]!.factor)
}

/** 回到待咬阶段（结算或跑鱼后），随机下一条的等待。 */
function toIdle(state: FishingState): void {
  state.phase = 'idle'
  state.waitMs = nextWait(state.rng)
  state.biteMs = 0
  state.fish = null
  state.fightT = 0
  state.tension = 0
  state.pullNow = 0
}

/**
 * 推进一帧：计时、待咬→咬钩→搏斗状态机、张力 / 距离 / 体力物理与结算。
 * 事件写入 state.events，调用方每帧消费（下一帧开头清空）。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param holding - 玩家当前是否按住（收线）。
 */
export function stepFishing(state: FishingState, dtMs: number, holding: boolean): void {
  state.events.length = 0
  state.holding = holding
  if (state.phase === 'over') return
  const dt = dtMs / 1000
  state.t += dtMs
  state.timeLeft = Math.max(0, state.timeLeft - dtMs)
  if (state.timeLeft <= 0) { state.phase = 'over'; return }

  // 飘字上浮渐隐。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 30 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }

  if (state.phase === 'idle') {
    state.waitMs -= dtMs
    if (state.waitMs <= 0) {
      state.fish = rollFish(state.rng)
      state.phase = 'bite'
      state.biteMs = BITE_MS
      state.events.push({ type: 'bite', x: BOBBER_X })
    }
    return
  }

  if (state.phase === 'bite') {
    state.biteMs -= dtMs
    if (holding) {
      // 刺鱼成功，进入搏斗。
      state.phase = 'fight'
      state.fightT = 0
      state.distance = DIST_START
      state.tension = 20
      state.events.push({ type: 'hook', x: BOBBER_X })
      return
    }
    if (state.biteMs <= 0) {
      // 错过咬钩窗口，鱼游走。
      state.floats.push({ x: BOBBER_X, y: WATER_Y + 26, text: '没咬住…', life: FLOAT_MS })
      toIdle(state)
    }
    return
  }

  // fight 阶段。
  const fish = state.fish
  if (fish === null) { toIdle(state); return }
  state.fightT += dtMs
  const pull = pullOf(fish, state.fightT)
  state.pullNow = pull

  if (holding) {
    // 收线：距离减少，张力按 (拉力-缓解) 上升（保底 HOLD_MIN_GAIN），
    // 鱼体力随对抗消耗——死按不放张力只增不减，必须适时松线。
    state.tension += Math.max(HOLD_MIN_GAIN, pull - REEL_EASE) * TENSION_GAIN * dt
    state.distance -= REEL_SPEED * dt
    fish.stamina = Math.max(0, fish.stamina - (9 + pull * 0.16) * dt)
  } else {
    // 松线：张力回落，鱼缓慢逃跑。
    state.tension -= TENSION_FALL * dt
    state.distance += escapeSpeed(fish, pull) * dt
    fish.stamina = Math.max(0, fish.stamina - 2.5 * dt)
  }
  state.tension = Math.max(0, Math.min(TENSION_MAX, state.tension))

  if (state.tension >= TENSION_MAX) {
    // 断线。
    state.breaks += 1
    const name = FISH_KINDS[fish.kind % FISH_KINDS.length]!.name
    state.floats.push({ x: BOBBER_X + 40, y: WATER_Y - 26, text: '断线！' + name + '跑了', life: FLOAT_MS })
    state.events.push({ type: 'break', x: BOBBER_X })
    if (state.breaks >= MAX_BREAKS) { state.phase = 'over'; state.fish = null; return }
    toIdle(state)
    return
  }
  if (state.distance <= 0) {
    // 捕获。
    const pts = catchPoints(fish)
    state.score += pts
    state.catches += 1
    const name = FISH_KINDS[fish.kind % FISH_KINDS.length]!.name
    state.floats.push({
      x: BOBBER_X + 60,
      y: WATER_Y - 30,
      text: name + ' ' + fish.weight.toFixed(1) + 'kg +' + pts,
      life: FLOAT_MS,
    })
    state.events.push({ type: 'catch', x: BOBBER_X, y: WATER_Y, kind: fish.kind, weight: fish.weight, points: pts })
    toIdle(state)
    return
  }
  if (state.distance > DIST_ESCAPE) {
    // 跑鱼。
    const name = FISH_KINDS[fish.kind % FISH_KINDS.length]!.name
    state.floats.push({ x: BOBBER_X, y: WATER_Y + 26, text: name + '脱钩跑了…', life: FLOAT_MS })
    state.events.push({ type: 'escape', x: BOBBER_X })
    toIdle(state)
  }
}

/**
 * 当前渲染深度 0~1（鱼影纵向位置）：距离越近水面越小。
 * @param state - 当前状态。
 * @returns 0（水面）~1（最深处）。
 */
export function depthOf(state: FishingState): number {
  if (state.phase !== 'fight' || state.fish === null) return 1
  return Math.max(0, Math.min(1, state.distance / DIST_ESCAPE))
}
