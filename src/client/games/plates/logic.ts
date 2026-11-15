/**
 * 转碟杂技（Plates）纯逻辑：舞台上最多 6 根长杆，每杆顶一只碟子；
 * 碟子转速（0..1）按每秒 0.09 自然衰减，转速低于 0.25 开始摇晃（视觉
 * 预警，由渲染层按转速推导），归零即掉落并损失 1 命（共 3 命）。玩家
 * 控制杂技演员左右移动，按空格为距自己最近的碟子补转（+0.5、封顶 1，
 * 1 秒点击式冷却）。场上目标碟子数随存活时间每 15 秒 +1（封顶 6），
 * 掉落后下一帧补回目标数。得分为每秒 10 × 场上碟子数（帧内小数累积、
 * 取整上报）。3 命耗尽结束。所有随机走注入 seed（mulberry32），同
 * seed + 同输入序列重放一致。时间单位毫秒。
 */

/** 逻辑画布尺寸。 */
export const W = 480
export const H = 640

/** 长杆顶部 y（碟面高度）。 */
export const POLE_TOP_Y = 210
/** 长杆底部 y（舞台地面）。 */
export const POLE_BASE_Y = 560
/** 左右留白：第 0 根与第 5 根杆的 x。 */
export const SLOT_MARGIN = 58
/** 转速自然衰减 / 秒。 */
export const DECAY_PER_S = 0.09
/** 低于该转速开始摇晃（视觉预警阈值）。 */
export const WOBBLE_SPIN = 0.25
/** 单次补转增量。 */
export const SPIN_ADD = 0.5
/** 转速上限。 */
export const SPIN_MAX = 1
/** 补转冷却 ms（点击式）。 */
export const SPIN_CD_MS = 1000
/** 每存活多少 ms 目标碟子数 +1。 */
export const ADD_PLATE_MS = 15_000
/** 场上碟子数上限（也是杆位槽位数）。 */
export const MAX_PLATES = 6
/** 初始生命。 */
export const START_LIVES = 3
/** 每秒每碟基础得分。 */
export const SCORE_PER_S = 10
/** 演员横向移动速度 px/s。 */
export const PLAYER_SPEED = 260
/** 演员横向活动范围（相对左右留白）。 */
export const PLAYER_MARGIN = 40
/** 新碟出生转速下限（上限为 SPIN_MAX）。 */
export const SPAWN_SPIN_MIN = 0.85

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

/** 一只转着的碟子：slot 为杆位槽（0..MAX_PLATES-1）。 */
export interface Plate {
  /** 杆位槽下标。 */
  slot: number
  /** 转速 0..1。 */
  spin: number
  /** 旋转相位（视觉用，随转速积分）。 */
  phase: number
  /** 配色索引（稳定取共享主题色阶）。 */
  hue: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type PlatesEvent =
  | { type: 'spin', x: number, y: number, hue: number }
  | { type: 'deny', x: number, y: number }
  | { type: 'drop', x: number, hue: number }
  | { type: 'spawn', x: number, hue: number }

/** 一帧输入：左右按住状态 + 本帧是否按下补转。 */
export interface PlatesInput {
  left: boolean
  right: boolean
  spin: boolean
}

/** 一局游戏的完整可测状态。 */
export interface PlatesState {
  /** 回合内已流逝 ms。 */
  t: number
  /** 取整后的展示得分（真实累积在 scoreAcc）。 */
  score: number
  /** 帧内小数累积的得分（导出以便测试精确断言）。 */
  scoreAcc: number
  lives: number
  dropped: number
  /** 场上碟子（含槽位）。 */
  plates: Plate[]
  /** 演员中心 x。 */
  playerX: number
  /** 补转冷却剩余 ms。 */
  cooldownLeft: number
  events: PlatesEvent[]
  rng: () => number
  /** 已使用的配色索引计数（保证新碟颜色稳定递进）。 */
  hueCount: number
  over: boolean
}

/**
 * 第 i 根杆的 x 坐标（槽位均匀横排）。
 * @param i - 槽位下标 0..MAX_PLATES-1。
 * @returns 杆中心 x。
 */
export function slotX(i: number): number {
  return SLOT_MARGIN + (i * (W - SLOT_MARGIN * 2)) / (MAX_PLATES - 1)
}

/**
 * 当前目标碟子数：1 + floor(t / ADD_PLATE_MS)，封顶 MAX_PLATES。
 * @param tMs - 回合内毫秒钟。
 * @returns 目标碟子数。
 */
export function plateTargetOf(tMs: number): number {
  return Math.min(MAX_PLATES, 1 + Math.floor(Math.max(0, tMs) / ADD_PLATE_MS))
}

/**
 * 碟子是否处于摇晃预警区间（转速低于 WOBBLE_SPIN 且未归零）。
 * @param plate - 待判定的碟子。
 * @returns true 表示需要摇晃预警。
 */
export function isWobbling(plate: Plate): boolean {
  return plate.spin < WOBBLE_SPIN && plate.spin > 0
}

/**
 * 距演员最近的一只碟子（补转作用目标）。
 * @param state - 当前状态。
 * @returns 最近的碟子，场上无碟时为 null。
 */
export function nearestPlate(state: PlatesState): Plate | null {
  let best: Plate | null = null
  let bestD = Infinity
  for (const p of state.plates) {
    const d = Math.abs(slotX(p.slot) - state.playerX)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

/**
 * 演员横向活动范围。
 * @returns [minX, maxX]。
 */
export function playerRange(): [number, number] {
  return [PLAYER_MARGIN, W - PLAYER_MARGIN]
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态（含 1 只起始碟）。
 */
export function createPlates(seed: number, round = 1): PlatesState {
  const state: PlatesState = {
    t: 0,
    score: 0,
    scoreAcc: 0,
    lives: START_LIVES,
    dropped: 0,
    plates: [],
    playerX: W / 2,
    cooldownLeft: 0,
    events: [],
    rng: mulberry32((Math.floor(seed) * 31 + round) >>> 0),
    hueCount: 0,
    over: false,
  }
  spawnPlate(state)
  return state
}

/**
 * 在最低空闲槽位补一只新碟：出生转速 0.85..1 由 rng 决定。
 * @param state - 目标状态（使用其 rng 与 hueCount）。
 */
function spawnPlate(state: PlatesState): void {
  const used = new Set(state.plates.map((p) => p.slot))
  let slot = 0
  while (slot < MAX_PLATES && used.has(slot)) slot += 1
  if (slot >= MAX_PLATES) return
  const hue = state.hueCount % 8
  state.hueCount += 1
  const spin = SPAWN_SPIN_MIN + state.rng() * (SPIN_MAX - SPAWN_SPIN_MIN)
  state.plates.push({ slot, spin, phase: state.rng() * Math.PI * 2, hue })
  state.events.push({ type: 'spawn', x: slotX(slot), hue })
}

/**
 * 扣 1 命；命尽置 over。
 * @param state - 目标状态。
 */
function loseLife(state: PlatesState): void {
  state.lives -= 1
  if (state.lives <= 0) {
    state.lives = 0
    state.over = true
  }
}

/** 一帧的空输入常量（idle 推进）。 */
export const IDLE_INPUT: PlatesInput = { left: false, right: false, spin: false }

/**
 * 推进一帧：演员移动 → 冷却递减 → 结算补转（最近碟 +0.5，冷却中拒绝）
 * → 转速衰减与相位积分（归零掉落扣命）→ 补碟到目标数（每帧最多 1 个）
 * → 得分累积（10 × 碟数 / 秒）。事件写入 state.events，调用方每帧消费
 * 后在下一帧开头被清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入。
 */
export function stepPlates(state: PlatesState, dtMs: number, input: PlatesInput): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  const dt = Math.max(0, dtMs) / 1000

  // 演员：左右移动并夹在舞台内。
  const [minX, maxX] = playerRange()
  let dir = 0
  if (input.left) dir -= 1
  if (input.right) dir += 1
  state.playerX = Math.max(minX, Math.min(maxX, state.playerX + dir * PLAYER_SPEED * dt))

  // 冷却递减。
  state.cooldownLeft = Math.max(0, state.cooldownLeft - dtMs)

  // 补转：作用于距演员最近的一只碟。
  if (input.spin) {
    const target = nearestPlate(state)
    if (target === null) {
      state.events.push({ type: 'deny', x: state.playerX, y: POLE_TOP_Y })
    } else if (state.cooldownLeft > 0) {
      state.events.push({ type: 'deny', x: slotX(target.slot), y: POLE_TOP_Y })
    } else {
      target.spin = Math.min(SPIN_MAX, target.spin + SPIN_ADD)
      state.cooldownLeft = SPIN_CD_MS
      state.events.push({ type: 'spin', x: slotX(target.slot), y: POLE_TOP_Y, hue: target.hue })
    }
  }

  // 转速衰减 + 相位积分；归零掉落（倒序遍历以便删除）。
  for (let i = state.plates.length - 1; i >= 0; i -= 1) {
    const p = state.plates[i]!
    p.spin -= DECAY_PER_S * dt
    if (p.spin <= 0) {
      state.plates.splice(i, 1)
      state.dropped += 1
      state.events.push({ type: 'drop', x: slotX(p.slot), hue: p.hue })
      loseLife(state)
      if (state.over) return
      continue
    }
    p.phase += p.spin * dt * 12
  }

  // 补碟到目标数（每帧最多 1 个，节奏与 juggle 一致）。
  if (state.plates.length < plateTargetOf(state.t)) spawnPlate(state)

  // 得分：每秒 10 × 碟数，帧内小数累积后取整展示。
  state.scoreAcc += SCORE_PER_S * state.plates.length * dt
  state.score = Math.floor(state.scoreAcc)
}
