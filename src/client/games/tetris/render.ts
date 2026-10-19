/**
 * Tetris canvas renderer on the shared theme kit: gradient backdrop, a
 * themed board with glowing rounded blocks and a ghost outline, accent-per-
 * kind piece colors, hudPair stats, a clear-line particle burst (observed
 * from the lines counter), and a themed game-over overlay.
 */
import {
  COLS, ROWS, PREVIEW_COUNT, ghostY, type TetrisState, type Piece,
} from './board.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

const CELL = 22
const MINI = 14
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
/** Full logical canvas width: the board plus the preview column. */
export const LOGICAL_W = BOARD_W + 16 + 4 * CELL + 8
const PREVIEW_X = BOARD_W + 16
const PREVIEW_W = 4 * CELL

/** Kind id -> fill color (stable accent per piece type). */
function kindColor(kind: number): string {
  return accent(kind)
}

const GRID_LINE = THEME.panelEdge

// Render-side clear-line burst, observed from the lines counter.
const particles = createParticles()
let prevLines = -1
let lastFrame = 0

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1, ghost = false, lit = true): void {
  ctx.globalAlpha = alpha
  if (ghost) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    roundRectPath(ctx, x + 2.5, y + 2.5, CELL - 5, CELL - 5, 4)
    ctx.stroke()
  } else {
    if (lit) glow(ctx, color, 7)
    ctx.fillStyle = color
    roundRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 4)
    ctx.fill()
    if (lit) noGlow(ctx)
    // Inner top-left highlight + darker seam for a beveled block look.
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(x + 3, y + 3, CELL - 6, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x + 3, y + CELL - 5, CELL - 6, 2)
  }
  ctx.globalAlpha = 1
}

function drawShape(ctx: CanvasRenderingContext2D, shape: number[][], px: number, py: number, kind: number, alpha = 1, ghost = false): void {
  for (let r = 0; r < shape.length; r += 1) {
    for (let c = 0; c < shape[r]!.length; c += 1) {
      if (shape[r]![c] === 0) continue
      drawCell(ctx, px + c * CELL, py + r * CELL, kindColor(kind), alpha, ghost)
    }
  }
}

/** Draw a mini piece preview (used for the next queue). */
function drawMiniPiece(ctx: CanvasRenderingContext2D, piece: Piece | null, x: number, y: number, w: number): void {
  if (piece === null) return
  const shape = piece.shape
  const shapeW = shape[0]!.length * MINI
  const shapeH = shape.length * MINI
  const ox = x + Math.floor((w - shapeW) / 2)
  const oy = y + Math.floor((3 * MINI - shapeH) / 2)
  ctx.fillStyle = kindColor(piece.kind)
  for (let r = 0; r < shape.length; r += 1) {
    for (let c = 0; c < shape[r]!.length; c += 1) {
      if (shape[r]![c] === 0) continue
      ctx.fillRect(ox + c * MINI, oy + r * MINI, MINI - 1, MINI - 1)
    }
  }
}

/** Draw a full-size piece preview (hold). */
function drawHold(ctx: CanvasRenderingContext2D, piece: Piece | null, y: number): void {
  hudPair(ctx, PREVIEW_X, y, '暂存 ', 'C')
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, PREVIEW_X, y + 6, PREVIEW_W, 3 * CELL, 6)
  ctx.fill()
  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 1
  ctx.stroke()
  if (piece === null) return
  const shape = piece.shape
  const ox = PREVIEW_X + Math.floor((PREVIEW_W - shape[0]!.length * CELL) / 2)
  const oy = y + 6 + Math.floor((3 * CELL - shape.length * CELL) / 2)
  drawShape(ctx, shape, ox, oy, piece.kind)
}

/** Draw the next-queue previews (up to PREVIEW_COUNT mini pieces). */
function drawNextQueue(ctx: CanvasRenderingContext2D, state: TetrisState): void {
  hudPair(ctx, PREVIEW_X, 12, '下一个', '')
  const itemH = 3 * MINI + 8
  for (let i = 0; i < Math.min(PREVIEW_COUNT, state.nextQueue.length); i += 1) {
    const y = 18 + i * itemH
    ctx.fillStyle = THEME.panel
    roundRectPath(ctx, PREVIEW_X, y, PREVIEW_W, 3 * MINI, 6)
    ctx.fill()
    ctx.strokeStyle = GRID_LINE
    ctx.lineWidth = 1
    ctx.stroke()
    drawMiniPiece(ctx, state.nextQueue[i]!, PREVIEW_X, y, PREVIEW_W)
  }
}

/** Draw one frame of the game. */
export function renderTetris(ctx: CanvasRenderingContext2D, state: TetrisState): void {
  const width = LOGICAL_W
  ctx.clearRect(0, 0, width, BOARD_H + 8)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, width, BOARD_H + 8)

  // Board panel + grid + border.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 1, 1, BOARD_W - 2, BOARD_H - 2, 6)
  ctx.fill()
  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 2
  ctx.stroke()
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
      if (kind !== 0) drawCell(ctx, c * CELL, r * CELL, kindColor(kind), 1, false, false)
    }
  }

  // Ghost + current piece.
  if (state.current !== null) {
    const piece = state.current
    const gy = ghostY(state)
    if (gy !== piece.y) drawShape(ctx, piece.shape, piece.x * CELL, gy * CELL, piece.kind, 0.35, true)
    drawShape(ctx, piece.shape, piece.x * CELL, piece.y * CELL, piece.kind)
  }

  // Line-clear burst, observed from the lines counter (logic untouched).
  if (prevLines >= 0 && state.lines > prevLines) {
    for (let i = 0; i < 3; i += 1) {
      particles.burst(BOARD_W / 2 + (i - 1) * BOARD_W / 3, BOARD_H * 0.75, THEME.gold, 12, 160)
    }
  }
  prevLines = state.lines
  particles.tick(ctx, dt)

  // Next queue (5 mini previews) + hold preview.
  drawNextQueue(ctx, state)
  // Hold sits below the 5-piece queue, then the stats HUD.
  const queueBottom = 18 + PREVIEW_COUNT * (3 * MINI + 8)
  drawHold(ctx, state.hold, queueBottom + 8)
  const statsY = queueBottom + 8 + 6 + 3 * CELL + 24
  hudPair(ctx, PREVIEW_X, statsY, '得分 ', String(state.score), 'left', THEME.text)
  hudPair(ctx, PREVIEW_X, statsY + 18, '行数 ', `${state.lines}`, 'left', THEME.text)
  hudPair(ctx, PREVIEW_X, statsY + 36, '等级 ', String(state.level), 'left', THEME.text)

  if (state.over) {
    drawOverlay(ctx, BOARD_W, BOARD_H, 'GAME OVER', `得分 ${state.score} · R 重新开始`, THEME.bad)
  }
}
