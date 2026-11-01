/**
 * 合成大西瓜（Suika）纯逻辑：确定性 2D 圆形水果物理。玩家选一列 x 投放
 * 水果，固定 120Hz 子步积分：重力 + 圆-圆碰撞（位置修正按半径配重 +
 * 冲量法向反弹），同级两圆接触即合成上一级并爆分（产生 merge 事件供
 * 渲染层放粒子/浮字，合成到最高级西瓜额外 +500）。顶部警戒线：水果
 * （脱离投放保护期后）稳定停在警戒线以上持续一段时间即 game over。
 * 时间单位毫秒，物理单位 px / s，同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（竖向容器）。 */
export const W = 480
export const H = 640
/** 左右墙内侧 x。 */
export const WALL_L = 12
/** 右墙内侧 x。 */
export const WALL_R = W - 12
/** 地面 y（水果底部落点）。 */
export const FLOOR_Y = H - 12
/** 顶部警戒线 y：水果稳定越过（圆顶高于）此线判负。 */
export const WARN_Y = 132
/** 投放高度 y（警戒线上方）。 */
export const DROP_Y = 64
/** 重力加速度 px/s^2。 */
export const GRAVITY = 1500
/** 固定物理子步 ms（120Hz，确定性可测）。 */
export const SUBSTEP_MS = 1000 / 120
/** 碰撞法向反弹恢复系数（软塌堆积感）。 */
export const RESTITUTION = 0.12
/** 地面切向摩擦（每子步速度保留率）。 */
export const GROUND_FRICTION = 0.985
/** 投放冷却 ms。 */
export const DROP_COOLDOWN_MS = 400
/** 新投放水果的稳定判定豁免 ms（下落穿越警戒线不算）。 */
export const GRACE_MS = 700
/** 视为稳定的合速度平方阈值 (px/s)^2。 */
export const SETTLE_SPEED2 = 60 * 60
/** 稳定越线持续该 ms 后 game over。 */
export const OVER_MS = 900
/** 最高级索引（西瓜）。 */
export const MAX_LEVEL = 10
/** 合成到西瓜的额外奖励分。 */
export const WATERMELON_BONUS = 500
/** 浮字存活 ms。 */
export const FLOAT_MS = 950

/** 各级水果半径 px（樱桃→西瓜，11 级递增）。 */
export const FRUIT_RADII = [15, 21, 27, 34, 42, 51, 61, 72, 84, 97, 112] as const
/** 各级水果中文名。 */
export const FRUIT_NAMES = ['樱桃', '草莓', '葡萄', '柠檬', '橙子', '苹果', '梨', '桃子', '菠萝', '哈密瓜', '西瓜'] as const
/** 合成出第 i 级水果的得分（三角数表）。 */
export const MERGE_POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66] as const
/** 预备（下一个可投放）水果的最高级索引：前 5 级随机。 */
export const NEXT_LEVEL_MAX = 4

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

/** 阶段：进行中 / 结束。 */
export type SuikaPhase = 'play' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type SuikaEvent =
  | { type: 'merge', x: number, y: number, level: number, gained: number, bonus: boolean }
  | { type: 'drop', x: number, y: number, level: number }

/** 上浮渐隐的浮字。 */
export interface FloatText {
  x: number
  y: number
  text: string
  life: number
}

/** 场上一个圆形水果。 */
export interface Fruit {
  /** 自增 id（合成替换后作区分）。 */
  id: number
  x: number
  y: number
  vx: number
  vy: number
  /** 等级 0（樱桃）..10（西瓜）。 */
  level: number
  /** 出生时刻 ms（投放豁免期判定用）。 */
  born: number
}

/** 一局游戏的完整可测状态。 */
export interface SuikaState {
  /** 本局累计模拟 ms。 */
  t: number
  seed: number
  score: number
  phase: SuikaPhase
  /** 当前投放列 x。 */
  dropX: number
  /** 投放冷却剩余 ms。 */
  cooldownMs: number
  /** 手上待投放水果等级。 */
  next: number
  /** 再下一个水果等级（预览）。 */
  nextNext: number
  /** 本局合成出的最高等级。 */
  topLevel: number
  /** 稳定越线累计 ms（达 OVER_MS 判负）。 */
  overMs: number
  fruits: Fruit[]
  events: SuikaEvent[]
  floats: FloatText[]
  /** 剩余子步累计器 ms（固定步长积分）。 */
  accMs: number
  /** 下一个水果 id。 */
  nextId: number
  rng: () => number
}

/** 水果半径查表。 */
export function fruitRadius(level: number): number {
  return FRUIT_RADII[level] ?? FRUIT_RADII[FRUIT_RADII.length - 1]!
}

/** 投放列 x 的合法范围（按手上水果半径收边）。 */
export function clampDropX(x: number, level: number): number {
  const r = fruitRadius(level)
  return Math.min(Math.max(x, WALL_L + r), WALL_R - r)
}

/**
 * 开新局：清空场地，预备两个随机前 5 级水果。
 * @param seed - 非负整数随机种子。
 * @returns 初始状态。
 */
export function createSuika(seed: number): SuikaState {
  const rng = mulberry32(seed)
  const roll = (): number => Math.floor(rng() * (NEXT_LEVEL_MAX + 1))
  return {
    t: 0,
    seed,
    score: 0,
    phase: 'play',
    dropX: W / 2,
    cooldownMs: 0,
    next: roll(),
    nextNext: roll(),
    topLevel: 0,
    overMs: 0,
    fruits: [],
    events: [],
    floats: [],
    accMs: 0,
    nextId: 1,
    rng,
  }
}

/**
 * 移动投放列。
 * @param state - 游戏状态。
 * @param x - 目标 x，按手上水果半径自动收边。
 */
export function moveDrop(state: SuikaState, x: number): void {
  if (state.phase !== 'play') return
  state.dropX = clampDropX(x, state.next)
}

/**
 * 投放手上水果（冷却中或已结束返回 false）。
 * @param state - 游戏状态。
 * @returns 是否成功投放。
 */
export function dropFruit(state: SuikaState): boolean {
  if (state.phase !== 'play' || state.cooldownMs > 0) return false
  const r = fruitRadius(state.next)
  const x = Math.min(Math.max(state.dropX, WALL_L + r), WALL_R - r)
  state.fruits.push({ id: state.nextId, x, y: DROP_Y, vx: 0, vy: 0, level: state.next, born: state.t })
  state.nextId += 1
  state.events.push({ type: 'drop', x, y: DROP_Y, level: state.next })
  state.next = state.nextNext
  state.nextNext = Math.floor(state.rng() * (NEXT_LEVEL_MAX + 1))
  state.dropX = clampDropX(state.dropX, state.next)
  state.cooldownMs = DROP_COOLDOWN_MS
  return true
}

/**
 * 推进一帧：固定 120Hz 子步积分 + 合成 + 警戒线判定，并推进浮字。
 * @param state - 游戏状态。
 * @param dtMs - 距上帧 ms（内部按固定子步消费，dt 语义无累积误差）。
 */
export function stepSuika(state: SuikaState, dtMs: number): void {
  // 浮字与冷却按帧推进（结束阶段也要让浮字飘完）。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const f = state.floats[i]!
    f.life += dtMs
    f.y -= 26 * (dtMs / 1000)
    if (f.life >= FLOAT_MS) state.floats.splice(i, 1)
  }
  state.cooldownMs = Math.max(0, state.cooldownMs - dtMs)
  if (state.phase !== 'play') return

  state.t += dtMs
  state.accMs += dtMs
  let guard = 0
  while (state.accMs >= SUBSTEP_MS && guard < 16) {
    state.accMs -= SUBSTEP_MS
    substep(state)
    guard += 1
  }
}

/** 一个固定子步：积分、边界、成对碰撞与合成、越线判定。 */
function substep(state: SuikaState): void {
  const h = SUBSTEP_MS / 1000
  const fruits = state.fruits
  for (const f of fruits) {
    f.vy += GRAVITY * h
    f.x += f.vx * h
    f.y += f.vy * h
    const r = fruitRadius(f.level)
    if (f.x - r < WALL_L) { f.x = WALL_L + r; f.vx = -f.vx * RESTITUTION }
    if (f.x + r > WALL_R) { f.x = WALL_R - r; f.vx = -f.vx * RESTITUTION }
    if (f.y + r > FLOOR_Y) {
      f.y = FLOOR_Y - r
      f.vy = -f.vy * RESTITUTION
      f.vx *= GROUND_FRICTION
    }
  }

  // 待合成对（i<j 同级接触），本子步内各圆至多参与一次。
  const merged = new Set<number>()
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < fruits.length; i += 1) {
    const a = fruits[i]!
    const ra = fruitRadius(a.level)
    for (let j = i + 1; j < fruits.length; j += 1) {
      const b = fruits[j]!
      if (merged.has(a.id) || merged.has(b.id)) continue
      const rb = fruitRadius(b.level)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const min = ra + rb
      const dist2 = dx * dx + dy * dy
      if (dist2 >= min * min) continue
      if (a.level === b.level && a.level < MAX_LEVEL) {
        pairs.push([i, j])
        merged.add(a.id)
        merged.add(b.id)
        continue
      }
      // 碰撞：按半径配重推开 + 冲量法向反弹（质量 ∝ r^2）。
      const dist = Math.sqrt(dist2)
      const nx = dist > 0.0001 ? dx / dist : 1
      const ny = dist > 0.0001 ? dy / dist : 0
      const overlap = min - dist
      const wa = rb / min
      const wb = ra / min
      a.x -= nx * overlap * wa
      a.y -= ny * overlap * wa
      b.x += nx * overlap * wb
      b.y += ny * overlap * wb
      const rvx = b.vx - a.vx
      const rvy = b.vy - a.vy
      const vn = rvx * nx + rvy * ny
      if (vn < 0) {
        const ma = ra * ra
        const mb = rb * rb
        const jimp = -(1 + RESTITUTION) * vn / (1 / ma + 1 / mb)
        a.vx -= jimp * nx / ma
        a.vy -= jimp * ny / ma
        b.vx += jimp * nx / mb
        b.vy += jimp * ny / mb
      }
    }
  }

  // 合成：删两只、生成上一级（位置取质量配重中点），爆分并产生事件。
  for (const [i, j] of pairs) {
    const a = fruits[i]!
    const b = fruits[j]!
    const level = a.level + 1
    const ra = fruitRadius(a.level)
    const rb = fruitRadius(b.level)
    const wa = ra * ra
    const wb = rb * rb
    const x = (a.x * wa + b.x * wb) / (wa + wb)
    const y = (a.y * wa + b.y * wb) / (wa + wb)
    const born = state.t
    const fruit: Fruit = {
      id: state.nextId,
      x,
      y,
      vx: (a.vx * wa + b.vx * wb) / (wa + wb),
      vy: (a.vy * wa + b.vy * wb) / (wa + wb),
      level,
      born,
    }
    state.nextId += 1
    fruits[i] = fruit
    fruits.splice(j, 1)
    let gained: number = MERGE_POINTS[level]!
    let bonus = false
    if (level === MAX_LEVEL) {
      gained += WATERMELON_BONUS
      bonus = true
    }
    state.score += gained
    if (level > state.topLevel) state.topLevel = level
    state.events.push({ type: 'merge', x, y, level, gained, bonus })
    state.floats.push({ x, y: y - fruitRadius(level) - 6, text: '+' + gained, life: 0 })
    if (bonus) state.floats.push({ x, y: y - fruitRadius(level) - 26, text: '大西瓜 +500', life: 0 })
  }

  // 警戒线判定：脱离保护期的水果稳定压线，或被顶出画布顶，累计判负。
  let violating = false
  for (const f of fruits) {
    const r = fruitRadius(f.level)
    if (f.y - r < -4) { violating = true; break }
    if (state.t - f.born < GRACE_MS) continue
    if (f.y - r < WARN_Y && f.vx * f.vx + f.vy * f.vy < SETTLE_SPEED2) { violating = true; break }
  }
  state.overMs = violating ? state.overMs + SUBSTEP_MS : 0
  if (state.overMs >= OVER_MS) state.phase = 'over'
}
