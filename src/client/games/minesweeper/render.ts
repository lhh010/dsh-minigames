/**
 * Minesweeper canvas renderer: the mine grid (hidden tiles, glowing numbers,
 * flags), a mine-counter HUD, and win/game-over overlays — all on the shared
 * theme kit. Score-side effects are render-side observations only.
 */
import type { MinesweeperState } from './logic.ts'
import { COLS, MINES, ROWS } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const CELL = 30
export const HUD_H = 30
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

/** Seconds -> "mm:ss" (or "ss" under a minute). */
function formatTime(seconds: number): string {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}

// Render-side effect state: particles + the frame clock they tick on.
const particles = createParticles()
let prevOver = false
let prevWon = false
let prevFrameMs = 0

/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export function renderMinesweeper(ctx: CanvasRenderingContext2D, state: MinesweeperState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // End-of-run bursts (observed, logic untouched).
  if (state.won && !prevWon) particles.burst(LOGICAL_W / 2, HUD_H + BOARD_H / 2, THEME.gold, 26, 160)
  if (state.over && !prevOver) particles.burst(LOGICAL_W / 2, HUD_H + BOARD_H / 2, THEME.bad, 26, 160)
  prevWon = state.won
  prevOver = state.over

  // HUD: mines remaining + elapsed time.
  const flagged = state.grid.flat().filter(c => c.flagged).length
  hudPair(ctx, 10, 20, '💣', `${Math.max(0, MINES - flagged)}`)
  hudPair(ctx, LOGICAL_W - 10, 20, '⏱', formatTime(state.elapsed), 'right')

  // Grid.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const x = c * CELL
      const y = HUD_H + r * CELL
      const cell = state.grid[r]![c]!
      if (!cell.revealed) {
        // Hidden: raised rounded tile.
        roundRectPath(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 6)
        ctx.fillStyle = THEME.panel
        ctx.fill()
        ctx.strokeStyle = THEME.panelEdge
        ctx.lineWidth = 1
        ctx.stroke()
        if (cell.flagged) {
          glow(ctx, THEME.bad, 8)
          ctx.fillStyle = THEME.bad
          ctx.beginPath()
          ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.22, 0, Math.PI * 2)
          ctx.fill()
          noGlow(ctx)
        }
      } else if (cell.mine) {
        roundRectPath(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 6)
        ctx.fillStyle = '#17171f'
        ctx.fill()
        glow(ctx, THEME.bad, 10)
        ctx.fillStyle = THEME.bad
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.28, 0, Math.PI * 2)
        ctx.fill()
        noGlow(ctx)
        ctx.fillStyle = THEME.text
        ctx.beginPath()
        ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, CELL * 0.08, 0, Math.PI * 2)
        ctx.fill()
      } else {
        roundRectPath(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 6)
        ctx.fillStyle = '#17171f'
        ctx.fill()
        if (cell.count > 0) {
          // Stable accent per number: accent(1)..accent(8).
          const color = accent(cell.count)
          glow(ctx, color, 6)
          ctx.fillStyle = color
          ctx.font = 'bold 14px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(cell.count), x + CELL / 2, y + CELL / 2)
          noGlow(ctx)
        }
      }
    }
  }
  ctx.textBaseline = 'alphabetic'

  particles.tick(ctx, dtMs)

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '踩雷了', '按 R 重新开始', THEME.bad)
  } else if (state.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部排雷！', `用时 ${formatTime(state.elapsed)} · 按 R 重新开始`, THEME.gold)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
