/**
 * 过河青蛙 canvas renderer: road lanes as alternating strips, glowing cars
 * with direction headlights, the frog as a rounded body with eyes, safe rows
 * (goal/start), and game-over/pause overlays. Cars are drawn from the pure
 * lane specs at the current sim time — the renderer owns no state.
 */
import type { FroggerLevel, LaneSpec } from './logic.ts'
import { COLS, LANES, TRACK, carRange } from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
export const CELL = 42
export const FIELD_W = COLS * CELL
export const FIELD_H = (LANES + 2) * CELL
export const LOGICAL_W = FIELD_W + 12
export const LOGICAL_H = HUD_H + FIELD_H + 12

/** Row y origin (each row is one lane; row 0 = goal, row LANES+1 = start). */
export function rowY(row: number): number {
  return HUD_H + 6 + row * CELL
}

/** Center of a board cell (row 0..LANES+1, col 0..COLS-1). */
export function cellCenter(row: number, col: number): { x: number; y: number } {
  return { x: 6 + col * CELL + CELL / 2, y: rowY(row) + CELL / 2 }
}

/** Draw one frame.
 * @param t - simulation seconds (car positions).
 * @param frog - frog position {row, col} (row 0 = goal, LANES+1 = start).
 * @param dead - death flash: frog drawn red instead of green.
 * @param lives - remaining lives for the HUD.
 * @param score - total score for the HUD.
 * @param levelNo - 1-based display level.
 * @param paused - show the pause overlay.
 * @param gameOver - game-over overlay instead of pause.
 */
export function renderFrogger(
  ctx: CanvasRenderingContext2D, level: FroggerLevel, t: number,
  frog: { row: number; col: number }, dead: boolean,
  lives: number, score: number, levelNo: number,
  paused: boolean, gameOver: boolean,
): void {
  const w = LOGICAL_W
  const h = LOGICAL_H
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, 6, 21, '分数 ', String(score))
  hudPair(ctx, w / 2, 21, '第 ' + levelNo + ' 关', '', 'center')
  hudPair(ctx, w - 6, 21, '生命 ', '🐸'.repeat(Math.max(0, lives)), 'right')

  // Goal and start safe rows.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 6, rowY(0), FIELD_W, CELL, 8)
  ctx.fill()
  ctx.fillStyle = accent(2) + '22'
  roundRectPath(ctx, 6, rowY(0), FIELD_W, CELL, 8)
  ctx.fill()
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 6, rowY(LANES + 1), FIELD_W, CELL, 8)
  ctx.fill()

  // Road lanes.
  for (let lane = 0; lane < LANES; lane += 1) {
    const spec = level.lanes[lane]!
    const row = LANES - lane // lane 0 is nearest the goal
    ctx.fillStyle = lane % 2 === 0 ? '#1b1b26' : '#17171f'
    ctx.fillRect(6, rowY(row), FIELD_W, CELL)
    ctx.strokeStyle = THEME.panelEdge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(6, rowY(row))
    ctx.lineTo(6 + FIELD_W, rowY(row))
    ctx.stroke()
    for (const start of spec.starts) {
      drawCar(ctx, spec, start, t, row, lane)
    }
  }

  drawFrog(ctx, cellCenter(frog.row, frog.col), dead)

  if (gameOver) {
    drawOverlay(ctx, w, h, '游戏结束', '按 R 重来 · 得分 ' + score, THEME.bad)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '按 P 继续', THEME.text)
  }
}

function drawCar(ctx: CanvasRenderingContext2D, spec: LaneSpec, start: number, t: number, row: number, lane: number): void {
  const range = carRange(spec, start, t)
  if (range === null) return
  const x0 = 6 + range.from * CELL + 3
  const width = (range.to - range.from + 1) * CELL - 6
  const y = rowY(row) + 8
  const h = CELL - 16
  const color = accent(lane + 3)
  glow(ctx, color, 8)
  ctx.fillStyle = color
  roundRectPath(ctx, x0, y, width, h, 7)
  ctx.fill()
  noGlow(ctx)
  // Headlights point along the travel direction.
  ctx.fillStyle = THEME.gold
  const lampY = y + h / 2
  if (spec.dir === 1) {
    ctx.fillRect(x0 + width - 5, lampY - 5, 3, 3)
    ctx.fillRect(x0 + width - 5, lampY + 2, 3, 3)
  } else {
    ctx.fillRect(x0 + 2, lampY - 5, 3, 3)
    ctx.fillRect(x0 + 2, lampY + 2, 3, 3)
  }
}

function drawFrog(ctx: CanvasRenderingContext2D, center: { x: number; y: number }, dead: boolean): void {
  const body = dead ? THEME.bad : accent(2)
  glow(ctx, body, 10)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(center.x, center.y + 3, CELL * 0.3, CELL * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  ctx.fillStyle = THEME.text
  ctx.beginPath()
  ctx.arc(center.x - 7, center.y - 7, 3.4, 0, Math.PI * 2)
  ctx.arc(center.x + 7, center.y - 7, 3.4, 0, Math.PI * 2)
  ctx.fill()
}

void TRACK
