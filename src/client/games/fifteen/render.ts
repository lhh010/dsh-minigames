/**
 * 15-Puzzle canvas renderer: rounded glowing number tiles on the shared
 * accent ramp, a dark blank hole, a 关卡/步数/打乱 HUD, and the shared
 * pause / level-clear overlays. Handles 3×3–5×5 boards; smaller boards are
 * centered on the fixed 5×5 logical canvas.
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const CELL = 58
export const GAP = 10
export const HUD_H = 32
export const FOOT_H = 16
/** Widest board (5×5) fixes the canvas size for every level. */
export const MAX_SIZE = 5
export const BOARD_W = MAX_SIZE * CELL + (MAX_SIZE + 1) * GAP
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_W + FOOT_H

/** Board origin for a given size (centered horizontally). */
function boardOrigin(size: number): { x: number; y: number } {
  const w = size * CELL + (size + 1) * GAP
  return { x: (LOGICAL_W - w) / 2, y: HUD_H }
}

/** Tile rect for a flat index. */
function tileRect(size: number, i: number): { x: number; y: number } {
  const { x: ox, y: oy } = boardOrigin(size)
  const r = Math.floor(i / size)
  const c = i % size
  return { x: ox + GAP + c * (CELL + GAP), y: oy + GAP + r * (CELL + GAP) }
}

/** Which tile a logical-space point lands on, or null. */
export function tileAt(x: number, y: number, size: number): number | null {
  for (let i = 0; i < size * size; i += 1) {
    const { x: px, y: py } = tileRect(size, i)
    if (x >= px && x <= px + CELL && y >= py && y <= py + CELL) return i
  }
  return null
}

/**
 * Draw one frame.
 * @param par - scramble move count shown next to the HUD.
 * @param paused - show the pause overlay.
 * @param winText - level-clear subtitle, or null while playing.
 */
export function renderFifteen(
  ctx: CanvasRenderingContext2D, w: number, h: number, board: number[], size: number,
  level: number, moves: number, par: number, paused: boolean, winText: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP, 21, '关卡 ', String(level))
  hudPair(ctx, w / 2, 21, '步数 ', String(moves), 'left', THEME.gold)
  hudPair(ctx, w - GAP, 21, '打乱 ', String(par), 'right')

  // Board panel sized to the actual level board.
  const { x: ox, y: oy } = boardOrigin(size)
  const bw = size * CELL + (size + 1) * GAP
  ctx.fillStyle = THEME.panel
  glow(ctx, THEME.panelEdge, 8)
  roundRectPath(ctx, ox, oy, bw, bw, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  roundRectPath(ctx, ox + 0.5, oy + 0.5, bw - 1, bw - 1, 10)
  ctx.stroke()

  for (let i = 0; i < board.length; i += 1) {
    const { x, y } = tileRect(size, i)
    const value = board[i]!
    if (value === 0) {
      // The blank hole sits darker than the panel.
      ctx.fillStyle = THEME.bgBottom
      roundRectPath(ctx, x, y, CELL, CELL, 8)
      ctx.fill()
      continue
    }
    const color = accent(value % (size * size))
    ctx.fillStyle = color
    glow(ctx, color, 6)
    roundRectPath(ctx, x, y, CELL, CELL, 8)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${size >= 5 ? 20 : 24}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(value), x + CELL / 2, y + CELL / 2)
  }
  ctx.textBaseline = 'alphabetic'

  if (winText !== null) {
    drawOverlay(ctx, w, h, '完成', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '面板继续', THEME.text)
  }
}
