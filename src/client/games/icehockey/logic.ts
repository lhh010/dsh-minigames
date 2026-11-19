/**
 * 桌上冰球（Air Hockey）纯逻辑：480×720 竖直球台，玩家推杆守下半区、
 * AI 推杆守上半区，各自底边球门宽台面 1/3。冰球是圆盘，物理为圆-圆
 * 弹性碰撞（推杆瞬时速度传入球，MALLET_E 恢复系数）、边墙反弹 0.85、
 * 指数摩擦微衰减与球速上限。进球 +1 分，先得 7 分胜一局，3 局 2 胜；
 * 每球开球由得分方发球（球静止摆在得分方半区，被推杆击出）。
 * step() 为写时复制：返回新状态、绝不改参数；给定 (seed, dt, input)
 * 完全确定（mulberry32 驱动发球位置与 AI 感知噪声）。时间单位毫秒。
 */

/** 逻辑画布宽（px）。 */
export const W = 480
/** 逻辑画布高（px），顶部 HUD_H 归渲染 HUD，底部 EDGE_B 留边。 */
export const H = 720
/** 顶部 HUD 条高度；球台上边缘 y = TOP。 */
export const HUD_H = 44
/** 底部留边厚度；球台下边缘 y = BOT。 */
export const EDGE_B = 14
/** 球场上边缘。 */
export const TOP = HUD_H
/** 球场下边缘（玩家侧球门线）。 */
export const BOT = H - EDGE_B
/** 中线 y：双方半区分界。 */
export const CENTER_Y = (TOP + BOT) / 2

/** 冰球半径。 */
export const PUCK_R = 15
/** 推杆半径。 */
export const MALLET_R = 26
/** 球门半宽（门宽 = W/3）。 */
export const GOAL_HALF = W / 6

/** 边墙反弹恢复系数。 */
export const WALL_E = 0.85
/** 推杆-冰球碰撞恢复系数（近弹性）。 */
export const MALLET_E = 0.96
/** 摩擦速率（每秒指数衰减率）。 */
export const FRICTION = 0.18
/** 冰球速度上限（px/s）。 */
export const MAX_PUCK_SPEED = 920
/** 玩家推杆追踪指针的速度上限（px/s）。 */
export const PLAYER_SPEED = 900

/** 单局获胜分。 */
export const WIN_SCORE = 7
/** 场胜局数（3 局 2 胜）。 */
export const GAMES_TO_WIN = 2
/** 每球发球倒计时（ms）。 */
export const SERVE_MS = 800
/** 每帧内部固定子步数（tunneling 防护）。 */
export const SUBSTEPS = 4

/** 确定性 PRNG（mulberry32），32 位状态字。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    const stepped = mulberry32Step(a)
    a = stepped.next
    return stepped.value
  }
}

/**
 * 显式状态字上的单步 mulberry32。
 * @param state - 当前 32 位 PRNG 状态字。
 * @returns [0,1) 均匀值与下一状态字。
 */
export function mulberry32Step(state: number): { value: number; next: number } {
  const a = (state + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, next: a }
}

/** 位置向量。 */
export interface Vec {
  x: number
  y: number
}

/** 冰球：圆心位置与速度。 */
export interface Puck {
  x: number
  y: number
  vx: number
  vy: number
}

/** 一步的持键输入：推杆追逐目标（逻辑坐标）。 */
export interface IceHockeyInput {
  x?: number
  y?: number
}

/** 场胜者；对局进行中为 null。 */
export type MatchWinner = 'player' | 'ai' | null

/** 半区归属。 */
export type Side = 'player' | 'ai'

/** AI 难度参数（随关卡提升：反应更快、更快更狠）。 */
export interface AiParams {
  /** 感知刷新间隔 ms。 */
  reactionMs: number
  /** 移动速度上限 px/s。 */
  speed: number
  /** 转入进攻的球速阈值 px/s。 */
  attackSpeed: number
  /** 感知位置噪声幅度 px。 */
  jitter: number
}

/**
 * 按关卡取 AI 参数（1..3，越界收敛）。
 * @param level - 关卡号（1 起）。
 * @returns 该关的反应/速度/进攻阈值/噪声。
 */
export function aiParams(level: number): AiParams {
  const lv = Math.min(3, Math.max(1, Math.round(level)))
  if (lv === 1) return { reactionMs: 240, speed: 300, attackSpeed: 300, jitter: 60 }
  if (lv === 2) return { reactionMs: 170, speed: 380, attackSpeed: 340, jitter: 30 }
  return { reactionMs: 110, speed: 470, attackSpeed: 400, jitter: 10 }
}

/** 一局比赛的完整状态（含 AI 感知缓存与 PRNG 状态字）。 */
export interface IceHockeyState {
  /** 冰球。 */
  puck: Puck
  /** 玩家推杆圆心。 */
  player: Vec
  /** 玩家推杆追逐目标。 */
  playerTarget: Vec
  /** AI 推杆圆心。 */
  ai: Vec
  /** AI 当前目的地（每次感知刷新时更新）。 */
  aiTarget: Vec
  /** AI 感知到的冰球位置（带噪声、按 reactionMs 刷新）。 */
  aiSense: Vec
  /** 距下次 AI 感知刷新的累计毫秒。 */
  aiClock: number
  /** 本局比分。 */
  playerScore: number
  aiScore: number
  /** 已胜局数。 */
  playerGames: number
  aiGames: number
  /** 全场累计玩家进球数（onScore 上报）。 */
  playerGoals: number
  /** 发球倒计时剩余；>0 时冰球静止摆放。 */
  serveCd: number
  /** 发球方（上一球的得分方）。 */
  serveSide: Side
  /** 关卡（每打完一局 +1，封顶 3）。 */
  level: number
  /** 场胜者。 */
  over: MatchWinner
  /** mulberry32 状态字。 */
  rngState: number
}

/**
 * 推杆位置夹取到己方半区与左右墙内。
 * @param x - 目标圆心 x。
 * @param y - 目标圆心 y。
 * @param side - 半区。
 * @returns 夹取后的合法圆心。
 */
export function clampMallet(x: number, y: number, side: Side): Vec {
  const cx = Math.min(W - MALLET_R, Math.max(MALLET_R, x))
  const yMin = side === 'player' ? CENTER_Y + MALLET_R : TOP + MALLET_R
  const yMax = side === 'player' ? BOT - MALLET_R : CENTER_Y - MALLET_R
  return { x: cx, y: Math.min(yMax, Math.max(yMin, y)) }
}

/**
 * AI 决策（纯函数）：球在 AI 半区且足够慢 → 绕到球身后沿「球→对方
 * 球门」连线方向顶击；否则回防球门前横移盯球。
 * @param senseX - 感知到的球 x。
 * @param senseY - 感知到的球 y。
 * @param puckSpeed - 球真实速率（进攻模式判定用）。
 * @param level - 关卡号。
 * @returns 目的地与是否进攻。
 */
export function aiDecide(senseX: number, senseY: number, puckSpeed: number, level: number): { x: number; y: number; attack: boolean } {
  const p = aiParams(level)
  if (senseY < CENTER_Y && puckSpeed < p.attackSpeed) {
    // 进攻：站到球背离对方球门的一侧，推向 (W/2, BOT)。
    const dx = senseX - W / 2
    const dy = senseY - BOT
    const len = Math.hypot(dx, dy) || 1
    const behind = MALLET_R + PUCK_R + 4
    return { x: senseX + (dx / len) * behind, y: senseY + (dy / len) * behind, attack: true }
  }
  // 防守：球门前横移盯球，活动范围略宽于球门。
  const guard = GOAL_HALF * 1.5
  return { x: Math.min(W / 2 + guard, Math.max(W / 2 - guard, senseX)), y: TOP + 74, attack: false }
}

/** 把冰球静止摆到发球方半区（x 由 seed 摆动），清零速度。 */
function placeServe(s: IceHockeyState): void {
  const a = mulberry32Step(s.rngState)
  s.rngState = a.next
  const b = mulberry32Step(s.rngState)
  s.rngState = b.next
  s.puck.x = W / 2 + (a.value * 2 - 1) * 110
  s.puck.y = s.serveSide === 'player' ? BOT - 150 : TOP + 130
  s.puck.vx = 0
  s.puck.vy = 0
}

/** 复位推杆与 AI 感知（新一局/新一场通用）。 */
function resetMallets(s: IceHockeyState): void {
  s.player = { x: W / 2, y: BOT - 80 }
  s.playerTarget = { ...s.player }
  s.ai = { x: W / 2, y: TOP + 74 }
  s.aiTarget = { ...s.ai }
  s.aiSense = { x: s.puck.x, y: s.puck.y }
  s.aiClock = 0
}

/**
 * 新建一场比赛。
 * @param seed - PRNG 种子（驱动发球位置与 AI 噪声）。
 * @param level - 起始关卡（默认 1）。
 * @returns 初始状态：玩家先发球，倒计时中。
 */
export function createState(seed: number = 1, level: number = 1): IceHockeyState {
  const s: IceHockeyState = {
    puck: { x: W / 2, y: BOT - 150, vx: 0, vy: 0 },
    player: { x: W / 2, y: BOT - 80 },
    playerTarget: { x: W / 2, y: BOT - 80 },
    ai: { x: W / 2, y: TOP + 74 },
    aiTarget: { x: W / 2, y: TOP + 74 },
    aiSense: { x: W / 2, y: BOT - 150 },
    aiClock: 0,
    playerScore: 0,
    aiScore: 0,
    playerGames: 0,
    aiGames: 0,
    playerGoals: 0,
    serveCd: SERVE_MS,
    serveSide: 'player',
    level,
    over: null,
    rngState: seed >>> 0,
  }
  placeServe(s)
  resetMallets(s)
  return s
}

/** 打完一局：清比分、关卡 +1、败方发球开新局。 */
function nextGame(s: IceHockeyState, loser: Side): void {
  s.playerScore = 0
  s.aiScore = 0
  s.level = Math.min(3, s.level + 1)
  s.serveSide = loser
  s.serveCd = SERVE_MS
  resetMallets(s)
  placeServe(s)
}

/**
 * 推杆-冰球圆-圆碰撞（就地改写冰球）：先沿法线分离到接触距离，再对
 * 相对法向速度做近弹性反弹——静止推杆按恢复系数反弹来球，运动推杆
 * 把自身法向速度传进球（推得越快球飞得越快）。
 * @param puck - 冰球（会被改写）。
 * @param m - 推杆圆心与瞬时速度。
 * @returns 是否发生碰撞。
 */
export function collideMalletPuck(puck: Puck, m: { x: number; y: number; vx: number; vy: number }): boolean {
  const dx = puck.x - m.x
  const dy = puck.y - m.y
  const rSum = PUCK_R + MALLET_R
  if (dx * dx + dy * dy >= rSum * rSum) return false
  const d = Math.hypot(dx, dy)
  // 完全重合的退化情形：按上下半区分离方向。
  const nx = d === 0 ? 0 : dx / d
  const ny = d === 0 ? (puck.y >= m.y ? 1 : -1) : dy / d
  puck.x = m.x + nx * rSum
  puck.y = m.y + ny * rSum
  const rvn = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny
  if (rvn < 0) {
    puck.vx -= (1 + MALLET_E) * rvn * nx
    puck.vy -= (1 + MALLET_E) * rvn * ny
  }
  return true
}

/**
 * 边墙与球门判定（就地改写冰球）：左右墙永远按 WALL_E 反弹；上下边
 * 在球门开口内放行（整球越线即进球），开口外按 WALL_E 反弹。
 * @param puck - 冰球（会被改写）。
 * @returns 进球归属得分方（'player' = 攻破上方球门），未进球为 null。
 */
export function resolveEdges(puck: Puck): Side | null {
  if (puck.x < PUCK_R) {
    puck.x = PUCK_R * 2 - puck.x
    puck.vx = Math.abs(puck.vx) * WALL_E
  } else if (puck.x > W - PUCK_R) {
    puck.x = (W - PUCK_R) * 2 - puck.x
    puck.vx = -Math.abs(puck.vx) * WALL_E
  }
  const inMouth = Math.abs(puck.x - W / 2) < GOAL_HALF
  // 上边缘（AI 球门）。
  if (puck.y - PUCK_R < TOP) {
    if (inMouth) {
      if (puck.y + PUCK_R < TOP) return 'player'
    } else {
      puck.y = (TOP + PUCK_R) * 2 - puck.y
      puck.vy = Math.abs(puck.vy) * WALL_E
    }
  }
  // 下边缘（玩家球门）。
  if (puck.y + PUCK_R > BOT) {
    if (inMouth) {
      if (puck.y - PUCK_R > BOT) return 'ai'
    } else {
      puck.y = (BOT - PUCK_R) * 2 - puck.y
      puck.vy = -Math.abs(puck.vy) * WALL_E
    }
  }
  return null
}

/** 进球结算：比分 +1，得分方发球；到 7 分结局，先胜 2 局终场。 */
function scoreGoal(s: IceHockeyState, who: Side): void {
  if (who === 'player') {
    s.playerScore += 1
    s.playerGoals += 1
  } else {
    s.aiScore += 1
  }
  if (s.playerScore >= WIN_SCORE || s.aiScore >= WIN_SCORE) {
    const gameWinner: Side = s.playerScore >= WIN_SCORE ? 'player' : 'ai'
    if (gameWinner === 'player') s.playerGames += 1
    else s.aiGames += 1
    if (s.playerGames >= GAMES_TO_WIN || s.aiGames >= GAMES_TO_WIN) {
      s.over = s.playerGames >= GAMES_TO_WIN ? 'player' : 'ai'
      s.serveCd = 0
      s.puck = { x: W / 2, y: CENTER_Y, vx: 0, vy: 0 }
    } else {
      nextGame(s, gameWinner === 'player' ? 'ai' : 'player')
    }
    return
  }
  s.serveSide = who
  s.serveCd = SERVE_MS
  placeServe(s)
}

/** 向目标限速移动一步，返回新位置与瞬时速度。 */
function moveToward(pos: Vec, target: Vec, maxDist: number): { pos: Vec; vx: number; vy: number } {
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const dist = Math.hypot(dx, dy)
  const step = Math.min(dist, maxDist)
  const nx = pos.x + (dist === 0 ? 0 : (dx / dist) * step)
  const ny = pos.y + (dist === 0 ? 0 : (dy / dist) * step)
  return { pos: { x: nx, y: ny }, vx: (nx - pos.x) * 1000, vy: (ny - pos.y) * 1000 }
}

/**
 * 推进一帧（写时复制；内部固定 SUBSTEPS 子步防穿透）。
 * @param state - 当前状态（不会被改写）。
 * @param dt - 帧时长 ms（>50 按 50 处理）。
 * @param input - 玩家推杆追逐目标（逻辑坐标，可为空）。
 * @returns 新状态；已终场的状态原样返回。
 */
export function step(state: IceHockeyState, dt: number, input: IceHockeyInput): IceHockeyState {
  if (state.over !== null) return state
  const s: IceHockeyState = {
    ...state,
    puck: { ...state.puck },
    player: { ...state.player },
    playerTarget: { ...state.playerTarget },
    ai: { ...state.ai },
    aiTarget: { ...state.aiTarget },
    aiSense: { ...state.aiSense },
  }
  const clamped = Math.min(50, Math.max(0, dt))

  if (input.x !== undefined && input.y !== undefined) {
    s.playerTarget = clampMallet(input.x, input.y, 'player')
  }

  const frozen = s.serveCd > 0
  if (frozen) {
    s.serveCd = Math.max(0, s.serveCd - clamped)
  }

  const sub = clamped / SUBSTEPS
  const subSec = sub / 1000
  const params = aiParams(s.level)

  for (let i = 0; i < SUBSTEPS; i += 1) {
    // 玩家推杆：限速追逐指针目标。
    const p = moveToward(s.player, s.playerTarget, PLAYER_SPEED * subSec)
    s.player = p.pos

    // AI：感知按 reactionMs 刷新（带 seed 噪声），随后限速奔向目的地。
    s.aiClock += sub
    if (s.aiClock >= params.reactionMs) {
      s.aiClock = 0
      const a = mulberry32Step(s.rngState)
      s.rngState = a.next
      const b = mulberry32Step(s.rngState)
      s.rngState = b.next
      s.aiSense = {
        x: s.puck.x + (a.value * 2 - 1) * params.jitter,
        y: s.puck.y + (b.value * 2 - 1) * params.jitter,
      }
      const decision = aiDecide(s.aiSense.x, s.aiSense.y, Math.hypot(s.puck.vx, s.puck.vy), s.level)
      s.aiTarget = clampMallet(decision.x, decision.y, 'ai')
    }
    const a2 = moveToward(s.ai, s.aiTarget, params.speed * subSec)
    s.ai = a2.pos

    // 发球倒计时中：冰球静止摆放，只动推杆。
    if (frozen) continue

    // 冰球积分 + 摩擦衰减。
    s.puck.x += s.puck.vx * subSec
    s.puck.y += s.puck.vy * subSec
    const decay = Math.exp(-FRICTION * subSec)
    s.puck.vx *= decay
    s.puck.vy *= decay

    // 碰撞（先 AI 后玩家，顺序固定保证确定性）与边墙/球门。
    collideMalletPuck(s.puck, { x: s.ai.x, y: s.ai.y, vx: a2.vx, vy: a2.vy })
    collideMalletPuck(s.puck, { x: s.player.x, y: s.player.y, vx: p.vx, vy: p.vy })
    const goal = resolveEdges(s.puck)
    if (goal !== null) {
      scoreGoal(s, goal)
      return s
    }

    // 球速上限。
    const sp = Math.hypot(s.puck.vx, s.puck.vy)
    if (sp > MAX_PUCK_SPEED) {
      s.puck.vx = (s.puck.vx / sp) * MAX_PUCK_SPEED
      s.puck.vy = (s.puck.vy / sp) * MAX_PUCK_SPEED
    }
  }
  return s
}
