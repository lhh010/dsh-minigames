/**
 * 剪绳喂糖 (CutRope) 纯逻辑层。糖果系在 1-3 根绳上（弹簧质点链 +
 * Verlet 积分的悬垂物理），玩家点击/划线剪断绳子让糖果摆动、坠落，
 * 最终掉进小怪物嘴里过关；途中可顺路收集星星加分，碰到尖刺糖果
 * 即碎、掉出界或带气泡飞出顶部同样判负（共用 3 条命），限剪次数
 * 用尽仍未喂到也判负。
 *
 * 物理为确定性固定子步（SUBSTEP_HZ）：绳是等分段质点链（锚点端
 * 固定，末端与糖果共享节点，糖果一侧校正权重更大模拟重物），剪断
 * 后绳段保留内部约束自由垂落（渲染层播放“弹开”动画）；糖果本身
 * 也是 Verlet 质点，进气泡后受恒定浮力（可点破恢复重力）。全部
 * 运算是纯浮点 + 注入 seed（mulberry32，仅用于剪断冲量的微扰动），
 * 同 seed 同输入逐位一致，可确定性重放。
 */

export const W = 640
export const H = 440
/** 地面（糖果落地面即视为错失机会，进入静止超时判负）。 */
export const GROUND_Y = 400
export const GRAVITY = 1400
/** 气泡浮力（向上的加速度，略小于重力的一半，先沉后缓升）。 */
export const BUOY = 700
/** 固定物理子步频率。 */
export const SUBSTEP_HZ = 120
/** 每子步绳约束迭代次数。 */
export const ROPE_ITER = 10
export const ROPE_DAMP = 0.995
export const CANDY_DAMP = 0.999
export const CANDY_R = 12
/** 小怪物嘴捕获半径。 */
export const MOUTH_R = 26
export const STAR_R = 11
export const BUBBLE_R = 24
export const MAX_LIVES = 3
/** 每根绳的质点数（含锚点端，不含糖果端）。 */
const ROPE_PTS = 7

/** 绳质点（Verlet：px/py 为上一步位置）。 */
export interface Pt {
  x: number
  y: number
  px: number
  py: number
}

export interface RopeSpec {
  ax: number
  ay: number
  len: number
}

export interface SpikeSpec {
  /** 尖刺碰撞矩形（左上角 + 宽高）。 */
  x: number
  y: number
  w: number
  h: number
}

export interface LevelSpec {
  ropes: readonly RopeSpec[]
  candy: { x: number, y: number }
  monster: { x: number, y: number }
  stars: readonly { x: number, y: number }[]
  spikes?: readonly SpikeSpec[]
  bubble?: { x: number, y: number }
  cuts: number
}

/** 运行时绳：cut 后仍保留质点链自由垂落（渲染弹开动画）。 */
export interface RopeRT {
  ax: number
  ay: number
  rest: number
  cut: boolean
  pts: Pt[]
}

export interface Candy {
  x: number
  y: number
  px: number
  py: number
}

export interface BubbleState {
  x: number
  y: number
  onCandy: boolean
  popped: boolean
}

export type CutRopeEvent =
  | { type: 'cut', x: number, y: number }
  | { type: 'star', x: number, y: number }
  | { type: 'shatter', x: number, y: number }
  | { type: 'bubble', x: number, y: number }
  | { type: 'pop', x: number, y: number }
  | { type: 'win', stars: number }
  | { type: 'fail', reason: 'fell' | 'spike' | 'flew' | 'starved' }

export type Phase = 'play' | 'won' | 'lost'

export interface CutRopeState {
  seed: number
  level: number
  phase: Phase
  lives: number
  cutsLeft: number
  ropes: RopeRT[]
  candy: Candy
  monster: { x: number, y: number }
  stars: { x: number, y: number, got: boolean }[]
  spikes: SpikeSpec[]
  bubble: BubbleState | null
  /** 静止累计 ms（错失判负计时）。 */
  stillMs: number
  timeMs: number
  events: CutRopeEvent[]
  /** 注入的确定性随机源（剪断冲量微扰动用）。 */
  rng: () => number
}

/** mulberry32 PRNG：小、快、确定性。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779b9) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 5 关递进：1 绳直落 → 2 绳摆荡 → 2 绳 + 地面尖刺逼抛物线 →
 * 气泡浮空 + 高台怪物 → 3 绳 + 气泡 + 尖刺（左路长程飞行）。
 */
export const LEVELS: readonly LevelSpec[] = [
  {
    ropes: [{ ax: 320, ay: 70, len: 150 }],
    candy: { x: 322, y: 218 },
    monster: { x: 320, y: 372 },
    stars: [{ x: 320, y: 300 }],
    cuts: 1,
  },
  {
    ropes: [
      { ax: 220, ay: 70, len: 170 },
      { ax: 420, ay: 70, len: 170 },
    ],
    candy: { x: 320, y: 212 },
    monster: { x: 320, y: 372 },
    stars: [{ x: 320, y: 288 }, { x: 320, y: 330 }],
    cuts: 2,
  },
  {
    ropes: [
      { ax: 200, ay: 70, len: 190 },
      { ax: 440, ay: 70, len: 190 },
    ],
    candy: { x: 320, y: 216 },
    monster: { x: 510, y: 372 },
    stars: [{ x: 430, y: 300 }, { x: 470, y: 252 }],
    spikes: [{ x: 248, y: 388, w: 176, h: 12 }],
    cuts: 2,
  },
  {
    ropes: [{ ax: 300, ay: 70, len: 160 }],
    candy: { x: 330, y: 200 },
    monster: { x: 384, y: 178 },
    stars: [{ x: 336, y: 292 }, { x: 338, y: 240 }],
    spikes: [{ x: 170, y: 388, w: 300, h: 12 }],
    bubble: { x: 300, y: 332 },
    cuts: 1,
  },
  {
    ropes: [
      { ax: 260, ay: 70, len: 150 },
      { ax: 340, ay: 70, len: 150 },
      { ax: 420, ay: 70, len: 180 },
    ],
    candy: { x: 310, y: 210 },
    monster: { x: 150, y: 200 },
    stars: [{ x: 222, y: 288 }, { x: 182, y: 248 }],
    spikes: [{ x: 240, y: 388, w: 300, h: 12 }],
    bubble: { x: 280, y: 330 },
    cuts: 3,
  },
]

/** 开一关（lives 由调用方跨关延续）。 */
export function createCutRope(seed: number, level: number, lives = MAX_LIVES): CutRopeState {
  const spec = LEVELS[Math.min(level - 1, LEVELS.length - 1)]!
  const ropes: RopeRT[] = spec.ropes.map(rs => {
    const pts: Pt[] = []
    for (let i = 0; i < ROPE_PTS; i += 1) {
      const t = i / (ROPE_PTS - 1)
      const x = rs.ax + (spec.candy.x - rs.ax) * t
      const y = rs.ay + (spec.candy.y - rs.ay) * t
      pts.push({ x, y, px: x, py: y })
    }
    return { ax: rs.ax, ay: rs.ay, rest: rs.len / ROPE_PTS, cut: false, pts }
  })
  return {
    seed,
    level,
    phase: 'play',
    lives,
    cutsLeft: spec.cuts,
    ropes,
    candy: { x: spec.candy.x, y: spec.candy.y, px: spec.candy.x, py: spec.candy.y },
    monster: { x: spec.monster.x, y: spec.monster.y },
    stars: spec.stars.map(s => ({ x: s.x, y: s.y, got: false })),
    spikes: spec.spikes === undefined ? [] : spec.spikes.map(s => ({ ...s })),
    bubble: spec.bubble === undefined ? null : { x: spec.bubble.x, y: spec.bubble.y, onCandy: false, popped: false },
    stillMs: 0,
    timeMs: 0,
    events: [],
    rng: mulberry32(seed),
  }
}

/** 约束松弛：把 a-b 拉回静止长度（wa/wb 为两侧校正权重）。 */
function relax(a: Pt, b: { x: number, y: number }, rest: number, wa: number, wb: number): void {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-6) return
  const diff = (d - rest) / d
  a.x += dx * diff * wa
  a.y += dy * diff * wa
  b.x -= dx * diff * wb
  b.y -= dy * diff * wb
}

/** 圆 vs 轴对齐矩形最近点距离平方。 */
function circleRectDist2(cx: number, cy: number, r: { x: number, y: number, w: number, h: number }): number {
  const qx = Math.max(r.x, Math.min(cx, r.x + r.w))
  const qy = Math.max(r.y, Math.min(cy, r.y + r.h))
  const dx = cx - qx
  const dy = cy - qy
  return dx * dx + dy * dy
}

function fail(state: CutRopeState, reason: 'fell' | 'spike' | 'flew' | 'starved'): void {
  state.lives -= 1
  state.phase = 'lost'
  state.events.push({ type: 'fail', reason })
}

/** 单个固定子步：积分 → 约束 → 地面 → 判定。 */
function substep(state: CutRopeState, dt: number): void {
  const bubble = state.bubble
  const bubbled = bubble !== null && bubble.onCandy && !bubble.popped
  const dt2 = dt * dt

  // 1. 绳质点 Verlet 积分（锚点 idx 0 除外）。
  for (const rope of state.ropes) {
    for (let i = 1; i < rope.pts.length; i += 1) {
      const p = rope.pts[i]!
      const vx = (p.x - p.px) * ROPE_DAMP
      const vy = (p.y - p.py) * ROPE_DAMP
      p.px = p.x
      p.py = p.y
      p.x += vx
      p.y += vy + GRAVITY * dt2
    }
  }

  // 2. 糖果积分：气泡中受浮力，否则重力。
  const c = state.candy
  const cvx = (c.x - c.px) * CANDY_DAMP
  const cvy = (c.y - c.py) * CANDY_DAMP
  c.px = c.x
  c.py = c.y
  const accel = bubbled ? -BUOY : GRAVITY
  c.x += cvx
  c.y += cvy + accel * dt2

  // 3. 约束迭代：未剪的绳锚点固定、末端连糖果（糖果重，权重小）；
  // 剪断的绳只保留内部约束，自由垂落。
  for (let it = 0; it < ROPE_ITER; it += 1) {
    for (const rope of state.ropes) {
      const pts = rope.pts
      if (!rope.cut) {
        pts[0]!.x = rope.ax
        pts[0]!.y = rope.ay
        pts[0]!.px = rope.ax
        pts[0]!.py = rope.ay
      }
      for (let i = 0; i < pts.length - 1; i += 1) {
        const wa = i === 0 && !rope.cut ? 0 : 0.5
        relax(pts[i]!, pts[i + 1]!, rope.rest, wa, 1 - wa)
      }
      if (!rope.cut) {
        // 糖果重：末端点动 0.72，糖果只被拉 0.28。
        relax(pts[pts.length - 1]!, c, rope.rest, 0.72, 0.28)
      }
    }
  }

  // 4. 地面：糖果落到地面即停（等待错失超时）；绳点同样不穿地。
  if (c.y > GROUND_Y - CANDY_R) {
    c.y = GROUND_Y - CANDY_R
    c.px = c.x - (c.x - c.px) * 0.5
    c.py = c.y
  }
  for (const rope of state.ropes) {
    for (let i = 1; i < rope.pts.length; i += 1) {
      const p = rope.pts[i]!
      if (p.y > GROUND_Y) p.y = GROUND_Y
    }
  }

  if (state.phase !== 'play') return
  state.timeMs += dt * 1000

  // 5. 气泡：吸附 / 跟随。
  if (bubble !== null && !bubble.popped) {
    if (!bubble.onCandy && Math.hypot(c.x - bubble.x, c.y - bubble.y) < BUBBLE_R - 2) {
      bubble.onCandy = true
      // 气泡软接住糖果：竖直速度清零（不再砸穿下坠），水平漂移保留。
      c.py = c.y
      state.events.push({ type: 'bubble', x: bubble.x, y: bubble.y })
    }
    if (bubble.onCandy) {
      bubble.x = c.x
      bubble.y = c.y
    }
  }

  // 6. 尖刺：糖果碰到即碎。
  for (const s of state.spikes) {
    if (circleRectDist2(c.x, c.y, s) < CANDY_R * CANDY_R) {
      state.events.push({ type: 'shatter', x: c.x, y: c.y })
      fail(state, 'spike')
      return
    }
  }

  // 7. 出界：坠落/横飞出界、气泡带糖飞出顶部。
  if (c.y > H + 60 || c.x < -60 || c.x > W + 60) {
    fail(state, 'fell')
    return
  }
  if (bubbled && c.y < 6) {
    fail(state, 'flew')
    return
  }

  // 8. 星星收集。
  for (const st of state.stars) {
    if (!st.got && Math.hypot(c.x - st.x, c.y - st.y) < CANDY_R + STAR_R + 2) {
      st.got = true
      state.events.push({ type: 'star', x: st.x, y: st.y })
    }
  }

  // 9. 入嘴过关。
  if (Math.hypot(c.x - state.monster.x, c.y - state.monster.y) < MOUTH_R) {
    state.phase = 'won'
    state.events.push({ type: 'win', stars: state.stars.filter(s => s.got).length })
    return
  }

  // 10. 错失超时：糖已无绳可剪（剪数用尽或绳已全断）且近似静止。
  const attached = state.ropes.some(r => !r.cut)
  const speed = Math.hypot(c.x - c.px, c.y - c.py) / dt
  if (!attached || state.cutsLeft <= 0) {
    if (speed < 18) {
      state.stillMs += dt * 1000
      if (state.stillMs > 1100) {
        fail(state, 'starved')
        return
      }
    } else {
      state.stillMs = 0
    }
  } else {
    state.stillMs = 0
  }
}

/** 推进一帧：内部按 SUBSTEP_HZ 固定子步，同输入逐位确定。 */
export function stepCutRope(state: CutRopeState, dtMs: number): void {
  const steps = Math.max(1, Math.round((dtMs / 1000) * SUBSTEP_HZ))
  const dt = 1 / SUBSTEP_HZ
  for (let s = 0; s < steps; s += 1) {
    if (state.phase !== 'play') break
    substep(state, dt)
  }
}

/** 线段相交判定（剪绳命中 + 测试用）。 */
export function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
  if (d === 0) return false
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

/** 剪刀线段是否与某根未剪绳的折线（含末段到糖果）相交。 */
function ropeHit(rope: RopeRT, candy: Candy, x1: number, y1: number, x2: number, y2: number): number {
  const chain: { x: number, y: number }[] = [...rope.pts.map(p => ({ x: p.x, y: p.y })), { x: candy.x, y: candy.y }]
  for (let i = 0; i < chain.length - 1; i += 1) {
    const a = chain[i]!
    const b = chain[i + 1]!
    if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) return i
  }
  return -1
}

/**
 * 剪绳：剪刀线段穿过第一根相交的未剪绳（一次剪一根），消耗一次
 * 剪数；剪断点质点获得由 seed 决定的微小侧向冲量（确定性弹开）。
 * @returns 命中并剪断时为 true。
 */
export function cutRopeAt(state: CutRopeState, x1: number, y1: number, x2: number, y2: number): boolean {
  if (state.phase !== 'play' || state.cutsLeft <= 0) return false
  for (const rope of state.ropes) {
    if (rope.cut) continue
    const hit = ropeHit(rope, state.candy, x1, y1, x2, y2)
    if (hit < 0) continue
    rope.cut = true
    state.cutsLeft -= 1
    // 弹开冲量：命中点附近质点沿剪刀法线甩开，幅度取注入随机数。
    const mid = rope.pts[Math.min(hit + 1, rope.pts.length - 1)]!
    const k = state.rng() * 2.2 + 0.8
    const nx = -(y2 - y1)
    const ny = x2 - x1
    const nl = Math.hypot(nx, ny) || 1
    mid.px = mid.x - (nx / nl) * k
    mid.py = mid.y - (ny / nl) * k
    state.events.push({ type: 'cut', x: mid.x, y: mid.y })
    return true
  }
  return false
}

/** 点破气泡（点击落在气泡范围内）。 */
export function popBubbleAt(state: CutRopeState, x: number, y: number): boolean {
  const b = state.bubble
  if (state.phase !== 'play' || b === null || b.popped) return false
  if (Math.hypot(x - b.x, y - b.y) > BUBBLE_R + 10) return false
  b.popped = true
  b.onCandy = false
  state.events.push({ type: 'pop', x: b.x, y: b.y })
  return true
}

/** 糖果瞬时速度（px/s，测试与错失判定用）。 */
export function candySpeed(state: CutRopeState): number {
  const c = state.candy
  return Math.hypot(c.x - c.px, c.y - c.py) * SUBSTEP_HZ
}
