/**
 * Piano Tiles renderer: 4 lanes with divider lines, the hit zone at the
 * bottom, glowing tiles (dimmed once hit), lane key labels, HUD, and the
 * ready/pause/over overlays. All drawing happens in the fixed logical space
 * (LOGICAL_W x LOGICAL_H).
 */
import {
  HIT_MIN_Y, LANE_COUNT, LOGIC_H, MISS_Y, ROW_H, type PianoState, type Tile,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 360
export const LOGICAL_H = LOGIC_H
const HUD_H = 40

export interface PianoView {
  state: PianoState
  paused: boolean
  /** Best score to show in the corner (panel-managed). */
  best: number
}

/** Center x of a lane column. */
export function laneCenter(lane: number): number {
  return (LOGICAL_W / LANE_COUNT) * (lane + 0.5)
}

function drawLanes(ctx: CanvasRenderingContext2D): void {
  const laneW = LOGICAL_W / LANE_COUNT
  // Faint alternating lane fill.
  for (let i = 0; i < LANE_COUNT; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.045)'
    ctx.fillRect(i * laneW, 0, laneW, LOGIC_H)
  }
  ctx.strokeStyle = 'rgba(226,226,238,0.10)'
  ctx.lineWidth = 1
  for (let i = 1; i < LANE_COUNT; i += 1) {
    ctx.beginPath()
    ctx.moveTo(i * laneW, 0)
    ctx.lineTo(i * laneW, LOGIC_H)
    ctx.stroke()
  }
}

function drawHitZone(ctx: CanvasRenderingContext2D): void {
  const h = MISS_Y - HIT_MIN_Y
  const g = ctx.createLinearGradient(0, HIT_MIN_Y, 0, MISS_Y)
  g.addColorStop(0, 'rgba(122,162,247,0)')
  g.addColorStop(1, 'rgba(122,162,247,0.16)')
  ctx.fillStyle = g
  ctx.fillRect(0, HIT_MIN_Y, LOGICAL_W, h)
  ctx.strokeStyle = 'rgba(122,162,247,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, MISS_Y)
  ctx.lineTo(LOGICAL_W, MISS_Y)
  ctx.stroke()
}

function drawTile(ctx: CanvasRenderingContext2D, tile: Tile): void {
  const laneW = LOGICAL_W / LANE_COUNT
  const pad = 5
  const x = tile.lane * laneW + pad
  const w = laneW - pad * 2
  const h = tile.len * ROW_H - pad * 2
  const color = accent(tile.lane)
  ctx.globalAlpha = tile.hit ? 0.18 : 1
  glow(ctx, color, tile.hit ? 0 : 14)
  roundRectPath(ctx, x, tile.y + pad, w, h, 8)
  ctx.fillStyle = tile.hit ? '#2a2a38' : color
  ctx.fill()
  noGlow(ctx)
  // Top edge highlight on live tiles.
  if (!tile.hit) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(x + 4, tile.y + pad + 2, w - 8, 3)
  }
  ctx.globalAlpha = 1
}

const LANE_KEYS = ['D', 'F', 'J', 'K'] as const

function drawKeyLabels(ctx: CanvasRenderingContext2D): void {
  const laneW = LOGICAL_W / LANE_COUNT
  ctx.textAlign = 'center'
  ctx.font = '700 14px system-ui, sans-serif'
  for (let i = 0; i < LANE_COUNT; i += 1) {
    ctx.fillStyle = 'rgba(226,226,238,0.4)'
    ctx.fillText(LANE_KEYS[i]!, laneCenter(i), LOGIC_H - 10)
    ctx.globalAlpha = 0.25
    ctx.fillStyle = accent(i)
    ctx.fillRect(i * laneW, 0, laneW, 4)
    ctx.globalAlpha = 1
  }
}

/** Draw one frame. */
export function renderPiano(ctx: CanvasRenderingContext2D, view: PianoView): void {
  const state = view.state
  drawBackground(ctx, LOGICAL_W, LOGIC_H)
  drawLanes(ctx)
  // Draw far tiles first so nearer tiles layer on top.
  const ordered = [...state.tiles].sort((a, b) => a.y - b.y)
  for (const tile of ordered) drawTile(ctx, tile)
  drawHitZone(ctx)
  drawKeyLabels(ctx)

  // HUD: score / combo on the left, best on the right.
  hudPair(ctx, 12, 22, '分数 ', String(state.score), 'left', THEME.gold)
  hudPair(ctx, 12, HUD_H + 6, '连击 ', `${String(state.combo)} · ×${String(Math.min(8, 1 + Math.floor(state.combo / 8)))}`, 'left', THEME.text)
  hudPair(ctx, LOGICAL_W - 12, 22, '最高 ', String(view.best), 'right', THEME.text)

  if (state.result === 'over') {
    const why = state.failReason === 'wrong' ? '按错啦' : '漏掉了'
    drawOverlay(ctx, LOGICAL_W, LOGIC_H, '游戏结束', `${why} · 分数 ${String(state.score)} · Enter 再来一局`, THEME.bad)
  } else if (state.result === 'ready') {
    drawOverlay(ctx, LOGICAL_W, LOGIC_H, '钢琴块', 'Enter 开始 · D F J K 或点击轨道', THEME.gold)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGIC_H, '已暂停', '按 P 或面板继续', THEME.text)
  }
}
