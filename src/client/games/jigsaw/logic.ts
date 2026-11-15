/**
 * 百变拼图 Jigsaw 纯逻辑：程序化图案场景（同一 seed 完全一致）、按 seed
 * 把碎片散布到托盘、0/±90°/180° 旋转档位、距离+角度双条件吸附判定、
 * 完成判定与计分。所有随机都来自注入 seed 的 mulberry32，无 Math.random，
 * 因此局面确定可测、重开同一关卡完全复现。
 */
import { accent } from '../theme.ts'

/** mulberry32 伪随机数生成器（同 fifteen/logic.ts 构造）。 */
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

/**
 * 二维确定性哈希：把整数坐标与 seed 混合成 [0,1) 的稳定值。
 * @param x - 横向整数坐标（如碎片列号）。
 * @param y - 纵向整数坐标（如碎片行号）。
 * @param seed - 种子。
 * @returns [0,1) 的确定性伪随机值。
 */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---- 布局常量（render 与 index 共用；全部在此定义保证吸附坐标可测） ----

/** 单块碎片边长（逻辑像素）。 */
export const CELL = 64
/** HUD 高度。 */
export const HUD_H = 34
/** 最大列数（第 5 关 6×6）。 */
export const BOARD_COLS_MAX = 6
/** 盘面最大边长（6×CELL）。 */
export const BOARD_MAX = BOARD_COLS_MAX * CELL
/** 逻辑画布宽。 */
export const LOGICAL_W = BOARD_MAX + 56
/** 盘面顶部 y。 */
export const BOARD_Y = HUD_H + 10
/** 托盘顶部 y（盘面区按最大边长预留）。 */
export const TRAY_Y = BOARD_Y + BOARD_MAX + 16
/** 托盘高度。 */
export const TRAY_H = 260
/** 逻辑画布高。 */
export const LOGICAL_H = TRAY_Y + TRAY_H + 14
/** 托盘矩形（碎片散布区）。 */
export const TRAY = { x: 14, y: TRAY_Y, w: LOGICAL_W - 28, h: TRAY_H }

/**
 * 某尺寸盘面的左上角坐标（水平居中）。
 * @param size - 盘面每边块数。
 */
export function boardOrigin(size: number): { x: number; y: number } {
  return { x: (LOGICAL_W - size * CELL) / 2, y: BOARD_Y }
}

/**
 * 碎片 (row,col) 正确格的中心坐标。
 * @param size - 盘面每边块数。
 * @param row - 目标行。
 * @param col - 目标列。
 */
export function targetCenter(size: number, row: number, col: number): { x: number; y: number } {
  const o = boardOrigin(size)
  return { x: o.x + col * CELL + CELL / 2, y: o.y + row * CELL + CELL / 2 }
}

/** 吸附距离容差（像素）。 */
export const SNAP_TOL = 24

/** 单关配置：块数、是否需要旋转、散布抖动幅度。 */
export interface JigsawLevelConfig {
  /** 每边块数（4→6）。 */
  size: number
  /** true 时碎片初始带随机旋转档且吸附要求角度归零。 */
  rotate: boolean
  /** 托盘散布抖动幅度（像素，越大越散乱）。 */
  jitter: number
}

/** 5 关递进配置：块数 16→36、散乱度上升、第 3 关起需要旋转。 */
export const LEVELS: readonly JigsawLevelConfig[] = [
  { size: 4, rotate: false, jitter: 6 },
  { size: 4, rotate: false, jitter: 14 },
  { size: 5, rotate: true, jitter: 8 },
  { size: 5, rotate: true, jitter: 16 },
  { size: 6, rotate: true, jitter: 12 },
]

// ---- 程序化图案 ----

/** 图案中的几何形状（坐标为整图归一化 [0,1)）。 */
export interface SceneShape {
  /** 形状类别。 */
  kind: 'circle' | 'square' | 'triangle'
  /** 中心横坐标（归一化）。 */
  fx: number
  /** 中心纵坐标（归一化）。 */
  fy: number
  /** 特征半径（归一化）。 */
  r: number
  /** 填充色。 */
  color: string
  /** 不透明度 [0,1]。 */
  alpha: number
}

/** 噪点斑纹（归一化坐标的小圆点）。 */
export interface SceneSpeckle {
  /** 横坐标（归一化）。 */
  fx: number
  /** 纵坐标（归一化）。 */
  fy: number
  /** 半径（归一化）。 */
  r: number
  /** 颜色。 */
  color: string
}

/** 一幅完整拼图图案：渐变底 + 几何形状 + 噪声斑纹。 */
export interface PatternScene {
  /** 渐变顶色。 */
  baseTop: string
  /** 渐变底色。 */
  baseBottom: string
  /** 几何形状（先画在下层）。 */
  shapes: SceneShape[]
  /** 噪声斑纹。 */
  speckles: SceneSpeckle[]
}

/** 渐变底色候选对（上色/下色）。 */
const BASE_PAIRS: readonly (readonly [string, string])[] = [
  ['#2a3f6f', '#101a33'],
  ['#3d2a5f', '#171028'],
  ['#1f4d43', '#0d211d'],
  ['#5c3a2e', '#241410'],
  ['#42283f', '#160d18'],
  ['#233d52', '#0d1a24'],
]

/**
 * 按 seed 构建整幅图案场景：同一 seed 输出完全一致（碎片图案确定的来源）。
 * @param seed - 图案种子。
 * @returns 可直接绘制的场景描述。
 */
export function buildPatternScene(seed: number): PatternScene {
  const rng = mulberry32((seed ^ 0x51ab1e) >>> 0)
  const pair = BASE_PAIRS[Math.floor(rng() * BASE_PAIRS.length)]!
  const shapes: SceneShape[] = []
  for (let i = 0; i < 9; i += 1) {
    const kind = (Math.floor(rng() * 3) as 0 | 1 | 2) === 0 ? 'circle' : Math.floor(rng() * 3) % 3 === 1 ? 'square' : 'triangle'
    shapes.push({
      kind,
      fx: rng(),
      fy: rng(),
      r: 0.06 + rng() * 0.16,
      color: accent(Math.floor(rng() * 8)),
      alpha: 0.5 + rng() * 0.4,
    })
  }
  const speckles: SceneSpeckle[] = []
  for (let i = 0; i < 46; i += 1) {
    speckles.push({
      fx: rng(),
      fy: rng(),
      r: 0.006 + rng() * 0.012,
      color: rng() < 0.5 ? '#ffffff' : '#0b0b12',
    })
  }
  return { baseTop: pair[0], baseBottom: pair[1], shapes, speckles }
}

/** 解析 6 位十六进制颜色为 RGB。 */
function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** 两色线性插值。 */
function mixHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a)
  const cb = hexRgb(b)
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t)
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t)
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t)
  let s = '#'
  for (const c of [r, g, bl]) s += (c < 16 ? '0' : '') + c.toString(16)
  return s
}

/** 点是否落在形状内（按类别做包含测试）。 */
function insideShape(s: SceneShape, fx: number, fy: number): boolean {
  if (s.kind === 'circle') {
    const dx = fx - s.fx
    const dy = fy - s.fy
    return dx * dx + dy * dy <= s.r * s.r
  }
  if (s.kind === 'square') {
    return Math.abs(fx - s.fx) <= s.r && Math.abs(fy - s.fy) <= s.r
  }
  // 顶点朝上的等腰三角形：v=-r 处宽 0，v=+r 处宽 2r。
  const u = fx - s.fx
  const v = fy - s.fy
  return v >= -s.r && v <= s.r && Math.abs(u) <= (v + s.r) / 2
}

/**
 * 纯函数采样图案颜色：按自上而下的绘制顺序取最上层元素，纯逻辑可测。
 * @param scene - 图案场景。
 * @param fx - 归一化横坐标 [0,1)。@param fy - 归一化纵坐标 [0,1)。
 * @returns 该点的十六进制颜色。
 */
export function sampleScene(scene: PatternScene, fx: number, fy: number): string {
  for (let i = scene.shapes.length - 1; i >= 0; i -= 1) {
    if (insideShape(scene.shapes[i]!, fx, fy)) return scene.shapes[i]!.color
  }
  for (const sp of scene.speckles) {
    const dx = fx - sp.fx
    const dy = fy - sp.fy
    if (dx * dx + dy * dy <= sp.r * sp.r) return sp.color
  }
  return mixHex(scene.baseTop, scene.baseBottom, Math.min(1, Math.max(0, fy)))
}

/**
 * 碎片描边色：同一 (seed,row,col) 确定，用于区分相邻碎片。
 * @param seed - 关卡种子。@param row - 碎片行。@param col - 碎片列。
 */
export function pieceTint(seed: number, row: number, col: number): string {
  return accent(Math.floor(hash2(row, col, seed) * 8))
}

// ---- 关卡状态 ----

/** 一块碎片：id = row*size+col，图案固定为正确位置的裁切。 */
export interface JigsawPiece {
  /** 碎片编号（等于正确位置的平铺下标）。 */
  id: number
  /** 正确行。 */
  row: number
  /** 正确列。 */
  col: number
  /** 当前中心 x（逻辑坐标）。 */
  x: number
  /** 当前中心 y（逻辑坐标）。 */
  y: number
  /** 旋转档位 0..3（0 为正确角度）。 */
  rot: number
  /** 已吸附到正确格。 */
  placed: boolean
}

/** 一关的完整状态。 */
export interface JigsawState {
  /** 关卡号（1 起）。 */
  level: number
  /** 每边块数。 */
  size: number
  /** 本关是否需要旋转对齐。 */
  rotate: boolean
  /** 关卡种子（图案与散布都由它决定）。 */
  seed: number
  /** 全部碎片（id 顺序）。 */
  pieces: JigsawPiece[]
  /** 已用步数（放置尝试/旋转/提示）。 */
  moves: number
  /** 已用毫秒（由 index 的帧循环累加）。 */
  elapsedMs: number
}

/**
 * 生成一关：图案 seed + 碎片按 seed 打散到托盘（网格 + 抖动）。
 * @param level - 关卡号（1 起，超出 5 循环）。
 * @param seed - 关卡种子。
 * @returns 完整初始状态（含全部碎片与散布位置）。
 */
export function createLevel(level: number, seed: number): JigsawState {
  const cfg = LEVELS[(level - 1) % LEVELS.length]!
  const size = cfg.size
  const n = size * size
  const rng = mulberry32((seed ^ Math.imul(level, 0x9e3779b9)) >>> 0)
  // 打乱放置顺序（Fisher-Yates），逐槽散布到托盘网格。
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const t = order[i]!
    order[i] = order[j]!
    order[j] = t
  }
  const cols = Math.max(1, Math.floor(TRAY.w / CELL))
  const rows = Math.ceil(n / cols)
  const spacingY = rows > 1 ? (TRAY.h - CELL) / (rows - 1) : 0
  const spacingX = cols > 1 ? (TRAY.w - CELL) / (cols - 1) : 0
  const pieces: JigsawPiece[] = []
  for (let k = 0; k < n; k += 1) {
    const id = order[k]!
    const row = Math.floor(id / size)
    const col = id % size
    const sc = k % cols
    const sr = Math.floor(k / cols)
    const j = cfg.jitter
    let x = TRAY.x + CELL / 2 + sc * spacingX + (rng() * 2 - 1) * j
    let y = TRAY.y + CELL / 2 + sr * spacingY + (rng() * 2 - 1) * j
    // 抖动后仍保证碎片中心留在托盘内。
    x = Math.min(TRAY.x + TRAY.w - 10, Math.max(TRAY.x + 10, x))
    y = Math.min(TRAY.y + TRAY.h - 10, Math.max(TRAY.y + 10, y))
    pieces.push({ id, row, col, x, y, rot: cfg.rotate ? Math.floor(rng() * 4) : 0, placed: false })
  }
  // pieces 保持 id 顺序，便于命中测试与渲染稳定。
  pieces.sort((a, b) => a.id - b.id)
  return { level, size, rotate: cfg.rotate, seed, pieces, moves: 0, elapsedMs: 0 }
}

/** 已正确放置的碎片数。 */
export function placedCount(state: JigsawState): number {
  return state.pieces.reduce((acc, p) => acc + (p.placed ? 1 : 0), 0)
}

/** 全部碎片归位即过关。 */
export function isComplete(state: JigsawState): boolean {
  return state.pieces.every((p) => p.placed)
}

/**
 * 旋转一档：0→1→2→3→0 循环（每档 90°）。
 * @param state - 关卡状态（原地修改）。@param id - 碎片编号。
 */
export function cyclePiece(state: JigsawState, id: number): void {
  const p = state.pieces.find((q) => q.id === id)
  if (p === undefined) return
  p.rot = (p.rot + 1) % 4
}

/**
 * 吸附判定：碎片中心距正确格中心 ≤ 容差，且（旋转关）角度档为 0 时吸附
 * 归位；否则原地不动。
 * @param state - 关卡状态（成功时原地更新碎片）。
 * @param id - 碎片编号。
 * @param snapTol - 距离容差（默认 {@link SNAP_TOL}）。
 * @returns true 表示已吸附。
 */
export function tryPlace(state: JigsawState, id: number, snapTol = SNAP_TOL): boolean {
  const p = state.pieces.find((q) => q.id === id)
  if (p === undefined || p.placed) return false
  if (state.rotate && p.rot % 4 !== 0) return false
  const t = targetCenter(state.size, p.row, p.col)
  const dx = p.x - t.x
  const dy = p.y - t.y
  if (Math.sqrt(dx * dx + dy * dy) > snapTol) return false
  p.x = t.x
  p.y = t.y
  p.placed = true
  return true
}

/**
 * 提示：把编号最小的未归位碎片摆到正确格（角度归零并标记已放）。
 * @returns 被放置的碎片编号，或 null（已全部完成）。
 */
export function hintPlace(state: JigsawState): number | null {
  const p = state.pieces.find((q) => !q.placed)
  if (p === undefined) return null
  const t = targetCenter(state.size, p.row, p.col)
  p.rot = 0
  p.x = t.x
  p.y = t.y
  p.placed = true
  return p.id
}

/**
 * 计分：关卡基础分 + 奖励，减去用时与步数惩罚，下限 100。
 * @param level - 关卡号。@param elapsedMs - 用时毫秒。@param moves - 步数。
 * @returns 不低于 100 的整数分。
 */
export function computeScore(level: number, elapsedMs: number, moves: number): number {
  const sec = elapsedMs / 1000
  return Math.max(100, Math.round(300 + level * 400 - sec * 2 - moves * 5))
}
