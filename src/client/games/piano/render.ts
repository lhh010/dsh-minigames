/**
 * Piano Tiles renderer: 4 lanes with divider lines, the judge window at the
 * bottom, glowing tiles (dimmed once resolved), lane press-flash feedback,
 * hold progress, lives HUD, and the ready/pause/over overlays. All drawing
 * happens in the fixed logical space (LOGICAL_W x FIELD_H).
 */
import {
  GRADE_SHOW_S, HIT_MIN_Y, LANE_COUNT, LINE_Y, LOGIC_H as FIELD_H, LIVES, MISS_Y, ROW_H,
  type Grade, type PianoState, type Tile,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const LOGICAL_W = 360
export const LOGICAL_H = FIELD_H
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

function drawLanes(ctx: CanvasRenderingContext2D, state: PianoState): void {
  const laneW = LOGICAL_W / LANE_COUNT
  // Faint alternating lane fill.
  for (let i = 0; i < LANE_COUNT; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.045)'
    ctx.fillRect(i * laneW, 0, laneW, FIELD_H)
  }
  // Press feedback: a lane key held/pressed lights its whole column (flash
  // decays via state.laneFlash; holds keep a steady glow).
  for (let i = 0; i < LANE_COUNT; i += 1) {
    const holding = state.tiles.some(t => t.holding && t.lane === i)
    const flash = state.laneFlash[i] ?? 0
    const a = holding ? 0.20 : flash > 0 ? (flash / 0.18) * 0.16 : 0
    if (a <= 0.005) continue
    const g = ctx.createLinearGradient(0, FIELD_H * 0.45, 0, FIELD_H)
    g.addColorStop(0, 'rgba(122,162,247,0)')
    g.addColorStop(1, `rgba(122,162,247,${a.toFixed(3)})`)
    ctx.fillStyle = g
    ctx.fillRect(i * laneW, FIELD_H * 0.45, laneW, FIELD_H * 0.55)
    ctx.fillStyle = `rgba(122,162,247,${(a * 0.4).toFixed(3)})`
    ctx.fillRect(i * laneW, 0, laneW, FIELD_H * 0.45)
  }
  ctx.strokeStyle = 'rgba(226,226,238,0.10)'
  ctx.lineWidth = 1
  for (let i = 1; i < LANE_COUNT; i += 1) {
    ctx.beginPath()
    ctx.moveTo(i * laneW, 0)
    ctx.lineTo(i * laneW, FIELD_H)
    ctx.stroke()
  }
}

function drawHitZone(ctx: CanvasRenderingContext2D): void {
  // Soft gradient window + a bright judge line at LINE_Y: presses count
  // while a tile covers the line; the window edges are the early/late
  // tolerance, so the visuals and the logic read the same rule.
  const h = MISS_Y - HIT_MIN_Y
  const g = ctx.createLinearGradient(0, HIT_MIN_Y, 0, MISS_Y)
  g.addColorStop(0, 'rgba(122,162,247,0.02)')
  g.addColorStop(0.5, 'rgba(122,162,247,0.14)')
  g.addColorStop(1, 'rgba(122,162,247,0.02)')
  ctx.fillStyle = g
  ctx.fillRect(0, HIT_MIN_Y, LOGICAL_W, h)
  ctx.strokeStyle = 'rgba(122,162,247,0.28)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 8])
  ctx.beginPath()
  ctx.moveTo(0, HIT_MIN_Y)
  ctx.lineTo(LOGICAL_W, HIT_MIN_Y)
  ctx.moveTo(0, MISS_Y)
  ctx.lineTo(LOGICAL_W, MISS_Y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(122,162,247,0.75)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(0, LINE_Y)
  ctx.lineTo(LOGICAL_W, LINE_Y)
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
  glow(ctx, color, tile.holding ? 26 : tile.hit ? 0 : 14)
  roundRectPath(ctx, x, tile.y + pad, w, h, 8)
  ctx.fillStyle = tile.hit ? '#2a2a38' : color
  ctx.fill()
  noGlow(ctx)
  // Top edge highlight on live tiles; holds pulse along their body.
  if (!tile.hit) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(x + 4, tile.y + pad + 2, w - 8, 3)
  }
  if (tile.holding && tile.len > 1) {
    // Hold progress: brighten the held stretch from the head down to the
    // judge line (the still-approaching tail brightens as it arrives).
    const held = Math.min(h, Math.max(0, LINE_Y - (tile.y + pad)))
    if (held > 4) {
      ctx.fillStyle = 'rgba(255,255,255,0.30)'
      ctx.fillRect(x + 4, tile.y + pad + 4, w - 8, held - 4)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('按住', x + w / 2, tile.y + pad + h / 2 + 4)
  }
  ctx.globalAlpha = 1
}

const LANE_KEYS = ['D', 'F', 'J', 'K'] as const

function drawKeyLabels(ctx: CanvasRenderingContext2D, state: PianoState): void {
  const laneW = LOGICAL_W / LANE_COUNT
  ctx.textAlign = 'center'
  ctx.font = '700 14px system-ui, sans-serif'
  for (let i = 0; i < LANE_COUNT; i += 1) {
    const active = state.laneFlash[i]! > 0 || state.tiles.some(t => t.holding && t.lane === i)
    ctx.fillStyle = active ? accent(i) : 'rgba(226,226,238,0.4)'
    ctx.fillText(LANE_KEYS[i]!, laneCenter(i), FIELD_H - 10)
    ctx.globalAlpha = active ? 0.7 : 0.25
    ctx.fillStyle = accent(i)
    ctx.fillRect(i * laneW, 0, laneW, 4)
    ctx.globalAlpha = 1
  }
}

/** Grade text: color per grade. */
const GRADE_COLORS: Record<Grade, string> = {
  PERFECT: '#ffe066',
  GREAT: '#7dcfff',
  GOOD: '#c0caf5',
  BAD: '#ff9e64',
  MISS: '#f7768e',
}

function drawJudge(ctx: CanvasRenderingContext2D, state: PianoState): void {
  const j = state.judge
  if (j === null) return
  const age = state.t - j.at
  if (age < 0 || age > GRADE_SHOW_S) return
  // Pop in (0-0.1s scale up), float up, fade out.
  const pop = Math.min(1, age / 0.1)
  const rise = age * 26
  const alpha = age < GRADE_SHOW_S * 0.6 ? 1 : 1 - (age - GRADE_SHOW_S * 0.6) / (GRADE_SHOW_S * 0.4)
  const size = (j.grade === 'PERFECT' ? 26 : 21) * (0.6 + 0.4 * pop)
  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.translate(laneCenter(j.lane), LINE_Y - 46 - rise)
  ctx.scale(1, 1)
  ctx.font = `900 ${size.toFixed(0)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const color = GRADE_COLORS[j.grade]
  if (j.grade === 'PERFECT' || j.grade === 'MISS' || j.grade === 'BAD') {
    ctx.shadowColor = color
    ctx.shadowBlur = 14
  }
  ctx.fillStyle = color
  ctx.fillText(j.grade, 0, 0)
  ctx.restore()
}

/** Draw one frame. */
export function renderPiano(ctx: CanvasRenderingContext2D, view: PianoView): void {
  const state = view.state
  drawBackground(ctx, LOGICAL_W, FIELD_H)
  drawLanes(ctx, state)
  // Draw far tiles first so nearer tiles layer on top.
  const ordered = [...state.tiles].sort((a, b) => a.y - b.y)
  for (const tile of ordered) drawTile(ctx, tile)
  drawHitZone(ctx)
  drawJudge(ctx, state)
  drawKeyLabels(ctx, state)

  // HUD: score / combo on the left, lives + best on the right.
  hudPair(ctx, 12, 22, '分数 ', String(state.score), 'left', THEME.gold)
  hudPair(ctx, 12, HUD_H + 6, '连击 ', `${String(state.combo)} · ×${String(Math.min(8, 1 + Math.floor(state.combo / 8)))}`, 'left', THEME.text)
  const hearts = '♥'.repeat(Math.max(0, LIVES - state.misses)) + '·'.repeat(Math.min(LIVES, state.misses))
  hudPair(ctx, LOGICAL_W - 12, 22, '命 ', hearts, 'right', THEME.bad)
  hudPair(ctx, LOGICAL_W - 12, HUD_H + 6, '最高 ', String(view.best), 'right', THEME.text)

  if (state.result === 'over') {
    drawOverlay(ctx, LOGICAL_W, FIELD_H, '游戏结束', `失误 ${String(state.misses)} 次 · 分数 ${String(state.score)} · Enter 再来一局`, THEME.bad)
  } else if (state.result === 'ready') {
    drawOverlay(ctx, LOGICAL_W, FIELD_H, '钢琴块', 'Enter 开始 · D F J K · 长块按住 · 空按免罚', THEME.gold)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, FIELD_H, '已暂停', '按 P 或面板继续', THEME.text)
  }
}
