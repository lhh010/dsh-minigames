/**
 * 2048 canvas renderer: a 4x4 board of tiles with power-of-two colors, a score
 * HUD, and win/game-over overlays. Palette tuned for the DSH dark shell.
 */
import type { Game2048State } from './logic.ts'

export const CELL = 64
export const GAP = 8
export const HUD_H = 36
export const BOARD_W = 4 * CELL + 5 * GAP
export const BOARD_H = 4 * CELL + 5 * GAP
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const BG = '#1b1b22'
const CELL_BG = '#26262e'
const TEXT = '#d8d8e0'

/** Tile background color by exponent of 2 (value). */
function tileColor(value: number): string {
  if (value === 2) return '#3a4a6a'
  if (value === 4) return '#4a6a9a'
  if (value === 8) return '#5a8ab0'
  if (value === 16) return '#5abf8a'
  if (value === 32) return '#e8a04c'
  if (value === 64) return '#e8864c'
  if (value === 128) return '#e8604c'
  if (value === 256) return '#e84c8a'
  if (value === 512) return '#b07cc9'
  if (value === 1024) return '#e8c84c'
  return '#4cd0c9'
}

function tilePos(i: number): number {
  return GAP + i * (CELL + GAP)
}

/** Draw one frame. */
export function render2048(ctx: CanvasRenderingContext2D, state: Game2048State): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // HUD.
  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = 'bold 16px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText('2048', 10, 25)
  ctx.textAlign = 'right'
  ctx.font = '13px ui-monospace, monospace'
  ctx.fillText(`得分 ${state.score}`, LOGICAL_W - 10, 25)

  // Board.
  ctx.fillStyle = BG
  ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const x = tilePos(c)
      const y = HUD_H + tilePos(r)
      const value: number | null = state.grid[r]![c] ?? null
      ctx.fillStyle = value === null ? CELL_BG : tileColor(value)
      ctx.fillRect(x, y, CELL, CELL)
      if (value !== null) {
        ctx.fillStyle = value <= 4 ? '#e8ecf4' : '#ffffff'
        ctx.font = value >= 1024 ? 'bold 18px ui-monospace, monospace' : 'bold 24px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(value), x + CELL / 2, y + CELL / 2)
      }
    }
  }
  ctx.textBaseline = 'alphabetic'

  if (state.won && !state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.55)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('达 成 2048 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText('继续挑战更高分 · R 重新开始', BOARD_W / 2, HUD_H + BOARD_H / 2 + 20)
  } else if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.65)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = TEXT
    ctx.font = 'bold 24px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('游 戏 结 束', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 20)
  }
}
