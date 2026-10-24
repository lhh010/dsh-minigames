/**
 * Gomoku canvas renderer: the 15x15 board with grid lines and stones, a turn
 * HUD, a win overlay, and a particle burst on game end. Uses the shared
 * visual kit (../theme.ts).
 */
import type { GomokuState } from './logic.ts'
import { SIZE } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 24
export const HUD_H = 32
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

// Render-side event observation: burst once when the game ends.
const particles = createParticles()
let prevOver = false
let prevFrameMs = 0

const STAR_POINTS: ReadonlyArray<readonly [number, number]> = [
  [3, 3], [3, 11], [11, 3], [11, 11], [7, 7],
]

/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export function renderGomoku(ctx: CanvasRenderingContext2D, state: GomokuState, paused: boolean): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  const status = state.over
    ? state.winner === 1 ? '你赢了！' : state.winner === 2 ? 'AI 赢了' : '平局'
    : state.turn === 1 ? '你的回合 ●' : 'AI 思考中 ○'
  hudPair(ctx, 10, 21, '状态 ', status, 'left',
    state.over ? (state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.text) : accent(0))

  // Board panel.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 2, HUD_H + 2, BOARD_W - 4, BOARD_H - 4, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // Grid.
  ctx.strokeStyle = THEME.panelEdge
  for (let i = 0; i < SIZE; i += 1) {
    ctx.beginPath()
    ctx.moveTo(CELL / 2, HUD_H + i * CELL + CELL / 2)
    ctx.lineTo(BOARD_W - CELL / 2, HUD_H + i * CELL + CELL / 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(i * CELL + CELL / 2, HUD_H + CELL / 2)
    ctx.lineTo(i * CELL + CELL / 2, LOGICAL_H - CELL / 2)
    ctx.stroke()
  }
  // Star points.
  ctx.fillStyle = THEME.textMuted
  for (const [r, c] of STAR_POINTS) {
    ctx.beginPath()
    ctx.arc(c * CELL + CELL / 2, HUD_H + r * CELL + CELL / 2, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Stones: black/white by rule, with a soft glow.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const stone = state.board[r]![c]!
      if (stone === 0) continue
      const x = c * CELL + CELL / 2
      const y = HUD_H + r * CELL + CELL / 2
      glow(ctx, stone === 1 ? accent(0) : THEME.text, 6)
      ctx.fillStyle = stone === 1 ? '#0f0f16' : '#ececf4'
      ctx.beginPath()
      ctx.arc(x, y, CELL * 0.42, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
      ctx.strokeStyle = stone === 1 ? THEME.panelEdge : THEME.textMuted
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // End-of-game burst (observed render-side; logic untouched).
  if (state.over && !prevOver) {
    const color = state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.gold
    particles.burst(BOARD_W / 2, HUD_H + BOARD_H / 2, color, 26, 170)
  }
  prevOver = state.over
  particles.tick(ctx, dtMs)

  // Overlay covers the board only.
  if (state.over) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(
      ctx, BOARD_W, BOARD_H,
      state.winner === 1 ? '你赢了！' : state.winner === 2 ? 'AI 赢了' : '平局',
      '按 R 重新开始',
      state.winner === 1 ? THEME.good : state.winner === 2 ? THEME.bad : THEME.gold,
    )
    ctx.restore()
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
