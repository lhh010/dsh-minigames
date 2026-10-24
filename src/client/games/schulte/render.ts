/**
 * 舒尔特方格 canvas renderer: an n×n board of numbered rounded cells
 * (locked cells glow green), a 关卡/用时/误点 HUD, and overlays for pause
 * and finish. Timer values and the wrong-click flash state are caller-owned;
 * the renderer stays stateless and uses the shared visual kit (../theme.ts).
 */
import { gridSizeFor } from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

export const HUD_H = 32
/** Fixed square board area; the per-level cell size derives from it. */
export const BOARD_W = 336
export const GAP = 12
export const LOGICAL_W = BOARD_W + GAP
export const LOGICAL_H = HUD_H + BOARD_W + GAP + 16

/** One in-flight wrong-click flash; ageMs counts from the click. */
export interface WrongFlash {
  index: number
  ageMs: number
}

/** Cell side for a level's grid side. */
export function cellSize(level: number): number {
  return BOARD_W / gridSizeFor(level)
}

function cellRect(index: number, level: number): { x: number; y: number; s: number } {
  const n = gridSizeFor(level)
  const s = cellSize(level)
  const r = Math.floor(index / n)
  const c = index % n
  return { x: GAP / 2 + c * s, y: HUD_H + GAP / 2 + r * s, s }
}

/** Which cell a logical-space point lands on, or -1. */
export function cellAt(x: number, y: number, level: number): number {
  const n = gridSizeFor(level)
  const s = cellSize(level)
  const c = Math.floor((x - GAP / 2) / s)
  const r = Math.floor((y - HUD_H - GAP / 2) / s)
  if (r < 0 || r >= n || c < 0 || c >= n) return -1
  // Point may sit past the board's right/bottom edge inside the final gap.
  if (x > GAP / 2 + n * s || y > HUD_H + GAP / 2 + n * s) return -1
  return r * n + c
}

/** Center of a cell in logical space (particle bursts). */
export function cellCenter(index: number, level: number): { x: number; y: number } {
  const { x, y, s } = cellRect(index, level)
  return { x: x + s / 2, y: y + s / 2 }
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}`
}

/**
 * Draw one frame.
 * @param grid - shuffled 1..n² values from makeGrid.
 * @param level - 1-based level (derives the grid size and seed).
 * @param lockedCount - numbers 1..lockedCount are already locked (next = +1).
 * @param wrong - active wrong-click red flash, or null.
 * @param elapsedMs - penalized elapsed time for the 用时 HUD.
 * @param wrongCount - total wrong clicks for the 误点 HUD.
 * @param paused - show the pause overlay.
 * @param winText - finish overlay subtitle, or null while playing.
 */
export function renderSchulte(
  ctx: CanvasRenderingContext2D, w: number, h: number, grid: number[],
  level: number, lockedCount: number, wrong: WrongFlash | null,
  elapsedMs: number, wrongCount: number, paused: boolean, winText: string | null,
): void {
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, w, h)

  hudPair(ctx, GAP / 2, 21, '关卡 ', `${level} (${gridSizeFor(level)}×${gridSizeFor(level)})`)
  hudPair(ctx, w / 2, 21, '用时 ', `${formatSeconds(elapsedMs)} 秒`, 'left', THEME.gold)
  hudPair(ctx, w - GAP / 2, 21, '误点 ', String(wrongCount), 'right', wrongCount > 0 ? THEME.bad : THEME.text)

  for (let i = 0; i < grid.length; i += 1) {
    const { x, y, s } = cellRect(i, level)
    const locked = grid[i]! <= lockedCount
    const flashing = wrong !== null && wrong.index === i && wrong.ageMs <= 200
    const color = flashing ? THEME.bad : locked ? THEME.good : THEME.panelEdge
    glow(ctx, flashing ? THEME.bad : locked ? THEME.good : THEME.panelEdge, flashing ? 22 : locked ? 14 : 3)
    ctx.fillStyle = flashing || locked ? color : THEME.panel
    roundRectPath(ctx, x + 3, y + 3, s - 6, s - 6, 10)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = locked || flashing ? color : THEME.panelEdge
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.floor(s * 0.34)}px system-ui, sans-serif`
    ctx.fillStyle = locked || flashing ? '#14141c' : THEME.text
    ctx.fillText(String(grid[i]!), x + s / 2, y + s / 2)
  }

  if (winText !== null) {
    drawOverlay(ctx, w, h, '完成', winText, THEME.good)
  } else if (paused) {
    drawOverlay(ctx, w, h, '已暂停', '面板恢复后继续', THEME.text)
  }
}
