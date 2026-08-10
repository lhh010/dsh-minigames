/**
 * Tetris canvas renderer: the 10x20 board, the current piece with its ghost,
 * and the next/hold previews on the right. Palette tuned for the DSH dark
 * shell.
 */
import {
  COLS, ROWS, ghostY, type TetrisState,
} from './board.ts'

const CELL = 22
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
/** Full logical canvas width: the board plus the preview column. */
export const LOGICAL_W = BOARD_W + 16 + 4 * CELL + 8
const PREVIEW_X = BOARD_W + 16
const PREVIEW_W = 4 * CELL
const PREVIEW_H = 4 * CELL

/** Kind id -> fill color. */
const COLORS = [
  '', '#e45756', '#4c9ae8', '#b07cc9', '#5abf6b', '#e8c84c', '#e88a4c', '#4cd0c9',
]

const GRID_LINE = '#26262e'
const BOARD_BG = '#15151b'
const BOARD_BORDER = '#3a3a45'
const TEXT = '#d8d8e0'

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
  // Inner top-left highlight + darker seam for a beveled block look.
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x + 2, y + 2, CELL - 4, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(x + 2, y + CELL - 4, CELL - 4, 2)
  ctx.globalAlpha = 1
}

function drawShape(ctx: CanvasRenderingContext2D, shape: number[][], px: number, py: number, kind: number, alpha = 1): void {
  for (let r = 0; r < shape.length; r += 1) {
    for (let c = 0; c < shape[r]!.length; c += 1) {
      if (shape[r]![c] === 0) continue
      drawCell(ctx, px + c * CELL, py + r * CELL, COLORS[kind]!, alpha)
    }
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, label: string, piece: TetrisState['next'], y: number): void {
  ctx.fillStyle = TEXT
  ctx.font = '11px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(label, PREVIEW_X, y)
  ctx.fillStyle = BOARD_BG
  ctx.fillRect(PREVIEW_X, y + 6, PREVIEW_W, PREVIEW_H)
  ctx.strokeStyle = GRID_LINE
  ctx.strokeRect(PREVIEW_X + 0.5, y + 6.5, PREVIEW_W, PREVIEW_H)
  if (piece === null) return
  const shape = piece.shape
  const ox = PREVIEW_X + Math.floor((PREVIEW_W - shape[0]!.length * CELL) / 2)
  const oy = y + 6 + Math.floor((PREVIEW_H - shape.length * CELL) / 2)
  drawShape(ctx, shape, ox, oy, piece.kind)
}

/** Draw one frame of the game. */
export function renderTetris(ctx: CanvasRenderingContext2D, state: TetrisState): void {
  const width = LOGICAL_W
  ctx.clearRect(0, 0, width, BOARD_H + 8)

  // Board background + grid + border.
  ctx.fillStyle = BOARD_BG
  ctx.fillRect(0, 0, BOARD_W, BOARD_H)
  ctx.strokeStyle = BOARD_BORDER
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, BOARD_W - 2, BOARD_H - 2)
  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 1
  for (let c = 1; c < COLS; c += 1) {
    ctx.beginPath()
    ctx.moveTo(c * CELL + 0.5, 0)
    ctx.lineTo(c * CELL + 0.5, BOARD_H)
    ctx.stroke()
  }
  for (let r = 1; r < ROWS; r += 1) {
    ctx.beginPath()
    ctx.moveTo(0, r * CELL + 0.5)
    ctx.lineTo(BOARD_W, r * CELL + 0.5)
    ctx.stroke()
  }

  // Locked cells.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const kind = state.grid[r]![c]!
      if (kind !== 0) drawCell(ctx, c * CELL, r * CELL, COLORS[kind]!)
    }
  }

  // Ghost + current piece.
  if (state.current !== null) {
    const piece = state.current
    const gy = ghostY(state)
    if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL, gy * CELL, piece.kind, 0.25)
    drawShape(ctx, piece.shape, piece.x * CELL, piece.y * CELL, piece.kind)
  }

  // Next + hold previews.
  drawPreview(ctx, '下一个', state.next, 6)
  drawPreview(ctx, '暂存 C', state.hold, 6 + PREVIEW_H + 18)

  if (state.over) {
    ctx.fillStyle = TEXT
    ctx.font = 'bold 18px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', BOARD_W / 2, BOARD_H / 2 - 8)
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · R 重新开始`, BOARD_W / 2, BOARD_H / 2 + 18)
  }
}
