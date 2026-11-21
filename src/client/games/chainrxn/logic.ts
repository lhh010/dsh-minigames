/**
 * 连锁反应 ChainRxN 纯逻辑：矩形场地内 40-80 个缓慢漂移的 orb，玩家每关
 * 固定点击次数，点击产生扩张爆波；被波及的 orb 引爆并产生半径 = 自身
 * 半径 × 3.5 的新爆波，逐层连锁。第 n 层引爆得 10×n 分；总引爆数达标
 * 过关，剩余点击折算加分；第 4 关起加入吸收爆波的钢球。全部随机走注入
 * seed（mulberry32），漂移为确定性物理，固定步长 step 可逐帧重放。
 */

/** 逻辑画布尺寸（与渲染共用）。 */
export const W = 640
export const H = 460

/** 场地内框（orb 漂移与反弹边界；HUD 与提示行留在外侧）。 */
export const FIELD = { left: 16, top: 48, right: W - 16, bottom: H - 38 } as const

/** 玩家点击产生的初始爆波最大半径。 */
export const PLAYER_BLAST_R = 30
/** orb 爆波半径 = 自身半径 × 该系数。 */
export const BLAST_SCALE = 3.5
/** 爆波扩张速度（px/秒）。 */
export const EXPAND_SPEED = 130
/** 爆波到最大半径后的滞留秒数（保证连锁窗口，随后消失）。 */
export const LINGER_S = 0.25
/** 每层引爆的基础分（第 n 层得 10×n）。 */
export const LAYER_BASE = 10
/** 过关时每个剩余点击的折算分。 */
export const CLICK_BONUS = 25
/** 固定模拟步长（秒）；index 层按此步长逐帧推进，保证可重放。 */
export const FIXED_DT = 1 / 60

/** 单个关卡参数。 */
export interface Level {
  /** 漂移 orb 数量。 */
  orbCount: number
  /** 过关所需的总引爆数。 */
  goal: number
  /** 本关点击次数。 */
  clicks: number
  /** 钢球数量（吸收爆波、不可引爆）。 */
  steel: number
}

/** 5 关递进：orb 更多 / 目标更高 / 点击更少，第 4 关起加入钢球。 */
export const LEVELS: readonly Level[] = [
  { orbCount: 45, goal: 18, clicks: 5, steel: 0 },
  { orbCount: 55, goal: 28, clicks: 4, steel: 0 },
  { orbCount: 65, goal: 40, clicks: 4, steel: 0 },
  { orbCount: 72, goal: 50, clicks: 4, steel: 6 },
  { orbCount: 80, goal: 62, clicks: 3, steel: 9 },
] as const

/** 场上圆球：可引爆的 orb 或吸收爆波的钢球。 */
export interface Orb {
  id: number
  x: number
  y: number
  r: number
  vx: number
  vy: number
  kind: 'orb' | 'steel'
  alive: boolean
}

/** 一个正在扩张 / 滞留的爆波。 */
export interface Blast {
  x: number
  y: number
  /** 当前半径（扩张中）。 */
  r: number
  /** 最大半径。 */
  maxR: number
  /** 连锁层：玩家点击为 0，被第 n 层爆波引爆的 orb 为 n+1。 */
  depth: number
  /** 到达最大半径后的剩余滞留秒数。 */
  linger: number
  alive: boolean
}

/** 一次引爆事件（渲染粒子 / 测试断言用）。 */
export interface Ignition {
  x: number
  y: number
  /** 连锁层（第 n 层）。 */
  layer: number
  /** 本次得分 10×layer。 */
  gain: number
}

/** 单步模拟结果事件。 */
export interface StepEvent {
  /** 本步被引爆的 orb（按处理顺序）。 */
  ignited: Ignition[]
  /** 本步被钢球吸收掉的爆波数。 */
  absorbed: number
}

/** 一局状态：跨关累计 score，phase 标记当前阶段。 */
export interface ChainRxnState {
  levelIndex: number
  level: Level
  orbs: Orb[]
  blasts: Blast[]
  clicksLeft: number
  /** 本关已引爆 orb 数。 */
  exploded: number
  /** 跨关累计总分。 */
  score: number
  phase: 'aim' | 'chain' | 'won' | 'lost' | 'cleared'
  /** 关卡种子基值（重开 / 下一关按关卡序号派生）。 */
  baseSeed: number
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 构造单个圆球（测试与生成共用）。
 * @param id - 唯一序号。
 * @param x - 圆心 x。
 * @param y - 圆心 y。
 * @param r - 半径。
 * @param vx - x 向速度 px/秒。
 * @param vy - y 向速度 px/秒。
 * @param kind - 'orb' 可引爆 / 'steel' 钢球。
 * @returns 新圆球（存活状态）。
 */
export function makeOrb(id: number, x: number, y: number, r: number, vx: number, vy: number, kind: 'orb' | 'steel'): Orb {
  return { id, x, y, r, vx, vy, kind, alive: true }
}

/** 关卡序号 → 该关 orb 生成种子（同一 baseSeed 下每关不同且确定）。 */
function levelSeed(baseSeed: number, levelIndex: number): number {
  return (baseSeed + levelIndex * 7919) >>> 0
}

/**
 * 生成某一关的初始盘面（seed 决定 orb 位置 / 半径 / 漂移方向）。
 * @param levelIndex - 关卡序号（0 起）。
 * @param baseSeed - 种子基值。
 * @returns 新关卡状态（phase 'aim'，score 归 0）。
 */
export function createLevelState(levelIndex: number, baseSeed: number): ChainRxnState {
  const level = LEVELS[Math.min(Math.max(levelIndex, 0), LEVELS.length - 1)]!
  const rng = mulberry32(levelSeed(baseSeed, levelIndex))
  const orbs: Orb[] = []
  let id = 0
  for (let i = 0; i < level.orbCount; i += 1) {
    const r = 6 + rng() * 10
    const x = FIELD.left + r + 2 + rng() * (FIELD.right - FIELD.left - 2 * r - 4)
    const y = FIELD.top + r + 2 + rng() * (FIELD.bottom - FIELD.top - 2 * r - 4)
    const angle = rng() * Math.PI * 2
    const speed = 8 + rng() * 16
    orbs.push(makeOrb(id, x, y, r, Math.cos(angle) * speed, Math.sin(angle) * speed, 'orb'))
    id += 1
  }
  for (let i = 0; i < level.steel; i += 1) {
    const r = 11 + rng() * 2
    const x = FIELD.left + r + 2 + rng() * (FIELD.right - FIELD.left - 2 * r - 4)
    const y = FIELD.top + r + 2 + rng() * (FIELD.bottom - FIELD.top - 2 * r - 4)
    const angle = rng() * Math.PI * 2
    const speed = 8 + rng() * 10
    orbs.push(makeOrb(id, x, y, r, Math.cos(angle) * speed, Math.sin(angle) * speed, 'steel'))
    id += 1
  }
  return {
    levelIndex,
    level,
    orbs,
    blasts: [],
    clicksLeft: level.clicks,
    exploded: 0,
    score: 0,
    phase: 'aim',
    baseSeed,
  }
}

/**
 * 在指定位置引爆一次点击（玩家初始爆波，层 0）。
 * @param state - 当前状态。
 * @param x - 点击 x。
 * @param y - 点击 y。
 * @returns 是否成功消耗一次点击（终局或次数耗尽返回 false）。
 */
export function fire(state: ChainRxnState, x: number, y: number): boolean {
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'cleared') return false
  if (state.clicksLeft <= 0) return false
  state.clicksLeft -= 1
  state.blasts.push({ x, y, r: 0, maxR: PLAYER_BLAST_R, depth: 0, linger: LINGER_S, alive: true })
  state.phase = 'chain'
  return true
}

/** 漂移一步并在场地内框反弹。 */
function drift(orbs: Orb[], dt: number): void {
  for (const o of orbs) {
    if (!o.alive) continue
    o.x += o.vx * dt
    o.y += o.vy * dt
    if (o.x < FIELD.left + o.r) { o.x = FIELD.left + o.r; o.vx = Math.abs(o.vx) }
    if (o.x > FIELD.right - o.r) { o.x = FIELD.right - o.r; o.vx = -Math.abs(o.vx) }
    if (o.y < FIELD.top + o.r) { o.y = FIELD.top + o.r; o.vy = Math.abs(o.vy) }
    if (o.y > FIELD.bottom - o.r) { o.y = FIELD.bottom - o.r; o.vy = -Math.abs(o.vy) }
  }
}

/**
 * 推进一帧模拟：漂移 → 爆波扩张 / 滞留 → 钢球吸收 → 引爆连锁 →
 * 终局判定（爆波全部消失时按目标 / 剩余点击结算）。
 * @param state - 当前状态（原地变更）。
 * @param dt - 步长秒数（重放须用相同步长序列）。
 * @returns 本步事件（引爆列表与吸收数）。
 */
export function step(state: ChainRxnState, dt: number): StepEvent {
  const event: StepEvent = { ignited: [], absorbed: 0 }
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'cleared') return event
  drift(state.orbs, dt)
  for (const b of state.blasts) {
    if (!b.alive) continue
    if (b.r < b.maxR) b.r = Math.min(b.maxR, b.r + EXPAND_SPEED * dt)
    else b.linger -= dt
  }
  // 本帧新爆波不参与本帧判定（固定层进：每帧最多推进一层连锁）。
  const blastCount = state.blasts.length
  // 钢球吸收：爆波外缘触及钢球即被吞掉（阻挡其后的传播）。
  for (let bi = 0; bi < blastCount; bi += 1) {
    const b = state.blasts[bi]!
    if (!b.alive) continue
    for (const o of state.orbs) {
      if (!o.alive || o.kind !== 'steel') continue
      const dx = o.x - b.x
      const dy = o.y - b.y
      if (Math.hypot(dx, dy) <= b.r + o.r) {
        b.alive = false
        event.absorbed += 1
        break
      }
    }
  }
  // 引爆：存活 orb 触及存活爆波即炸，产生新爆波并按层计分。
  for (let bi = 0; bi < blastCount; bi += 1) {
    const b = state.blasts[bi]!
    if (!b.alive) continue
    for (const o of state.orbs) {
      if (!o.alive || o.kind !== 'orb') continue
      const dx = o.x - b.x
      const dy = o.y - b.y
      if (Math.hypot(dx, dy) <= b.r + o.r) {
        o.alive = false
        const layer = b.depth + 1
        const gain = LAYER_BASE * layer
        state.exploded += 1
        state.score += gain
        state.blasts.push({ x: o.x, y: o.y, r: 0, maxR: o.r * BLAST_SCALE, depth: layer, linger: LINGER_S, alive: true })
        event.ignited.push({ x: o.x, y: o.y, layer, gain })
      }
    }
  }
  state.blasts = state.blasts.filter(b => b.alive && !(b.r >= b.maxR && b.linger <= 0))
  // 终局判定：爆波全部消失时结算。
  if (state.blasts.length === 0 && state.phase === 'chain') {
    if (state.exploded >= state.level.goal) {
      state.score += state.clicksLeft * CLICK_BONUS
      state.phase = 'won'
    } else if (state.clicksLeft <= 0) {
      state.phase = 'lost'
    } else {
      state.phase = 'aim'
    }
  }
  return event
}

/**
 * 是否处于终局阶段（won / lost / cleared）；用函数取值可避免属性窄化
 * 掩盖 step 中的相位变更。
 * @param phase - 当前相位。
 * @returns 终局返回 true。
 */
export function isTerminal(phase: ChainRxnState['phase']): boolean {
  return phase === 'won' || phase === 'lost' || phase === 'cleared'
}

/**
 * 过关后进入下一关（保留累计 score；最后一关过关进入通关态）。
 * @param state - 当前状态（须处于 'won'）。
 * @returns 是否成功推进（非过关态返回 false）。
 */
export function nextLevel(state: ChainRxnState): boolean {
  if (state.phase !== 'won') return false
  if (state.levelIndex + 1 >= LEVELS.length) {
    state.phase = 'cleared'
    return true
  }
  const next = createLevelState(state.levelIndex + 1, state.baseSeed)
  next.score = state.score
  Object.assign(state, next)
  return true
}
