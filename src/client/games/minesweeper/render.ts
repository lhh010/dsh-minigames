/**
 * Minesweeper canvas renderer: the mine grid (hidden cells, numbers, flags),
 * a mine-counter HUD, and win/game-over overlays. Palette tuned for the DSH
 * dark shell.
 */
import type { MinesweeperState } from './logic.ts'
import { COLS, ROWS } from './logic.ts'

export const CELL = 30
export const HUD_H = 30
export const BOARD_W = COLS * CELL
export const BOARD_H = ROWS * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

export type MinesweeperMode = 'reveal' | 'flag'

const HIDDEN = '#2c3332'
const HIDDEN_LIGHT = '#394140'
const REVEALED = '#181b1b'
const TEXT = '#edeeea'
const FLAG = '#e9a0a0'
const MINE = '#202525'

const NUMBER_COLORS = ['', '#5abf6b', '#4c9ae8', '#e45756', '#7a4ce8', '#e88a4c', '#4cd0c9', '#e8c84c', '#9aa3b8']

/** Seconds -> "mm:ss" (or "ss" under a minute). */
function formatTime(seconds: number): string {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}

/** Draw one frame. */
export function renderMinesweeper(ctx: CanvasRenderingContext2D, state: MinesweeperState, mode: MinesweeperMode = 'reveal'): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // HUD: mines remaining + elapsed time.
  ctx.fillStyle = '#212525'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  const flagged = state.grid.flat().filter(c => c.flagged).length
  ctx.fillText(`💣 ${Math.max(0, 10 - flagged)}`, 10, 20)
  const drawModeButton = (x: number, label: string, active: boolean): void => {
    ctx.fillStyle = active ? '#c5dba7' : '#2a3030'
    ctx.fillRect(x, 4, 46, HUD_H - 8)
    ctx.fillStyle = active ? '#18201c' : TEXT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText(label, x + 23, HUD_H / 2)
  }
  drawModeButton(88, '翻开', mode === 'reveal')
  drawModeButton(138, '标旗', mode === 'flag')
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`⏱ ${formatTime(state.elapsed)}`, LOGICAL_W - 10, 20)

  // Grid.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const x = c * CELL
      const y = HUD_H + r * CELL
      const cell = state.grid[r]![c]!
      if (!cell.revealed) {
        // Hidden: raised tile.
        ctx.fillStyle = HIDDEN
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        ctx.fillStyle = HIDDEN_LIGHT
        ctx.fillRect(x + 1, y + 1, CELL - 2, 3)
        if (cell.flagged) {
          ctx.fillStyle = FLAG
          ctx.beginPath()
          ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.22, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (cell.mine) {
        ctx.fillStyle = REVEALED
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        ctx.fillStyle = MINE
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.28, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, CELL * 0.08, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = REVEALED
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        if (cell.count > 0) {
          ctx.fillStyle = NUMBER_COLORS[cell.count]!
          ctx.font = 'bold 14px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(cell.count), x + CELL / 2, y + CELL / 2)
        }
      }
    }
  }
  ctx.textBaseline = 'alphabetic'

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#e45756'
    ctx.font = 'bold 22px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('踩 雷 了', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText('按 R 重新开始', BOARD_W / 2, HUD_H + BOARD_H / 2 + 18)
  } else if (state.won) {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 22px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('全 部 排 雷 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`用时 ${formatTime(state.elapsed)} · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 18)
  }
}
