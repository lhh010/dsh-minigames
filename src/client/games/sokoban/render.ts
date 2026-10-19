/**
 * Sokoban canvas renderer: the warehouse grid (panel-brick walls, glowing
 * outline goals, glowing rounded boxes, a glowing player figure), a HUD
 * (关卡/步数/得分), a clear overlay with a particle burst, and a gold win
 * overlay after the last level. Uses the shared visual kit (../theme.ts).
 */
import type { SokobanState } from './logic.ts'
import { LEVELS } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow,
  roundRectPath,
} from '../theme.ts'

export const CELL = 48
export const HUD_H = 44
/** Fixed logical canvas sized to the largest built-in level; smaller levels center. */
const MAX_ROWS = Math.max(...LEVELS.map(t => t.split('\n').filter(l => l.trim().length > 0).length))
const MAX_COLS = Math.max(...LEVELS.map(t => Math.max(...t.split('\n').filter(l => l.trim().length > 0).map(l => l.length))))
export const LOGICAL_W = MAX_COLS * CELL
export const LOGICAL_H = HUD_H + MAX_ROWS * CELL

const BOX_ACCENT = accent(1) // stable accent for boxes
const PLAYER_ACCENT = accent(0)

// Render-side event observation: burst once when a level is cleared.
const particles = createParticles()
let prevCleared = false
let prevFrameMs = 0

/** What the game wants rendered this frame. */
export interface SokobanView {
  totalLevels: number
  /** All levels cleared: show the gold win overlay. */
  won: boolean
  /** The last push's animation progress (0..1), or null when idle. */
  push: { playerTo: { r: number; c: number }; boxTo: { r: number; c: number } | null; t: number } | null
}

function gridOffsets(state: SokobanState): { ox: number; oy: number } {
  return {
    ox: ((MAX_COLS - state.cols) / 2) * CELL,
    oy: HUD_H + ((MAX_ROWS - state.rows) / 2) * CELL,
  }
}

/** Draw one brick-style wall cell: panel fill with an edge stroke. */
function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = THEME.panel
  ctx.fillRect(x, y, CELL, CELL)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2)
  // Brick seam.
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + 3, y + CELL / 2 + 0.5)
  ctx.lineTo(x + CELL - 3, y + CELL / 2 + 0.5)
  ctx.stroke()
}

/** Draw a goal cell as a glowing rounded outline. */
function drawGoal(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const size = CELL - 22
  ctx.strokeStyle = THEME.gold
  ctx.lineWidth = 2
  glow(ctx, THEME.gold, 8)
  roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 6)
  ctx.stroke()
  noGlow(ctx)
}

/** Draw a glowing rounded box; green glow when it sits on a goal. */
function drawBox(ctx: CanvasRenderingContext2D, cx: number, cy: number, onGoal: boolean): void {
  const color = onGoal ? THEME.good : BOX_ACCENT
  const size = CELL - 12
  glow(ctx, color, onGoal ? 14 : 8)
  ctx.fillStyle = color
  roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 8)
  ctx.fill()
  noGlow(ctx)
  // Inner detail line.
  ctx.strokeStyle = 'rgba(13,13,20,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - size / 4, cy)
  ctx.lineTo(cx + size / 4, cy)
  ctx.stroke()
}

/** Draw the player as a glowing rounded figure (body + head). */
function drawPlayer(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const bodyW = CELL - 22
  const bodyH = CELL - 30
  glow(ctx, PLAYER_ACCENT, 12)
  ctx.fillStyle = PLAYER_ACCENT
  roundRectPath(ctx, cx - bodyW / 2, cy - bodyH / 2 + 4, bodyW, bodyH, 7)
  ctx.fill()
  noGlow(ctx)
  glow(ctx, PLAYER_ACCENT, 8)
  ctx.beginPath()
  ctx.arc(cx, cy - bodyH / 2 + 2, 7, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
}

/** Draw one frame. `push` positions interpolate to their target. */
export function renderSokoban(
  ctx: CanvasRenderingContext2D,
  state: SokobanState,
  view: SokobanView,
): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(64, now - prevFrameMs)
  prevFrameMs = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  hudPair(ctx, 12, 18, '关卡 ', `${state.levelIndex + 1}/${view.totalLevels}`)
  hudPair(ctx, 130, 18, '步数 ', String(state.moves))
  hudPair(ctx, LOGICAL_W - 12, 18, '得分 ', String(state.score), 'right')
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('方向键/WASD 移动 · Z 撤销 · R 重开', 12, 36)

  const { ox, oy } = gridOffsets(state)
  const animating = view.push !== null
  const skip = new Set<string>()
  if (animating) {
    skip.add(`${view.push!.playerTo.r},${view.push!.playerTo.c}`)
    if (view.push!.boxTo !== null) skip.add(`${view.push!.boxTo.r},${view.push!.boxTo.c}`)
  }

  // Floor + goals + walls.
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const x = ox + c * CELL
      const y = oy + r * CELL
      if (state.walls[r]![c]!) {
        drawWall(ctx, x, y)
        continue
      }
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      ctx.fillRect(x, y, CELL, CELL)
      if (state.goals[r]![c]!) drawGoal(ctx, x + CELL / 2, y + CELL / 2)
    }
  }

  // Boxes.
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (!state.boxes[r]![c]! || skip.has(`${r},${c}`)) continue
      drawBox(ctx, ox + c * CELL + CELL / 2, oy + r * CELL + CELL / 2, state.goals[r]![c]!)
    }
  }

  // Player (and the animated player/box on top).
  if (!animating) {
    drawPlayer(ctx, ox + state.player.c * CELL + CELL / 2, oy + state.player.r * CELL + CELL / 2)
  } else {
    const k = view.push!.t
    const px = ox + state.player.c * CELL + CELL / 2
    const py = oy + state.player.r * CELL + CELL / 2
    const step = CELL * (1 - k)
    const dx = view.push!.playerTo.c === state.player.c ? 0 : view.push!.playerTo.c < state.player.c ? step : -step
    const dy = view.push!.playerTo.r === state.player.r ? 0 : view.push!.playerTo.r < state.player.r ? step : -step
    drawPlayer(ctx, px + dx, py + dy)
    if (view.push!.boxTo !== null) {
      const bt = view.push!.boxTo
      const bx = ox + bt.c * CELL + CELL / 2
      const by = oy + bt.r * CELL + CELL / 2
      const bdx = bt.c === state.player.c ? 0 : bt.c < state.player.c ? step : -step
      const bdy = bt.r === state.player.r ? 0 : bt.r < state.player.r ? step : -step
      drawBox(ctx, bx + bdx, by + bdy, state.goals[bt.r]![bt.c]!)
    }
  }

  // Burst once on the cleared transition; tick particles every frame.
  if (state.cleared && !prevCleared) {
    particles.burst(ox + state.player.c * CELL + CELL / 2, oy + state.player.r * CELL + CELL / 2, THEME.gold, 26, 180)
  }
  prevCleared = state.cleared
  particles.tick(ctx, dtMs)

  if (view.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '全部通关', `总分 ${state.score} · 按 R 重新开始`, THEME.gold)
  } else if (state.cleared) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', '按 N 或稍后进入下一关', THEME.good)
  }
}
