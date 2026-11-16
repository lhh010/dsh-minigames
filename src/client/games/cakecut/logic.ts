/**
 * 蛋糕等分 CakeCut 的纯逻辑：多边形块表示、半平面裁剪（Sutherland–Hodgman
 * 等价实现）、刀切分块、等分判定、关卡轮廓与对称辅助线。全部确定性：
 * 关卡方位角由注入 seed（mulberry32）驱动，无任何 Math.random / DOM 依赖。
 */

/** 平面点（世界坐标，蛋糕中心为原点）。 */
export interface Pt { x: number; y: number }

/** 闭合多边形环（顶点数组，首尾隐式相连）。 */
export type Poly = Pt[]

/** 无限直线由两点确定。 */
export interface Line { a: Pt; b: Pt }

/** 线段（预览/绘制用）。 */
export interface Seg { a: Pt; b: Pt }

/**
 * 一块蛋糕：outer 为外轮廓，holes 为孔洞环（环形关卡）。孔洞总在 outer
 * 内部，面积 = |outer| − Σ|hole|。
 */
export interface Block { id: number; outer: Poly; holes: Poly[] }

/** mulberry32 PRNG：小而快，同 seed 序列完全一致。
 * @param seed - 任意 32 位整数。
 * @returns 返回 [0,1) 均匀伪随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** 鞋带公式的带符号面积（逆时针为正）。
 * @param poly - 顶点数组。
 * @returns 带符号面积。
 */
export function shoelace(poly: Poly): number {
  let sum = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    sum += p.x * q.y - q.x * p.y
  }
  return sum / 2
}

/** 多边形面积（绝对值）。
 * @param poly - 顶点数组。
 * @returns 面积。
 */
export function polygonArea(poly: Poly): number {
  return Math.abs(shoelace(poly))
}

/** 一块的面积：外轮廓减孔洞。
 * @param block - 蛋糕块。
 * @returns 面积。
 */
export function blockArea(block: Block): number {
  let area = polygonArea(block.outer)
  for (const h of block.holes) area -= polygonArea(h)
  return area
}

/**
 * 半平面裁剪（Sutherland–Hodgman，凸裁剪域退化为直线半平面，因此对
 * 凹多边形主体同样正确，退化桥边面积在鞋带公式中相互抵消）。
 * @param poly - 被裁剪的多边形。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @param side - +1 保留直线左侧，-1 保留右侧。
 * @returns 裁剪结果；空侧返回空数组。
 */
export function clipHalfPlane(poly: Poly, a: Pt, b: Pt, side: 1 | -1): Poly {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const sideOf = (p: Pt): number => side * (dx * (p.y - a.y) - dy * (p.x - a.x))
  const out: Poly = []
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i]!
    const nxt = poly[(i + 1) % poly.length]!
    const dc = sideOf(cur)
    const dn = sideOf(nxt)
    if (dc >= 0) out.push(cur)
    if ((dc > 0 && dn < 0) || (dc < 0 && dn > 0)) {
      const t = dc / (dc - dn)
      out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t })
    }
  }
  return out
}

/** 判定面积是否达到有效块下限（滤除数值碎屑/相切残片）。 */
const AREA_EPS = 1

/** 单块刀切结果：两侧均有效时才视为切开。 */
interface SplitResult { left: Block; right: Block }

/**
 * 用过 a、b 的直线把一块切成两块（孔洞随各自所在侧保留）。
 * @param block - 被切的块。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @param idLeft - 左侧新块 id。
 * @param idRight - 右侧新块 id。
 * @returns 两侧都有效时返回两块；切线未贯穿（未触及或相切，某一侧面积
 * 低于下限）返回 null。
 */
export function cutBlock(block: Block, a: Pt, b: Pt, idLeft: number, idRight: number): SplitResult | null {
  const outerL = clipHalfPlane(block.outer, a, b, 1)
  const outerR = clipHalfPlane(block.outer, a, b, -1)
  if (outerL.length === 0 || outerR.length === 0) return null
  const holesL: Poly[] = []
  const holesR: Poly[] = []
  for (const h of block.holes) {
    const hl = clipHalfPlane(h, a, b, 1)
    const hr = clipHalfPlane(h, a, b, -1)
    if (hl.length >= 3) holesL.push(hl)
    if (hr.length >= 3) holesR.push(hr)
  }
  const left: Block = { id: idLeft, outer: outerL, holes: holesL }
  const right: Block = { id: idRight, outer: outerR, holes: holesR }
  if (blockArea(left) <= AREA_EPS || blockArea(right) <= AREA_EPS) return null
  return { left, right }
}

/**
 * 对整盘块应用一刀：直线贯穿到的每一块都被一分为二（贯穿切割可同时
 * 切开多块，这是 2 刀 4 份等三线共点谜题的核心）。
 * @param blocks - 当前全部块。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @param nextId - 新块 id 分配起点（依次 +1）。
 * @returns 切开至少一块时返回新块数组与切开块数；一刀没有贯穿任何块
 * （在蛋糕外、仅相切、沿既有刀缝）返回 null。
 */
export function applyCut(blocks: Block[], a: Pt, b: Pt, nextId: number): { blocks: Block[]; splitCount: number } | null {
  const out: Block[] = []
  let id = nextId
  let splitCount = 0
  for (const block of blocks) {
    const r = cutBlock(block, a, b, id, id + 1)
    if (r === null) { out.push(block); continue }
    out.push(r.left, r.right)
    id += 2
    splitCount += 1
  }
  if (splitCount === 0) return null
  return { blocks: out, splitCount }
}

/** 偶奇规则点在块内测试（外轮廓与孔洞共同计数）。
 * @param p - 测试点。
 * @param block - 蛋糕块。
 * @returns 点在块材料内为 true。
 */
export function pointInBlock(p: Pt, block: Block): boolean {
  let inside = false
  const rings = [block.outer, ...block.holes]
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const pi = ring[i]!
      const pj = ring[j]!
      if ((pi.y > p.y) !== (pj.y > p.y) &&
        p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) {
        inside = !inside
      }
    }
  }
  return inside
}

/**
 * 直线在整盘块内的实体系数区间：刀线预览与合法性判定共用。
 * @param blocks - 当前全部块。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @returns 升序线段数组（世界坐标端点）。
 */
export function cutSegments(blocks: Block[], a: Pt, b: Pt): Seg[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const ts: number[] = []
  for (const block of blocks) {
    for (const ring of [block.outer, ...block.holes]) {
      for (let i = 0; i < ring.length; i += 1) {
        const p = ring[i]!
        const q = ring[(i + 1) % ring.length]!
        const ex = q.x - p.x
        const ey = q.y - p.y
        const denom = dx * ey - dy * ex
        if (denom === 0) continue
        const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / denom
        const s = ((p.x - a.x) * dy - (p.y - a.y) * dx) / denom
        if (s >= 0 && s <= 1 && t >= -1e9 && t <= 1e9) ts.push(t)
      }
    }
  }
  if (ts.length < 2) return []
  ts.sort((x, y) => x - y)
  const segs: Seg[] = []
  for (let i = 0; i + 1 < ts.length; i += 1) {
    const t0 = ts[i]!
    const t1 = ts[i + 1]!
    if (t1 - t0 < 1e-9) continue
    const mid = { x: a.x + (dx * (t0 + t1)) / 2, y: a.y + (dy * (t0 + t1)) / 2 }
    if (blocks.some(block => pointInBlock(mid, block))) {
      segs.push({ a: { x: a.x + dx * t0, y: a.y + dy * t0 }, b: { x: a.x + dx * t1, y: a.y + dy * t1 } })
    }
  }
  return segs
}

/** 一关的静态数据：轮廓、孔洞与对称辅助线（即一组可行解刀线）。 */
export interface LevelData {
  name: string
  cuts: number
  pieces: number
  tolerance: number
  outline: Poly
  holes: Poly[]
  guides: Line[]
  showGuidesByDefault: boolean
  totalArea: number
}

/** 正多边形环（起点角度 theta，逆时针）。 */
function regularPoly(n: number, r: number, theta: number): Poly {
  const pts: Poly = []
  for (let i = 0; i < n; i += 1) {
    const ang = theta + (i / n) * Math.PI * 2
    pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) })
  }
  return pts
}

/** 过原点的直径线（角度 theta，两端延伸到 reach）。 */
function diameter(theta: number, reach = 160): Line {
  const dx = Math.cos(theta) * reach
  const dy = Math.sin(theta) * reach
  return { a: { x: -dx, y: -dy }, b: { x: dx, y: dy } }
}

/** 凹形（L 形）轮廓：120×120 方形切去右上 60×70。 */
const L_SHAPE: Poly = [
  { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 50 }, { x: 60, y: 50 },
  { x: 60, y: 120 }, { x: 0, y: 120 },
]

/** 关卡数量。 */
export const LEVEL_COUNT = 5

/**
 * 构建一关：轮廓/孔洞/辅助线随注入 seed 确定性生成（圆/环/自由形的
 * 方位角由 seed 决定，辅助线与轮廓同步旋转，因此任何 seed 下都构成
 * 可行解）。
 * @param levelIndex - 0 起关卡下标。
 * @param seed - 注入的确定性种子。
 * @returns 关卡静态数据。
 */
export function buildLevel(levelIndex: number, seed: number): LevelData {
  const rng = mulberry32((seed * 0x9e3779b1 + levelIndex * 7919) >>> 0)
  const theta = rng() * Math.PI
  if (levelIndex === 0) {
    const outline = regularPoly(48, 90, theta)
    return {
      name: '圆形 · 2 刀 4 份', cuts: 2, pieces: 4, tolerance: 0.02,
      outline, holes: [],
      guides: [diameter(theta), diameter(theta + Math.PI / 2)],
      showGuidesByDefault: true,
      totalArea: polygonArea(outline),
    }
  }
  if (levelIndex === 1) {
    const outline = [
      { x: -70, y: -70 }, { x: 70, y: -70 }, { x: 70, y: 70 }, { x: -70, y: 70 },
    ]
    return {
      name: '方形 · 2 刀 4 份', cuts: 2, pieces: 4, tolerance: 0.02,
      outline, holes: [],
      guides: [diameter(0), diameter(Math.PI / 2)],
      showGuidesByDefault: false,
      totalArea: polygonArea(outline),
    }
  }
  if (levelIndex === 2) {
    return {
      name: '凹形 · 1 刀 2 份', cuts: 1, pieces: 2, tolerance: 0.015,
      outline: L_SHAPE.map(p => ({ x: p.x - 60, y: p.y - 60 })), holes: [],
      guides: [{ a: { x: -17.5, y: -80 }, b: { x: -17.5, y: 80 } }],
      showGuidesByDefault: false,
      totalArea: polygonArea(L_SHAPE),
    }
  }
  if (levelIndex === 3) {
    const outline = regularPoly(48, 90, theta)
    const hole = regularPoly(24, 45, theta)
    return {
      name: '环形 · 2 刀 4 份', cuts: 2, pieces: 4, tolerance: 0.02,
      outline, holes: [hole],
      guides: [diameter(theta), diameter(theta + Math.PI / 2)],
      showGuidesByDefault: false,
      totalArea: polygonArea(outline) - polygonArea(hole),
    }
  }
  const outline = regularPoly(12, 95, theta)
  return {
    name: '自由形 · 3 刀 6 份', cuts: 3, pieces: 6, tolerance: 0.03,
    outline, holes: [],
    guides: [diameter(theta), diameter(theta + Math.PI / 3), diameter(theta + (2 * Math.PI) / 3)],
    showGuidesByDefault: false,
    totalArea: polygonArea(outline),
  }
}

/** 一局进行态：不可变快照式更新，history 支持撤回。 */
export interface CakeState {
  levelIndex: number
  seed: number
  level: LevelData
  blocks: Block[]
  history: Block[][]
  cutsUsed: number
  nextId: number
  solved: boolean
}

/**
 * 开局：整只蛋糕作为 id 0 的单块。
 * @param levelIndex - 0 起关卡下标。
 * @param seed - 注入种子（默认 1）。
 * @returns 初始状态。
 */
export function createCakeState(levelIndex: number, seed = 1): CakeState {
  const level = buildLevel(levelIndex, seed)
  return {
    levelIndex, seed, level,
    blocks: [{ id: 0, outer: level.outline, holes: level.holes.map(h => h) }],
    history: [], cutsUsed: 0, nextId: 1, solved: false,
  }
}

/**
 * 切一刀：校验刀数未用尽且直线至少贯穿一块；切开记录历史。
 * @param state - 当前状态。
 * @param a - 直线上第一点。
 * @param b - 直线上第二点。
 * @returns 新状态（原状态不变）；无刀可切或刀线无效返回 null。
 */
export function cakeCut(state: CakeState, a: Pt, b: Pt): CakeState | null {
  if (state.solved || state.cutsUsed >= state.level.cuts) return null
  const r = applyCut(state.blocks, a, b, state.nextId)
  if (r === null) return null
  const next: CakeState = {
    ...state,
    blocks: r.blocks,
    history: [...state.history, state.blocks],
    cutsUsed: state.cutsUsed + 1,
    nextId: state.nextId + r.splitCount * 2,
  }
  next.solved = cakeIsSolved(next)
  return next
}

/**
 * 撤回最近一刀。
 * @param state - 当前状态。
 * @returns 回退后的新状态；无历史返回 null。
 */
export function cakeUndo(state: CakeState): CakeState | null {
  if (state.history.length === 0) return null
  const history = state.history.slice()
  const blocks = history.pop()!
  return { ...state, blocks, history, cutsUsed: state.cutsUsed - 1, solved: false }
}

/**
 * 各块相对目标面积的偏差比（area/target − 1）。
 * @param state - 当前状态。
 * @returns 与 blocks 同序的偏差数组。
 */
export function cakeDeviations(state: CakeState): number[] {
  const target = state.level.totalArea / state.level.pieces
  return state.blocks.map(b => blockArea(b) / target - 1)
}

/**
 * 等分判定：块数恰为目标份数且每块偏差在容差内。
 * @param state - 当前状态。
 */
export function cakeIsSolved(state: CakeState): boolean {
  if (state.blocks.length !== state.level.pieces) return false
  const devs = cakeDeviations(state)
  return devs.every(d => Math.abs(d) <= state.level.tolerance)
}

/**
 * 过关得分：关卡基数 + 剩余刀数效率奖励（共点切割可用更少刀达成更多份）。
 * @param levelIndex - 0 起关卡下标。
 * @param cutsLeft - 过关时剩余刀数。
 * @returns 得分。
 */
export function computeScore(levelIndex: number, cutsLeft: number): number {
  return 120 * (levelIndex + 1) + 40 * cutsLeft
}
