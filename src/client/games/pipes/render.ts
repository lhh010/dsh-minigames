/**
 * Pipes canvas renderer: the board as panel cells with rounded pipe strokes
 * (water-connected tiles glow accent-blue with flowing dashes; unconnected
 * tiles draw muted panel strokes), special 源/汇 endpoint tiles, a HUD
 * (关卡/时间/得分), and win/pause/timeout overlays. Uses the shared visual
 * kit (../theme.ts).
 */
import type { PipeTile, PipesState } from './logic.ts'
import { connectedCells, openings, WIN_SCORE } from './logic.ts'
import { DR, DC } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 52
export const HUD_H = 44
export const MARGIN = 16
const MAX_SIZE = 8
/** Fixed logical canvas sized to the largest board; smaller boards center. */
export const LOGICAL_W = MAX_SIZE * CELL + MARGIN * 2
export const LOGICAL_H = HUD_H + MAX_SIZE * CELL + MARGIN * 2

const WATER = accent(0)
/** Low-time warning threshold in seconds. */
const LOW_TIME_S = 15

// Render-side event observation: burst once when a level is connected.
const particles = createParticles()
let prevWon = false
let prevFrameMs = 0

/** What the game wants rendered this frame. */
export interface PipesView {
  paused: boolean
  /** Keyboard cursor cell to highlight, or null. */
  cursor: { r: number; c: number } | null
}

function boardOffsets(size: number): { ox: number; oy: number } {
  return {
    ox: MARGIN + ((MAX_SIZE - size) * CELL) / 2,
    oy: HUD_H + MARGIN + ((MAX_SIZE - size) * CELL) / 2,
  }
}

/**
 * One pipe cell: a stroke from the center to each opening edge. Connected
 * cells glow and carry flowing dashes; unconnected cells use muted strokes.
 */
function drawPipe(
  ctx: CanvasRenderingContext2D, tile: PipeTile,
  x: number, y: number, connected: boolean, nowMs: number,
): void {
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  const mask = openings(tile)
  ctx.lineCap = 'round'
  ctx.lineWidth = 9
  for (let d = 0; d < 4; d += 1) {
    if ((mask & (1 << d)) === 0) continue
    const ex = cx + (DC[d]! * CELL) / 2
    const ey = cy + (DR[d]! * CELL) / 2
    if (connected) {
      glow(ctx, WATER, 10)
      ctx.strokeStyle = WATER
    } else {
      ctx.strokeStyle = THEME.panelEdge
    }
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    noGlow(ctx)
  }
  if (connected) {
    // Flowing water: bright dashes sliding along the same strokes.
    ctx.save()
    ctx.setLineDash([9, 9])
    ctx.lineDashOffset = -(nowMs / 40) % 18
    ctx.strokeStyle = 'rgba(226,240,255,0.85)'
    ctx.lineWidth = 3.5
    for (let d = 0; d < 4; d += 1) {
      if ((mask & (1 << d)) === 0) continue
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + (DC[d]! * CELL) / 2, cy + (DR[d]! * CELL) / 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Source/sink endpoint: a glowing hub with a stub toward its opening. */
function drawEndpoint(
  ctx: CanvasRenderingContext2D, label: string, color: string,
  x: number, y: number, rotation: number, connected: boolean, nowMs: number,
): void {
  drawPipe(ctx, { type: label === '源' ? 'source' : 'sink', rotation }, x, y, connected, nowMs)
  const cx = x + CELL / 2
  const cy = y + CELL / 2
  glow(ctx, color, connected ? 14 : 8)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, 13, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = '#10101a'
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, cy + 1)
  ctx.textBaseline = 'alphabetic'
}

/** Draw one frame. */
export function renderPipes(ctx: CanvasRenderingContext2D, state: PipesState, view: PipesView): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(64, now - prevFrameMs)
  prevFrameMs = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  const timeColor = state.timeLeft <= LOW_TIME_S ? THEME.bad : THEME.text
  hudPair(ctx, 12, 18, '关卡 ', String(state.level))
  hudPair(ctx, 110, 18, '时间 ', `${Math.ceil(state.timeLeft)}s`, 'left', timeColor)
  hudPair(ctx, LOGICAL_W - 12, 18, '得分 ', String(state.score), 'right')
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('点击 / 方向键+空格：旋转水管 · P：暂停 · R：重开', 12, 36)

  const { size, source, sink, tiles } = state.board
  const { ox, oy } = boardOffsets(size)
  const water = connectedCells(tiles, size, source)

  // Cells + pipes.
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const x = ox + c * CELL
      const y = oy + r * CELL
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      ctx.fillRect(x, y, CELL, CELL)
      ctx.strokeStyle = 'rgba(52,52,74,0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)
      const tile = tiles[r]![c]!
      const connected = water[r]![c]!
      if (tile.type === 'source') drawEndpoint(ctx, '源', THEME.good, x, y, tile.rotation, connected, now)
      else if (tile.type === 'sink') drawEndpoint(ctx, '汇', THEME.gold, x, y, tile.rotation, connected, now)
      else drawPipe(ctx, tile, x, y, connected, now)
    }
  }

  // Keyboard cursor highlight.
  if (view.cursor !== null) {
    const { r, c } = view.cursor
    if (r >= 0 && r < size && c >= 0 && c < size) {
      ctx.strokeStyle = accent(1)
      ctx.lineWidth = 2
      glow(ctx, accent(1), 8)
      roundRectPath(ctx, ox + c * CELL + 2, oy + r * CELL + 2, CELL - 4, CELL - 4, 8)
      ctx.stroke()
      noGlow(ctx)
    }
  }

  // Burst once on the won transition; tick particles every frame.
  if (state.status === 'won' && !prevWon) {
    particles.burst(ox + sink.c * CELL + CELL / 2, oy + sink.r * CELL + CELL / 2, WATER, 26, 180)
  }
  prevWon = state.status === 'won'
  particles.tick(ctx, dtMs)

  if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '面板继续', THEME.text)
  } else if (state.status === 'won') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '接通！', `+${WIN_SCORE} · 按 N 或稍后进入下一关`, THEME.good)
  } else if (state.status === 'over') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '时间到', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  }
}
