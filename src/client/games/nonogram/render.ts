/**
 * Nonogram canvas renderer on the shared theme kit: gradient background,
 * row/column clue strips (satisfied lines dim), the 10x10 grid with filled
 * cells and X marks, a glowing cursor, a hudPair HUD, and a win overlay.
 */
import type { Cell, Clues } from './logic.ts'
import { SIZE } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const CELL = 34
export const HUD_H = 30
/** Clue gutters: up to 5 runs per line at 10 cells. */
export const CLUE_W = 92
export const CLUE_H = 76
export const BOARD = SIZE * CELL
export const LOGICAL_W = CLUE_W + BOARD
export const LOGICAL_H = HUD_H + CLUE_H + BOARD

const FILL = accent(0)
const GRID = THEME.panelEdge
const EDGE = THEME.gold

/** Board origin (past HUD + column clues). */
const OX = CLUE_W
const OY = HUD_H + CLUE_H

// Render-side effect state: win burst + per-frame particle ticking.
const particles = createParticles()
let prevWon = false
let lastFrame = 0

export interface Cursor { r: number, c: number }

/** Grid cell at logical coordinates, or null outside the board. */
export function cellAt(x: number, y: number): Cursor | null {
  const c = Math.floor((x - OX) / CELL)
  const r = Math.floor((y - OY) / CELL)
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
  return { r, c }
}

/** Whether the player's current marks in a line already satisfy its clue. */
function lineSatisfied(cells: Cell[][], index: number, vertical: boolean, clue: number[]): boolean {
  const line: boolean[] = []
  for (let i = 0; i < SIZE; i += 1) {
    const cell = vertical ? cells[i]![index]! : cells[index]![i]!
    line.push(cell === 1)
  }
  const runs: number[] = []
  let run = 0
  for (const v of line) {
    if (v) run += 1
    else if (run > 0) { runs.push(run); run = 0 }
  }
  if (run > 0) runs.push(run)
  const got = runs.length === 0 ? [0] : runs
  return got.length === clue.length && got.every((v, i) => v === clue[i])
}

/** Draw one frame. */
export function renderNonogram(
  ctx: CanvasRenderingContext2D,
  cells: Cell[][],
  clues: Clues,
  cursor: Cursor | null,
  level: number,
  elapsed: number,
  paused: boolean,
  winText: string | null,
): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Board panel.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, OX + 2, OY + 2, BOARD - 4, BOARD - 4, 10)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // Cursor highlight (glowing rounded cell).
  if (cursor !== null && winText === null) {
    ctx.fillStyle = 'rgba(122,162,247,0.14)'
    glow(ctx, accent(0), 12)
    roundRectPath(ctx, OX + cursor.c * CELL + 2, OY + cursor.r * CELL + 2, CELL - 4, CELL - 4, 8)
    ctx.fill()
    noGlow(ctx)
  }

  // Cells: filled squares and X marks.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const cell = cells[r]![c]!
      if (cell === 0) continue
      const x = OX + c * CELL
      const y = OY + r * CELL
      if (cell === 1) {
        ctx.fillStyle = FILL
        glow(ctx, FILL, 5)
        roundRectPath(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 6)
        ctx.fill()
        noGlow(ctx)
      } else {
        // X mark: two crossing strokes in muted red.
        ctx.strokeStyle = THEME.bad
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x + 9, y + 9)
        ctx.lineTo(x + CELL - 9, y + CELL - 9)
        ctx.moveTo(x + CELL - 9, y + 9)
        ctx.lineTo(x + 9, y + CELL - 9)
        ctx.stroke()
      }
    }
  }

  // Grid lines (thin every cell, gold every 5 cells).
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  for (let i = 0; i <= SIZE; i += 1) {
    if (i % 5 === 0) continue
    ctx.beginPath()
    ctx.moveTo(OX + i * CELL, OY)
    ctx.lineTo(OX + i * CELL, OY + BOARD)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(OX, OY + i * CELL)
    ctx.lineTo(OX + BOARD, OY + i * CELL)
    ctx.stroke()
  }
  ctx.strokeStyle = EDGE
  ctx.lineWidth = 2.5
  for (let i = 0; i <= SIZE; i += 5) {
    ctx.beginPath()
    ctx.moveTo(OX + i * CELL, OY)
    ctx.lineTo(OX + i * CELL, OY + BOARD)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(OX, OY + i * CELL)
    ctx.lineTo(OX + BOARD, OY + i * CELL)
    ctx.stroke()
  }

  // Row clues: right-aligned horizontal runs; satisfied rows dim.
  ctx.font = 'bold 13px ui-monospace, monospace'
  ctx.textBaseline = 'middle'
  const rowClues = clues.rows
  for (let r = 0; r < SIZE; r += 1) {
    const clue = rowClues[r]!
    const done = lineSatisfied(cells, r, false, clue)
    ctx.fillStyle = done ? THEME.textMuted : THEME.text
    ctx.textAlign = 'right'
    const text = clue.join(' ')
    ctx.fillText(text, OX - 8, OY + r * CELL + CELL / 2)
  }
  // Column clues: stacked vertically, centered on the column.
  for (let c = 0; c < SIZE; c += 1) {
    const clue = clues.cols[c]!
    const done = lineSatisfied(cells, c, true, clue)
    ctx.fillStyle = done ? THEME.textMuted : THEME.text
    ctx.textAlign = 'center'
    const top = OY - 6 - clue.length * 14
    clue.forEach((n, i) => {
      ctx.fillText(String(n), OX + c * CELL + CELL / 2, top + i * 14 + 7)
    })
  }
  ctx.textBaseline = 'alphabetic'

  // Win burst (observed from the win text; logic untouched).
  const won = winText !== null
  if (won && !prevWon) particles.burst(OX + BOARD / 2, OY + BOARD / 2, THEME.gold, 26, 170)
  prevWon = won
  particles.tick(ctx, dt)

  // HUD: level + elapsed time.
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  const s = Math.floor(elapsed)
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  hudPair(ctx, 10, 20, '关卡', String(level), 'left')
  hudPair(ctx, LOGICAL_W - 10, 20, '⏱ ', clock, 'right')

  if (winText !== null) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, LOGICAL_W, BOARD + CLUE_H, '完成！', `${winText} · 即将进入下一关`, THEME.gold)
    ctx.restore()
  } else if (paused) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H - HUD_H, '已暂停', '面板恢复后继续', THEME.text)
    ctx.restore()
  }
}
