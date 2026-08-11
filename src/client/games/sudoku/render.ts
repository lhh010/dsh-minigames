/**
 * Sudoku canvas renderer: the 9x9 grid with box dividers, fixed clues in
 * dark, player entries in blue, conflicts in red, a cursor highlight, and a
 * difficulty/time HUD.
 */
import type { SudokuState } from './logic.ts'
import { conflictsAt } from './logic.ts'
import { SIZE, type Difficulty } from './logic.ts'

export const CELL = 40
export const HUD_H = 30
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const BG = '#1b1b22'
const GRID = '#3a3a46'
const BOX = '#e8c84c'
const CLUE = '#e8e8ec'
const ENTRY = '#4c9ae8'
const CONFLICT = '#e45756'
const CURSOR = 'rgba(255,255,255,0.16)'
const TEXT = '#d8d8e0'

/** Draw one frame; cursor is the selected cell or null. */
export function renderSudoku(ctx: CanvasRenderingContext2D, state: SudokuState, difficulty: Difficulty, cursor: { r: number; c: number } | null): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Board background.
  ctx.fillStyle = BG
  ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)

  // Cursor highlight.
  if (cursor !== null && !state.won) {
    ctx.fillStyle = CURSOR
    ctx.fillRect(cursor.c * CELL, HUD_H + cursor.r * CELL, CELL, CELL)
  }

  // Cells.
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const n = state.grid[r]![c]
      if (n === null) continue
      const isClue = state.puzzle[r]![c] !== null
      const bad = !isClue && conflictsAt(state, r, c)
      ctx.fillStyle = isClue ? CLUE : bad ? CONFLICT : ENTRY
      ctx.font = 'bold 19px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(n), c * CELL + CELL / 2, HUD_H + r * CELL + CELL / 2)
    }
  }
  ctx.textBaseline = 'alphabetic'

  // Grid lines (thick every 3 cells).
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  for (let i = 0; i <= SIZE; i += 1) {
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

  // HUD: difficulty + elapsed time.
  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  const label = difficulty === 'easy' ? '简单' : difficulty === 'normal' ? '普通' : '困难'
  ctx.fillText(`${label} · D 切换`, 10, 20)
  ctx.textAlign = 'right'
  const s = Math.floor(state.elapsed)
  ctx.fillText(`⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, LOGICAL_W - 10, 20)

  if (state.won) {
    ctx.fillStyle = 'rgba(21,21,27,0.7)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('解 决 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`用时 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · 按 R 开新题`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 20)
  }
}
