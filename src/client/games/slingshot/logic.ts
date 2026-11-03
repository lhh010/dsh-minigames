/**
 * 弹弓复仇 (Slingshot) pure logic. 拖拽弹弓发射鸟弹轰塌堡垒：
 * 木/石/冰材质耐久各异，块被撞碎裂后上方块自然下落、倾倒，猪被
 * 直接命中、坠落着地或被落块砸中即消灭——全部消灭过关，剩弹定星。
 *
 * 物理为愤怒的小鸟式 2D 刚体：块为任意朝向的矩形（OBB），带中心
 * 位置、线速度、角度与角速度（质量 = 材质 mass × 面积 × 密度）；
 * 猪与鸟为圆。碰撞用 SAT（OBB-OBB 参考面/入射面裁剪出接触点，
 * 圆-盒取最近点）+ 序列冲量求解（累积法向冲量 + 库仑摩擦）+ 直接
 * 位置投影修正穿透（不给静止堆叠注入能量）；偏心冲量经转动惯量产
 * 生角速度，因此撞击可倾倒、抽走底块上方自然塌落。低速且有支撑的
 * 刚体休眠（速度清零、位移为零），失去接触或受冲量即唤醒。固定
 * 子步 (SUBSTEP_HZ) + 纯浮点运算保证同输入逐位一致的确定性重放。
 * 关卡开局做一次确定性落位：把表中互相嵌入/悬空的块去重叠、落到
 * 支撑面、重心对准支撑区间，再用真实子步预落座到全场休眠（LEVELS
 * 表本身不变，玩家看到的第一帧就是静止的堆叠）。
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
/** 冲击阈值：法向接近速度低于它不造成伤害（轻擦）。 */
export const IMPACT_MIN = 90

/** 材质：耐久与质量系数（石最硬最重、冰最脆最轻）。 */
export type Material = 'wood' | 'stone' | 'ice'
export interface MaterialSpec { readonly hp: number, readonly mass: number }
export const MATERIALS: Record<Material, MaterialSpec> = {
  wood: { hp: 60, mass: 1 },
  stone: { hp: 130, mass: 1.8 },
  ice: { hp: 26, mass: 0.6 },
}

/** 面密度：质量 = 材质 mass × 面积(px²) × DENSITY。 */
const DENSITY = 0.001
/** 鸟弹质量（重弹，动量传递明显）。 */
const BIRD_MASS = 3
/** 猪质量。 */
const PIG_MASS = 1.2
/** 每子步冲量迭代次数。 */
const ITERATIONS = 8
/** 位置投影修正的穿透容差(px)与单步最大修正量(px)。 */
const SLOP = 0.4
const MAX_CORR = 1.2
/** 摩擦系数。 */
const MU_BOX = 0.5
const MU_GROUND = 0.8
/** 速度上限（防爆）。 */
const MAX_V = 2400
const MAX_AV = 40

/** 矩形刚体块：x/y 为中心，可平移与旋转。 */
export interface Block {
  x: number
  y: number
  w: number
  h: number
  mat: Material
  hp: number
  vx: number
  vy: number
  angle: number
  av: number
  broken: boolean
  /** 休眠：低速且有支撑持续时冻结速度，静止堆叠位移为零。 */
  asleep: boolean
  /** 低速持续的子步计数。 */
  still: number
}

/** 猪圆形刚体：被直接命中 / 坠落着地 / 被落块砸中即消灭。 */
export interface Pig {
  x: number
  y: number
  vx: number
  vy: number
  dead: boolean
  asleep: boolean
  still: number
}

export interface BirdBody {
  x: number
  y: number
  vx: number
  vy: number
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
  bird: BirdBody | null
  events: SlingshotEvent[]
  stars: number
  /** 鸟低速持续的子步计数（滞留判定用）。 */
  birdSlow: number
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

/** 一块静态块的布局描述（关卡表用，x/y 为左上角）。 */
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

// ---------------------------------------------------------------------------
// 刚体工具：质量属性、接触、求解器。
// ---------------------------------------------------------------------------

type CircleBody = Pig | BirdBody

/** 块质量。 */
function blockMass(b: Block): number {
  return MATERIALS[b.mat].mass * b.w * b.h * DENSITY
}

function invMass(o: Block | CircleBody): number {
  if ('mat' in o) return 1 / blockMass(o)
  if ('dead' in o) return 1 / PIG_MASS
  return 1 / BIRD_MASS
}

/** 转动惯量倒数（圆不旋转）。 */
function invInertia(o: Block | CircleBody): number {
  if ('mat' in o) {
    const m = blockMass(o)
    return 12 / (m * (o.w * o.w + o.h * o.h))
  }
  return 0
}

function radiusOf(o: CircleBody): number {
  return 'dead' in o ? PIG_R : BALL_R
}

/** 刚体是否休眠（地面/鸟视为不休眠）。 */
function asleepOf(o: Block | CircleBody | null): boolean {
  if (o === null) return false
  if ('mat' in o || 'dead' in o) return (o as Block | Pig).asleep
  return false
}

/** 接触点：a→b 法线（b 为 null 表示地面，视作无穷大质量的静止体）。 */
interface Contact {
  a: Block | CircleBody
  b: Block | CircleBody | null
  nx: number
  ny: number
  px: number
  py: number
  pen: number
  jn: number
  jt: number
  e: number
  mu: number
}

/** 接触点处刚体的速度（含旋转项 ω×r）。 */
function velAt(o: Block | CircleBody, rx: number, ry: number): { x: number, y: number } {
  if ('mat' in o) return { x: o.vx - o.av * ry, y: o.vy + o.av * rx }
  return { x: o.vx, y: o.vy }
}

/** 给刚体施加冲量（块含角分量）。 */
function applyImpulse(o: Block | CircleBody, jx: number, jy: number, rx: number, ry: number): void {
  const im = invMass(o)
  o.vx += jx * im
  o.vy += jy * im
  if ('mat' in o) o.av += (rx * jy - ry * jx) * invInertia(o)
}

/** 法向接近速度（>0 表示互相压近），n 为 a→b。 */
function closingSpeed(a: Block | CircleBody, b: Block | CircleBody | null, nx: number, ny: number, px: number, py: number): number {
  const va = velAt(a, px - a.x, py - a.y)
  const vb = b === null ? { x: 0, y: 0 } : velAt(b, px - b.x, py - b.y)
  const vn = (vb.x - va.x) * nx + (vb.y - va.y) * ny
  return vn < 0 ? -vn : 0
}

/** 序列冲量求解单个接触（累积法向冲量 + 库仑摩擦； restitution 见 Contact.e）。 */
function solveContact(c: Contact): void {
  const a = c.a
  const b = c.b
  const invIa = invInertia(a)
  const invIb = b === null ? 0 : invInertia(b)
  const rax = c.px - a.x
  const ray = c.py - a.y
  const rbx = b === null ? 0 : c.px - b.x
  const rby = b === null ? 0 : c.py - b.y
  const { nx, ny } = c
  const rnA = rax * ny - ray * nx
  const rnB = rbx * ny - rby * nx
  const kn = invMass(a) + (b === null ? 0 : invMass(b)) + invIa * rnA * rnA + invIb * rnB * rnB
  if (kn <= 0) return
  const va = velAt(a, rax, ray)
  const vb = b === null ? { x: 0, y: 0 } : velAt(b, rbx, rby)
  const vn = (vb.x - va.x) * nx + (vb.y - va.y) * ny
  const bounce = c.e > 0 && vn < -40 ? -c.e * vn : 0
  const target = bounce
  const jnOld = c.jn
  c.jn = Math.max(0, jnOld + (-vn + target) / kn)
  const dj = c.jn - jnOld
  applyImpulse(a, -dj * nx, -dj * ny, rax, ray)
  if (b !== null) applyImpulse(b, dj * nx, dj * ny, rbx, rby)
  // 摩擦。
  const tx = -ny
  const ty = nx
  const rtA = rax * ty - ray * tx
  const rtB = rbx * ty - rby * tx
  const kt = invMass(a) + (b === null ? 0 : invMass(b)) + invIa * rtA * rtA + invIb * rtB * rtB
  if (kt <= 0) return
  const va2 = velAt(a, rax, ray)
  const vb2 = b === null ? { x: 0, y: 0 } : velAt(b, rbx, rby)
  const vt = (vb2.x - va2.x) * tx + (vb2.y - va2.y) * ty
  const maxF = c.mu * c.jn
  const jtOld = c.jt
  c.jt = Math.max(-maxF, Math.min(maxF, jtOld - vt / kt))
  const djt = c.jt - jtOld
  applyImpulse(a, -djt * tx, -djt * ty, rax, ray)
  if (b !== null) applyImpulse(b, djt * tx, djt * ty, rbx, rby)
}

// ---------------------------------------------------------------------------
// 碰撞检测（流形生成）。
// ---------------------------------------------------------------------------

interface RawContact { nx: number, ny: number, px: number, py: number, pen: number }

/** OBB 的 4 个世界角点（顺时针）。 */
function boxCorners(b: Block): { x: number, y: number }[] {
  const c = Math.cos(b.angle)
  const s = Math.sin(b.angle)
  const hw = b.w / 2
  const hh = b.h / 2
  return [
    { x: b.x + c * -hw - s * -hh, y: b.y + s * -hw + c * -hh },
    { x: b.x + c * hw - s * -hh, y: b.y + s * hw + c * -hh },
    { x: b.x + c * hw - s * hh, y: b.y + s * hw + c * hh },
    { x: b.x + c * -hw - s * hh, y: b.y + s * -hw + c * hh },
  ]
}

/**
 * OBB-OBB：SAT 选最小穿透轴为参考面，裁剪入射面得到 1-2 个接触点
 * （Box2D-lite 做法）。无重叠返回空。
 */
function boxBox(a: Block, b: Block): RawContact[] {
  const ca = Math.cos(a.angle), sa = Math.sin(a.angle)
  const cb = Math.cos(b.angle), sb = Math.sin(b.angle)
  const axx = ca, axy = sa
  const ayx = -sa, ayy = ca
  const bxx = cb, bxy = sb
  const byx = -sb, byy = cb
  const ahw = a.w / 2, ahh = a.h / 2
  const bhw = b.w / 2, bhh = b.h / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  // 轴间点积绝对值。
  const abxx = Math.abs(axx * bxx + axy * bxy)
  const abxy = Math.abs(axx * byx + axy * byy)
  const abyx = Math.abs(ayx * bxx + ayy * bxy)
  const abyy = Math.abs(ayx * byx + ayy * byy)
  const dax = dx * axx + dy * axy
  const day = dx * ayx + dy * ayy
  const dbx = dx * bxx + dy * bxy
  const dby = dx * byx + dy * byy
  const sepAx = Math.abs(dax) - (ahw + bhw * abxx + bhh * abxy)
  const sepAy = Math.abs(day) - (ahh + bhw * abyx + bhh * abyy)
  const sepBx = Math.abs(dbx) - (bhw + ahw * abxx + ahh * abyx)
  const sepBy = Math.abs(dby) - (bhh + ahw * abxy + ahh * abyy)
  if (sepAx > 0 || sepAy > 0 || sepBx > 0 || sepBy > 0) return []
  // 选分离最大（穿透最小）的轴作为参考。
  let refBody = a
  let refNx = 0, refNy = 0
  let refHalfN = 0
  let refTx = 0, refTy = 0
  let refHalfT = 0
  let best = -Infinity
  const consider = (sep: number, body: Block, nx0: number, ny0: number, dotD: number, halfN: number, tx: number, ty: number, halfT: number): void => {
    if (sep > best) {
      best = sep
      const sign = dotD >= 0 ? 1 : -1
      refBody = body
      refNx = nx0 * sign
      refNy = ny0 * sign
      refHalfN = halfN
      refTx = tx
      refTy = ty
      refHalfT = halfT
    }
  }
  consider(sepAx, a, axx, axy, dax, ahw, ayx, ayy, ahh)
  consider(sepAy, a, ayx, ayy, day, ahh, axx, axy, ahw)
  consider(sepBx, b, bxx, bxy, -dbx, bhw, byx, byy, bhh)
  consider(sepBy, b, byx, byy, -dby, bhh, bxx, bxy, bhw)
  // 入射面：另一块上与参考法线最反向的面。
  const other = refBody === a ? b : a
  const oc = Math.cos(other.angle), os = Math.sin(other.angle)
  const ohw = other.w / 2, ohh = other.h / 2
  const faces = [
    { nx: oc, ny: os, hn: ohw, tx: -os, ty: oc, ht: ohh },
    { nx: -oc, ny: -os, hn: ohw, tx: -os, ty: oc, ht: ohh },
    { nx: -os, ny: oc, hn: ohh, tx: oc, ty: os, ht: ohw },
    { nx: os, ny: -oc, hn: ohh, tx: oc, ty: os, ht: ohw },
  ]
  let inc = faces[0]!
  let minDot = Infinity
  for (const f of faces) {
    const d = f.nx * refNx + f.ny * refNy
    if (d < minDot) {
      minDot = d
      inc = f
    }
  }
  // 入射面两端点（世界系）。
  let p1x = other.x + inc.nx * inc.hn - inc.tx * inc.ht
  let p1y = other.y + inc.ny * inc.hn - inc.ty * inc.ht
  let p2x = other.x + inc.nx * inc.hn + inc.tx * inc.ht
  let p2y = other.y + inc.ny * inc.hn + inc.ty * inc.ht
  // 按参考面切向坐标裁剪到参考面范围内。
  const clip = (px: number, py: number): number => (px - refBody.x) * refTx + (py - refBody.y) * refTy
  const clipSegment = (): void => {
    const t1 = clip(p1x, p1y)
    const t2 = clip(p2x, p2y)
    if (t1 < -refHalfT && t2 > t1) {
      const k = (-refHalfT - t1) / (t2 - t1)
      p1x += (p2x - p1x) * k
      p1y += (p2y - p1y) * k
    } else if (t1 > refHalfT && t2 < t1) {
      const k = (refHalfT - t1) / (t2 - t1)
      p1x += (p2x - p1x) * k
      p1y += (p2y - p1y) * k
    }
    const u1 = clip(p1x, p1y)
    const u2 = clip(p2x, p2y)
    if (u2 < -refHalfT && u1 < u2) {
      const k = (u2 - -refHalfT) / (u2 - u1)
      p2x += (p1x - p2x) * k
      p2y += (p1y - p2y) * k
    } else if (u2 > refHalfT && u1 > u2) {
      const k = (u2 - refHalfT) / (u2 - u1)
      p2x += (p1x - p2x) * k
      p2y += (p1y - p2y) * k
    }
  }
  clipSegment()
  const out: RawContact[] = []
  for (const p of [{ x: p1x, y: p1y }, { x: p2x, y: p2y }]) {
    const sep = (p.x - refBody.x) * refNx + (p.y - refBody.y) * refNy - refHalfN
    if (sep <= 0.05) out.push({ nx: refNx, ny: refNy, px: p.x, py: p.y, pen: -sep })
  }
  // 法线统一为 a→b。
  if (refBody === b) {
    for (const c of out) {
      c.nx = -c.nx
      c.ny = -c.ny
    }
  }
  return out
}

/** 圆 vs OBB：盒局部系最近点。无重叠返回 null。 */
function circleBox(c: CircleBody, r: number, b: Block): RawContact | null {
  const cs = Math.cos(b.angle), sn = Math.sin(b.angle)
  const dx = c.x - b.x
  const dy = c.y - b.y
  const lx = dx * cs + dy * sn
  const ly = -dx * sn + dy * cs
  const hw = b.w / 2, hh = b.h / 2
  const qx = Math.max(-hw, Math.min(hw, lx))
  const qy = Math.max(-hh, Math.min(hh, ly))
  if (qx === lx && qy === ly) {
    // 圆心在盒内：沿最浅轴推出。
    const penX = hw - Math.abs(lx)
    const penY = hh - Math.abs(ly)
    let nlx = 0, nly = 0, pen = 0
    if (penX < penY) {
      nlx = lx >= 0 ? 1 : -1
      pen = penX + r
    } else {
      nly = ly >= 0 ? 1 : -1
      pen = penY + r
    }
    const nx = nlx * cs - nly * sn
    const ny = nlx * sn + nly * cs
    const px = b.x + cs * qx - sn * qy
    const py = b.y + sn * qx + cs * qy
    return { nx, ny, px, py, pen }
  }
  const ddx = lx - qx
  const ddy = ly - qy
  const dist = Math.hypot(ddx, ddy)
  if (dist >= r) return null
  const nlx = ddx / (dist || 1)
  const nly = ddy / (dist || 1)
  const nx = nlx * cs - nly * sn
  const ny = nlx * sn + nly * cs
  const px = b.x + cs * qx - sn * qy
  const py = b.y + sn * qx + cs * qy
  return { nx, ny, px, py, pen: r - dist }
}

/** 圆 vs 圆。 */
function circleCircle(a: CircleBody, ra: number, b: CircleBody, rb: number): RawContact | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  if (d >= ra + rb || d === 0) return null
  const nx = dx / d
  const ny = dy / d
  return { nx, ny, px: a.x + nx * ra, py: a.y + ny * ra, pen: ra + rb - d }
}

// ---------------------------------------------------------------------------
// 伤害与消灭规则。
// ---------------------------------------------------------------------------

/** 猪被落块砸中的法向接近速度阈值。 */
const PIG_CRUSH_V = 90
/** 猪坠落着地消灭的最小落地速度（容忍开局 ≤22px 的摆放空隙）。 */
const PIG_FALL_V = 200
/** 猪被鸟直接命中的合速度阈值。 */
const PIG_HIT_V = 60

/** 冲击伤害：接近速度 × 有效质量 × 材质脆度 × 来源系数。 */
function impactDamage(block: Block, other: Block | CircleBody | null, closing: number): void {
  if (closing <= IMPACT_MIN) return
  const invOther = other === null ? 0 : invMass(other)
  const meff = 1 / (invMass(block) + invOther)
  let mult = 0.35
  if (other === null) mult = 0.3
  else if (!('mat' in other)) mult = 'dead' in other ? 0.4 : 1
  const dmg = (closing - IMPACT_MIN) * meff * 0.12 * (1 / MATERIALS[block.mat].mass) * mult
  block.hp -= dmg
}

/** 碎裂：标记消失 + 事件 + 给邻近块一点侧向冲量。 */
function breakBlock(state: SlingshotState, b: Block): void {
  b.broken = true
  state.events.push({ type: 'break', x: b.x, y: b.y, mat: b.mat })
  for (const o of state.blocks) {
    if (o.broken || o === b) continue
    const dx = o.x - b.x
    const dy = o.y - b.y
    if (Math.hypot(dx, dy) > 70) continue
    if (Math.abs(dx) > 1) o.vx += dx > 0 ? 45 : -45
    else o.vy -= 25
  }
}

// ---------------------------------------------------------------------------
// 子步。
// ---------------------------------------------------------------------------

function substep(state: SlingshotState, dt: number, settling = false): void {
  const bird = state.bird
  // 1. 积分重力（休眠刚体冻结）。
  for (const b of state.blocks) {
    if (b.broken || b.asleep) continue
    b.vy += GRAVITY * dt
  }
  for (const p of state.pigs) {
    if (!p.dead && !p.asleep) p.vy += GRAVITY * dt
  }
  if (bird !== null) bird.vy += GRAVITY * dt

  // 2. 生成接触（含伤害/消灭判定）。
  const contacts: Contact[] = []
  let birdLanded = false
  const alive = state.blocks.filter(b => !b.broken)
  for (let i = 0; i < alive.length; i += 1) {
    const a = alive[i]!
    for (let j = i + 1; j < alive.length; j += 1) {
      const b = alive[j]!
      const raw = boxBox(a, b)
      if (raw.length === 0) continue
      let worst = 0
      for (const r of raw) {
        const cs = closingSpeed(a, b, r.nx, r.ny, r.px, r.py)
        if (cs > worst) worst = cs
      }
      if (!settling) {
        impactDamage(a, b, worst)
        impactDamage(b, a, worst)
      }
      for (const r of raw) {
        contacts.push({ a, b, nx: r.nx, ny: r.ny, px: r.px, py: r.py, pen: r.pen, jn: 0, jt: 0, e: 0, mu: MU_BOX })
      }
    }
  }
  const circles: CircleBody[] = []
  for (const p of state.pigs) if (!p.dead) circles.push(p)
  if (bird !== null) circles.push(bird)
  for (const c of circles) {
    const r = radiusOf(c)
    const isBird = !('dead' in c)
    for (const b of alive) {
      const raw = circleBox(c, r, b)
      if (raw === null) continue
      const closing = closingSpeed(b, c, raw.nx, raw.ny, raw.px, raw.py)
      if (!settling) {
        impactDamage(b, c, closing)
        if (!isBird && closing > PIG_CRUSH_V && b.vy - (c as Pig).vy > 60) {
          const pig = c as Pig
          if (!pig.dead) {
            pig.dead = true
            state.events.push({ type: 'pig', x: pig.x, y: pig.y })
          }
        }
      }
      contacts.push({ a: b, b: c, nx: raw.nx, ny: raw.ny, px: raw.px, py: raw.py, pen: raw.pen, jn: 0, jt: 0, e: isBird ? 0.2 : 0, mu: MU_BOX })
    }
    // 圆 vs 地面。
    if (c.y + r > GROUND_Y) {
      const pen = c.y + r - GROUND_Y
      const closing = c.vy
      contacts.push({ a: c, b: null, nx: 0, ny: 1, px: c.x, py: GROUND_Y, pen, jn: 0, jt: 0, e: 0, mu: MU_GROUND })
      if (isBird) {
        birdLanded = true
      } else if (!settling) {
        const pig = c as Pig
        if (!pig.dead && closing > PIG_FALL_V) {
          pig.dead = true
          state.events.push({ type: 'pig', x: pig.x, y: pig.y })
        }
      }
    }
  }
  // 鸟 vs 猪。
  if (bird !== null) {
    for (const pig of state.pigs) {
      if (pig.dead) continue
      const raw = circleCircle(bird, BALL_R, pig, PIG_R)
      if (raw === null) continue
      const rel = Math.hypot(bird.vx - pig.vx, bird.vy - pig.vy)
      if (!settling && rel > PIG_HIT_V) {
        pig.dead = true
        state.events.push({ type: 'pig', x: pig.x, y: pig.y })
      }
      contacts.push({ a: bird, b: pig, nx: raw.nx, ny: raw.ny, px: raw.px, py: raw.py, pen: raw.pen, jn: 0, jt: 0, e: 0.1, mu: 0.3 })
    }
  }
  // 块 vs 地面（最低的角点）。
  for (const b of alive) {
    let worst = 0
    let worstCorner: { x: number, y: number } | null = null
    for (const p of boxCorners(b)) {
      if (p.y > GROUND_Y && p.y - GROUND_Y > worst) {
        worst = p.y - GROUND_Y
        worstCorner = p
      }
    }
    if (worstCorner === null) continue
    if (!settling) impactDamage(b, null, b.vy)
    contacts.push({ a: b, b: null, nx: 0, ny: 1, px: worstCorner.x, py: worstCorner.y, pen: worst, jn: 0, jt: 0, e: 0, mu: MU_GROUND })
  }

  // 3. 冲量迭代。
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (const c of contacts) solveContact(c)
  }

  // 4. 位置投影：把超过容差的穿透按质量权重直接推开（不引入速度，
  // 静止堆叠不获得能量；双方休眠的接触跳过，避免冻结堆叠漂移）。
  for (const c of contacts) {
    if (c.pen <= SLOP) continue
    if (asleepOf(c.a) && asleepOf(c.b)) continue
    const corr = Math.min((c.pen - SLOP) * 0.6, MAX_CORR)
    const ia = invMass(c.a)
    const ib = c.b === null ? 0 : invMass(c.b)
    const wa = ia / (ia + ib)
    const wb = 1 - wa
    c.a.x -= c.nx * corr * wa
    c.a.y -= c.ny * corr * wa
    if (c.b !== null) {
      c.b.x += c.nx * corr * wb
      c.b.y += c.ny * corr * wb
    }
  }

  // 5. 积分位置。
  for (const b of state.blocks) {
    if (b.broken || b.asleep) continue
    if (b.vx > MAX_V) b.vx = MAX_V
    if (b.vx < -MAX_V) b.vx = -MAX_V
    if (b.vy > MAX_V) b.vy = MAX_V
    if (b.vy < -MAX_V) b.vy = -MAX_V
    if (b.av > MAX_AV) b.av = MAX_AV
    if (b.av < -MAX_AV) b.av = -MAX_AV
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.angle += b.av * dt
  }
  for (const p of state.pigs) {
    if (p.dead || p.asleep) continue
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.y + PIG_R > GROUND_Y + 30) p.y = GROUND_Y + 30
  }
  if (bird !== null) {
    bird.x += bird.vx * dt
    bird.y += bird.vy * dt
  }

  // 6. 休眠/唤醒：低速且有接触持续一段时间的刚体冻结速度（静止
  // 堆叠位移为零）；失去接触或被冲量加速则唤醒。
  const touched = new Set<Block | Pig>()
  for (const c of contacts) {
    touched.add(c.a as Block | Pig)
    if (c.b !== null) touched.add(c.b as Block | Pig)
  }
  // 预落座期用更宽的休眠阈值：仅靠窄支撑平衡的板（亚稳）在数值
  // 扰动放大前冻结，而不是倾倒砸塌全场。
  const wakeV2 = settling ? 900 : 225
  const wakeAv = settling ? 0.5 : 0.25
  const sleepV2 = settling ? 400 : 64
  const sleepAv = settling ? 0.25 : 0.1
  const sleepStill = settling ? 8 : 48
  for (const b of state.blocks) {
    if (b.broken) continue
    const fast = b.vx * b.vx + b.vy * b.vy > wakeV2 || Math.abs(b.av) > wakeAv
    if (b.asleep) {
      if (!touched.has(b) || fast) {
        b.asleep = false
        b.still = 0
      }
    } else if (fast || b.vx * b.vx + b.vy * b.vy >= sleepV2 || Math.abs(b.av) >= sleepAv || !touched.has(b)) {
      b.still = 0
    } else {
      b.still += 1
      if (b.still >= sleepStill) {
        b.asleep = true
        b.vx = 0
        b.vy = 0
        b.av = 0
      }
    }
  }
  for (const p of state.pigs) {
    if (p.dead) continue
    const fast = p.vx * p.vx + p.vy * p.vy > wakeV2
    if (p.asleep) {
      if (!touched.has(p) || fast) {
        p.asleep = false
        p.still = 0
      }
    } else if (fast || p.vx * p.vx + p.vy * p.vy >= sleepV2 || !touched.has(p)) {
      p.still = 0
    } else {
      p.still += 1
      if (p.still >= sleepStill) {
        p.asleep = true
        p.vx = 0
        p.vy = 0
      }
    }
  }

  // 7. 碎裂清扫。
  for (const b of state.blocks) {
    if (!b.broken && b.hp <= 0) breakBlock(state, b)
  }

  // 8. 鸟结束判定。
  if (bird !== null) {
    const speed = Math.hypot(bird.vx, bird.vy)
    state.birdSlow = speed < 20 ? state.birdSlow + 1 : 0
    const gone = bird.x > W + 80 || bird.x < -80 || bird.y < -600 || state.birdSlow > 120
    if (birdLanded || gone) {
      state.events.push({ type: 'land', x: bird.x, y: Math.min(bird.y, GROUND_Y) })
      state.bird = null
      state.birdSlow = 0
    }
  }
}

/** 场上是否静止（用于回到 aim / 判负）。 */
function settled(state: SlingshotState): boolean {
  for (const b of state.blocks) {
    if (b.broken) continue
    if (b.vx * b.vx + b.vy * b.vy > 100 || Math.abs(b.av) > 0.15) return false
  }
  for (const p of state.pigs) {
    if (p.dead) continue
    if (p.vx * p.vx + p.vy * p.vy > 100) return false
  }
  return true
}

/**
 * 推进一帧（内部按 SUBSTEP_HZ 固定子步）：刚体积分、碰撞冲量、
 * 耐久碎裂、猪消灭。
 */
export function stepSlingshot(state: SlingshotState, dtMs: number): void {
  const steps = Math.max(1, Math.round((dtMs / 1000) * SUBSTEP_HZ))
  const dt = 1 / SUBSTEP_HZ
  for (let s = 0; s < steps; s += 1) substep(state, dt)
}

/** 开一关。 */
export function createSlingshot(seed: number, level: number): SlingshotState {
  const spec = LEVELS[Math.min(level - 1, LEVELS.length - 1)]!
  const blocks: Block[] = spec.blocks.map(b => ({
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    w: b.w,
    h: b.h,
    mat: b.mat,
    hp: MATERIALS[b.mat].hp,
    vx: 0,
    vy: 0,
    angle: 0,
    av: 0,
    broken: false,
    asleep: false,
    still: 0,
  }))
  const pigs: Pig[] = spec.pigs.map(p => ({ x: p.x, y: p.y, vx: 0, vy: 0, dead: false, asleep: false, still: 0 }))
  settleLayout(blocks, pigs)
  const state: SlingshotState = {
    seed,
    level,
    phase: 'aim',
    birds: spec.birds,
    used: 0,
    blocks,
    pigs,
    bird: null,
    events: [],
    stars: 0,
    birdSlow: 0,
  }
  // 开局物理预落座：先全部置休眠，再以真实子步推进（免伤/免死）——
  // 已落在支撑面上的块保持冻结，仅有空隙/失去支撑的块唤醒下落并重新
  // 休眠，直到全部休眠或上限。玩家看到的第一帧就是静止、无悬空的堆叠。
  const dt = 1 / SUBSTEP_HZ
  for (const b of blocks) b.asleep = true
  for (const pig of pigs) pig.asleep = true
  for (let i = 0; i < 4800; i += 1) {
    substep(state, dt, true)
    if (state.blocks.every(b => b.broken || b.asleep) && state.pigs.every(p => p.dead || p.asleep)) break
  }
  for (const b of state.blocks) {
    b.vx = 0
    b.vy = 0
    b.av = 0
    b.still = 0
    b.asleep = true
  }
  for (const pig of state.pigs) {
    pig.vx = 0
    pig.vy = 0
    pig.still = 0
    pig.asleep = true
  }
  state.events.length = 0
  return state
}

// ---------------------------------------------------------------------------

/** 去重叠迭代：SAT 最小平移向量按质量加权推开 + 地面钳制（纯位置）。 */
function separateOverlaps(blocks: Block[], pigs: Pig[]): void {
  const weight = (a: Block | Pig, b: Block): { wa: number, wb: number } => {
    const ia = 'mat' in a ? invMass(a) : 1 / PIG_MASS
    const ib = invMass(b)
    return { wa: ia / (ia + ib), wb: ib / (ia + ib) }
  }
  for (let iter = 0; iter < 160; iter += 1) {
    let moved = false
    for (let i = 0; i < blocks.length; i += 1) {
      const a = blocks[i]!
      for (let j = i + 1; j < blocks.length; j += 1) {
        const b = blocks[j]!
        const raw = boxBox(a, b)
        if (raw.length === 0) continue
        let deepest = raw[0]!
        for (const r of raw) if (r.pen > deepest.pen) deepest = r
        const { wa, wb } = weight(a, b)
        a.x -= deepest.nx * deepest.pen * wa
        a.y -= deepest.ny * deepest.pen * wa
        b.x += deepest.nx * deepest.pen * wb
        b.y += deepest.ny * deepest.pen * wb
        moved = true
      }
      let deepestGround = 0
      for (const q of boxCorners(a)) {
        if (q.y > GROUND_Y && q.y - GROUND_Y > deepestGround) deepestGround = q.y - GROUND_Y
      }
      if (deepestGround > 0) {
        a.y -= deepestGround
        moved = true
      }
    }
    for (const pig of pigs) {
      for (const b of blocks) {
        const raw = circleBox(pig, PIG_R, b)
        if (raw === null) continue
        const { wa, wb } = weight(pig, b)
        pig.x -= raw.nx * raw.pen * wa
        pig.y -= raw.ny * raw.pen * wa
        b.x += raw.nx * raw.pen * wb
        b.y += raw.ny * raw.pen * wb
        moved = true
      }
      if (pig.y + PIG_R > GROUND_Y) {
        pig.y = GROUND_Y - PIG_R
        moved = true
      }
    }
    if (!moved) break
  }
}

/** 块/猪正下方最高的支撑面顶边（x 投影重叠者；无则地面）。 */
function floorUnder(blocks: Block[], bottom: number, x1: number, x2: number): number {
  let floorTop = GROUND_Y
  for (const o of blocks) {
    const top = o.y - o.h / 2
    if (top < bottom - 1 || top >= floorTop) continue
    if (o.x + o.w / 2 > x1 + 1 && o.x - o.w / 2 < x2 - 1) floorTop = top
  }
  return floorTop
}

/**
 * 确定性落位预处理：自下而上把每个块/猪垂直落到正下方最高的支撑面
 * （消除关卡表中的悬空与嵌入），再把重心越出支撑区间（留 6px 余量）
 * 的块连同其正上方的叠放物水平平移到支撑区间中心（≤30px）。残余
 * 重叠交给开局物理预落座的位置投影温和解决。LEVELS 表本身不变。
 */
function settleLayout(blocks: Block[], pigs: Pig[]): void {
  const drop = (): void => {
    const order = blocks.map((b, i) => ({ b, i })).sort((p, q) => {
      const dp = (q.b.y + q.b.h / 2) - (p.b.y + p.b.h / 2)
      return dp !== 0 ? dp : p.i - q.i
    })
    for (const { b } of order) {
      b.y = floorUnder(blocks, b.y + b.h / 2, b.x - b.w / 2, b.x + b.w / 2) - b.h / 2
    }
    for (const pig of pigs) {
      pig.y = floorUnder(blocks, pig.y + PIG_R, pig.x - PIG_R, pig.x + PIG_R) - PIG_R
    }
  }
  separateOverlaps(blocks, pigs)
  drop()
  // 重心对支撑。
  const order = blocks.map((b, i) => ({ b, i })).sort((p, q) => {
    const dp = (q.b.y + q.b.h / 2) - (p.b.y + p.b.h / 2)
    return dp !== 0 ? dp : p.i - q.i
  })
  for (const { b } of order) {
    const bottom = b.y + b.h / 2
    if (bottom >= GROUND_Y - 3) continue
    let lo = Infinity
    let hi = -Infinity
    for (const o of blocks) {
      if (o === b) continue
      const top = o.y - o.h / 2
      if (top < bottom - 4 || top > bottom + 4) continue
      if (o.x + o.w / 2 > b.x - b.w / 2 + 2 && o.x - o.w / 2 < b.x + b.w / 2 - 2) {
        lo = Math.min(lo, o.x - o.w / 2)
        hi = Math.max(hi, o.x + o.w / 2)
      }
    }
    if (lo === Infinity) continue
    const margin = 6
    if (b.x >= lo + margin && b.x <= hi - margin) continue
    let shift = (lo + hi) / 2 - b.x
    if (shift > 30) shift = 30
    if (shift < -30) shift = -30
    const top = b.y - b.h / 2
    const x1 = b.x - b.w / 2 - 4
    const x2 = b.x + b.w / 2 + 4
    b.x += shift
    for (const o of blocks) {
      if (o === b) continue
      if (o.y + o.h / 2 <= top + 2 && o.x > x1 && o.x < x2) o.x += shift
    }
    for (const pig of pigs) {
      if (pig.y + PIG_R <= top + 2 && pig.x > x1 && pig.x < x2) pig.x += shift
    }
  }
  separateOverlaps(blocks, pigs)
  drop()
}

/** 发射：设置鸟初速（phase 必须为 aim 且有剩弹）。 */
export function launch(state: SlingshotState, vx: number, vy: number): boolean {
  if (state.phase !== 'aim' || state.used >= state.birds) return false
  state.bird = { x: SLING.x, y: SLING.y, vx, vy }
  state.used += 1
  state.phase = 'flying'
  state.birdSlow = 0
  state.events.push({ type: 'launch', x: SLING.x, y: SLING.y })
  return true
}

/** 星级：剩弹 2+ 三星、1 二星、0 一星。 */
export function starsFor(state: SlingshotState): number {
  const left = state.birds - state.used
  return left >= 2 ? 3 : left >= 1 ? 2 : 1
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
    if (settled(state)) {
      state.phase = state.used >= state.birds ? 'lost' : 'aim'
    }
  }
}

/** 包装 step：物理后结算终局（测试与主循环共用的纯入口）。 */
export function stepAndJudge(state: SlingshotState, dtMs: number): void {
  stepSlingshot(state, dtMs)
  judge(state)
}
