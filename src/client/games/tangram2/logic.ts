/**
 * 七巧拼图 Tangram2 纯逻辑：标准七巧板七块（2 大三角 / 1 中三角 / 2 小三角
 * / 1 正方 / 1 平行四边形）的形状、旋转变换、翻转变换、放置判定与关卡数据。
 *
 * 关卡 = 一个目标剪影：内置 12 个图形（方块 / 房子 / 钻石 / 城墙 / 帆船 /
 * 高山 / 猫 / 兔子 / 人物 / 鱼 / 鸟 / 火箭），每个图形预存 7 块板的标准解
 * （逐块多边形，已通过「面积和 = 64 格 + 互不重叠 + 与基准块全等」校验）。
 * 玩家拖动板块、R 旋转 45°、F 翻转；tryPlace 用「顶点集合在容差内一致」
 * 判定与某个同形状标准解吻合，吸附后计入覆盖面积；7 块全放且覆盖 ≥98%
 * 过关。所有随机（散布 / 初始旋转）走注入 seed 的 mulberry32，确定可测。
 */

/** 板块形状类别（两种 large / 两种 small 互为同形，可互换匹配）。 */
export type PieceKind = 'large' | 'medium' | 'small' | 'square' | 'para'

/** 平面点（网格坐标或像素坐标，由调用方约定单位）。 */
export type Pt = [number, number]

/**
 * mulberry32 种子随机数生成器。
 * @param seed - 32 位无符号整数种子。
 * @returns 返回 () => [0,1) 的确定性随机函数。
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
 * 基准板块多边形（8x8 原始网格坐标，质心不必在原点；polygonOf 负责归一）。
 * 面积：大三角 16 x2、中三角 8、小三角 4 x2、正方 8、平行四边形 8，合计 64。
 */
const BASE: Record<PieceKind, readonly Pt[]> = {
  large: [[0, 0], [0, 8], [4, 4]],
  medium: [[8, 4], [8, 8], [4, 8]],
  small: [[8, 0], [6, 2], [8, 4]],
  square: [[6, 2], [4, 4], [6, 6], [8, 4]],
  para: [[0, 8], [4, 8], [6, 6], [2, 6]],
}

/** 板块在逻辑画布上的像素坐标（渲染与命中测试共用）。 */
export const LOGICAL_W = 960
export const LOGICAL_H = 640

/** 剪影在盘面的中心与托盘基线（像素）。 */
const BOARD_CX = 420
const BOARD_CY = 290
const TRAY_Y = 585

/** 吸附容差（像素）：板块顶点集合与标准解顶点集合的最大允许偏差。 */
export const SNAP_TOL = 15

/** 多边形顶点绕 (0,0) 旋转 k*45°（屏幕坐标系，y 向下）。 */
function rotatePt(p: Pt, k: number): Pt {
  const a = (k * Math.PI) / 4
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c * p[0] - s * p[1], s * p[0] + c * p[1]]
}

/**
 * 计算多边形质心（顶点均值；本游戏所有板块旋转都是绕质心的刚体变换）。
 * @param poly - 多边形顶点。
 * @returns 质心坐标。
 */
export function polygonCenter(poly: readonly Pt[]): Pt {
  let x = 0
  let y = 0
  for (const p of poly) { x += p[0]; y += p[1] }
  return [x / poly.length, y / poly.length]
}

/**
 * 鞋带公式多边形面积。
 * @param poly - 多边形顶点。
 * @returns 面积（始终为正）。
 */
export function polygonArea(poly: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

/**
 * 生成板块当前姿态的像素多边形：基准形状质心平移到原点 -> 可选镜像 ->
 * 旋转 rot*45° -> 缩放 unit -> 平移到 (x, y)。
 * @param kind - 板块形状类别。
 * @param rot - 旋转步数（0-7，每步 45°）。
 * @param flipped - 是否左右镜像（仅平行四边形真正改变形状朝向）。
 * @param x - 板块质心的像素 x。
 * @param y - 板块质心的像素 y。
 * @param unit - 一格的像素边长。
 * @returns 像素坐标顶点数组（与基准顶点同序）。
 */
export function polygonOf(kind: PieceKind, rot: number, flipped: boolean, x: number, y: number, unit: number): Pt[] {
  const base = BASE[kind]
  const [cx, cy] = polygonCenter(base)
  const out: Pt[] = []
  for (const p of base) {
    let vx = p[0] - cx
    let vy = p[1] - cy
    if (flipped) vx = -vx
    const r = rotatePt([vx, vy], rot)
    out.push([x + r[0] * unit, y + r[1] * unit])
  }
  return out
}

/**
 * 判定两个同顶点数多边形是否为「同一位置同一姿态」：把 a 的每个顶点唯一
 * 配对到 b 中容差内的顶点。用于放置吸附（板块姿态 = 标准解姿态）。
 * @param a - 玩家板块多边形。
 * @param b - 标准解槽位多边形。
 * @param tol - 允许的最大顶点偏差（像素）。
 * @returns 全部顶点可配对时返回 true。
 */
export function polysCongruentPos(a: readonly Pt[], b: readonly Pt[], tol: number): boolean {
  if (a.length !== b.length) return false
  const used = new Array<boolean>(b.length).fill(false)
  for (const p of a) {
    let hit = -1
    for (let i = 0; i < b.length; i += 1) {
      if (used[i]) continue
      const q = b[i]!
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) { hit = i; break }
    }
    if (hit < 0) return false
    used[hit] = true
  }
  return true
}

/**
 * 射线法点在多边形内判定（边界按内处理，命中测试足够）。
 * @param x - 点 x。
 * @param y - 点 y。
 * @param poly - 多边形顶点。
 * @returns 点在多边形内（含边界）返回 true。
 */
export function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i]!
    const pj = poly[j]!
    if (pi[1] === y && pj[1] === y) continue
    if ((pi[1] > y) !== (pj[1] > y)) {
      const t = (y - pi[1]) / (pj[1] - pi[1])
      if (x <= pi[0] + t * (pj[0] - pi[0])) inside = !inside
    }
  }
  return inside
}

/** 一个标准解槽位：形状类别 + 网格坐标多边形（createLevel 再缩放平移）。 */
export interface FigureSlotDef { kind: PieceKind; poly: Pt[] }

/** 一个图形：名称 + 7 个槽位的标准解（网格坐标）。 */
export interface FigureDef { name: string; pieces: FigureSlotDef[] }

/** 内置 12 个图形（均已通过面积 / 全等 / 不重叠校验）。 */
export const FIGURES: FigureDef[] = [
  { name: '方块', pieces: [
    { kind: 'large', poly: [[0, 0], [0, 8], [4, 4]] }, { kind: 'large', poly: [[0, 0], [8, 0], [4, 4]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[8, 0], [6, 2], [8, 4]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[4, 4], [2, 6], [6, 6]] },
  ] },
  { name: '房子', pieces: [
    { kind: 'large', poly: [[0, 0], [0, 8], [4, 4]] }, { kind: 'large', poly: [[0, 0], [8, 0], [4, 4]] },
    { kind: 'medium', poly: [[2, 0], [7.6569, 0], [4.8284, -2.8284]] },
    { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[8, 0], [6, 2], [8, 4]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[4, 4], [2, 6], [6, 6]] },
  ] },
  { name: '钻石', pieces: [
    { kind: 'large', poly: [[8, 8], [8, 16], [12, 12]] }, { kind: 'large', poly: [[8, 8], [16, 8], [12, 12]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[8, 0], [6, 2], [8, 4]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[4, 4], [2, 6], [6, 6]] },
  ] },
  { name: '城墙', pieces: [
    { kind: 'large', poly: [[8, 0], [8, 8], [12, 4]] }, { kind: 'large', poly: [[8, 0], [12, 4], [16, 0]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[8, 0], [6, 2], [8, 4]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[4, 4], [2, 6], [6, 6]] },
  ] },
  { name: '帆船', pieces: [
    { kind: 'large', poly: [[-3.31, 0], [4.69, 0], [0.69, -4]] },
    { kind: 'large', poly: [[4.69, 0], [12.69, 0], [8.69, -4]] },
    { kind: 'medium', poly: [[5.1716, 2.8284], [2.3431, 5.6569], [-0.4853, 2.8284]] },
    { kind: 'square', poly: [[5.1716, 0], [2.3431, 0], [2.3431, 2.8284], [5.1716, 2.8284]] },
    { kind: 'small', poly: [[8, 0], [5.1716, 0], [5.1716, 2.8284]] },
    { kind: 'para', poly: [[-3.3137, 0], [-0.4853, 2.8284], [2.3431, 2.8284], [-0.4853, 0]] },
    { kind: 'small', poly: [[2.3431, 0], [-0.4853, 0], [2.3431, 2.8284]] },
  ] },
  { name: '高山', pieces: [
    { kind: 'large', poly: [[8, 0], [8, 8], [12, 4]] }, { kind: 'large', poly: [[8, 8], [12, 4], [16, 8]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[8, 0], [6, 2], [8, 4]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[4, 4], [2, 6], [6, 6]] },
  ] },
  { name: '猫', pieces: [
    { kind: 'large', poly: [[0, 0], [0, 8], [4, 4]] }, { kind: 'large', poly: [[0, 0], [8, 0], [4, 4]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[0, 0], [4, 0], [2, -2]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[4, 0], [8, 0], [6, -2]] },
  ] },
  { name: '兔子', pieces: [
    { kind: 'large', poly: [[8, 8], [8, 16], [12, 12]] }, { kind: 'large', poly: [[8, 8], [16, 8], [12, 12]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[4, 0], [8, 0], [6, -2]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[8, 0], [12, 0], [10, -2]] },
  ] },
  { name: '人物', pieces: [
    { kind: 'large', poly: [[0, 0], [0, 8], [4, 4]] }, { kind: 'large', poly: [[0, 0], [8, 0], [4, 4]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] },
    { kind: 'square', poly: [[4, -4], [2, -2], [4, 0], [6, -2]] },
    { kind: 'small', poly: [[4, 8], [2, 10], [4, 12]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[6, 10], [8, 8], [4, 8]] },
  ] },
  { name: '鱼', pieces: [
    { kind: 'large', poly: [[8, 8], [8, 16], [12, 12]] }, { kind: 'large', poly: [[8, 8], [16, 8], [12, 12]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[16, 8], [18, 6], [20, 8]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[16, 8], [18, 10], [20, 8]] },
  ] },
  { name: '鸟', pieces: [
    { kind: 'large', poly: [[0, 0], [0, 8], [4, 4]] }, { kind: 'large', poly: [[0, 0], [8, 0], [4, 4]] },
    { kind: 'medium', poly: [[0, 0], [0, 4], [-4, 4]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[8, 0], [6, 2], [8, 4]] }, { kind: 'para', poly: [[8, 6], [12, 6], [14, 4], [10, 4]] },
    { kind: 'small', poly: [[4, 4], [2, 6], [6, 6]] },
  ] },
  { name: '火箭', pieces: [
    { kind: 'large', poly: [[8, 8], [8, 16], [12, 12]] }, { kind: 'large', poly: [[8, 8], [16, 8], [12, 12]] },
    { kind: 'medium', poly: [[8, 4], [8, 8], [4, 8]] }, { kind: 'square', poly: [[6, 2], [4, 4], [6, 6], [8, 4]] },
    { kind: 'small', poly: [[0, 8], [-2, 10], [0, 12]] }, { kind: 'para', poly: [[0, 8], [4, 8], [6, 6], [2, 6]] },
    { kind: 'small', poly: [[16, 8], [18, 10], [16, 12]] },
  ] },
]

/** 5 个关卡依次使用的图形下标（从规整到发散，由易到难）。 */
export const LEVEL_FIGURES: readonly number[] = [0, 1, 3, 4, 7]

/** 玩家手中一块板的状态。 */
export interface TangramPiece {
  id: number
  kind: PieceKind
  /** 质心像素位置。 */
  x: number
  y: number
  /** 旋转步数（0-7，每步 45°）。 */
  rot: number
  flipped: boolean
  placed: boolean
}

/** 已缩放到像素的标准解槽位。 */
export interface SlotState { kind: PieceKind; poly: Pt[]; center: Pt; taken: boolean }

/** 一关的完整可玩状态（纯数据，渲染与测试共享）。 */
export interface TangramState {
  /** 关卡号（1-5）。 */
  level: number
  figureIndex: number
  name: string
  unit: number
  slots: SlotState[]
  pieces: TangramPiece[]
  moves: number
  elapsedMs: number
  seed: number
}

/** 生成第 level 关（1-5）：缩放剪影居中、按 seed 散布七块板并随机初始姿态。 */
export function createLevel(level: number, seed: number): TangramState {
  const figureIndex = LEVEL_FIGURES[Math.min(LEVEL_FIGURES.length - 1, Math.max(0, level - 1))]!
  const figure = FIGURES[figureIndex]!
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
  for (const slot of figure.pieces) {
    for (const p of slot.poly) {
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0])
      miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1])
    }
  }
  const unit = Math.min(36, 520 / (maxx - minx), 430 / (maxy - miny))
  const [bcx, bcy] = polygonCenter([[minx, miny], [maxx, maxy]])
  const slots: SlotState[] = figure.pieces.map((slot) => {
    const poly = slot.poly.map((p) => [BOARD_CX + (p[0] - bcx) * unit, BOARD_CY + (p[1] - bcy) * unit] as Pt)
    return { kind: slot.kind, poly, center: polygonCenter(poly), taken: false }
  })
  const rng = mulberry32((seed ^ Math.imul(level, 0x85ebca6b)) >>> 0)
  const order = [0, 1, 2, 3, 4, 5, 6]
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = order[i]!
    order[i] = order[j]!
    order[j] = tmp
  }
  const kinds: PieceKind[] = ['large', 'large', 'medium', 'square', 'small', 'para', 'small']
  const pieces: TangramPiece[] = order.map((kindIndex, i) => ({
    id: i,
    kind: kinds[kindIndex]!,
    x: 90 + i * 130 + Math.floor(rng() * 30) - 15,
    y: TRAY_Y + Math.floor(rng() * 44) - 22,
    rot: Math.floor(rng() * 8),
    flipped: rng() < 0.5,
    placed: false,
  }))
  return { level, figureIndex, name: figure.name, unit, slots, pieces, moves: 0, elapsedMs: 0, seed }
}

/**
 * 尝试放置一块板：在同类且未占用的槽位中寻找姿态吻合（顶点集合容差内
 * 一致）的目标，成功则精确吸附到槽位质心并占用槽位。
 * @param state - 关卡状态。
 * @param pieceId - 板块编号。
 * @param tol - 吸附容差（像素，默认 SNAP_TOL）。
 * @returns 吸附成功返回 true。
 */
export function tryPlace(state: TangramState, pieceId: number, tol: number = SNAP_TOL): boolean {
  const piece = state.pieces.find((p) => p.id === pieceId)
  if (piece === undefined || piece.placed) return false
  const poly = polygonOf(piece.kind, piece.rot, piece.flipped, piece.x, piece.y, state.unit)
  for (const slot of state.slots) {
    if (slot.taken || slot.kind !== piece.kind) continue
    if (!polysCongruentPos(poly, slot.poly, tol)) continue
    const [cx, cy] = slot.center
    piece.x = cx
    piece.y = cy
    piece.placed = true
    slot.taken = true
    return true
  }
  return false
}

/** 已放置面积占剪影总面积的百分比（0-100）。 */
export function coveragePercent(state: TangramState): number {
  let total = 0
  let placed = 0
  for (const slot of state.slots) {
    total += polygonArea(slot.poly)
    if (slot.taken) placed += polygonArea(slot.poly)
  }
  if (total === 0) return 0
  return (placed / total) * 100
}

/** 过关判定：7 块全放且覆盖 ≥98%。 */
export function isLevelClear(state: TangramState): boolean {
  const allPlaced = state.pieces.every((p) => p.placed)
  return allPlaced && coveragePercent(state) >= 98
}

/** 已放置块数。 */
export function placedCount(state: TangramState): number {
  return state.pieces.filter((p) => p.placed).length
}

/**
 * G 提示：把编号最小的未放置板摆到同形状的空闲槽位（搜索其 16 种姿态）。
 * @param state - 关卡状态。
 * @returns 被放置的板块编号，无可放返回 null。
 */
export function hintPlace(state: TangramState): number | null {
  for (const piece of state.pieces) {
    if (piece.placed) continue
    for (const slot of state.slots) {
      if (slot.taken || slot.kind !== piece.kind) continue
      const [cx, cy] = slot.center
      for (let flip = 0; flip < 2; flip += 1) {
        for (let rot = 0; rot < 8; rot += 1) {
          const cand = polygonOf(piece.kind, rot, flip === 1, cx, cy, state.unit)
          if (polysCongruentPos(cand, slot.poly, 1e-6)) {
            piece.rot = rot
            piece.flipped = flip === 1
            piece.x = cx
            piece.y = cy
            piece.placed = true
            slot.taken = true
            return piece.id
          }
        }
      }
    }
  }
  return null
}

/**
 * 旋转一块板 45°（姿态变换；计步由调用方负责）。
 * @param state - 关卡状态。
 * @param pieceId - 板块编号。
 */
export function cycleRotation(state: TangramState, pieceId: number): void {
  const piece = state.pieces.find((p) => p.id === pieceId)
  if (piece === undefined || piece.placed) return
  piece.rot = (piece.rot + 1) % 8
}

/**
 * 翻转一块板（左右镜像；仅平行四边形改变实际形状朝向）。
 * @param state - 关卡状态。
 * @param pieceId - 板块编号。
 */
export function toggleFlip(state: TangramState, pieceId: number): void {
  const piece = state.pieces.find((p) => p.id === pieceId)
  if (piece === undefined || piece.placed) return
  piece.flipped = !piece.flipped
}

/**
 * 过关计分：基础分随关卡递增，用时（秒）与多余操作次数扣分，下限 120。
 * @param level - 关卡号（1-5）。
 * @param elapsedMs - 本关用时（毫秒）。
 * @param moves - 本关操作次数。
 * @returns 本关得分。
 */
export function computeScore(level: number, elapsedMs: number, moves: number): number {
  const seconds = Math.floor(elapsedMs / 1000)
  return Math.max(120, 1000 + level * 200 - seconds * 3 - moves * 4)
}
