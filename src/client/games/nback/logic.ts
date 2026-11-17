/**
 * N-Back 记忆训练纯逻辑：3×3 位置流（+后期的声音数字流）按固定节律逐个
 * 呈现刺激，玩家判断当前刺激是否与 N 步之前相同。全部随机由注入 seed 的
 * mulberry32 驱动，序列、计分、档位升降、节轮转与序列化重放均为确定性
 * 纯函数，可离线测试。
 */

/** 逻辑画布宽度（渲染层与本层共享的坐标系）。 */
export const LOGICAL_W = 480
/** 逻辑画布高度。 */
export const LOGICAL_H = 340
/** 3×3 网格共 9 个位置（0..8，行优先）。 */
export const GRID_CELLS = 9
/** 每节 trial 数。 */
export const TRIALS_PER_SESSION = 20
/** 每个 trial 的呈现时长（毫秒）。 */
export const TRIAL_MS = 2500
/** trial 内格子点亮的时长（毫秒），其余时间为空档。 */
export const LIGHT_MS = 1200
/** 命中加分。 */
export const SCORE_HIT = 10
/** 误按扣分。 */
export const SCORE_FALSE = -5
/** 漏按不扣分（常量仅作说明）。 */
export const SCORE_MISS = 0
/** N 档上下限。 */
export const MAX_N = 3
export const MIN_N = 1
/** 节末准确率 ≥ 此值升一档。 */
export const PROMOTE_ACC = 0.8
/** 节末准确率 < 此值降一档。 */
export const DEMOTE_ACC = 0.5
/** 一局共几节。 */
export const SESSIONS_PER_GAME = 4
/** 第几节（1 起）起启用双流（位置 + 声音数字）。 */
export const DUAL_FROM_SESSION = 3
/** 反馈闪烁时长（秒）。 */
export const FLASH_S = 0.5
/** 位置流约束：目标（与 N 步前相同）概率。 */
export const TARGET_RATE = 0.3
/** 位置流约束：同一位置最多连续出现次数（防超长同格）。 */
export const MAX_RUN = 2
/** 位置流约束：连续多少个非目标后强制插入一个目标（防过易）。 */
export const MAX_TARGET_GAP = 7

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀分布的随机函数；同种子序列完全一致。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 单条刺激流的生成约束。 */
export interface StreamConfig {
  /** 值域大小（位置流 9 格，声音流数字 1-9）。 */
  size: number
  /** 目标（与 N 步前相同）概率。 */
  targetRate: number
  /** 是否限制同一值连续出现的次数（位置流限制，声音流不限制）。 */
  avoidRuns: boolean
}

/** 位置流（3×3 格）约束。 */
export const POSITION_STREAM: StreamConfig = { size: GRID_CELLS, targetRate: TARGET_RATE, avoidRuns: true }
/** 声音流（数字 1-9）约束。 */
export const AUDIO_STREAM: StreamConfig = { size: 9, targetRate: TARGET_RATE, avoidRuns: false }

/** 计算序列末尾同一值的连续长度。 */
function trailingRun(seq: number[]): { value: number; run: number } {
  if (seq.length === 0) return { value: -1, run: 0 }
  const value = seq[seq.length - 1]!
  let run = 1
  for (let i = seq.length - 2; i >= 0 && seq[i] === value; i -= 1) run += 1
  return { value, run }
}

/**
 * 生成一条刺激流：目标位（i ≥ n 时按概率或超长空档强制）取 i-n 位的值，
 * 非目标位避开 i-n 位的值（i ≥ n 时），avoidRuns 时同值连续不超过
 * MAX_RUN。拒绝采样用确定性 +1 回退，保证同 seed 完全可重放。
 * @param rng - 注入的随机函数。
 * @param count - trial 总数。
 * @param n - N-Back 的 N。
 * @param config - 流约束。
 * @returns 长度为 count 的值数组（位置 0..8；声音流调用方自行 +1 成数字）。
 */
export function generateStream(rng: () => number, count: number, n: number, config: StreamConfig): number[] {
  const seq: number[] = []
  let lastTarget = -1
  for (let i = 0; i < count; i += 1) {
    const canTarget = i >= n
    const tail = trailingRun(seq)
    let wantTarget = false
    if (canTarget) {
      const starved = i - lastTarget > MAX_TARGET_GAP
      wantTarget = starved || rng() < config.targetRate
    }
    if (wantTarget && config.avoidRuns && tail.run >= MAX_RUN && seq[i - n] === tail.value) {
      // 目标值会延续末尾已达上限的连击（n=1 必中，n≥2 偶发）：降级为非目标。
      wantTarget = false
    }
    if (wantTarget) {
      seq.push(seq[i - n]!)
      lastTarget = i
      continue
    }
    let v = Math.floor(rng() * config.size)
    const nBack = canTarget ? seq[i - n]! : -1
    while (v === nBack || (config.avoidRuns && tail.run >= MAX_RUN && v === tail.value)) {
      v = (v + 1) % config.size
    }
    seq.push(v)
  }
  return seq
}

/** 一节的完整计划：位置序列 + 声音序列（单流模式声音序列生成但不启用）。 */
export interface SessionPlan {
  /** 本节使用的 N。 */
  n: number
  /** 是否双流（位置 + 声音同时判定）。 */
  dual: boolean
  /** 位置序列（0..8）。 */
  positions: number[]
  /** 声音数字序列（1..9）。 */
  digits: number[]
}

/**
 * 按节序号从 seed 派生该节计划：每节用 mulberry32(seed ^ (节序+1)*黄金比)
 * 独立取随机流，序列化重放时无需回放随机消费。
 * @param seed - 本局种子。
 * @param sessionIndex - 节序号（0 起）。
 * @param n - 本节 N 档。
 * @param dual - 是否双流。
 * @returns 该节的刺激计划。
 */
export function planSession(seed: number, sessionIndex: number, n: number, dual: boolean): SessionPlan {
  const rng = mulberry32((seed ^ Math.imul(sessionIndex + 1, 2654435761)) >>> 0)
  const positions = generateStream(rng, TRIALS_PER_SESSION, n, POSITION_STREAM)
  const digits = generateStream(rng, TRIALS_PER_SESSION, n, AUDIO_STREAM).map((v) => v + 1)
  return { n, dual, positions, digits }
}

/** 反馈类别：命中 / 误按 / 漏按。 */
export type FeedbackKind = 'hit' | 'false' | 'miss'

/** 单条流（位置或声音）的节内计数。 */
export interface StreamCounters {
  hits: number
  misses: number
  falseAlarms: number
}

/** 一节结束的小结记录。 */
export interface SessionSummary {
  /** 本节 N 档。 */
  n: number
  /** 本节是否双流。 */
  dual: boolean
  /** 本节准确率（0..1）。 */
  accuracy: number
  /** 节后决定的下一节 N 档。 */
  nextN: number
}

/** 游戏阶段：trial 进行中 / 节间小结 / 一局结束。 */
export type NBackPhase = 'running' | 'summary' | 'over'

/** N-Back 完整可变状态（纯数据，可序列化）。 */
export interface NBackState {
  /** 本局种子（每节随机流由此派生）。 */
  seed: number
  /** 当前 N 档。 */
  n: number
  /** 本局到达过的最高 N 档。 */
  maxN: number
  /** 节序号（0 起）。 */
  sessionIndex: number
  /** 节内 trial 序号（0 起）。 */
  trialIndex: number
  /** 当前 trial 已流逝毫秒。 */
  trialElapsed: number
  /** 全局累计秒（动画用）。 */
  elapsed: number
  phase: NBackPhase
  /** 当前节计划。 */
  plan: SessionPlan
  score: number
  /** 小结阶段暂存的下一节 N 档（running/over 阶段无意义）。 */
  pendingN: number
  /** 本 trial 位置流是否已作答。 */
  respondedPosition: boolean
  /** 本 trial 声音流是否已作答。 */
  respondedAudio: boolean
  /** 位置流节内计数。 */
  positionCounters: StreamCounters
  /** 声音流节内计数。 */
  audioCounters: StreamCounters
  /** 全局（跨节跨流）计数。 */
  total: StreamCounters
  /** 位置流反馈闪烁剩余秒。 */
  flashPosition: number
  /** 声音流反馈闪烁剩余秒。 */
  flashAudio: number
  flashPositionKind: FeedbackKind | null
  flashAudioKind: FeedbackKind | null
  /** 已完成各节的小结。 */
  history: SessionSummary[]
}

/**
 * 某节序号（0 起）是否为双流（位置 + 声音）。
 * @param sessionIndex - 节序号（0 起）。
 * @returns 双流返回 true。
 */
export function isDualSession(sessionIndex: number): boolean {
  return sessionIndex + 1 >= DUAL_FROM_SESSION
}

/**
 * 生成初始状态：第 1 节、N=1、单流。
 * @param seed - 种子（默认取当前时间，测试必须显式传入）。
 * @returns 初始 NBackState。
 */
export function createNBackState(seed: number = Date.now() >>> 0): NBackState {
  const state: NBackState = {
    seed,
    n: MIN_N,
    maxN: MIN_N,
    sessionIndex: 0,
    trialIndex: 0,
    trialElapsed: 0,
    elapsed: 0,
    phase: 'running',
    plan: planSession(seed, 0, MIN_N, isDualSession(0)),
    score: 0,
    pendingN: MIN_N,
    respondedPosition: false,
    respondedAudio: false,
    positionCounters: { hits: 0, misses: 0, falseAlarms: 0 },
    audioCounters: { hits: 0, misses: 0, falseAlarms: 0 },
    total: { hits: 0, misses: 0, falseAlarms: 0 },
    flashPosition: 0,
    flashAudio: 0,
    flashPositionKind: null,
    flashAudioKind: null,
    history: [],
  }
  return state
}

/**
 * 当前 trial 的位置是否与 N 步前相同（前 n 个 trial 无参照，恒 false）。
 * @param state - 当前状态。
 * @returns 相同返回 true。
 */
export function isPositionMatch(state: NBackState): boolean {
  if (state.trialIndex < state.n) return false
  return state.plan.positions[state.trialIndex] === state.plan.positions[state.trialIndex - state.n]
}

/**
 * 当前 trial 的声音数字是否与 N 步前相同（单流模式恒 false）。
 * @param state - 当前状态。
 * @returns 双流且相同时返回 true。
 */
export function isAudioMatch(state: NBackState): boolean {
  if (!state.plan.dual || state.trialIndex < state.n) return false
  return state.plan.digits[state.trialIndex] === state.plan.digits[state.trialIndex - state.n]
}

/** 记录一次判定结果并触发反馈闪烁。 */
function applyFeedback(state: NBackState, stream: 'position' | 'audio', kind: FeedbackKind): FeedbackKind {
  const counters = stream === 'position' ? state.positionCounters : state.audioCounters
  if (kind === 'hit') {
    state.score += SCORE_HIT
    counters.hits += 1
    state.total.hits += 1
  } else {
    state.score += SCORE_FALSE
    counters.falseAlarms += 1
    state.total.falseAlarms += 1
  }
  if (stream === 'position') {
    state.flashPosition = FLASH_S
    state.flashPositionKind = kind
  } else {
    state.flashAudio = FLASH_S
    state.flashAudioKind = kind
  }
  return kind
}

/**
 * 玩家对当前 trial 作答：命中 +10；不匹配时误按 -5（前 n 个 trial 无参照，
 * 作答同样记误按）。同一流同一 trial 只记第一次；非 running 阶段或单流模式
 * 按声音均忽略。
 * @param state - 当前状态。
 * @param stream - 作答的流。
 * @returns 'hit' | 'false'，忽略时 null。
 */
export function respond(state: NBackState, stream: 'position' | 'audio'): FeedbackKind | null {
  if (state.phase !== 'running') return null
  if (stream === 'position') {
    if (state.respondedPosition) return null
    state.respondedPosition = true
    return applyFeedback(state, 'position', isPositionMatch(state) ? 'hit' : 'false')
  }
  if (!state.plan.dual) return null
  if (state.respondedAudio) return null
  state.respondedAudio = true
  return applyFeedback(state, 'audio', isAudioMatch(state) ? 'hit' : 'false')
}

/** trial 结算：未作答且本流匹配 → 漏按（不扣分，仅计数与闪烁）。 */
function settleMisses(state: NBackState): void {
  if (!state.respondedPosition && isPositionMatch(state)) {
    state.positionCounters.misses += 1
    state.total.misses += 1
    state.flashPosition = FLASH_S
    state.flashPositionKind = 'miss'
  }
  if (state.plan.dual && !state.respondedAudio && isAudioMatch(state)) {
    state.audioCounters.misses += 1
    state.total.misses += 1
    state.flashAudio = FLASH_S
    state.flashAudioKind = 'miss'
  }
}

/** 合并两条流的计数。 */
function mergeCounters(a: StreamCounters, b: StreamCounters): StreamCounters {
  return {
    hits: a.hits + b.hits,
    misses: a.misses + b.misses,
    falseAlarms: a.falseAlarms + b.falseAlarms,
  }
}

/**
 * 计数流的准确率：命中 / (命中 + 漏按 + 误按)，无判定时为 0。
 * @param counters - 计数流。
 * @returns 0..1 的准确率。
 */
export function streamAccuracy(counters: StreamCounters): number {
  const t = counters.hits + counters.misses + counters.falseAlarms
  return t <= 0 ? 0 : counters.hits / t
}

/**
 * 当前节准确率（位置 + 声音合并）。
 * @param state - 当前状态。
 * @returns 0..1 的节内准确率。
 */
export function sessionAccuracy(state: NBackState): number {
  return streamAccuracy(mergeCounters(state.positionCounters, state.audioCounters))
}

/**
 * 全局准确率（跨节跨流）。
 * @param state - 当前状态。
 * @returns 0..1 的总准确率。
 */
export function overallAccuracy(state: NBackState): number {
  return streamAccuracy(state.total)
}

/**
 * 按节末准确率决定下一节 N 档：≥ PROMOTE_ACC 升一档（封顶 MAX_N），
 * < DEMOTE_ACC 降一档（保底 MIN_N），其余保持。
 * @param n - 本节 N 档。
 * @param accuracy - 本节准确率。
 * @returns 下一节 N 档。
 */
export function nextLevel(n: number, accuracy: number): number {
  if (accuracy >= PROMOTE_ACC) return Math.min(MAX_N, n + 1)
  if (accuracy < DEMOTE_ACC) return Math.max(MIN_N, n - 1)
  return n
}

/** 节结束：写小结、决定下一节 N 档并进入 summary（最后一节直接 over）。 */
function endSession(state: NBackState): void {
  const accuracy = sessionAccuracy(state)
  const nextN = nextLevel(state.n, accuracy)
  state.history.push({ n: state.n, dual: state.plan.dual, accuracy, nextN })
  state.trialElapsed = 0
  if (state.sessionIndex + 1 >= SESSIONS_PER_GAME) {
    state.phase = 'over'
  } else {
    state.phase = 'summary'
    state.pendingN = nextN
  }
}

/**
 * 小结后进入下一节：应用 pendingN（并更新 maxN），换新计划与计数。
 * 仅在 summary 阶段有效。
 * @param state - 当前状态。
 * @returns 是否成功推进。
 */
export function advanceSession(state: NBackState): boolean {
  if (state.phase !== 'summary') return false
  state.n = state.pendingN
  state.maxN = Math.max(state.maxN, state.n)
  state.sessionIndex += 1
  state.trialIndex = 0
  state.trialElapsed = 0
  state.respondedPosition = false
  state.respondedAudio = false
  state.positionCounters = { hits: 0, misses: 0, falseAlarms: 0 }
  state.audioCounters = { hits: 0, misses: 0, falseAlarms: 0 }
  state.plan = planSession(state.seed, state.sessionIndex, state.n, isDualSession(state.sessionIndex))
  state.phase = 'running'
  return true
}

/**
 * 推进一帧：衰减反馈闪烁；running 时累计 trial 计时，trial 到期先结算漏按
 * 再切下一个 trial；一节最后一个 trial 结束后进入 summary/over。
 * @param state - 当前状态。
 * @param dt - 帧间隔秒。
 */
export function tickNBack(state: NBackState, dt: number): void {
  if (state.flashPosition > 0) {
    state.flashPosition = Math.max(0, state.flashPosition - dt)
    if (state.flashPosition === 0) state.flashPositionKind = null
  }
  if (state.flashAudio > 0) {
    state.flashAudio = Math.max(0, state.flashAudio - dt)
    if (state.flashAudio === 0) state.flashAudioKind = null
  }
  if (state.phase !== 'running') return
  state.elapsed += dt
  state.trialElapsed += dt * 1000
  while (state.trialElapsed >= TRIAL_MS && state.phase === 'running') {
    settleMisses(state)
    state.trialElapsed -= TRIAL_MS
    state.trialIndex += 1
    state.respondedPosition = false
    state.respondedAudio = false
    if (state.trialIndex >= TRIALS_PER_SESSION) endSession(state)
  }
}

/**
 * 序列化快照：纯 JSON 数据，用于重放/持久化。
 * @param state - 当前状态。
 * @returns 可 JSON 化的快照对象。
 */
export interface NBackSnapshot {
  seed: number
  n: number
  maxN: number
  sessionIndex: number
  trialIndex: number
  trialElapsed: number
  elapsed: number
  phase: NBackPhase
  pendingN: number
  score: number
  respondedPosition: boolean
  respondedAudio: boolean
  positionCounters: StreamCounters
  audioCounters: StreamCounters
  total: StreamCounters
  history: SessionSummary[]
  plan: SessionPlan
}

export function serializeNBack(state: NBackState): NBackSnapshot {
  return {
    seed: state.seed,
    n: state.n,
    maxN: state.maxN,
    sessionIndex: state.sessionIndex,
    trialIndex: state.trialIndex,
    trialElapsed: state.trialElapsed,
    elapsed: state.elapsed,
    phase: state.phase,
    pendingN: state.pendingN,
    score: state.score,
    respondedPosition: state.respondedPosition,
    respondedAudio: state.respondedAudio,
    positionCounters: { ...state.positionCounters },
    audioCounters: { ...state.audioCounters },
    total: { ...state.total },
    history: state.history.map((h) => ({ ...h })),
    plan: {
      n: state.plan.n,
      dual: state.plan.dual,
      positions: [...state.plan.positions],
      digits: [...state.plan.digits],
    },
  }
}

/**
 * 从快照重建状态（后续各节随机流仍由 seed 派生，重放确定）。
 * @param snapshot - serializeNBack 的输出。
 * @returns 重建的 NBackState。
 */
export function deserializeNBack(snapshot: NBackSnapshot): NBackState {
  return {
    seed: snapshot.seed,
    n: snapshot.n,
    maxN: snapshot.maxN,
    sessionIndex: snapshot.sessionIndex,
    trialIndex: snapshot.trialIndex,
    trialElapsed: snapshot.trialElapsed,
    elapsed: snapshot.elapsed,
    phase: snapshot.phase,
    pendingN: snapshot.pendingN,
    score: snapshot.score,
    respondedPosition: snapshot.respondedPosition,
    respondedAudio: snapshot.respondedAudio,
    positionCounters: { ...snapshot.positionCounters },
    audioCounters: { ...snapshot.audioCounters },
    total: { ...snapshot.total },
    history: snapshot.history.map((h) => ({ ...h })),
    plan: snapshot.plan,
    flashPosition: 0,
    flashAudio: 0,
    flashPositionKind: null,
    flashAudioKind: null,
  }
}
