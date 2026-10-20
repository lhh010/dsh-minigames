/**
 * Color Lines (五连珠) canvas renderer: HUD (score / free cells), a 9x9
 * board panel with glowing accent balls (stable per color id), a pulsing
 * selected ball, a dashed keyboard cursor, and the shared game-over
 * overlay. Line clears fire a particle burst.
 */
import type { ColorLinesState, Position } from './logic.ts'
import { SIZE, emptyCells } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 44
export const HUD_H = 40
export const GAP = 6
export const BOARD_W = SIZE * CELL + (SIZE + 1) * GAP
export const BOARD_H = SIZE * CELL + (SIZE + 1) * GAP
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

/** What the game wants rendered this frame. */
export interface ColorLinesView {
  selected: Position | null
  cursor: Position
  /** Cells flashing as they clear (0..1 animation progress). */
  clearing: { cells: Position[]; t: number } | null
}

const particles = createParticles()
let prevScore = -1
let prevFrameMs = 0

function cellX(c: number): number {
  return GAP + c * (CELL + GAP) + CELL / 2
}

function cellY(r: number): number {
  return HUD_H + GAP + r * (CELL + GAP) + CELL / 2
}

function drawBoardPanel(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = THEME.panel
  glow(ctx, THEME.panelEdge, 8)
  roundRectPath(ctx, 0, HUD_H, BOARD_W, BOARD_H, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  roundRectPath(ctx, 0.5, HUD_H + 0.5, BOARD_W - 1, BOARD_H - 1, 10)
  ctx.stroke()
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      ctx.fillStyle = THEME.bgBottom
      roundRectPath(ctx, GAP + c * (CELL + GAP), HUD_H + GAP + r * (CELL + GAP), CELL, CELL, 8)
      ctx.fill()
    }
  }
}

/** One glowing ball; radius pulses when selected. */
function drawBall(ctx: CanvasRenderingContext2D, color: number, cx: number, cy: number, r: number): void {
  const fill = accent(color - 1)
  glow(ctx, fill, 10)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // Highlight for a sphere feel.
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.28, cy - r * 0.3, r * 0.22, 0, Math.PI * 2)
  ctx.fill()
}

/** Draw one frame. */
export function renderColorLines(
  ctx: CanvasRenderingContext2D,
  state: ColorLinesState,
  view: ColorLinesView,
): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 180)

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  hudPair(ctx, 10, 16, '五连珠', '', 'left')
  hudPair(ctx, LOGICAL_W / 2, 16, '得分 ', String(state.score), 'left', THEME.gold)
  hudPair(ctx, LOGICAL_W - 10, 16, '剩余空间 ', String(emptyCells(state.grid).length), 'right')
  drawBoardPanel(ctx)

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const color = state.grid[r]![c]!
      if (color === 0) continue
      const isSelected = view.selected !== null && view.selected.r === r && view.selected.c === c
      const radius = (CELL * 0.36) * (isSelected ? 1 + 0.14 * pulse : 1)
      // Glow ring under the selected ball.
      if (isSelected) {
        ctx.strokeStyle = THEME.gold
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.4 + 0.4 * pulse
        ctx.beginPath()
        ctx.arc(cellX(c), cellY(r), CELL * 0.44, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      drawBall(ctx, color, cellX(c), cellY(r), radius)
    }
  }

  // Clearing cells flash white before they vanish.
  if (view.clearing !== null) {
    const flash = 0.35 + 0.55 * Math.abs(Math.sin(view.clearing.t * 22))
    for (const p of view.clearing.cells) {
      ctx.fillStyle = `rgba(255,255,255,${flash.toFixed(2)})`
      roundRectPath(ctx, GAP + p.c * (CELL + GAP) + 2, HUD_H + GAP + p.r * (CELL + GAP) + 2, CELL - 4, CELL - 4, 8)
      ctx.fill()
    }
  }

  // Score gain → burst at the board centre (observed render-side).
  if (state.score !== prevScore) {
    if (prevScore >= 0 && state.score > prevScore) {
      particles.burst(BOARD_W / 2, HUD_H + BOARD_H / 2, THEME.good, 14, 150)
    }
    prevScore = state.score
  }
  particles.tick(ctx, dtMs)

  // Keyboard cursor: dashed gold box (solid when on the selected ball).
  const cur = view.cursor
  ctx.strokeStyle = view.selected !== null && view.selected.r === cur.r && view.selected.c === cur.c
    ? THEME.text
    : THEME.gold
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  roundRectPath(
    ctx, GAP + cur.c * (CELL + GAP) + 2, HUD_H + GAP + cur.r * (CELL + GAP) + 2,
    CELL - 4, CELL - 4, 8,
  )
  ctx.stroke()
  ctx.setLineDash([])

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  }
}
