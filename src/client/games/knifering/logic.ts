/**
 * 飞刀转盘（Knife Ring）纯逻辑：圆形木盘绕中心轴旋转，玩家点击/空格
 * 从正上方插刀，插中当前转盘角度处；与已有刀的环上角度差小于最小间隔
 * 即碰刀失败 -1 命（共 3 命），成功则钉在盘上随盘旋转。每关需插
 * N 把刀（N 递增），插满进入下一关（角速度更快、允许间隔更小、偶有
 * 预置障碍刀）。角速度曲线由 seed+关卡经 mulberry32 确定性生成为分段
 * 恒速段（高关卡随机变速/换向）。时间单位毫秒，角度单位弧度。
 */

/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export const W = 480
export const H = 600
/** 转盘中心。 */
export const CENTER_X = 240
export const CENTER_Y = 330
/** 转盘半径 px。 */
export const RING_R = 150
/** 刀柄（刀刃入盘点）到中心的半径 px。 */
export const KNIFE_R = 128
/** 初始生命。 */
export const START_LIVES = 3
/** 插刀下落动画时长 ms。 */
export const THROW_MS = 130
/** 关卡完成停顿 ms。 */
export const LEVEL_BREAK_MS = 900
/** 失败抖动时长 ms。 */
export const FAIL_SHAKE_MS = 420
/** 每把刀得分。 */
export const KNIFE_SCORE = 10
/** 过关奖励分。 */
export const LEVEL_SCORE = 50

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
 * 第 level 关需要插的刀数：4 把起步，每关 +1，封顶 12。
 * @param level - 关卡号（从 1 开始）。
 * @returns 该关需插刀数。
 */
export function knivesFor(level: number): number {
  return Math.min(12, 3 + level)
}

/**
 * 第 level 关允许的最小角间隔 rad：从 0.52 递减到下限 0.30。
 * @param level - 关卡号。
 * @returns 两刀不判碰撞的最小角间隔。
 */
export function minGapFor(level: number): number {
  return Math.max(0.30, 0.52 - (level - 1) * 0.03)
}

/**
 * 第 level 关是否预置障碍刀（每 3 关出现，第 3、6、9……关）。
 * @param level - 关卡号。
 * @returns true 时该关开局在盘上预置 1~2 把障碍刀。
 */
export function hasObstacles(level: number): boolean {
  return level >= 3 && level % 3 === 0
}

/** 一段恒定角速度：持续 durMs 毫秒、角速度 omega rad/s（正为顺时针）。 */
export interface SpeedSegment { durMs: number, omega: number }

/** 段间过渡的角加速度上限 rad/s²——变速/换向不再瞬跳，全程 300-700ms
 * 可见的减速-加速过程，玩家有反应窗口读节奏。 */
export const OMEGA_RAMP = 6

/**
 * 生成某关的角速度曲线：3 段起步，关卡升高段数增多、速度更快；
 * 第 2 关起每段有概率换向（变速+换向增加难度）。纯确定性。
 * @param rng - 该关的随机源。
 * @param level - 关卡号。
 * @returns 分段恒速曲线（循环播放）。
 */
export function buildSpeedCurve(rng: () => number, level: number): SpeedSegment[] {
  const segments: SpeedSegment[] = []
  const count = Math.min(6, 3 + Math.floor(level / 2))
  const baseSpeed = 1.1 + Math.min(1.6, (level - 1) * 0.28)
  const flipChance = level >= 2 ? Math.min(0.5, 0.08 + level * 0.05) : 0
  let dir = rng() < 0.5 ? 1 : -1
  for (let i = 0; i < count; i += 1) {
    const omega = dir * (baseSpeed * (0.75 + rng() * 0.5))
    segments.push({ durMs: 1100 + rng() * 1700, omega })
    if (rng() < flipChance) dir = -dir
  }
  return segments
}

/** 一把钉在盘上的刀：angleRad 为相对盘面的固有角度。 */
export interface PinnedKnife { angle: number, /** true 表示关卡开局预置的障碍刀。 */ obstacle: boolean }

/** 单步内产生、供渲染层消费的可视事件。 */
export type KnifeEvent =
  | { type: 'stick', angle: number }
  | { type: 'hit', angle: number }
  | { type: 'level', level: number }

/** 一局游戏的完整可测状态。 */
export interface KnifeRingState {
  /** 回合内已流逝 ms。 */
  t: number
  score: number
  lives: number
  /** 当前关卡（从 1 开始）。 */
  level: number
  /** 盘面当前朝向 rad（相对初始 0；插刀落点 = angleAtThrow 的盘面固有角）。 */
  ringAngle: number
  /** 当前关的分段速度曲线（循环）。 */
  curve: SpeedSegment[]
  /** 当前所处段索引与段内已流逝 ms。 */
  segIndex: number
  segMs: number
  /** 当前实际角速度（向目标段速度限加速度缓动，消除瞬跳）。 */
  omegaCur: number
  /** 已钉在盘上的刀（含预置障碍刀）。 */
  knives: PinnedKnife[]
  /** 当前关仍需插的刀数。 */
  remaining: number
  /** 下落的刀（动画期间不接受新的插刀）：targetAngle 为盘面固有角。 */
  throwing: { targetAngle: number, ms: number } | null
  /** 关卡完成停顿剩余 ms。 */
  breakMs: number
  /** 失败抖动剩余 ms。 */
  shakeMs: number
  events: KnifeEvent[]
  over: boolean
}

/**
 * 装配某一关：重建速度曲线、清空刀盘、按关卡预置障碍刀。
 * @param state - 目标状态（就地更新关卡字段）。
 * @param rng - 本局随机源。
 */
function setupLevel(state: KnifeRingState, rng: () => number): void {
  state.curve = buildSpeedCurve(rng, state.level)
  state.segIndex = 0
  state.segMs = 0
  state.omegaCur = 0
  state.knives = []
  state.remaining = knivesFor(state.level)
  state.throwing = null
  if (hasObstacles(state.level)) {
    const count = 1 + (rng() < 0.5 ? 1 : 0)
    for (let i = 0; i < count; i += 1) {
      state.knives.push({ angle: rng() * Math.PI * 2, obstacle: true })
    }
  }
}

/**
 * 新开一局：同 seed 同 round 的整局轨迹完全一致。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createKnifeRing(seed: number, round = 1): KnifeRingState {
  const rng = mulberry32((Math.floor(seed) * 97 + round * 31) >>> 0)
  const state: KnifeRingState = {
    t: 0,
    score: 0,
    lives: START_LIVES,
    level: 1,
    ringAngle: rng() * Math.PI * 2,
    curve: [],
    segIndex: 0,
    segMs: 0,
    omegaCur: 0,
    knives: [],
    remaining: 0,
    throwing: null,
    breakMs: 0,
    shakeMs: 0,
    events: [],
    over: false,
  }
  setupLevel(state, rng)
  return state
}

/** 环上角差归一到 [-PI, PI]。 */
function angDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * 尝试插刀：空闲时记录当前落点并进入下落动画（判定在动画结束时进行，
 * 保证确定性：落点取按下瞬间的盘面固有角）。动画中/停顿中/结束时忽略。
 * @param state - 目标状态。
 */
export function throwKnife(state: KnifeRingState): void {
  if (state.over || state.throwing !== null || state.breakMs > 0) return
  // 刀从正上方插入：落点的盘面固有角 = -ringAngle（盘转 +angle 时固有角反移）。
  state.throwing = { targetAngle: -state.ringAngle, ms: 0 }
}

/**
 * 推进一帧：转盘旋转（分段速度曲线）、插刀动画、碰刀判定、过关切换。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepKnifeRing(state: KnifeRingState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  if (state.shakeMs > 0) state.shakeMs = Math.max(0, state.shakeMs - dtMs)
  // 过关停顿：结束后进入下一关。
  if (state.breakMs > 0) {
    state.breakMs = Math.max(0, state.breakMs - dtMs)
    return
  }

  // 分段速度曲线推进（循环）。
  let seg = state.curve[state.segIndex % state.curve.length]!
  state.segMs += dtMs
  while (state.segMs >= seg.durMs) {
    state.segMs -= seg.durMs
    state.segIndex = (state.segIndex + 1) % state.curve.length
    seg = state.curve[state.segIndex]!
  }
  // 实际角速度向当前段目标限加速度缓动（OMEGA_RAMP rad/s²）——
  // 段切换的变速/换向以可见的减速-加速完成，给玩家反应时间。
  const maxStep = (OMEGA_RAMP * dtMs) / 1000
  const diff = seg.omega - state.omegaCur
  state.omegaCur += Math.max(-maxStep, Math.min(maxStep, diff))
  state.ringAngle = (state.ringAngle + state.omegaCur * (dtMs / 1000)) % (Math.PI * 2)

  // 插刀下落动画：结束时判定。
  const th = state.throwing
  if (th !== null) {
    th.ms += dtMs
    if (th.ms >= THROW_MS) {
      state.throwing = null
      const gap = minGapFor(state.level)
      let clash = false
      for (const k of state.knives) {
        if (Math.abs(angDiff(th.targetAngle, k.angle)) < gap) { clash = true; break }
      }
      if (clash) {
        state.lives -= 1
        state.shakeMs = FAIL_SHAKE_MS
        state.events.push({ type: 'hit', angle: th.targetAngle })
        if (state.lives <= 0) { state.lives = 0; state.over = true; return }
      } else {
        state.knives.push({ angle: th.targetAngle, obstacle: false })
        state.remaining -= 1
        state.score += KNIFE_SCORE
        state.events.push({ type: 'stick', angle: th.targetAngle })
        if (state.remaining <= 0) {
          state.score += LEVEL_SCORE
          state.events.push({ type: 'level', level: state.level })
          state.level += 1
          state.breakMs = LEVEL_BREAK_MS
          // 下一关参数在停顿结束时由 nextLevel 装配（此处仅占位重置刀盘）。
          state.knives = []
        }
      }
    }
  }
}

/**
 * 过关停顿结束时装配下一关（转盘随机源仍来自关卡派生种子，保持确定性）。
 * 与 createKnifeRing 的装配不同：这里用 seed+level 派生，便于单关复现。
 * @param state - 目标状态。
 * @param seed - 本局种子。
 */
export function beginNextLevel(state: KnifeRingState, seed: number): void {
  const rng = mulberry32((Math.floor(seed) * 131 + state.level * 17) >>> 0)
  setupLevel(state, rng)
}