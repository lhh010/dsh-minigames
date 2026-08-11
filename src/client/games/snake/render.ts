/**
 * Snake canvas renderer: the grid, the snake (head brighter, body segments),
 * the food, and a game-over overlay. Palette tuned for the DSH dark shell.
 */
import type { SnakeState } from './logic.ts'

export const CELL = 26
export const HUD_H = 30
export const BOARD_W = 16 * CELL
export const BOARD_H = 12 * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const BG = '#15151b'
const GRID_LINE = 'rgba(255,255,255,0.04)'
const SNAKE = '#5abf6b'
const SNAKE_HEAD = '#7ae08c'
const FOOD = '#e45756'
const TEXT = '#d8d8e0'

/** Draw one frame. */
export function renderSnake(ctx: CanvasRenderingContext2D, state: SnakeState): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // HUD.
  ctx.fillStyle = '#1b1b22'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`得分 ${state.score}`, 10, 20)

  // Board background + grid.
  ctx.fillStyle = BG
  ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 1
  for (let c = 1; c < 16; c += 1) {
    ctx.beginPath(); ctx.moveTo(c * CELL + 0.5, HUD_H); ctx.lineTo(c * CELL + 0.5, LOGICAL_H); ctx.stroke()
  }
  for (let r = 1; r < 12; r += 1) {
    ctx.beginPath(); ctx.moveTo(0, HUD_H + r * CELL + 0.5); ctx.lineTo(BOARD_W, HUD_H + r * CELL + 0.5); ctx.stroke()
  }

  // Food.
  ctx.fillStyle = FOOD
  ctx.beginPath()
  ctx.arc(state.food.c * CELL + CELL / 2, HUD_H + state.food.r * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2)
  ctx.fill()

  // Snake.
  state.snake.forEach((p, i) => {
    const x = p.c * CELL
    const y = HUD_H + p.r * CELL
    ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
  })

  if (state.over) {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = TEXT
    ctx.font = 'bold 22px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('游 戏 结 束', BOARD_W / 2, HUD_H + BOARD_H / 2 - 8)
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 18)
  }
}
