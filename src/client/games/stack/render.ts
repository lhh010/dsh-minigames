/**
 * Stack canvas renderer on the shared theme kit: gradient sky, the tower as
 * accent(layer)-colored slabs scrolled by a camera that keeps the top layer
 * near a fixed height (the tower grows visually upward), the glowing slider
 * at the top, tumbling overhang pieces, a perfect-drop white flash, a
 * 层数/得分 HUD, and the bad-red themed collapse overlay 「倒塌了 · X 层」.
 */
import type { FallingPiece, PlacedBlock, StackState } from './logic.ts'
import { W, H, HUD_H, BLOCK_H, BASE_Y, layerTopY } from './logic.ts'
import {
  THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

export const STACK_W = W
export const STACK_H = H

/** Layers kept on screen before the camera starts scrolling. */
const VISIBLE_LAYERS = Math.floor((BASE_Y - HUD_H - BLOCK_H * 2) / BLOCK_H)

// Render-owned frame clock and perfect-flash timer (one game per canvas).
let prevNow = 0
let prevLayers = -1
let flash = 0

/** Perfect-drop flash decay, ms to fade from full to zero. */
const FLASH_MS = 220

/** Camera offset: tower coordinates → screen coordinates (y grows downward). */
function camOffset(state: StackState): number {
  return Math.max(0, state.layers - VISIBLE_LAYERS) * BLOCK_H
}

/** Draw one frame. */
export function renderStack(ctx: CanvasRenderingContext2D, state: StackState): void {
  const now = performance.now()
  const dt = Math.min(50, Math.max(0, now - prevNow))
  prevNow = now

  drawBackground(ctx, W, H)
  const cam = camOffset(state)

  // Ground line + static slab under layer 0.
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, BASE_Y + cam)
  ctx.lineTo(W, BASE_Y + cam)
  ctx.stroke()
  ctx.fillStyle = THEME.panel
  ctx.lineWidth = 1
  roundRectPath(ctx, 24, BASE_Y + cam, W - 48, BLOCK_H, 4)
  ctx.fill()
  ctx.stroke()

  for (let i = 1; i < state.blocks.length; i += 1) {
    drawBlock(ctx, state.blocks[i]!, i, cam)
  }

  // Perfect flash on the freshly placed top block (streak > 0 ⇒ it was perfect).
  if (state.layers !== prevLayers) {
    if (prevLayers >= 0 && state.streak > 0) flash = 1
    prevLayers = state.layers
  }
  if (flash > 0) {
    flash = Math.max(0, flash - dt / FLASH_MS)
    const top = state.blocks[state.blocks.length - 1]!
    ctx.save()
    ctx.globalAlpha = flash * 0.85
    ctx.fillStyle = '#ffffff'
    roundRectPath(ctx, top.x, layerTopY(state.layers - 1) + cam, top.w, BLOCK_H, 4)
    ctx.fill()
    ctx.restore()
  }

  // Tumbling overhang pieces.
  for (const p of state.falling) drawFalling(ctx, p, cam)

  // The moving slider, glowing at the top layer.
  const s = state.slider
  if (!state.over) {
    const y = layerTopY(state.layers) + cam
    const color = accent(state.layers)
    glow(ctx, color, 14)
    ctx.fillStyle = color
    roundRectPath(ctx, s.x, y, s.w, BLOCK_H, 4)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(s.x + 4, y + 4, s.w - 8, 3)
  }

  // HUD strip.
  ctx.fillStyle = 'rgba(13,13,20,0.45)'
  ctx.fillRect(0, 0, W, HUD_H)
  hudPair(ctx, 10, 20, '层数', String(state.layers), 'left')
  hudPair(ctx, W / 2, 20, '得分', String(state.score), 'left')
  hudPair(ctx, W - 10, 20, '连击', String(state.streak), 'right', THEME.gold)

  if (state.over) {
    drawOverlay(
      ctx, W, H, `倒塌了 · ${state.layers} 层`,
      `得分 ${state.score} · 点击或按空格重新开始`,
      THEME.bad,
    )
  }
}

/** One tower slab, colored by its layer index. */
function drawBlock(ctx: CanvasRenderingContext2D, b: PlacedBlock, layer: number, cam: number): void {
  const y = layerTopY(layer - 1) + cam
  ctx.fillStyle = accent(layer)
  roundRectPath(ctx, b.x, y, b.w, BLOCK_H, 4)
  ctx.fill()
  // Top highlight strip for a lit-from-above read.
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(b.x + 3, y + 3, b.w - 6, 3)
}

/** A cut-off overhang piece tumbling down. */
function drawFalling(ctx: CanvasRenderingContext2D, p: FallingPiece, cam: number): void {
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.fillStyle = THEME.textMuted
  roundRectPath(ctx, p.x, p.y + cam, p.w, BLOCK_H, 4)
  ctx.fill()
  ctx.restore()
}
