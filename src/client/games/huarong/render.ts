/**
 * Huarong (15-puzzle) canvas renderer: 4x4 numbered tiles that slide into the
 * empty cell, a HUD (moves + time), a solved overlay, and a particle burst on
 * solve. Uses the shared visual kit (../theme.ts).
 */
import type { HuarongState, Position, Slide } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 72
export const HUD_H = 40
export const BOARD_W = 4 * CELL
export const BOARD_H = 4 * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

// Render-side event observation: burst once when the puzzle is solved.
const particles = createParticles()
let prevSolved = false
let prevFrameMs = 0

/** What the game wants rendered this frame. */
export interface HuarongView {
  /** Active slide animation (moving tiles interpolate from -> to). */
  slides: { entries: Slide[]; t: number } | null
  solved: boolean
}

function cellCenter(pos: Position): { x: number; y: number } {
  return { x: pos.c * CELL + CELL / 2, y: HUD_H + pos.r * CELL + CELL / 2 }
}

/** Whether tile `value` is in its solved position. */
function inSolvedSpot(state: HuarongState, value: number, r: number, c: number): boolean {
  return value === r * state.cols + c + 1
}

/** Draw a single rounded tile with its number; color by tile id (stable). */
function drawTile(
  ctx: CanvasRenderingContext2D,
  state: HuarongState,
  value: number,
  cx: number,
  cy: number,
  r: number,
  c: number,
): void {
  const correct = inSolvedSpot(state, value, r, c)
  const base = correct ? THEME.good : accent(value)
  const size = CELL - 8
  glow(ctx, base, correct ? 12 : 6)
  ctx.fillStyle = base
  roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 10)
  ctx.fill()
  noGlow(ctx)
  // Top highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  roundRectPath(ctx, cx - size / 2 + 4, cy - size / 2 + 4, size - 8, 8, 5)
  ctx.fill()
  // Number.
  ctx.fillStyle = '#10101a'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(value), cx, cy + 2)
}

/** Draw one frame. `board` is the (already-updated) logical board. */
export function renderHuarong(
  ctx: CanvasRenderingContext2D,
  state: HuarongState,
  view: HuarongView,
): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  hudPair(ctx, 10, 16, '步数 ', String(state.moves))
  const seconds = Math.floor(state.elapsed)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  hudPair(ctx, LOGICAL_W - 10, 16, '用时 ', clock, 'right', accent(1))
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('点击/方向键滑动方块，按 1..15 顺序排列', 10, 37)

  // Board recess.
  ctx.fillStyle = THEME.bgBottom
  roundRectPath(ctx, 2, HUD_H + 2, BOARD_W - 4, BOARD_H - 4, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  // Grid lines.
  ctx.strokeStyle = THEME.panelEdge
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath()
    ctx.moveTo(i * CELL + 0.5, HUD_H)
    ctx.lineTo(i * CELL + 0.5, LOGICAL_H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, HUD_H + i * CELL + 0.5)
    ctx.lineTo(BOARD_W, HUD_H + i * CELL + 0.5)
    ctx.stroke()
  }

  // Tiles; sliding tiles draw at interpolated positions on top.
  const sliding = new Set<number>()
  if (view.slides !== null) {
    for (const s of view.slides.entries) sliding.add(s.tile)
  }
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const value = state.board[r]![c]!
      if (value === 0 || sliding.has(value)) continue
      const { x, y } = cellCenter({ r, c })
      drawTile(ctx, state, value, x, y, r, c)
    }
  }
  if (view.slides !== null) {
    const k = view.slides.t
    for (const s of view.slides.entries) {
      const from = cellCenter(s.from)
      const to = cellCenter(s.to)
      drawTile(ctx, state, s.tile, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, s.to.r, s.to.c)
    }
  }

  // Solve burst (observed render-side; logic untouched).
  if (view.solved && !prevSolved) {
    particles.burst(BOARD_W / 2, HUD_H + BOARD_H / 2, THEME.good, 30, 180)
  }
  prevSolved = view.solved
  particles.tick(ctx, dtMs)

  // Solved overlay.
  if (view.solved) {
    const seconds2 = Math.floor(state.elapsed)
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(
      ctx, BOARD_W, BOARD_H, '完成！',
      `${state.moves} 步 · ${Math.floor(seconds2 / 60)}:${String(seconds2 % 60).padStart(2, '0')} · 按 R 或点击 重新开始`,
      THEME.gold,
    )
    ctx.restore()
  }
  ctx.textBaseline = 'alphabetic'
}
