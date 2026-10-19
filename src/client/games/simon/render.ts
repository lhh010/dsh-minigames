/**
 * Simon canvas renderer: a 2x2 grid of glowing pads with key letters, a
 * round/score HUD, and overlays for pause and game over. Uses the shared
 * visual kit (../theme.ts); which pad is lit is decided by the caller
 * (index.ts) and passed in, so the renderer stays stateless.
 */
import type { SimonState } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const PAD = 96
export const GAP = 16
export const BOARD_W = PAD * 2 + GAP
export const LOGICAL_W = BOARD_W + GAP
export const LOGICAL_H = HUD_H + BOARD_W + GAP

/** Key letter drawn on each pad (A/S/D/F). */
const KEY_LETTERS = ['A', 'S', 'D', 'F'] as const

function padRect(i: number): { x: number; y: number } {
  const col = i % 2
  const row = Math.floor(i / 2)
  return { x: GAP / 2 + col * (PAD + GAP), y: HUD_H + GAP / 2 + row * (PAD + GAP) }
}

/** Which pad (0..3) a logical-space point lands on, or null. */
export function padAt(x: number, y: number): number | null {
  for (let i = 0; i < 4; i += 1) {
    const { x: px, y: py } = padRect(i)
    if (x >= px && x <= px + PAD && y >= py && y <= py + PAD) return i
  }
  return null
}

/**
 * Draw one frame.
 * @param lit - pad index to render glowing, or null for none (caller-owned
 *   flash/press timing).
 */
export function renderSimon(ctx: CanvasRenderingContext2D, state: SimonState, lit: number | null, paused: boolean): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  hudPair(ctx, GAP / 2, 21, '回合 ', String(Math.max(1, state.round)))
  hudPair(ctx, LOGICAL_W - GAP / 2, 21, '得分 ', String(state.score), 'right', THEME.gold)

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = padRect(i)
    const color = accent(i)
    const active = lit === i
    glow(ctx, color, active ? 22 : 5)
    ctx.fillStyle = active ? color : THEME.panel
    roundRectPath(ctx, x, y, PAD, PAD, 14)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = color
    ctx.lineWidth = active ? 2.5 : 1.5
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillStyle = active ? THEME.bgTop : color
    ctx.fillText(KEY_LETTERS[i] ?? '?', x + PAD / 2, y + PAD / 2)
  }
  ctx.textBaseline = 'alphabetic'

  if (state.phase === 'input' && !paused) {
    ctx.textAlign = 'center'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('轮到你了', LOGICAL_W / 2, LOGICAL_H - 3)
  }

  if (state.phase === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重开`, THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
