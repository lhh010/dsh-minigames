/**
 * Sudoku canvas renderer on the shared theme kit: gradient background, a
 * panel board with glowing cursor/conflict highlights, themed digits, a
 * hudPair HUD, a win overlay, and a particle burst when the puzzle is solved.
 */
import type { SudokuState } from './logic.ts'
import { conflictsAt } from './logic.ts'
import { SIZE, type Difficulty } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const CELL = 40
export const HUD_H = 30
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const ENTRY = accent(0)
const GRID = THEME.panelEdge
const BOX = THEME.gold

// Render-side effect state: win burst + per-frame particle ticking.
const particles = createParticles()
let prevWon = false
let lastFrame = 0

/** Draw one frame; cursor is the selected cell or null.
 * @param paused - show the pause overlay. */
export function renderSudoku(ctx: CanvasRenderingContext2D, state: SudokuState, difficulty: Difficulty, cursor: { r: number; c: number } | null, paused: boolean): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Board panel.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 2, HUD_H + 2, BOARD_W - 4, BOARD_H - 4, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // Cursor highlight (glowing rounded cell).
  if (cursor !== null && !state.won) {
    const cx = cursor.c * CELL
    const cy = HUD_H + cursor.r * CELL
    ctx.fillStyle = 'rgba(122,162,247,0.14)'
    glow(ctx, accent(0), 12)
    roundRectPath(ctx, cx + 2, cy + 2, CELL - 4, CELL - 4, 8)
    ctx.fill()
    noGlow(ctx)
  }

  // Cells.
  const s = Math.floor(state.elapsed)
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  ctx.font = 'bold 19px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const n = state.grid[r]![c]
      if (n === null) continue
      const isClue = state.puzzle[r]![c] !== null
      const bad = !isClue && conflictsAt(state, r, c)
      ctx.fillStyle = isClue ? THEME.text : bad ? THEME.bad : ENTRY
      if (bad) glow(ctx, THEME.bad, 8)
      ctx.fillText(String(n), c * CELL + CELL / 2, HUD_H + r * CELL + CELL / 2)
      if (bad) noGlow(ctx)
    }
  }
  ctx.textBaseline = 'alphabetic'

  // Grid lines (thick gold every 3 cells).
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  for (let i = 0; i <= SIZE; i += 1) {
    if (i % 3 === 0) continue
    ctx.beginPath()
    ctx.moveTo(i * CELL, HUD_H)
    ctx.lineTo(i * CELL, LOGICAL_H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, HUD_H + i * CELL)
    ctx.lineTo(BOARD_W, HUD_H + i * CELL)
    ctx.stroke()
  }
  ctx.strokeStyle = BOX
  ctx.lineWidth = 2.5
  for (let i = 0; i <= SIZE; i += 3) {
    ctx.beginPath()
    ctx.moveTo(i * CELL, HUD_H)
    ctx.lineTo(i * CELL, LOGICAL_H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, HUD_H + i * CELL)
    ctx.lineTo(BOARD_W, HUD_H + i * CELL)
    ctx.stroke()
  }

  // Win burst (observed from the state flag; logic untouched).
  if (state.won && !prevWon) particles.burst(BOARD_W / 2, HUD_H + BOARD_H / 2, THEME.gold, 26, 170)
  prevWon = state.won
  particles.tick(ctx, dt)

  // HUD: difficulty + elapsed time.
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  const label = difficulty === 'easy' ? '简单' : difficulty === 'normal' ? '普通' : '困难'
  hudPair(ctx, 10, 20, `${label} · D 切换`, '', 'left')
  hudPair(ctx, LOGICAL_W - 10, 20, '⏱ ', clock, 'right')

  if (state.won) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, BOARD_W, BOARD_H, '解决！', `用时 ${clock} · 按 R 开新题`, THEME.gold)
    ctx.restore()
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
