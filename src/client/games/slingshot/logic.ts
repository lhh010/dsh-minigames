/**
 * 弹弓复仇 (Slingshot) pure logic. 拖拽弹弓发射鸟弹轰塌堡垒：
 * 木/石/冰材质耐久各异，块碎裂后上方失去支撑的块与猪坠落，猪被
 * 直接命中、坠落着地或被落块砸中即消灭——全部消灭过关，剩弹定星。
 *
 * 物理从简但确定：固定子步（SUBSTEP_HZ），鸟为圆形刚体，块为轴对齐
 * 矩形（受撞扣耐久、碎裂消失、失支撑整块下落），猪为圆形（受冲击/
 * 坠落消灭）。关卡为手工参数表。
 */

export const W = 640
export const H = 420
export const GROUND_Y = H - 40
export const SUBSTEP_HZ = 240

/** 弹弓锚点（拖拽发射参照 papertoss 模式）。 */
export const SLING = { x: 90, y: GROUND_Y - 120 }
export const MIN_DRAG = 14
export const MAX_DRAG = 160
export const MAX_SPEED = 950
export const GRAVITY = 900
export const BALL_R = 10
export const PIG_R = 13
/** 冲击阈值：鸟命中速度低于它不造成伤害（轻擦）。 */
export const IMPACT_MIN = 90

/** 材质：耐久与质量系数（石最硬最重、冰最脆最轻）。 */
export type Material = 'wood' | 'stone' | 'ice'
export interface MaterialSpec { readonly hp: number, readonly mass: number }
export const MATERIALS: Record<Material, MaterialSpec> = {
  wood: { hp: 60, mass: 1 },
  stone: { hp: 130, mass: 1.8 },
  ice: { hp: 26, mass: 0.6 },
}

/** 矩形块（静态受撞；失支撑后 vy>0 变为下落刚体）。 */
export interface Block {
  x: number
  y: number
  w: number
  h: number
  mat: Material
  hp: number
  /** 下落速度（0 = 静态支撑中）。 */
  vy: number
  broken: boolean
}

/** 猪：被直接命中 / 坠落着地 / 被落块砸中即消灭。 */
export interface Pig {
  x: number
  y: number
  vy: number
  dead: boolean
}

export type SlingshotEvent =
  | { type: 'break', x: number, y: number, mat: Material }
  | { type: 'pig', x: number, y: number }
  | { type: 'launch', x: number, y: number }
  | { type: 'land', x: number, y: number }

export type Phase = 'aim' | 'flying' | 'won' | 'lost'

export interface SlingshotState {
  seed: number
  level: number
  phase: Phase
  /** 关卡总弹数与已用弹数。 */
  birds: number
  used: number
  blocks: Block[]
  pigs: Pig[]
  /** 飞行中的鸟（null = 待发射）。 */
  bird: { x: number, y: number, vx: number, vy: number } | null
  events: SlingshotEvent[]
  stars: number
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

/** 拖拽向量 → 发射初速（弹弓式）。 */
export function dragToVelocity(dx: number, dy: number): { vx: number, vy: number } | null {
  const len = Math.hypot(dx, dy)
  if (len < MIN_DRAG) return null
  const power = Math.min(len, MAX_DRAG) / MAX_DRAG
  const speed = power * MAX_SPEED
  return { vx: (dx / len) * speed, vy: (dy / len) * speed }
}

/** 一块静态块的布局描述（关卡表用）。 */
export interface BlockSpec { x: number, y: number, w: number, h: number, mat: Material }

/** 关卡表：6 关，块布局 + 猪位 + 弹数。 */
export interface LevelSpec {
  blocks: readonly BlockSpec[]
  pigs: readonly { x: number, y: number }[]
  birds: number
}

const TOWER_X = 420
function column(x: number, top: number, count: number, mat: Material, w = 26, h = 64): BlockSpec[] {
  const out: BlockSpec[] = []
  for (let i = 0; i < count; i += 1) out.push({ x, y: top - i * (h + 2), w, h, mat })
  return out
}

export const LEVELS: readonly LevelSpec[] = [
  {
    blocks: [...column(TOWER_X, GROUND_Y - 64, 3, 'wood'), { x: TOWER_X - 40, y: GROUND_Y - 64, w: 110, h: 22, mat: 'wood' }],
    pigs: [{ x: TOWER_X, y: GROUND_Y - PIG_R }],
    birds: 3,
  },
  {
    blocks: [...column(TOWER_X, GROUND_Y - 64, 2, 'wood'), { x: TOWER_X, y: GROUND_Y - 150, w: 26, h: 40, mat: 'ice' }, ...column(TOWER_X + 60, GROUND_Y - 64, 2, 'ice')],
    pigs: [{ x: TOWER_X, y: GROUND_Y - PIG_R }, { x: TOWER_X + 60, y: GROUND_Y - PIG_R }],
    birds: 3,
  },
  {
    blocks: [...column(TOWER_X, GROUND_Y - 64, 3, 'stone'), { x: TOWER_X - 45, y: GROUND_Y - 150, w: 120, h: 20, mat: 'wood' }, { x: TOWER_X, y: GROUND_Y - 176, w: 30, h: 30, mat: 'ice' }],
    pigs: [{ x: TOWER_X - 45, y: GROUND_Y - PIG_R }, { x: TOWER_X, y: GROUND_Y - 176 - PIG_R }],
    birds: 4,
  },
  {
    blocks: [...column(TOWER_X - 50, GROUND_Y - 64, 2, 'stone'), ...column(TOWER_X + 50, GROUND_Y - 64, 2, 'stone'), { x: TOWER_X, y: GROUND_Y - 150, w: 150, h: 22, mat: 'stone' }, ...column(TOWER_X, GROUND_Y - 176, 2, 'ice', 24, 50)],
    pigs: [{ x: TOWER_X, y: GROUND_Y - PIG_R }, { x: TOWER_X - 50, y: GROUND_Y - PIG_R }, { x: TOWER_X, y: GROUND_Y - 240 - PIG_R }],
    birds: 4,
  },
  {
    blocks: [...column(TOWER_X - 80, GROUND_Y - 64, 4, 'wood'), ...column(TOWER_X, GROUND_Y - 64, 2, 'stone'), ...column(TOWER_X + 80, GROUND_Y - 64, 4, 'wood'), { x: TOWER_X - 40, y: GROUND_Y - 290, w: 220, h: 24, mat: 'stone' }, ...column(TOWER_X, GROUND_Y - 316, 1, 'ice', 30, 44)],
    pigs: [{ x: TOWER_X - 80, y: GROUND_Y - PIG_R }, { x: TOWER_X + 80, y: GROUND_Y - PIG_R }, { x: TOWER_X, y: GROUND_Y - 316 - PIG_R }, { x: TOWER_X, y: GROUND_Y - PIG_R }],
    birds: 5,
  },
  {
    blocks: [...column(TOWER_X - 100, GROUND_Y - 64, 3, 'ice'), ...column(TOWER_X - 40, GROUND_Y - 64, 3, 'stone'), ...column(TOWER_X + 40, GROUND_Y - 64, 3, 'stone'), ...column(TOWER_X + 100, GROUND_Y - 64, 3, 'ice'), { x: TOWER_X - 70, y: GROUND_Y - 200, w: 280, h: 22, mat: 'wood' }, { x: TOWER_X - 20, y: GROUND_Y - 240, w: 180, h: 20, mat: 'wood' }, { x: TOWER_X + 20, y: GROUND_Y - 272, w: 24, h: 44, mat: 'ice' }],
    pigs: [{ x: TOWER_X - 40, y: GROUND_Y - PIG_R }, { x: TOWER_X + 40, y: GROUND_Y - PIG_R }, { x: TOWER_X - 70, y: GROUND_Y - 226 - PIG_R }, { x: TOWER_X + 20, y: GROUND_Y - 300 - PIG_R }],
    birds: 5,
  },
]

/** 开一关。 */
export function createSlingshot(seed: number, level: number): SlingshotState {
  const spec = LEVELS[Math.min(level - 1, LEVELS.length - 1)]!
  return {
    seed,
    level,
    phase: 'aim',
    birds: spec.birds,
    used: 0,
    blocks: spec.blocks.map(b => ({ ...b, hp: MATERIALS[b.mat].hp, vy: 0, broken: false })),
    pigs: spec.pigs.map(p => ({ ...p, vy: 0, dead: false })),
    bird: null,
    events: [],
    stars: 0,
  }
}

/** 发射：设置鸟初速（phase 必须为 aim 且有剩弹）。 */
export function launch(state: SlingshotState, vx: number, vy: number): boolean {
  if (state.phase !== 'aim' || state.used >= state.birds) return false
  state.bird = { x: SLING.x, y: SLING.y, vx, vy }
  state.used += 1
  state.phase = 'flying'
  state.events.push({ type: 'launch', x: SLING.x, y: SLING.y })
  return true
}

/** 星级：剩弹 2+ 三星、1 二星、0 一星。 */
export function starsFor(state: SlingshotState): number {
  const left = state.birds - state.used
  return left >= 2 ? 3 : left >= 1 ? 2 : 1
}

/** 圆 vs 轴对齐矩形最近点。 */
function closestOnRect(bx: number, by: number, b: Block): { cx: number, cy: number } {
  return {
    cx: Math.max(b.x, Math.min(bx, b.x + b.w)),
    cy: Math.max(b.y, Math.min(by, b.y + b.h)),
  }
}

/**
 * 推进一帧（内部按 SUBSTEP_HZ 固定子步）：鸟飞行与碰撞、块耐久与
 * 碎裂、失支撑检测（块/猪下落）、猪消灭、终局结算。
 */
export function stepSlingshot(state: SlingshotState, dtMs: number): void {
  const steps = Math.max(1, Math.round((dtMs / 1000) * SUBSTEP_HZ))
  const dt = 1 / SUBSTEP_HZ
  for (let s = 0; s < steps; s += 1) substep(state, dt)
  settle(state)
}

function substep(state: SlingshotState, dt: number): void {
  const bird = state.bird
  if (bird !== null) {
    bird.vy += GRAVITY * dt
    bird.x += bird.vx * dt
    bird.y += bird.vy * dt
    // 出界或落地面：本弹结束。
    if (bird.y + BALL_R >= GROUND_Y || bird.x > W + 60 || bird.x < -60 || bird.y < -400) {
      state.events.push({ type: 'land', x: bird.x, y: Math.min(bird.y, GROUND_Y) })
      state.bird = null
      return
    }
    // 撞块：推出 + 按冲击速度扣耐久。
    for (const block of state.blocks) {
      if (block.broken) continue
      const { cx, cy } = closestOnRect(bird.x, bird.y, block)
      const dx = bird.x - cx
      const dy = bird.y - cy
      const d = Math.hypot(dx, dy)
      if (d >= BALL_R || d === 0) continue
      const nx = dx / (d || 1)
      const ny = dy / (d || 1)
      bird.x = cx + nx * BALL_R
      bird.y = cy + ny * BALL_R
      const vn = bird.vx * nx + bird.vy * ny
      if (vn < 0) {
        bird.vx -= (1 + 0.35) * vn * nx
        bird.vy -= (1 + 0.35) * vn * ny
        const impact = Math.abs(vn)
        if (impact > IMPACT_MIN) {
          block.hp -= impact / MATERIALS[block.mat].mass * 0.12
          if (block.hp <= 0) {
            block.broken = true
            state.events.push({ type: 'break', x: block.x + block.w / 2, y: block.y + block.h / 2, mat: block.mat })
          }
        }
      }
    }
    // 撞猪：直接消灭（冲击足够）。
    for (const pig of state.pigs) {
      if (pig.dead) continue
      const dx = bird.x - pig.x
      const dy = bird.y - pig.y
      if (Math.hypot(dx, dy) < BALL_R + PIG_R) {
        const vn = Math.hypot(bird.vx, bird.vy)
        if (vn > IMPACT_MIN * 0.7) {
          pig.dead = true
          state.events.push({ type: 'pig', x: pig.x, y: pig.y })
        }
      }
    }
  }
  // 下落物（块与猪）推进。
  for (const block of state.blocks) {
    if (block.broken || block.vy <= 0) continue
    block.vy += GRAVITY * dt
    block.y += block.vy * dt
    if (block.y + block.h >= GROUND_Y) {
      block.y = GROUND_Y - block.h
      // 落地冲击自伤。
      block.hp -= block.vy * 0.06
      block.vy = 0
      if (block.hp <= 0) {
        block.broken = true
        state.events.push({ type: 'break', x: block.x + block.w / 2, y: block.y + block.h / 2, mat: block.mat })
      }
    }
  }
  for (const pig of state.pigs) {
    if (pig.dead || pig.vy <= 0) continue
    pig.vy += GRAVITY * dt
    pig.y += pig.vy * dt
    if (pig.y + PIG_R >= GROUND_Y) {
      pig.dead = true
      state.events.push({ type: 'pig', x: pig.x, y: pig.y })
    }
  }
}

/** 失支撑检测：块/猪下方既无静态块也无地面接触则开始下落；落块砸猪。 */
function settle(state: SlingshotState): void {
  const solid = (x1: number, x2: number, y: number): boolean => {
    if (y >= GROUND_Y - 1) return true
    for (const b of state.blocks) {
      if (b.broken || b.vy > 0) continue
      if (b.y + b.h >= y - 2 && b.y <= y + 6 && x2 > b.x + 2 && x1 < b.x + b.w - 2) return true
    }
    return false
  }
  for (const block of state.blocks) {
    if (block.broken || block.vy > 0) continue
    if (!solid(block.x, block.x + block.w, block.y + block.h)) block.vy = 1
  }
  for (const pig of state.pigs) {
    if (pig.dead || pig.vy > 0) continue
    if (!solid(pig.x - PIG_R, pig.x + PIG_R, pig.y + PIG_R)) pig.vy = 1
  }
  // 落块砸猪：下落块与猪重叠且相对速度大。
  for (const block of state.blocks) {
    if (block.broken || block.vy <= 0) continue
    for (const pig of state.pigs) {
      if (pig.dead) continue
      if (pig.x + PIG_R > block.x && pig.x - PIG_R < block.x + block.w && pig.y + PIG_R > block.y && pig.y - PIG_R < block.y + block.h) {
        pig.dead = true
        state.events.push({ type: 'pig', x: pig.x, y: pig.y })
      }
    }
  }
}

/** 终局：猪全灭=过关（计星）；弹尽且场上静止且仍有猪=失败。 */
function judge(state: SlingshotState): void {
  if (state.pigs.every(p => p.dead)) {
    if (state.phase !== 'won') {
      state.phase = 'won'
      state.stars = starsFor(state)
    }
    return
  }
  if (state.phase === 'flying' && state.bird === null) {
    const moving = state.blocks.some(b => !b.broken && b.vy > 0) || state.pigs.some(p => !p.dead && p.vy > 0)
    if (!moving) {
      state.phase = state.used >= state.birds ? 'lost' : 'aim'
    }
  }
}

/** 包装 step：物理后结算终局（导出给测试用的纯入口）。 */
export function stepAndJudge(state: SlingshotState, dtMs: number): void {
  stepSlingshot(state, dtMs)
  judge(state)
}
