/**
 * Lights Out canvas renderer: a 5x5 grid of glowing cells (accent color
 * alternating by (r+c) parity), a 关卡/步数 HUD, and overlays for pause and
 * level-clear. State (cursor, win flash) is caller-owned; the renderer stays
 * stateless and uses the shared visual kit (../theme.ts).
 */
import { SIZE, type Board } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const GAP = 12
export const CELL = 56
export const BOARD_W = SIZE * CELL + (SIZE - 1) * GAP
export const LOGICAL_W = BOARD_W + GAP
export const LOGICAL_H = HUD_H + BOARD_W + GAP + 16

export interface Cursor {
  r: number
  c: number
}

function cellRect(r: number, c: number): { x: number; y: number } {
  return { x: GAP / 2 + c * (CELL + GAP), y: HUD_H + GAP / 2 + r * (CELL + GAP) }
}

/** Which cell a logical-space point lands on, or null. */
export function cellAt(x: number, y: number): Cursor | null {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const { x: px, y: py } = cellRect(r, c)
      if (x >= px && x <= px + CELL && y >= py && y <= py + CELL) return { r, c }
    }
  }
  return null
}

/** Center of a cell in logical space (particle bursts). */
export function cellCenter(r: number, c: number): { x: number; y: number } {
  const { x, y } = cellRect(r, c)
  return { x: x + CELL / 2, y: y + CELL / 2 }
}

/**
 * Draw one frame.
 * @param cursor - keyboard-focused cell, or null to hide the focus ring.
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export function renderLights(
  ctx: CanvasRenderingContext2D, w: number, h: number, board: Board,
  cursor: Cursor | null, level: number, moves: number, paused: boolean, winText: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '关卡 ', String(level))
  hudPair(ctx, w - GAP / 2, 21, '步数 ', String(moves), 'right', THEME.gold)

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const { x, y } = cellRect(r, c)
      const color = accent(r + c)
      const on = board[r]![c]!
      glow(ctx, color, on ? 20 : 4)
      ctx.fillStyle = on ? color : THEME.panel
      roundRectPath(ctx, x, y, CELL, CELL, 10)
      ctx.fill()
      noGlow(ctx)
      ctx.strokeStyle = on ? color : THEME.panelEdge
      ctx.lineWidth = cursor !== null && cursor.r === r && cursor.c === c ? 2.5 : 1
      if (cursor !== null && cursor.r === r && cursor.c === c) glow(ctx, THEME.text, 8)
      ctx.stroke()
      noGlow(ctx)
    }
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '过关', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}
