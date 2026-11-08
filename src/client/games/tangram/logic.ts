/**
 * 七巧板 Tangram 纯逻辑：标准七件（大三角×2、中三角、正方形、平行四边形、
 * 小三角×2）以「质心原点多边形」定义；剪影库为预定义的 5 组解槽多边形（同一
 * 单位坐标系），按关卡递进选取并以注入 seed 微扰锚点、打乱初始姿态。过关判定
 * 是几何包含：板块的全部顶点与质心都落在目标区域（解槽的并集）容差内。所有
 * 函数为纯函数，随机只走 mulberry32(seed)，确定性可测。
 */

/** mulberry32 伪随机数生成器（与 fifteen/logic.ts 同构）。 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 平面点。 */
export interface Pt {
  x: number
  y: number
}

/** 多边形（顶点按顺序排列；不自交）。 */
export type Poly = Pt[]

/** 一块板块的姿态：平移（质心位置）、旋转步数（每步 45°）、是否镜像翻转。 */
export interface Pose {
  x: number
  y: number
  rot: number
  flip: boolean
}

/** 板块定义：名称、能否翻转（仅平行四边形手性不对称）、质心原点局部顶点。 */
export interface PieceDef {
  name: string
  canFlip: boolean
  base: Poly
}

function poly(pts: readonly (readonly [number, number])[]): Poly {
  return pts.map(([x, y]) => ({ x, y }))
}

/** 多边形质心（顶点算术平均；对均质三角形/四边形即重心）。 */
export function polygonCentroid(p: Poly): Pt {
  let x = 0
  let y = 0
  for (const v of p) {
    x += v.x
    y += v.y
  }
  return { x: x / p.length, y: y / p.length }
}

/** 把多边形平移到质心原点（构造板块局部顶点用）。 */
function toCentroidOrigin(p: Poly): Poly {
  const c = polygonCentroid(p)
  return p.map(v => ({ x: v.x - c.x, y: v.y - c.y }))
}

// 标准七件：先给出正方形排布下的世界坐标，再转为质心原点局部顶点。
/** 七块标准板块（顺序：大三角×2、中三角、正方形、平行四边形、小三角×2）。 */
export const PIECES: readonly PieceDef[] = [
  {
    name: '大三角一',
    canFlip: false,
    base: toCentroidOrigin(poly([[0, 0], [4, 0], [2, 2]])),
  },
  {
    name: '大三角二',
    canFlip: false,
    base: toCentroidOrigin(poly([[0, 0], [2, 2], [0, 4]])),
  },
  {
    name: '中三角',
    canFlip: false,
    base: toCentroidOrigin(poly([[4, 2], [2, 4], [4, 4]])),
  },
  {
    name: '正方形',
    canFlip: false,
    base: toCentroidOrigin(poly([[2, 2], [3, 3], [2, 4], [1, 3]])),
  },
  {
    name: '平行四边形',
    canFlip: true,
    base: toCentroidOrigin(poly([[4, 0], [4, 2], [3, 3], [3, 1]])),
  },
  {
    name: '小三角一',
    canFlip: false,
    base: toCentroidOrigin(poly([[3, 1], [2, 2], [3, 3]])),
  },
  {
    name: '小三角二',
    canFlip: false,
    base: toCentroidOrigin(poly([[0, 4], [2, 4], [1, 3]])),
  },
]

/** 一个剪影：名称 + 七个解槽多边形（单位坐标系，按 PIECES 顺序）。 */
export interface Silhouette {
  name: string
  polys: Poly[]
}

/**
 * 预定义剪影库（复杂度递增）：正方 → 大三角 → 旗帜 → 烛台 → 火箭。
 * 每组都是七件的无缝铺砌（面积合计 16、两两无重叠）。
 */
export const SILHOUETTES: readonly Silhouette[] = [
  {
    name: '正方',
    polys: [
      poly([[0, 0], [4, 0], [2, 2]]),
      poly([[0, 0], [2, 2], [0, 4]]),
      poly([[4, 2], [2, 4], [4, 4]]),
      poly([[2, 2], [3, 3], [2, 4], [1, 3]]),
      poly([[4, 0], [4, 2], [3, 3], [3, 1]]),
      poly([[3, 1], [2, 2], [3, 3]]),
      poly([[0, 4], [2, 4], [1, 3]]),
    ],
  },
  {
    name: '大三角',
    polys: [
      poly([[0, 0], [4, 0], [2, 2]]),
      poly([[4, 0], [8, 0], [6, 2]]),
      poly([[4, 2], [4, 4], [6, 2]]),
      poly([[4, 0], [5, 1], [4, 2], [3, 1]]),
      poly([[3, 1], [4, 2], [4, 4], [3, 3]]),
      poly([[5, 1], [6, 2], [4, 2]]),
      poly([[2, 2], [3, 3], [3, 1]]),
    ],
  },
  {
    name: '旗帜',
    polys: [
      poly([[0, 0], [4, 0], [2, 2]]),
      poly([[4, 0], [8, 0], [6, 2]]),
      poly([[4, 4], [6, 2], [6, 4]]),
      poly([[4, 0], [5, 1], [4, 2], [3, 1]]),
      poly([[3, 1], [4, 2], [4, 4], [3, 3]]),
      poly([[5, 1], [6, 2], [4, 2]]),
      poly([[2, 2], [3, 3], [3, 1]]),
    ],
  },
  {
    name: '烛台',
    polys: [
      poly([[0, 0], [4, 0], [2, 2]]),
      poly([[0, 0], [2, 2], [0, 4]]),
      poly([[4, 2], [2, 4], [4, 4]]),
      poly([[2, 2], [3, 3], [2, 4], [1, 3]]),
      poly([[4, 0], [4, 2], [3, 3], [3, 1]]),
      poly([[3, 1], [2, 2], [3, 3]]),
      poly([[4, 0], [4, 2], [5, 1]]),
    ],
  },
  {
    name: '火箭',
    polys: [
      poly([[0, 0], [4, 0], [2, 2]]),
      poly([[4, 0], [8, 0], [6, 2]]),
      poly([[4, 4], [6, 2], [6, 4]]),
      poly([[4, 0], [5, 1], [4, 2], [3, 1]]),
      poly([[3, 1], [4, 2], [4, 4], [3, 3]]),
      poly([[5, 1], [6, 2], [4, 2]]),
      poly([[1, 0], [3, 0], [2, -1]]),
    ],
  },
]

/** 单位坐标 → 画布逻辑坐标的缩放。 */
export const SCALE = 26
/** 就位容差：顶点/质心距目标区域的允许偏差（逻辑像素）。 */
export const TOL = 10
/** 剪影锚点微扰幅度（±像素，seed 驱动）。 */
const JITTER = 3

// 画布布局常量（渲染与关卡构造共用）。
/** 逻辑画布宽。 */
export const LOGICAL_W = 700
/** 逻辑画布高。 */
export const LOGICAL_H = 520
/** 顶部 HUD 高。 */
export const HUD_H = 30
/** 左侧托盘区。 */
export const TRAY_X = 10
/** 托盘区宽。 */
export const TRAY_W = 246
/** 右侧目标区。 */
export const BOARD_X = 266
/** 目标区宽。 */
export const BOARD_W = 424
/** 托盘槽尺寸。 */
export const SLOT = 114

/**
 * 托盘槽中心（2 列 × 4 行）。
 * @param i - 板块下标 0..6。
 * @returns 槽中心的逻辑坐标。
 */
export function traySlot(i: number): Pt {
  const col = i % 2
  const row = Math.floor(i / 2)
  return {
    x: TRAY_X + 8 + SLOT / 2 + col * (SLOT + 6),
    y: HUD_H + 8 + SLOT / 2 + row * (SLOT + 6),
  }
}

/**
 * 把单位坐标剪影缩放并居中到目标面板，再加锚点偏移。
 * @param polys - 单位坐标解槽。
 * @param jx - 横向微扰像素。
 * @param jy - 纵向微扰像素。
 * @returns 画布逻辑坐标的解槽多边形。
 */
function fitTarget(polys: Poly[], jx: number, jy: number): Poly[] {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of polys) {
    for (const v of p) {
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y)
      maxY = Math.max(maxY, v.y)
    }
  }
  const ox = BOARD_X + (BOARD_W - (maxX - minX) * SCALE) / 2 - minX * SCALE + jx
  const oy = HUD_H + 8 + (LOGICAL_H - HUD_H - 16 - (maxY - minY) * SCALE) / 2 - minY * SCALE + jy
  return polys.map(p => p.map(v => ({ x: v.x * SCALE + ox, y: v.y * SCALE + oy })))
}

/** 旋转步数归一到 0..7。 */
export function normalizeRot(rot: number): number {
  return ((Math.round(rot) % 8) + 8) % 8
}

/**
 * 绕原点旋转多边形（用于质心原点局部顶点）。
 * @param p - 输入多边形。
 * @param quarter - 45° 步数（可为负，内部归一）。
 * @returns 新多边形；输入不变。
 */
export function rotatePoly(p: Poly, quarter: number): Poly {
  const a = (normalizeRot(quarter) * Math.PI) / 4
  const c = Math.cos(a)
  const s = Math.sin(a)
  return p.map(v => ({ x: v.x * c - v.y * s, y: v.x * s + v.y * c }))
}

/**
 * 沿纵轴镜像多边形（x → −x；对可翻板块即手性翻转）。
 * @param p - 输入多边形。
 * @returns 新多边形；输入不变。
 */
export function flipPoly(p: Poly): Poly {
  return p.map(v => ({ x: -v.x, y: v.y }))
}

/**
 * 板块在给定姿态下的世界多边形：局部单位顶点旋转（可翻板块先镜像）后按
 * SCALE 缩放到画布逻辑坐标，再平移到 pose 位置。不可翻板块即使 pose.flip
 * 为 true 也按未翻转处理。
 * @param index - 板块下标 0..6。
 * @param pose - 目标姿态（平移为画布逻辑坐标）。
 * @returns 画布逻辑坐标顶点。
 */
export function piecePoly(index: number, pose: Pose): Poly {
  const def = PIECES[index]!
  let local = rotatePoly(def.base, pose.rot)
  if (pose.flip && def.canFlip) local = flipPoly(local)
  return local.map(v => ({ x: v.x * SCALE + pose.x, y: v.y * SCALE + pose.y }))
}

/**
 * 点到线段的最短距离。
 * @param p - 查询点。
 * @param a - 线段端点。
 * @param b - 线段端点。
 */
export function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const cx = a.x + t * dx - p.x
  const cy = a.y + t * dy - p.y
  return Math.sqrt(cx * cx + cy * cy)
}

/**
 * 容差包含判定：点在多边形内部，或距任一边不超过 tol。
 * @param poly - 目标多边形。
 * @param p - 查询点。
 * @param tol - 边界容差，默认 0（严格内部）。
 */
export function containsPoint(poly: Poly, p: Pt, tol = 0): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[j]!
    const b = poly[i]!
    if ((b.y > p.y) !== (a.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) {
      inside = !inside
    }
  }
  if (inside) return true
  if (tol <= 0) return false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    if (segmentDistance(p, poly[j]!, poly[i]!) <= tol) return true
  }
  return false
}

/**
 * 板块覆盖判定：poly 的全部顶点与质心都落在覆盖区域（解槽并集）容差内。
 * @param poly - 板块世界多边形。
 * @param covers - 覆盖多边形集合。
 * @param tol - 容差。
 */
export function polygonCovered(poly: Poly, covers: Poly[], tol: number): boolean {
  const pts = [...poly, polygonCentroid(poly)]
  return pts.every(pt => covers.some(c => containsPoint(c, pt, tol)))
}

/** 板块与单个解槽的顶点级对齐：质心重合 + 顶点集合一一对应（容差内）。
 * 质心对齐保证平移正确；顶点对应保证旋转正确——只摆对位置没转正的
 * 板块角点与解槽角点不重合，不判就位。 */
export function pieceMatchesSlot(poly: Poly, slot: Poly, tol: number): boolean {
  if (poly.length !== slot.length) return false
  const cp = polygonCentroid(poly)
  const cs = polygonCentroid(slot)
  if (Math.hypot(cp.x - cs.x, cp.y - cs.y) > tol) return false
  return poly.every(p => slot.some(s => Math.hypot(p.x - s.x, p.y - s.y) <= tol))
    && slot.every(s => poly.some(p => Math.hypot(p.x - s.x, p.y - s.y) <= tol))
}

/** 全部板块与解槽的完美匹配（每块占一个不同槽；同形件可互换）。
 * 防两块同形板叠在同一槽上而另一槽空置的假过关。 */
function allMatchSlots(poses: readonly Pose[], target: readonly Poly[]): boolean {
  const used = new Array<boolean>(target.length).fill(false)
  const go = (i: number): boolean => {
    if (i >= poses.length) return true
    for (let j = 0; j < target.length; j += 1) {
      if (used[j]) continue
      if (pieceMatchesSlot(piecePoly(i, poses[i]!), target[j]!, TOL)) {
        used[j] = true
        if (go(i + 1)) return true
        used[j] = false
      }
    }
    return false
  }
  return go(0)
}

/** 一局七巧板的完整状态（纯数据，可整体快照比较）。 */
export interface TangramState {
  level: number
  seed: number
  /** 剪影名称（HUD 展示）。 */
  name: string
  /** 目标解槽（画布逻辑坐标，含 seed 微扰）。 */
  target: Poly[]
  /** 七块板各自姿态。 */
  poses: Pose[]
  /** 每块是否已就位。 */
  placed: boolean[]
  /** 有效操作计数。 */
  moves: number
  /** 是否已过关。 */
  won: boolean
}

function recompute(state: TangramState): TangramState {
  // 单块就位（高亮用）：与任一解槽顶点级对齐；过关另需完美匹配（每槽
  // 恰被一块占住），杜绝"位置对但没转正"与"两块叠一槽"的假过关。
  const placed = state.poses.map((pose, i) => state.target.some(slot => pieceMatchesSlot(piecePoly(i, pose), slot, TOL)))
  return { ...state, placed, won: placed.every(v => v) && allMatchSlots(state.poses, state.target) }
}

/**
 * 生成一关：按关卡号从剪影库顺序取轮廓（1..5 → 正方..火箭，循环），
 * seed 决定剪影锚点微扰与各板初始旋转/翻转；初始位置为托盘槽。
 * 同一 (level, seed) 结果完全一致。
 * @param level - 关卡号（≥1）。
 * @param seed - 随机种子。
 */
export function createLevel(level: number, seed: number): TangramState {
  const rng = mulberry32((seed ^ Math.imul(level, 0x9e3779b9)) >>> 0)
  const sil = SILHOUETTES[(level - 1) % SILHOUETTES.length]!
  const jx = Math.round((rng() - 0.5) * 2 * JITTER)
  const jy = Math.round((rng() - 0.5) * 2 * JITTER)
  const target = fitTarget(sil.polys, jx, jy)
  const poses = PIECES.map((def, i) => {
    const slot = traySlot(i)
    return {
      x: slot.x,
      y: slot.y,
      rot: Math.floor(rng() * 8),
      flip: def.canFlip ? rng() < 0.5 : false,
    }
  })
  return recompute({
    level,
    seed,
    name: sil.name,
    target,
    poses,
    placed: poses.map(() => false),
    moves: 0,
    won: false,
  })
}

/**
 * 更新一块板的姿态并重算就位/过关；不可翻板块的 flip 被忽略。
 * 输入状态不变（纯函数）。
 * @param state - 当前状态。
 * @param index - 板块下标 0..6。
 * @param pose - 新姿态。
 * @param countMove - true 时操作数 +1（拖放落子/旋转/翻转等离散操作）。
 */
export function setPose(state: TangramState, index: number, pose: Pose, countMove = false): TangramState {
  const def = PIECES[index]!
  const poses = state.poses.map((old, i) =>
    i === index ? { x: pose.x, y: pose.y, rot: normalizeRot(pose.rot), flip: pose.flip && def.canFlip } : old,
  )
  return recompute({ ...state, poses, moves: state.moves + (countMove ? 1 : 0) })
}

/** 多边形面积（鞋带公式）。 */
export function polygonArea(p: Poly): number {
  let s = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) {
    s += (p[j]!.x + p[i]!.x) * (p[j]!.y - p[i]!.y)
  }
  return Math.abs(s / 2)
}
