/**
 * 马踏棋盘渲染：棋盘格、已访问足迹编号、骑士（🐎 emoji）、可达格高亮、
 * 提示态出度数与 HUD、过关/失败/暂停 overlay。纯 canvas 绘制，无状态。
 */
import { accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, THEME } from '../theme.ts'
import { rowCol, warnsdorffDegree, type TourState } from './logic.ts'

/** 逻辑画布尺寸（HUD 顶栏 + 下方方形棋盘）。 */
export const LOGICAL_W = 520
export const LOGICAL_H = 600

/** 顶部 HUD 高度与棋盘外边距（逻辑像素）。 */
const HUD_H = 46
const MARGIN = 14
/** 棋盘边长（取宽度和剩余高度的较小者）。 */
const BOARD_PX = Math.min(LOGICAL_W - MARGIN * 2, LOGICAL_H - HUD_H - MARGIN * 2)
const BOARD_X = (LOGICAL_W - BOARD_PX) / 2
const BOARD_Y = HUD_H + (LOGICAL_H - HUD_H - BOARD_PX) / 2

/** 深浅棋盘格填充色（与主题面板同族的低调双色）。 */
const CELL_LIGHT = '#262637'
const CELL_DARK = '#1d1d2b'

/** 传给 {@link renderTour} 的一次完整视图。 */
export interface TourView {
  /** 当前局面。 */
  state: TourState
  /** 当前可达格（高亮）。 */
  reachable: readonly number[]
  /** 提示格（闪烁描边）；null 关闭。 */
  hintCell: number | null
  /** 提示态：可达格上标出度数。 */
  hintActive: boolean
  /** 闪烁相位 0..1（锯齿波）。 */
  blink: number
  /** 档位标签（如 '8×8·完整挑战'）。 */
  levelLabel: string
  /** 剩余提示次数。 */
  hintsLeft: number
  /** 结束/暂停标题；null 表示进行中不遮罩。 */
  statusText: string | null
  statusSub: string
  statusColor: string
  paused: boolean
}

/** 逻辑坐标 → 棋盘格序号。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @param size - 棋盘边长。
 * @returns 格序号，棋盘外为 -1。 */
export function squareAt(x: number, y: number, size: number): number {
  const cell = BOARD_PX / size
  const col = Math.floor((x - BOARD_X) / cell)
  const row = Math.floor((y - BOARD_Y) / cell)
  if (row < 0 || row >= size || col < 0 || col >= size) return -1
  return row * size + col
}

/** 单格中心坐标。 */
function cellCenter(size: number, cell: number): { x: number; y: number } {
  const step = BOARD_PX / size
  const { row, col } = rowCol(size, cell)
  return { x: BOARD_X + col * step + step / 2, y: BOARD_Y + row * step + step / 2 }
}

/** 一局完整绘制：背景 → HUD → 棋盘 → 足迹 → 骑士 → overlay。 */
export function renderTour(ctx: CanvasRenderingContext2D, view: TourView): void {
  const { state } = view
  const size = state.size
  const step = BOARD_PX / size
  const total = size * size
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD：左侧剩余格数，右侧档位与提示次数。
  hudPair(ctx, MARGIN, 28, '剩余', String(total - state.path.length) + ' 格')
  hudPair(ctx, LOGICAL_W - MARGIN, 28, view.levelLabel, '提示 x' + view.hintsLeft, 'right',
    view.hintsLeft > 0 ? THEME.text : THEME.textMuted)

  // 棋盘底格（深浅交替）。
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? CELL_LIGHT : CELL_DARK
      ctx.fillRect(BOARD_X + col * step, BOARD_Y + row * step, step, step)
    }
  }
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.strokeRect(BOARD_X, BOARD_Y, BOARD_PX, BOARD_PX)

  // 已访问足迹：按步序渐变（越新越亮），格内标注步序号。
  const last = state.path.length - 1
  for (let i = 0; i < state.path.length; i += 1) {
    const cell = state.path[i]!
    const { x, y } = cellCenter(size, cell)
    const fresh = i / Math.max(1, total - 1)
    ctx.globalAlpha = 0.18 + 0.4 * fresh
    ctx.fillStyle = accent(1)
    ctx.fillRect(BOARD_X + rowCol(size, cell).col * step, BOARD_Y + rowCol(size, cell).row * step, step, step)
    ctx.globalAlpha = 0.45 + 0.5 * fresh
    ctx.fillStyle = THEME.text
    ctx.font = '600 ' + Math.max(9, step * 0.26) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x, y + step * 0.12)
    ctx.globalAlpha = 1
  }

  // 可达格高亮 + 提示态出度数。
  const reachableSet = new Set<number>(view.reachable)
  for (const cell of view.reachable) {
    const { row, col } = rowCol(size, cell)
    const px = BOARD_X + col * step
    const py = BOARD_Y + row * step
    ctx.fillStyle = 'rgba(158,206,106,0.16)'
    roundRectPath(ctx, px + 2, py + 2, step - 4, step - 4, 5)
    ctx.fill()
    ctx.strokeStyle = 'rgba(158,206,106,0.55)'
    ctx.lineWidth = 1.5
    roundRectPath(ctx, px + 2, py + 2, step - 4, step - 4, 5)
    ctx.stroke()
    if (view.hintActive) {
      ctx.fillStyle = THEME.textMuted
      ctx.font = '600 ' + Math.max(9, step * 0.24) + 'px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(String(warnsdorffDegree(state, cell)), px + 5, py + step * 0.32)
    }
  }

  // 提示格：金色闪烁描边。
  if (view.hintCell !== null && reachableSet.has(view.hintCell)) {
    const { row, col } = rowCol(size, view.hintCell)
    ctx.globalAlpha = 0.35 + 0.65 * view.blink
    glow(ctx, THEME.gold, 12)
    ctx.strokeStyle = THEME.gold
    ctx.lineWidth = 3
    roundRectPath(ctx, BOARD_X + col * step + 2, BOARD_Y + row * step + 2, step - 4, step - 4, 5)
    ctx.stroke()
    noGlow(ctx)
    ctx.globalAlpha = 1
  }

  // 骑士当前格（最后一步足迹之上）。
  if (last >= 0) {
    const cur = cellCenter(size, state.path[last]!)
    glow(ctx, accent(3), 10)
    ctx.font = Math.floor(step * 0.66) + 'px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🐎', cur.x, cur.y + step * 0.04)
    ctx.textBaseline = 'alphabetic'
    noGlow(ctx)
  }

  // 结束/暂停遮罩。
  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P 继续 · R 重开')
  } else if (view.statusText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, view.statusText, view.statusSub, view.statusColor)
  }
}
