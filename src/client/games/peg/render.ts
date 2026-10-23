/**
 * Peg Solitaire canvas renderer: the 7×7 cross board with glowing pegs,
 * cursor ring, selected source highlight and landing hints, a 关卡/剩余
 * HUD, plus stuck and win overlays. Uses the shared visual kit (../theme.ts);
 * all state (board, cursor, selection) is decided by the caller and passed
 * in, so the renderer stays stateless.
 */
import { BOARD_MASK, SIZE, pegCount, type PegBoard } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export const HUD_H = 32
export const CELL = 34
export const MARGIN = 10
const BOARD_W = CELL * SIZE
export const LOGICAL_W = BOARD_W + MARGIN * 2
export const LOGICAL_H = HUD_H + BOARD_W + MARGIN * 2 + 18

/** Center of hole `index` in logical space. */
export function holeCenter(index: number): { x: number; y: number } {
  return {
    x: MARGIN + (index % SIZE) * CELL + CELL / 2,
    y: HUD_H + MARGIN + Math.floor(index / SIZE) * CELL + CELL / 2,
  }
}

/** Which hole index a logical-space point lands on (or null outside holes). */
export function holeAt(x: number, y: number): number | null {
  const c = Math.floor((x - MARGIN) / CELL)
  const r = Math.floor((y - HUD_H - MARGIN) / CELL)
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
  const index = r * SIZE + c
  return BOARD_MASK[index] === 1 ? index : null
}

export interface PegRenderState {
  board: PegBoard
  cursor: number | null
  selected: number | null
  /** Legal landing holes for the current selection (drawn as hint dots). */
  hints: number[]
  /** 1-based level number for the HUD. */
  levelDisplay: number
  levelName: string
  toast: string | null
  win: boolean
  stuck: boolean
}

/** Draw one frame of the board; overlays cover the scene on win/stuck/pause. */
export function renderPeg(ctx: CanvasRenderingContext2D, state: PegRenderState, paused: boolean): void {
  const { board, cursor, selected, hints } = state
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  hudPair(ctx, MARGIN, 21, `关卡 ${state.levelDisplay} `, state.levelName)
  hudPair(ctx, LOGICAL_W - MARGIN, 21, '剩余棋子 ', String(pegCount(board)), 'right', THEME.gold)

  for (let i = 0; i < board.length; i += 1) {
    if (BOARD_MASK[i] !== 1) continue
    const { x, y } = holeCenter(i)
    // Empty-hole socket.
    ctx.fillStyle = THEME.panel
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()

    if (board[i] === 1) {
      const isSelected = selected === i
      const color = isSelected ? THEME.gold : accent(i)
      glow(ctx, color, isSelected ? 18 : 6)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, isSelected ? 11 : 9, 0, Math.PI * 2)
      ctx.fill()
      noGlow(ctx)
    }

    if (hints.includes(i)) {
      // Landing hint: small ring inside the empty hole.
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (cursor === i && selected !== i) {
      ctx.strokeStyle = THEME.text
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(x, y, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  if (state.toast !== null) {
    ctx.textAlign = 'center'
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    ctx.fillText(state.toast, LOGICAL_W / 2, LOGICAL_H - 4)
  }

  if (state.win) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '完美！', '剩 1 子 · 即将进入下一关 · R 重开本关', THEME.gold)
  } else if (state.stuck) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '无路可走', 'Z 回退 · R 重开', THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  }
}
