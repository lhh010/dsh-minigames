/**
 * Huarong (15-puzzle) canvas renderer: 4x4 numbered tiles that slide into the
 * empty cell, a HUD (moves + time), and a solved overlay. Palette tuned for
 * the DSH dark shell.
 */
import type { HuarongState, Position, Slide } from './logic.ts'

export const CELL = 72
export const HUD_H = 40
export const BOARD_W = 4 * CELL
export const BOARD_H = 4 * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

const TILE = '#3a4a6a'
const TILE_LIGHT = '#5a7ab0'
const TILE_SOLVED = '#3f7a4a'
const TILE_SOLVED_LIGHT = '#5fa86a'
const EMPTY = '#15151b'
const GRID = '#26262e'
const TEXT = '#f0f4ff'
const MUTED = '#9aa3b8'

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

/** Draw a single rounded tile with its number. */
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
  const base = correct ? TILE_SOLVED : TILE
  const light = correct ? TILE_SOLVED_LIGHT : TILE_LIGHT
  const size = CELL - 8
  const radius = 10
  ctx.fillStyle = base
  ctx.beginPath()
  ctx.roundRect(cx - size / 2, cy - size / 2, size, size, radius)
  ctx.fill()
  // Top highlight.
  ctx.fillStyle = light
  ctx.beginPath()
  ctx.roundRect(cx - size / 2 + 4, cy - size / 2 + 4, size - 8, 8, 5)
  ctx.fill()
  // Number.
  ctx.fillStyle = TEXT
  ctx.font = 'bold 26px ui-monospace, monospace'
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
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = '#13131a'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  // HUD.
  ctx.fillStyle = '#1b1b22'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`步数 ${state.moves}`, 10, 16)
  ctx.textAlign = 'right'
  const seconds = Math.floor(state.elapsed)
  ctx.fillText(`用时 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, LOGICAL_W - 10, 16)
  ctx.fillStyle = MUTED
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText('点击/方向键滑动方块，按 1..15 顺序排列', 10, 37)

  // Board recess.
  ctx.fillStyle = EMPTY
  ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
  // Grid lines.
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
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

  // Solved overlay.
  if (view.solved) {
    ctx.fillStyle = 'rgba(19,19,26,0.7)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 28px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('完 成 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 14)
    ctx.fillStyle = TEXT
    ctx.font = '14px ui-monospace, monospace'
    const seconds2 = Math.floor(state.elapsed)
    ctx.fillText(`${state.moves} 步 · ${Math.floor(seconds2 / 60)}:${String(seconds2 % 60).padStart(2, '0')}`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 18)
    ctx.fillStyle = MUTED
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText('按 R 或点击 重新开始', BOARD_W / 2, HUD_H + BOARD_H / 2 + 42)
  }
  ctx.textBaseline = 'alphabetic'
}
