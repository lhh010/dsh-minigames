/**
 * 不等数独渲染：格子与数字（提示金色、填入白色、冲突红显）、格间
 * 不等号（水平 >/< 字形、垂直三角指向小值）、选中格高亮、关卡 HUD、
 * 过关/暂停 overlay。纯 canvas 绘制，无状态。
 */
import { accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, THEME } from '../theme.ts'
import type { Inequality } from './logic.ts'

/** 逻辑画布尺寸（顶部 HUD + 方形盘面）。 */
export const LOGICAL_W = 540
export const LOGICAL_H = 620

/** HUD 高度与盘面外边距（逻辑像素）。 */
const HUD_H = 46
const MARGIN = 14

/** 盘面几何：格子边长与符号间隙（不等号画在间隙里）。 */
export interface BoardLayout {
  readonly x: number
  readonly y: number
  readonly cell: number
  readonly gap: number
  readonly boardPx: number
}

/** 按边长计算盘面几何（居中于 HUD 下方区域）。
 * @param size - 盘面边长。
 * @returns 布局参数。 */
export function boardLayout(size: number): BoardLayout {
  const budget = Math.min(LOGICAL_W - MARGIN * 2, LOGICAL_H - HUD_H - MARGIN * 2)
  const gap = size === 5 ? 24 : 20
  const cell = (budget - gap * (size - 1)) / size
  const boardPx = cell * size + gap * (size - 1)
  return {
    x: (LOGICAL_W - boardPx) / 2,
    y: HUD_H + (LOGICAL_H - HUD_H - boardPx) / 2,
    cell,
    gap,
    boardPx,
  }
}

/** 逻辑坐标 → 格子序号。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @param size - 盘面边长。
 * @returns 格子序号，格隙或盘外为 -1。 */
export function cellAt(x: number, y: number, size: number): number {
  const { x: bx, y: by, cell, gap } = boardLayout(size)
  const step = cell + gap
  const col = Math.floor((x - bx) / step)
  const row = Math.floor((y - by) / step)
  if (row < 0 || row >= size || col < 0 || col >= size) return -1
  const inX = x - bx - col * step
  const inY = y - by - row * step
  if (inX >= cell || inY >= cell) return -1
  return row * size + col
}

/** 格子中心坐标。
 * @param size - 盘面边长。
 * @param cell - 格子序号。
 * @returns 中心点。 */
export function cellCenter(size: number, cell: number): { x: number; y: number } {
  const { x: bx, y: by, cell: cs, gap } = boardLayout(size)
  const step = cs + gap
  return {
    x: bx + (cell % size) * step + cs / 2,
    y: by + Math.floor(cell / size) * step + cs / 2,
  }
}

/** 传给 renderFutoshiki 的一次完整视图。 */
export interface FutoshikiView {
  /** 盘面边长。 */
  readonly size: number
  /** 当前盘面（一维，0 为空）。 */
  readonly grid: readonly number[]
  /** 提示数位置标记（与盘面同长）。 */
  readonly givenMask: readonly boolean[]
  /** 不等号约束列表。 */
  readonly constraints: readonly Inequality[]
  /** 选中格序号；null 未选中。 */
  readonly selected: number | null
  /** 行列重复/不等违反的格子红显标记。 */
  readonly conflictCells: readonly boolean[]
  /** 违反的不等号红显标记（与 constraints 同长）。 */
  readonly conflictSigns: readonly boolean[]
  /** HUD 关卡标签。 */
  readonly levelLabel: string
  /** 已填格数。 */
  readonly filled: number
  /** 结束/过关标题；null 表示进行中不遮罩。 */
  readonly statusText: string | null
  readonly statusSub: string
  readonly statusColor: string
  readonly paused: boolean
}

/** 一局完整绘制：背景 → HUD → 格子与数字 → 不等号 → 选中高亮 → overlay。 */
export function renderFutoshiki(ctx: CanvasRenderingContext2D, view: FutoshikiView): void {
  const { size, grid } = view
  const { x: bx, y: by, cell, gap } = boardLayout(size)
  const step = cell + gap
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：左侧关卡，右侧填数进度。
  hudPair(ctx, MARGIN, 28, '关卡', view.levelLabel)
  const total = size * size
  hudPair(ctx, LOGICAL_W - MARGIN, 28, '已填', view.filled + ' / ' + total, 'right',
    view.filled === total ? THEME.good : THEME.text)

  // 格子底板。
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      roundRectPath(ctx, bx + c * step + 1, by + r * step + 1, cell - 2, cell - 2, 6)
      ctx.fillStyle = '#232333'
      ctx.fill()
      ctx.strokeStyle = THEME.panelEdge
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // 数字：提示金色、填入白色、冲突红显。
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let cellIdx = 0; cellIdx < grid.length; cellIdx += 1) {
    const v = grid[cellIdx]!
    if (v === 0) continue
    const r = Math.floor(cellIdx / size)
    const c = cellIdx % size
    const cx = bx + c * step + cell / 2
    const cy = by + r * step + cell / 2
    const given = view.givenMask[cellIdx]!
    const conflict = view.conflictCells[cellIdx]!
    ctx.font = (given ? 'bold ' : '600 ') + Math.floor(cell * 0.5) + 'px system-ui, sans-serif'
    ctx.fillStyle = conflict ? THEME.bad : given ? THEME.gold : THEME.text
    if (given) glow(ctx, THEME.gold, 5)
    ctx.fillText(String(v), cx, cy + 1)
    noGlow(ctx)
  }

  // 不等号：水平用 >/< 字形，垂直用三角（尖指向小值）。
  for (let i = 0; i < view.constraints.length; i += 1) {
    const { a, b, op } = view.constraints[i]!
    const color = view.conflictSigns[i]! ? THEME.bad : accent(6)
    ctx.fillStyle = color
    const ra = Math.floor(a / size)
    const ca = a % size
    if (b === a + 1) {
      // 水平：符号落在两列之间的竖向间隙。
      const sx = bx + ca * step + cell + gap / 2
      const sy = by + ra * step + cell / 2
      ctx.font = 'bold ' + Math.floor(gap * 1.05) + 'px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(op, sx, sy + 1)
    } else {
      // 垂直：a 上 b 下；'>' 上大下小 → 尖朝下，'<' 尖朝上。
      const tx = bx + ca * step + cell / 2
      const ty = by + ra * step + cell + gap / 2
      const half = gap * 0.4
      ctx.beginPath()
      if (op === '>') {
        ctx.moveTo(tx - half, ty - half)
        ctx.lineTo(tx + half, ty - half)
        ctx.lineTo(tx, ty + half)
      } else {
        ctx.moveTo(tx - half, ty + half)
        ctx.lineTo(tx + half, ty + half)
        ctx.lineTo(tx, ty - half)
      }
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.textBaseline = 'alphabetic'

  // 选中格高亮。
  if (view.selected !== null && !view.paused) {
    const r = Math.floor(view.selected / size)
    const c = view.selected % size
    glow(ctx, accent(0), 10)
    ctx.strokeStyle = accent(0)
    ctx.lineWidth = 2.5
    roundRectPath(ctx, bx + c * step + 2, by + r * step + 2, cell - 4, cell - 4, 6)
    ctx.stroke()
    noGlow(ctx)
  }

  // 暂停/过关遮罩。
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P 继续 · R 重开')
  } else if (view.statusText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, view.statusText, view.statusSub, view.statusColor)
  }
}
