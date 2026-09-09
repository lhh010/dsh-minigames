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
export const PAD_H = 38
export const BOARD_W = SIZE * CELL
export const BOARD_H = SIZE * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H + PAD_H

const BG = '#181b1b'
const GRID = '#394140'
const BOX = '#78847f'
const CLUE = '#edeeea'
const ENTRY = '#a8c3d0'
const CONFLICT = '#e9a0a0'
const CURSOR = 'rgba(255,255,255,0.16)'
const TEXT = '#edeeea'

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
    ctx.lineTo(i * CELL, HUD_H + BOARD_H)
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
    ctx.lineTo(i * CELL, HUD_H + BOARD_H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, HUD_H + i * CELL)
    ctx.lineTo(BOARD_W, HUD_H + i * CELL)
    ctx.stroke()
  }

  // 触屏数字键盘；保留键盘输入，同时让手机和平板无需硬件数字行。
  ctx.fillStyle = '#212525'
  ctx.fillRect(0, HUD_H + BOARD_H, LOGICAL_W, PAD_H)
  const padY = HUD_H + BOARD_H + 4
  const gap = 2
  const numberW = 30
  const clearW = 60
  const padX = 3
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 14px ui-monospace, monospace'
  for (let n = 1; n <= 9; n += 1) {
    const x = padX + (n - 1) * (numberW + gap)
    ctx.fillStyle = '#2a3030'
    ctx.fillRect(x, padY, numberW, PAD_H - 8)
    ctx.fillStyle = TEXT
    ctx.fillText(String(n), x + numberW / 2, padY + (PAD_H - 8) / 2)
  }
  const clearX = padX + 9 * (numberW + gap)
  ctx.fillStyle = '#39302f'
  ctx.fillRect(clearX, padY, clearW, PAD_H - 8)
  ctx.fillStyle = '#f0b4b4'
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText('清除', clearX + clearW / 2, padY + (PAD_H - 8) / 2)
  ctx.textBaseline = 'alphabetic'

  // HUD: difficulty + elapsed time.
  ctx.fillStyle = '#212525'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  const labels: Array<[Difficulty, string]> = [['easy', '简单'], ['normal', '普通'], ['hard', '困难']]
  labels.forEach(([value, label], index) => {
    const x = 4 + index * 44
    ctx.fillStyle = value === difficulty ? '#c5dba7' : '#2a3030'
    ctx.fillRect(x, 4, 40, HUD_H - 8)
    ctx.fillStyle = value === difficulty ? '#18201c' : TEXT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText(label, x + 20, HUD_H / 2)
  })
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
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
