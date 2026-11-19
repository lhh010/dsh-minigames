/**
 * 起重机 Crane 纯逻辑：码头龙门吊码放（汉诺塔变体 + 抛物线物理）。
 * 吊钩随吊臂横向匀速往返（相位由种子决定），空格在吊钩位置抓取立柱
 * 顶部的集装箱；抓住的箱跟随摆动，再按空格按当前摆速抛下——箱沿
 * 抛物线坠落，落在柱容差内且"小上大下"合法则入柱（离柱心越近精准
 * 加成越高），落偏或压在更大的箱上则倒塔：失败 +1，箱退回原柱顶。
 * 全部箱按大小顺序（可再要求颜色分组）码到目标柱即过关，共 5 关
 * 递进（箱数 3→6、摆速加快、颜色分组）。所有随机来自注入的
 * mulberry32 种子流，同种子同输入完全可重放；渲染层只读状态，事件
 * 经 state.events 供渲染消费。
 */

/** 逻辑画布宽度（px）。 */
export const W = 640
/** 逻辑画布高度（px）。 */
export const H = 560

/** 三根立柱的圆心 x（索引 0 = 起始柱，2 = 目标柱）。 */
export const TOWER_X = [130, 320, 510] as const
/** 目标柱索引。 */
export const TARGET = 2
/** 地面 y（柱底 / 集装箱落地面，px）。 */
export const GROUND_Y = 470
/** 吊臂横梁 y（px）。 */
export const BOOM_Y = 96
/** 吊绳长度：吊钩悬挂高度 = BOOM_Y + ROPE_LEN（px）。 */
export const ROPE_LEN = 148
/** 集装箱统一高度（px）。 */
export const BOX_H = 28
/** 抓取容差：吊钩与柱心横向距离不超过该值才能抓（px）。 */
export const GRAB_TOL = 42
/** 落柱容差：落点与柱心横向距离不超过该值才算入柱（px）。 */
export const LAND_TOL = 46
/** 摆动中心 x 与振幅（px）：吊钩在 [mid-amp, mid+amp] 内往返。 */
export const SWING_MID = 320
export const SWING_AMP = 238
/** 基准摆动周期（ms；实际周期 = SWEEP_MS / 关卡速度）。 */
export const SWEEP_MS = 4200
/** 抛物线重力加速度（px/s²）。 */
export const G = 1500
/** 抛出水平初速 = 摆速 × 该系数（物理感：摆得越快甩得越远）。 */
export const THROW_VX_FACTOR = 0.9

/** 关卡配置（箱数递增、摆速加快、后两关要求颜色分组）。 */
export interface CraneLevel {
  /** 本关集装箱数量。 */
  boxes: number
  /** 摆速倍率（周期 = SWEEP_MS / speed）。 */
  speed: number
  /** 过关是否额外要求同色箱在目标柱上连续。 */
  colorGroup: boolean
}

/** 5 关递进配置。 */
export const LEVELS: readonly CraneLevel[] = [
  { boxes: 3, speed: 1.0, colorGroup: false },
  { boxes: 4, speed: 1.25, colorGroup: false },
  { boxes: 5, speed: 1.55, colorGroup: false },
  { boxes: 5, speed: 1.85, colorGroup: true },
  { boxes: 6, speed: 2.2, colorGroup: true },
]

/** 一只集装箱：size 越大箱越小（0 = 最大），宽随 size 递减。 */
export interface Box {
  /** 局内唯一 id。 */
  id: number
  /** 大小序号：0 最大，越大越小（合法栈要求下层 size 更小）。 */
  size: number
  /** 绘制宽度（px）。 */
  w: number
  /** 颜色索引（取强调色）。 */
  color: number
}

/** 逻辑向渲染广播的一次性事件。 */
export type CraneEvent =
  | { type: 'grab', x: number, y: number, size: number }
  | { type: 'throw', x: number, y: number }
  | { type: 'land', x: number, y: number, tower: number, precision: number }
  | { type: 'topple', x: number, y: number, tower: number }
  | { type: 'splash', x: number, y: number }
  | { type: 'win', level: number, levelScore: number }
  | { type: 'levelStart', level: number }
  | { type: 'over', score: number }

/** 游戏阶段：待抓 → 携带 → 抛落 → 落定缓冲 → 过关切换 → 全部完成。 */
export type CranePhase = 'swing' | 'carry' | 'falling' | 'settle' | 'between' | 'over'

/** 抛落中的箱（物理积分状态）。 */
export interface FallingBox {
  box: Box
  /** 箱左上角 x / y（px）。 */
  x: number, y: number
  /** 水平 / 垂直速度（px/s）。 */
  vx: number, vy: number
  /** 视觉旋转角（rad，渲染用）。 */
  spin: number
}

/** 一局 crane 的全部可测状态。 */
export interface CraneState {
  /** 当前阶段。 */
  phase: CranePhase
  /** 当前关卡（0 起）。 */
  level: number
  /** 总分（过关累加）。 */
  score: number
  /** 本关步数（每次抛下 +1）。 */
  steps: number
  /** 本关失败次数（倒塔 / 落水）。 */
  fails: number
  /** 本关精准加成累计（离柱心越近越高）。 */
  bonusTotal: number
  /** 三根立柱：数组下 0 = 柱底，末位 = 柱顶。 */
  towers: Box[][]
  /** 抓住的箱（未抓为 null）。 */
  carried: Box | null
  /** 抓取来源柱索引（失败退回该柱顶）。 */
  carryFrom: number
  /** 吊臂摆动相位（rad，种子定初相）。 */
  hookPhase: number
  /** 吊钩 x（px，step 内随相位刷新）。 */
  hookX: number
  /** 吊钩水平速度（px/s，抛出初速来源）。 */
  hookVx: number
  /** 抛落中的箱。 */
  fall: FallingBox | null
  /** 落定缓冲剩余（ms，含落点供弹跳动画）。 */
  settle: { ms: number, x: number, y: number, tower: number, ok: boolean } | null
  /** 过关切换剩余（ms）。 */
  betweenMs: number
  /** 最近一次入柱精准度（0..LAND_TOL）。 */
  lastPrecision: number
  /** 事件队列（step 开头清空，渲染每帧消费）。 */
  events: CraneEvent[]
  /** 注入的随机流（配色 / 初相全部经由它）。 */
  rng: () => number
  /** 关内时钟（ms）。 */
  timeMs: number
  /** 装饰时钟（ms，渲染动画用）。 */
  animMs: number
  /** 下一只箱 id。 */
  nextId: number
}

/**
 * 确定性伪随机流（mulberry32）：同种子产生完全相同的 0..1 序列。
 * @param seed - 非负整数种子。
 * @returns 产生 [0, 1) 随机数的函数。
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

/** 箱宽随大小序号递减：size 0 最宽（px）。 */
export function boxWidth(size: number): number {
  return 112 - size * 13
}

/** 柱顶表面 y（px）：空柱即地面。 */
export function stackTopY(tower: Box[]): number {
  return GROUND_Y - BOX_H * tower.length
}

/**
 * 栈是否合法：自底向上 size 严格递增（大下小上）。
 * @param tower - 一根立柱的箱序列（下 0 .. 顶末）。
 */
export function isStackOrdered(tower: Box[]): boolean {
  for (let i = 1; i < tower.length; i += 1) {
    if (tower[i]!.size <= tower[i - 1]!.size) return false
  }
  return true
}

/**
 * 同色箱是否各自连续（颜色分组关的过关附加条件）。
 * @param tower - 一根立柱的箱序列。
 */
export function isColorGrouped(tower: Box[]): boolean {
  const seen = new Set<number>()
  let prev = -1
  for (const box of tower) {
    if (box.color !== prev) {
      if (seen.has(box.color)) return false
      seen.add(box.color)
      prev = box.color
    }
  }
  return true
}

/**
 * 过关判定：全部箱都在目标柱上、大下小上，且（该关要求时）同色连续。
 * @param state - 当前状态。
 */
export function isLevelWon(state: CraneState): boolean {
  const target = state.towers[TARGET]!
  const total = target.length + (state.carried !== null ? 1 : 0)
    + state.towers.reduce((sum, t, i) => (i === TARGET ? sum : sum + t.length), 0)
  if (state.carried !== null || state.fall !== null) return false
  if (total !== LEVELS[state.level]!.boxes) return false
  if (target.length !== total) return false
  if (!isStackOrdered(target)) return false
  if (LEVELS[state.level]!.colorGroup && !isColorGrouped(target)) return false
  return true
}

/** 关卡开始：按种子布置箱色与初相，全部箱大下小上堆在起始柱。 */
function startLevel(state: CraneState): void {
  const cfg = LEVELS[state.level]!
  const boxes: Box[] = []
  for (let i = 0; i < cfg.boxes; i += 1) {
    boxes.push({ id: state.nextId, size: i, w: boxWidth(i), color: cfg.colorGroup ? Math.floor(i / 2) : Math.floor(state.rng() * 4) })
    state.nextId += 1
  }
  state.towers = [boxes, [], []]
  state.carried = null
  state.fall = null
  state.settle = null
  state.steps = 0
  state.fails = 0
  state.bonusTotal = 0
  state.hookPhase = state.rng() * Math.PI * 2
  state.timeMs = 0
  state.phase = 'swing'
  state.events.push({ type: 'levelStart', level: state.level })
}

/**
 * 创建一局新状态：第 0 关、箱堆起始柱、吊臂初相由种子决定。
 * @param seed - 种子（与局号组合决定随机流）。
 * @param run - 局号（重开递增，避免同种子完全重演）。
 */
export function createCrane(seed: number, run = 0): CraneState {
  const rng = mulberry32((seed * 374761393 + run * 668265263) >>> 0)
  const state: CraneState = {
    phase: 'swing',
    level: 0,
    score: 0,
    steps: 0,
    fails: 0,
    bonusTotal: 0,
    towers: [[], [], []],
    carried: null,
    carryFrom: 0,
    hookPhase: 0,
    hookX: SWING_MID,
    hookVx: 0,
    fall: null,
    settle: null,
    betweenMs: 0,
    lastPrecision: 0,
    events: [],
    rng,
    timeMs: 0,
    animMs: 0,
    nextId: 1,
  }
  startLevel(state)
  state.events.length = 0
  return state
}

/** 当前关摆动角速度（rad/ms）。 */
function omega(state: CraneState): number {
  return (Math.PI * 2) / (SWEEP_MS / LEVELS[state.level]!.speed)
}

/** 就地重算吊钩位置与速度（解析导数，无需帧差）。 */
function refreshHook(state: CraneState): void {
  state.hookX = SWING_MID + SWING_AMP * Math.sin(state.hookPhase)
  // d/dt [mid + amp·sin(phase)] = amp·cos(phase)·ω（rad/ms → px/s）。
  state.hookVx = SWING_AMP * Math.cos(state.hookPhase) * omega(state) * 1000
}

/** 落定 / 倒塔后的收尾：回摆等待下一次抓取。 */
function finishDrop(state: CraneState, x: number, y: number, tower: number, ok: boolean, ms = 320): void {
  state.settle = { ms, x, y, tower, ok }
  state.phase = 'settle'
}

/**
 * 抛落结算：落点最近柱在容差内且"小上大下"合法则入柱计精准加成并
 * 判过关；否则倒塔 / 落水，失败 +1，箱退回抓取来源柱顶。
 */
function resolveFall(state: CraneState): void {
  const fall = state.fall!
  state.fall = null
  let near = -1
  let nearDist = Infinity
  for (let i = 0; i < 3; i += 1) {
    const d = Math.abs(fall.x + fall.box.w / 2 - TOWER_X[i]!)
    if (d < nearDist) { nearDist = d; near = i }
  }
  const box = fall.box
  const boxCx = fall.x + box.w / 2
  if (nearDist <= LAND_TOL) {
    const tower = state.towers[near]!
    const top = tower[tower.length - 1]
    if (top === undefined || box.size > top.size) {
      tower.push(box)
      const precision = LAND_TOL - Math.abs(boxCx - TOWER_X[near]!)
      state.lastPrecision = precision
      state.bonusTotal += Math.round(precision * 2)
      state.events.push({ type: 'land', x: TOWER_X[near]!, y: stackTopY(tower), tower: near, precision })
      finishDrop(state, TOWER_X[near]!, stackTopY(tower), near, true)
      if (isLevelWon(state)) {
        const levelScore = Math.max(100, 1000 + state.bonusTotal - state.steps * 20 - state.fails * 150)
        state.score += levelScore
        state.phase = 'between'
        state.betweenMs = 1400
        state.events.push({ type: 'win', level: state.level, levelScore })
      }
      return
    }
    // 大箱压小箱：倒塔。
    state.fails += 1
    state.towers[state.carryFrom]!.push(box)
    state.events.push({ type: 'topple', x: TOWER_X[near]!, y: stackTopY(tower), tower: near })
    finishDrop(state, TOWER_X[near]!, stackTopY(tower), near, false, 520)
    return
  }
  // 落进柱间水面：箱退回来源柱顶。
  state.fails += 1
  state.towers[state.carryFrom]!.push(box)
  state.events.push({ type: 'splash', x: boxCx, y: GROUND_Y })
  finishDrop(state, boxCx, GROUND_Y, -1, false, 420)
}

/**
 * 推进一帧模拟：吊臂相位积分、抛落物理、落定缓冲与过关切换。事件
 * 写入 state.events（每帧开头清空）。
 * @param state - 当前状态。
 * @param dtMs - 帧时长（ms）。
 */
export function stepCrane(state: CraneState, dtMs: number): void {
  state.events.length = 0
  const dt = dtMs / 1000
  state.timeMs += dtMs
  state.animMs += dtMs

  if (state.phase === 'swing' || state.phase === 'carry') {
    state.hookPhase += omega(state) * dtMs
    refreshHook(state)
    return
  }
  if (state.phase === 'falling') {
    const fall = state.fall
    if (fall === null) { state.phase = 'swing'; return }
    fall.x += fall.vx * dt
    fall.y += fall.vy * dt
    fall.vy += G * dt
    fall.spin += fall.vx * dt * 0.004
    const nearDist = nearestTowerDist(fall.x + fall.box.w / 2)
    if (nearDist <= LAND_TOL) {
      const top = stackTopY(state.towers[nearestTower(fall.x + fall.box.w / 2)]!)
      if (fall.y + BOX_H >= top) { resolveFall(state); return }
    } else if (fall.y + BOX_H >= GROUND_Y) {
      resolveFall(state)
      return
    }
    if (fall.y > H + 80) resolveFall(state)
    return
  }
  if (state.phase === 'settle') {
    state.settle!.ms -= dtMs
    if (state.settle!.ms <= 0) {
      state.settle = null
      state.phase = 'swing'
    }
    return
  }
  if (state.phase === 'between') {
    state.betweenMs -= dtMs
    if (state.betweenMs <= 0) {
      state.level += 1
      if (state.level >= LEVELS.length) {
        state.phase = 'over'
        state.events.push({ type: 'over', score: state.score })
        return
      }
      startLevel(state)
      refreshHook(state)
    }
  }
}

/** 落点箱心与最近柱的横向距离（px）。 */
function nearestTowerDist(cx: number): number {
  return Math.abs(cx - TOWER_X[nearestTower(cx)]!)
}

/** 落点箱心最近的柱索引。 */
function nearestTower(cx: number): number {
  let near = 0
  let nearDist = Infinity
  for (let i = 0; i < 3; i += 1) {
    const d = Math.abs(cx - TOWER_X[i]!)
    if (d < nearDist) { nearDist = d; near = i }
  }
  return near
}

/**
 * 玩家按空格 / 点击：swing 时抓取吊钩容差内最近非空柱的顶箱；carry
 * 时按当前摆速抛下；其余阶段忽略。
 * @param state - 当前状态。
 */
export function pressCrane(state: CraneState): void {
  if (state.phase === 'swing') {
    let near = -1
    let nearDist = Infinity
    for (let i = 0; i < 3; i += 1) {
      if (state.towers[i]!.length === 0) continue
      const d = Math.abs(state.hookX - TOWER_X[i]!)
      if (d <= GRAB_TOL && d < nearDist) { nearDist = d; near = i }
    }
    if (near < 0) return
    const tower = state.towers[near]!
    const box = tower.pop()!
    state.carried = box
    state.carryFrom = near
    state.phase = 'carry'
    state.events.push({ type: 'grab', x: TOWER_X[near]!, y: stackTopY(tower), size: box.size })
    return
  }
  if (state.phase === 'carry' && state.carried !== null) {
    const box = state.carried
    state.carried = null
    state.steps += 1
    state.phase = 'falling'
    state.fall = {
      box,
      x: state.hookX - box.w / 2,
      y: BOOM_Y + ROPE_LEN,
      vx: state.hookVx * THROW_VX_FACTOR,
      vy: 40,
      spin: 0,
    }
    state.events.push({ type: 'throw', x: state.hookX, y: BOOM_Y + ROPE_LEN })
  }
}
