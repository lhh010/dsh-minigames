/**
 * 2048 canvas renderer: a 4x4 board of rounded glowing tiles colored by the
 * shared accent ramp (stable per tile value), a score HUD, and shared
 * win/game-over overlays. Score gains fire a particle burst at the board.
 */
import type { Game2048State } from './logic.ts'
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, createParticles,
} from '../theme.ts'

export const CELL = 64
export const GAP = 8
export const HUD_H = 36
export const BOARD_W = 4 * CELL + 5 * GAP
export const BOARD_H = 4 * CELL + 5 * GAP
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

// Render-owned particle system + frame clock (single game instance per canvas).
const particles = createParticles()
let prevScore = -1
let prevNow = 0

/** Stable tile accent by exponent of 2 (2 → accent(0), 4 → accent(1), ...). */
function tileColor(value: number): string {
  return accent(Math.log2(value) - 1)
}

function tilePos(i: number): number {
  return GAP + i * (CELL + GAP)
}

/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export function render2048(ctx: CanvasRenderingContext2D, state: Game2048State, paused: boolean): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  hudPair(ctx, 10, 24, '', '2048', 'left')
  hudPair(ctx, LOGICAL_W - 10, 24, '得分', String(state.score), 'right')

  // Board panel.
  ctx.fillStyle = THEME.panel
  glow(ctx, THEME.panelEdge, 8)
  roundRectPath(ctx, 0, HUD_H, BOARD_W, BOARD_H, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  roundRectPath(ctx, 0.5, HUD_H + 0.5, BOARD_W - 1, BOARD_H - 1, 10)
  ctx.stroke()

  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const x = tilePos(c)
      const y = HUD_H + tilePos(r)
      const value: number | null = state.grid[r]![c] ?? null
      if (value === null) {
        ctx.fillStyle = THEME.bgBottom
        roundRectPath(ctx, x, y, CELL, CELL, 8)
        ctx.fill()
        continue
      }
      const color = tileColor(value)
      // Higher tiles glow brighter.
      ctx.fillStyle = color
      glow(ctx, color, Math.min(18, 4 + Math.log2(value) * 1.2))
      roundRectPath(ctx, x, y, CELL, CELL, 8)
      ctx.fill()
      noGlow(ctx)
      ctx.fillStyle = value <= 4 ? THEME.text : '#ffffff'
      ctx.font = value >= 1024 ? 'bold 18px system-ui, sans-serif' : 'bold 24px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(value), x + CELL / 2, y + CELL / 2)
    }
  }
  ctx.textBaseline = 'alphabetic'

  // Score gain → burst at the board centre.
  if (state.score !== prevScore) {
    if (prevScore >= 0 && state.score > prevScore) {
      particles.burst(BOARD_W / 2, HUD_H + BOARD_H / 2, THEME.good, 12, 160)
    }
    prevScore = state.score
  }
  particles.tick(ctx, dt)

  if (state.won && !state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '达成 2048！', '继续挑战更高分 · R 重新开始', THEME.gold)
  } else if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
