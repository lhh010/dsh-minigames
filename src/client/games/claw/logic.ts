/**
 * 抓娃娃机 Claw 纯逻辑：双轴时序定位（水平扫描 → 前后深度扫描）→
 * 摆动下爪 → 夹取判定（娃娃大小 + 爪心偏移 → 命中概率）→ 提升、平移
 * 到出口 → 途中滑落判定（偏移越大越易掉）→ 入洞得分。所有随机来自
 * 注入的 mulberry32 种子流（布局 / 夹取 / 滑落），同种子同输入完全
 * 可重放；渲染层只读本模块状态，事件经 state.events 供渲染消费。
 */

/** 逻辑画布宽度（px）。 */
export const W = 640
/** 逻辑画布高度（px）。 */
export const H = 520

/** 机柜几何（逻辑坐标）：娃娃活动横向区间、导轨高度、地面高度、出口 x。 */
export const CABINET = { left: 92, right: 486, railY: 96, floorY: 440, chuteX: 572 } as const

/** 每轮币数（= 夹取次数）。 */
export const COINS_PER_ROUND = 5
/** 总轮数。 */
export const TOTAL_ROUNDS = 3

/** 爪最大下降深度（px，导轨以下）。 */
export const DROP_DEPTH = 320
/** 水平扫描周期（ms）。 */
export const X_CYCLE_MS = 2600
/** 前后深度扫描周期（ms）。 */
export const Z_CYCLE_MS = 1800
/** 钟摆摆动周期（ms）。 */
export const PEND_CYCLE_MS = 1250

/** 下降速度（px/s）。 */
const DROP_SPEED = 300
/** 提升速度（px/s）。 */
const LIFT_SPEED = 280
/** 平移到出口的速度（px/s）。 */
const SLIDE_SPEED = 250

/** 娃娃档次：大娃宽松低分、中娃均衡、钥匙扣难抓高分。 */
export interface DollKind {
  /** 档次名。 */
  name: string
  /** 基准半身尺寸（px）。 */
  size: number
  /** 入洞得分。 */
  value: number
}

/** 三档娃娃（索引即 kind）。 */
export const DOLL_KINDS: readonly DollKind[] = [
  { name: '大熊', size: 34, value: 100 },
  { name: '中娃', size: 24, value: 220 },
  { name: '钥匙扣', size: 15, value: 450 },
]

/** 柜内一只娃娃。 */
export interface Doll {
  /** 局内唯一 id。 */
  id: number
  /** 横向位置（px）。 */
  x: number
  /** 纵深 0（前排，大）..1（后排，小）。 */
  z: number
  /** 档次索引（见 DOLL_KINDS）。 */
  kind: number
  /** 本局实际尺寸（随轮次缩小，px）。 */
  size: number
  /** 入洞得分。 */
  value: number
}

/** 逻辑向渲染广播的一次性事件。 */
export type ClawEvent =
  | { type: 'lockX', x: number }
  | { type: 'lockZ', z: number }
  | { type: 'grab', x: number, y: number, value: number }
  | { type: 'miss', x: number, y: number }
  | { type: 'slip', x: number, y: number, value: number }
  | { type: 'score', x: number, y: number, value: number }
  | { type: 'roundStart', round: number }
  | { type: 'over', score: number }

/** 游戏阶段：水平定位 → 深度定位 → 下爪 → 提升/平移/投放 → 结束。 */
export type ClawPhase = 'aimX' | 'aimZ' | 'drop' | 'carry' | 'over'

/** 一局 claw 的全部可测状态。 */
export interface ClawState {
  /** 当前阶段。 */
  phase: ClawPhase
  /** 轮次（0 起）。 */
  round: number
  /** 本轮剩余币。 */
  coinsLeft: number
  /** 总分。 */
  score: number
  /** 累计成功夹取次数（驱动摆动幅度递进）。 */
  totalGrabs: number
  /** 爪横向位置（px；定位阶段随扫描刷新）。 */
  clawX: number
  /** 爪纵深 0..1（深度定位阶段随扫描刷新）。 */
  clawZ: number
  /** 锁定的横向位置（px）。 */
  lockedX: number
  /** 锁定的纵深 0..1。 */
  lockedZ: number
  /** 导轨以下下降量（px）。 */
  dropY: number
  /** 正在携带的娃娃（未夹中 / 已滑落为 null）。 */
  carrying: Doll | null
  /** 夹中时预抽的滑落判定值。 */
  slipRoll: number
  /** 本爪夹取时的爪心偏移（px）。 */
  lastOff: number
  /** 本爪是否已做过滑落判定。 */
  slipDone: boolean
  /** 柜内娃娃。 */
  dolls: Doll[]
  /** 事件队列（step 开头清空，渲染每帧消费）。 */
  events: ClawEvent[]
  /** 注入的随机流（布局 / 夹取 / 滑落全部经由它）。 */
  rng: () => number
  /** 回合内时钟（ms，驱动两轴扫描）。 */
  timeMs: number
  /** 装饰时钟（ms，渲染动画用）。 */
  animMs: number
  /** 钟摆相位（rad）。 */
  pendPhase: number
  /** 下一只娃娃 id。 */
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

/** 娃娃的绘制 / 判定纵坐标（地面随纵深抬高、后排更靠上）。 */
export function dollY(doll: Doll): number {
  return CABINET.floorY - 22 - doll.z * 62
}

/**
 * 本局钟摆幅度（px）：基础小摆，随累计成功与轮次递进（后轮更难）。
 * @param totalGrabs - 累计成功夹取次数。
 * @param round - 轮次（0 起）。
 */
export function swingAmplitude(totalGrabs: number, round: number): number {
  return Math.min(60, 8 + totalGrabs * 7 + round * 14)
}

/**
 * 当前钟摆横向偏移（px）：幅度 × sin(相位)，夹取判定即用它。
 * @param state - 当前状态。
 */
export function swingDx(state: ClawState): number {
  return swingAmplitude(state.totalGrabs, state.round) * Math.sin(state.pendPhase)
}

/**
 * 夹中概率：娃娃越大越宽容，爪心偏移越大越难夹，夹在 [0.03, 0.96]。
 * @param size - 娃娃尺寸（px）。
 * @param offset - 爪心与娃娃中心的横向偏移（px）。
 */
export function grabChance(size: number, offset: number): number {
  const reach = Math.max(6, size + 20)
  const centered = Math.max(0, 1 - Math.max(0, offset) / reach)
  const sizeBoost = 0.5 + size / 60
  return Math.min(0.96, Math.max(0.03, centered * sizeBoost))
}

/**
 * 携带途中的滑落概率：偏移越大越易掉，大娃更稳，后轮整体更滑。
 * @param size - 娃娃尺寸（px）。
 * @param offset - 夹取时的爪心偏移（px）。
 * @param round - 轮次（0 起）。
 */
export function slipChance(size: number, offset: number, round: number): number {
  const base = (Math.max(0, offset) / (size + 24)) * 0.8
  return Math.min(0.85, Math.max(0.04, base + round * 0.06))
}

/**
 * 用注入随机流布置一轮柜内娃娃：前后两排各 3 只，档次与位置由种子
 * 决定；后轮整体缩小（更难夹）。
 * @param rng - 注入随机流。
 * @param round - 轮次（0 起）。
 * @param firstId - 本轮起始娃娃 id。
 * @returns 娃娃数组。
 */
export function layoutDolls(rng: () => number, round: number, firstId: number): Doll[] {
  const shrink = 1 - round * 0.16
  const dolls: Doll[] = []
  const rows: { z: number, count: number }[] = [
    { z: 0.82, count: 3 },
    { z: 0.14, count: 3 },
  ]
  let id = firstId
  for (const row of rows) {
    const span = CABINET.right - CABINET.left - 60
    for (let i = 0; i < row.count; i += 1) {
      const kind = Math.floor(rng() * DOLL_KINDS.length) % DOLL_KINDS.length
      const base = DOLL_KINDS[kind]!
      const jitter = (rng() - 0.5) * 26
      const x = CABINET.left + 30 + (span / (row.count - 1)) * i + jitter
      dolls.push({
        id,
        x: Math.min(CABINET.right - 24, Math.max(CABINET.left + 24, x)),
        z: row.z,
        kind,
        size: Math.round(base.size * shrink),
        value: base.value,
      })
      id += 1
    }
  }
  return dolls
}

/**
 * 创建一局新状态：爪停在左上、5 币、娃娃按种子布置。
 * @param seed - 种子（与轮外局号组合决定随机流）。
 * @param run - 局号（重开递增，避免同日同种子完全重排）。
 */
export function createClaw(seed: number, run = 0): ClawState {
  const rng = mulberry32((seed * 374761393 + run * 668265263) >>> 0)
  return {
    phase: 'aimX',
    round: 0,
    coinsLeft: COINS_PER_ROUND,
    score: 0,
    totalGrabs: 0,
    clawX: CABINET.left,
    clawZ: 0,
    lockedX: CABINET.left,
    lockedZ: 0,
    dropY: 0,
    carrying: null,
    slipRoll: 0,
    lastOff: 0,
    slipDone: false,
    dolls: layoutDolls(rng, 0, 1),
    events: [],
    rng,
    timeMs: 0,
    animMs: 0,
    pendPhase: 0,
    nextId: 7,
  }
}

/**
 * 挑选夹取目标：横向偏移与纵深差加权距离最小、且爪够得着的娃娃。
 * @param state - 当前状态。
 * @param dx - 本爪钟摆偏移（px）。
 * @returns 最近的娃娃，无够得着的目标时为 null。
 */
export function pickTarget(state: ClawState, dx: number): Doll | null {
  let best: Doll | null = null
  let bestDist = Infinity
  for (const doll of state.dolls) {
    const off = Math.abs(doll.x - (state.lockedX + dx))
    if (off > doll.size + 26) continue
    const dist = off + Math.abs(doll.z - state.lockedZ) * 160
    if (dist < bestDist) {
      bestDist = dist
      best = doll
    }
  }
  return best
}

/** 投放完毕后的收尾：发币下一爪，或换轮 / 结束。 */
function finishCoin(state: ClawState): void {
  state.carrying = null
  state.dropY = 0
  state.clawZ = 0
  if (state.coinsLeft > 0) {
    state.phase = 'aimX'
    return
  }
  state.round += 1
  if (state.round >= TOTAL_ROUNDS) {
    state.phase = 'over'
    state.events.push({ type: 'over', score: state.score })
    return
  }
  state.dolls = layoutDolls(state.rng, state.round, state.nextId)
  state.nextId += state.dolls.length
  state.coinsLeft = COINS_PER_ROUND
  state.phase = 'aimX'
  state.events.push({ type: 'roundStart', round: state.round })
}

/**
 * 玩家点击 / 空格：aimX 锁横向进 aimZ；aimZ 锁深度并投币下爪；其余
 * 阶段忽略。
 * @param state - 当前状态。
 */
export function pressClaw(state: ClawState): void {
  if (state.phase === 'aimX') {
    state.lockedX = state.clawX
    state.phase = 'aimZ'
    state.events.push({ type: 'lockX', x: state.lockedX })
    return
  }
  if (state.phase === 'aimZ') {
    state.lockedZ = state.clawZ
    state.phase = 'drop'
    state.coinsLeft -= 1
    state.carrying = null
    state.slipDone = false
    state.lastOff = 0
    state.events.push({ type: 'lockZ', z: state.lockedZ })
  }
}

/**
 * 推进一帧模拟：两轴扫描、下爪、夹取 / 滑落判定、提升平移与投放、
 * 换轮与结束。事件写入 state.events（每帧开头清空）。
 * @param state - 当前状态。
 * @param dtMs - 帧时长（ms）。
 */
export function stepClaw(state: ClawState, dtMs: number): void {
  state.events.length = 0
  const dt = dtMs / 1000
  state.timeMs += dtMs
  state.animMs += dtMs
  state.pendPhase += (Math.PI * 2 * dtMs) / PEND_CYCLE_MS

  if (state.phase === 'aimX') {
    const mid = (CABINET.left + CABINET.right) / 2
    const half = (CABINET.right - CABINET.left) / 2
    state.clawX = mid + half * Math.sin((Math.PI * 2 * state.timeMs) / X_CYCLE_MS)
    return
  }
  if (state.phase === 'aimZ') {
    state.clawZ = 0.5 + 0.5 * Math.sin((Math.PI * 2 * state.timeMs) / Z_CYCLE_MS)
    return
  }
  if (state.phase === 'drop') {
    state.dropY = Math.min(DROP_DEPTH, state.dropY + DROP_SPEED * dt)
    if (state.dropY < DROP_DEPTH) return
    // 到底：钟摆偏移 + 大小 + 对中 → 夹取判定。
    const dx = swingDx(state)
    const target = pickTarget(state, dx)
    if (target === null) {
      state.events.push({ type: 'miss', x: state.lockedX + dx, y: CABINET.floorY - 30 })
      state.phase = 'carry'
      state.carrying = null
      return
    }
    const off = Math.abs(target.x - (state.lockedX + dx))
    state.lastOff = off
    if (state.rng() < grabChance(target.size, off)) {
      state.carrying = target
      state.slipRoll = state.rng()
      state.slipDone = false
      state.events.push({ type: 'grab', x: target.x, y: dollY(target), value: target.value })
    } else {
      state.events.push({ type: 'miss', x: state.lockedX + dx, y: dollY(target) })
    }
    state.phase = 'carry'
    return
  }
  if (state.phase === 'carry') {
    if (state.dropY > 0) {
      state.dropY = Math.max(0, state.dropY - LIFT_SPEED * dt)
      // 途中滑落判定：升到一半时结账（偏移越大越易掉）。
      if (
        state.carrying !== null && !state.slipDone
        && state.dropY <= DROP_DEPTH / 2
      ) {
        state.slipDone = true
        if (state.slipRoll < slipChance(state.carrying.size, state.lastOff, state.round)) {
          state.events.push({
            type: 'slip', x: state.clawX, y: CABINET.railY + state.dropY + 30, value: state.carrying.value,
          })
          state.carrying = null
        }
      }
      return
    }
    // 升空后平移到出口。
    const remain = CABINET.chuteX - state.clawX
    const stepLen = SLIDE_SPEED * dt
    if (Math.abs(remain) <= stepLen) {
      state.clawX = CABINET.chuteX
      if (state.carrying !== null) {
        const value = state.carrying.value
        state.score += value
        state.totalGrabs += 1
        state.dolls = state.dolls.filter((d) => d.id !== state.carrying!.id)
        state.events.push({ type: 'score', x: CABINET.chuteX, y: CABINET.floorY - 26, value })
      }
      finishCoin(state)
      return
    }
    state.clawX += Math.sign(remain) * stepLen
  }
}
