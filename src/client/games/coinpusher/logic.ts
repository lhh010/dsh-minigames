/**
 * 推金币 Coin Pusher 纯逻辑：确定性固定子步物理。
 *
 * 侧视机台模型：台面顶面 PLAT_Y、前沿 EDGE_X、左侧墙 WALL_X；推板是一块
 * 垂直往复运动的板（左面 pusherX，宽 PUSH_W），右面把台面上的静态币堆向
 * 前沿推挤。币为等半径圆盘，两种状态：
 *  - fall：空中币，按重力积分（投币下落、被推过沿翻落的币）；
 *  - rest：堆内币，无速度，仅被约束（推板/邻居/台面/墙）位移——圆-圆
 *    静态堆叠近似：每子步固定 ITER 次松弛分离，位移逐层传递。
 * 中心越过 EDGE_X 的 rest 币失去支撑翻落；下落币越过 SCORE_Y 结算得分
 * 并移除（普通+1 / 银+5 / 金+20 / 奖励币+10 并触发大堆倾倒前冲）。
 * 币量以 MAX_COINS 封顶（超出时移除最后方的 rest 币），所有计算每帧
 * 有界：子步数 ≤ ceil(0.05/SUB)，配对数 ≤ MAX_COINS^2。
 */

/** 币种：普通 / 银币 / 金币 / 奖励币（触发大堆倾倒）。 */
export type CoinType = 'normal' | 'silver' | 'gold' | 'bonus'

/** 掉落结算分值表。 */
export const COIN_SCORES: Readonly<Record<CoinType, number>> = {
  normal: 1, silver: 5, gold: 20, bonus: 10,
}

// ---- 机台几何（逻辑坐标 640x480，render.ts 同步使用）----
export const WALL_X = 64
export const PLAT_Y = 332
export const EDGE_X = 540
export const PUSH_W = 110
/** 推板左面行程：140..300，推进面最远 410，与台沿 540 之间是币堆区。 */
export const PUSH_X_BACK = 140
export const PUSH_TRAVEL = 160
export const PUSH_H = 100
export const COIN_R = 11
/** 投币：7 列，落点 170..380（覆盖推板台的往复行程，币落在板顶或暴露的台面上）。 */
export const DROP_COLS = 7
export const DROP_X0 = 170
export const DROP_X1 = 380
export const DROP_Y = 66

// ---- 物理与节奏参数 ----
export const SUB = 1 / 120
const ITER = 6
const GRAVITY = 900
/** 推板一个往返约 2.86 秒。 */
const PUSH_RATE = 0.35
export const ROUND_MS = 60000
export const START_COINS = 40
export const COOLDOWN_MS = 340
export const MAX_COINS = 120
const SCORE_Y = PLAT_Y + 90
const COL_GAP = (DROP_X1 - DROP_X0) / (DROP_COLS - 1)
/** 奖励币间隔：每 BONUS_EVERY 次投币出一枚。 */
const BONUS_EVERY = 14

/** 一枚币。id 全局递增，保证求解顺序确定。 */
export interface Coin {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  type: CoinType
  state: 'fall' | 'rest'
}

export type CoinPusherEvent =
  | { kind: 'score'; type: CoinType; x: number; y: number; points: number }
  | { kind: 'quake' }
  | { kind: 'ended'; reason: 'time' | 'coins' }

export interface CoinPusherState {
  coins: Coin[]
  /** 推板左面位置（右面 = pusherX + PUSH_W）。 */
  pusherX: number
  phase: number
  score: number
  coinsLeft: number
  timeLeftMs: number
  aimCol: number
  cooldownMs: number
  result: 'playing' | 'ended'
  /** 奖励币触发后的余震计时（ms），仅渲染用。 */
  quakeMs: number
  dropCount: number
  events: CoinPusherEvent[]
  /** 每局一个种子；投币类型由它驱动，保证可重放。 */
  rng: () => number
  nextId: number
  /** 固定子步累加器（帧切块无关的重放）。 */
  acc: number
}

/** mulberry32 种子随机（同 slitherlink 算法，游戏内自持一份避免耦合）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 开局币堆：前沿 4 排嵌套圆堆，类型按种子分布并埋一枚奖励币。 */
function buildHeap(rng: () => number): Coin[] {
  const coins: Coin[] = []
  let id = 1
  let bonusPlaced = false
  for (let row = 0; row < 4; row += 1) {
    const y = PLAT_Y - COIN_R - row * (COIN_R * 2 - 3)
    for (let k = 0; k < 6; k += 1) {
      const x = EDGE_X - 14 - k * 23 - (row % 2) * 11 + (rng() - 0.5) * 3
      const roll = rng()
      let type: CoinType = 'normal'
      if (roll < 0.1) type = 'gold'
      else if (roll < 0.34) type = 'silver'
      if (!bonusPlaced && row === 2 && k === 2) { type = 'bonus'; bonusPlaced = true }
      coins.push({ id, x, y, vx: 0, vy: 0, type, state: 'rest' })
      id += 1
    }
  }
  return coins
}

/**
 * 开一局。
 * @param seed 局种子（投币类型与开局币堆）。
 */
export function createGame(seed: number): CoinPusherState {
  const rng = mulberry32(seed)
  return {
    coins: buildHeap(rng),
    pusherX: PUSH_X_BACK,
    phase: 0,
    score: 0,
    coinsLeft: START_COINS,
    timeLeftMs: ROUND_MS,
    aimCol: Math.floor(DROP_COLS / 2),
    cooldownMs: 0,
    result: 'playing',
    quakeMs: 0,
    dropCount: 0,
    events: [],
    rng,
    nextId: 1000,
    acc: 0,
  }
}

/** 推板左面位置（余弦往复，前进慢回程快由波形自然给出）。 */
export function pusherXAt(phase: number): number {
  return PUSH_X_BACK + PUSH_TRAVEL * 0.5 * (1 - Math.cos(Math.PI * 2 * phase))
}

/** 瞄准列横坐标。 */
export function colX(col: number): number {
  return DROP_X0 + col * COL_GAP
}

/**
 * 移动瞄准列（钳制在 [0, DROP_COLS)）。
 * @param s 局状态。
 * @param dir -1 左移一列，+1 右移一列。
 */
export function moveAim(s: CoinPusherState, dir: number): void {
  if (s.result !== 'playing') return
  s.aimCol = Math.max(0, Math.min(DROP_COLS - 1, s.aimCol + dir))
}

/**
 * 投一枚币：冷却中、币尽或已结束返回 false；命中则在落点生成 fall 币并
 * 进入冷却。类型由局种子决定（约 10% 金 / 24% 银，每 BONUS_EVERY 枚一枚
 * 奖励币）。超过 MAX_COINS 时移除最后方的 rest 币封顶。
 * @param s 局状态。
 * @param col 目标列，省略时用当前瞄准列。
 * @returns 是否投出。
 */
export function dropCoin(s: CoinPusherState, col?: number): boolean {
  if (s.result !== 'playing' || s.cooldownMs > 0 || s.coinsLeft <= 0) return false
  const c = Math.max(0, Math.min(DROP_COLS - 1, col ?? s.aimCol))
  s.coinsLeft -= 1
  s.cooldownMs = COOLDOWN_MS
  s.dropCount += 1
  let type: CoinType = 'normal'
  if (s.dropCount % BONUS_EVERY === 0) type = 'bonus'
  else {
    const roll = s.rng()
    if (roll < 0.1) type = 'gold'
    else if (roll < 0.34) type = 'silver'
  }
  s.coins.push({ id: s.nextId, x: colX(c), y: DROP_Y, vx: 0, vy: 30, type, state: 'fall' })
  s.nextId += 1
  capCoins(s)
  return true
}

/** 币量封顶：移除最靠后（x 最小）的 rest 币。 */
function capCoins(s: CoinPusherState): void {
  while (s.coins.length > MAX_COINS) {
    let worst = -1
    for (let i = 0; i < s.coins.length; i += 1) {
      if (s.coins[i]!.state !== 'rest') continue
      if (worst < 0 || s.coins[i]!.x < s.coins[worst]!.x) worst = i
    }
    if (worst < 0) { s.coins.shift(); continue }
    s.coins.splice(worst, 1)
  }
}

/** 中心是否越过前沿（失去台面支撑，翻落）。 */
function pastEdge(c: Coin): boolean {
  return c.x > EDGE_X
}

/** fall 币下方是否有接触（台面 / 推板 / 下方邻居币）。 */
function supportedBelow(c: Coin, s: CoinPusherState): boolean {
  if (!pastEdge(c) && c.y + COIN_R >= PLAT_Y - 1) return true
  const px = s.pusherX
  if (c.x + COIN_R > px && c.x - COIN_R < px + PUSH_W && c.y + COIN_R >= PLAT_Y - PUSH_H - 1) return true
  for (let i = 0; i < s.coins.length; i += 1) {
    const o = s.coins[i]!
    if (o.id === c.id) continue
    const dx = o.x - c.x
    const dy = o.y - c.y
    if (dx * dx + dy * dy < (COIN_R * 2 + 1) * (COIN_R * 2 + 1) && dy > COIN_R * 0.6) return true
  }
  return false
}

/** 奖励币结算：前沿附近的 rest 币整体向前冲一步（大堆倾倒）。 */
function quake(s: CoinPusherState): void {
  s.quakeMs = 700
  s.events.push({ kind: 'quake' })
  for (const c of s.coins) {
    if (c.state === 'rest' && c.x > EDGE_X - 110) c.x += 9
  }
}

/** 一个固定子步：推板推进 → 重力/约束松弛 → 翻落与支撑判定 → 结算。 */
function substep(s: CoinPusherState): void {
  s.phase += PUSH_RATE * SUB
  if (s.phase >= 1) s.phase -= Math.floor(s.phase)
  const prevX = s.pusherX
  s.pusherX = pusherXAt(s.phase)
  const delta = s.pusherX - prevX
  if (delta > 0) {
    const top = PLAT_Y - PUSH_H
    for (const c of s.coins) {
      if (c.state === 'rest' && Math.abs(c.y + COIN_R - top) < 2
        && c.x > s.pusherX - COIN_R && c.x < s.pusherX + PUSH_W + COIN_R) {
        c.x += delta
      }
    }
  }

  // 重力积分（空中币）。
  for (const c of s.coins) {
    if (c.state !== 'fall') continue
    c.vy += GRAVITY * SUB
    c.x += c.vx * SUB
    c.y += c.vy * SUB
    c.vx *= 0.995
  }

  // 约束松弛：推板优先，其次币对，最后台面与墙。
  const px = s.pusherX
  for (let iter = 0; iter < ITER; iter += 1) {
    for (const c of s.coins) {
      const top = PLAT_Y - PUSH_H
      const cx = Math.max(px, Math.min(px + PUSH_W, c.x))
      const cy = Math.max(top, Math.min(PLAT_Y, c.y))
      const dx = c.x - cx
      const dy = c.y - cy
      if (dx === 0 && dy === 0) { c.x = px + PUSH_W + COIN_R; continue }
      const d2 = dx * dx + dy * dy
      if (d2 < COIN_R * COIN_R) {
        const d = Math.sqrt(d2)
        c.x = cx + (dx / d) * COIN_R
        c.y = cy + (dy / d) * COIN_R
      }
    }
    const n = s.coins.length
    for (let i = 0; i < n; i += 1) {
      const a = s.coins[i]!
      for (let j = i + 1; j < n; j += 1) {
        const b = s.coins[j]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const sum = COIN_R * 2
        const d2 = dx * dx + dy * dy
        if (d2 >= sum * sum || d2 === 0) continue
        const d = Math.sqrt(d2)
        const push = (sum - d) / 2
        const nx = dx / d
        const ny = dy / d
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
    for (const c of s.coins) {
      if (!pastEdge(c) && c.y + COIN_R > PLAT_Y) c.y = PLAT_Y - COIN_R
      if (c.x - COIN_R < WALL_X) c.x = WALL_X + COIN_R
    }
  }

  // 状态迁移与结算。
  const kept: Coin[] = []
  for (const c of s.coins) {
    if (c.state === 'rest') {
      if (pastEdge(c)) { c.state = 'fall'; c.vy = 0; c.vx = 0 }
      else if (!supportedBelow(c, s)) { c.state = 'fall'; c.vx = 0 }
      kept.push(c)
      continue
    }
    // fall 币：越界坠落结算，或落地转 rest。
    if (c.y - COIN_R > SCORE_Y) {
      const points = COIN_SCORES[c.type]
      s.score += points
      s.events.push({ kind: 'score', type: c.type, x: c.x, y: c.y, points })
      if (c.type === 'bonus') quake(s)
      continue // 移除
    }
    if (c.vy >= 0 && supportedBelow(c, s)) {
      c.vy = 0
      c.vx = 0
      c.state = 'rest'
    }
    kept.push(c)
  }
  s.coins = kept
  capCoins(s)
}

/**
 * 推进一帧：dt 秒（内部钳到 0.05s），按固定子步 SUB 消耗累加器执行，
 * 并扣除冷却与倒计时；结束条件为时间到，或投币用尽且最后一枚空中币已落定。
 * @param s 局状态。
 * @param dt 帧间隔秒。
 */
export function step(s: CoinPusherState, dt: number): void {
  if (s.result !== 'playing') return
  const clamped = Math.max(0, Math.min(0.05, dt))
  s.cooldownMs = Math.max(0, s.cooldownMs - clamped * 1000)
  s.quakeMs = Math.max(0, s.quakeMs - clamped * 1000)
  s.timeLeftMs -= clamped * 1000
  if (s.timeLeftMs <= 0) {
    s.timeLeftMs = 0
    s.coins.forEach(c => { c.vx = 0; c.vy = 0 })
    s.result = 'ended'
    s.events.push({ kind: 'ended', reason: 'time' })
    return
  }
  s.acc += clamped
  while (s.acc >= SUB) {
    substep(s)
    s.acc -= SUB
  }
  if (s.coinsLeft <= 0 && !s.coins.some(c => c.state === 'fall')) {
    s.result = 'ended'
    s.events.push({ kind: 'ended', reason: 'coins' })
  }
}
