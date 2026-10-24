/**
 * 桥 (Hashi) canvas renderer on the shared theme kit: gradient background, a
 * faint corner lattice, bridges as one or two parallel glowing strokes,
 * numbered island discs that ring green when satisfied and red when
 * over-bridged, a pulsing selection ring, the 关卡/桥数 HUD with a
 * 唯一解/多解 badge, and the shared win overlay with a particle burst.
 */
import type { HashiPuzzle, Island, Placed } from './logic.ts'
import { LEVEL_SIZES, degrees, placedBridges } from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** Cell edge of the largest (9x9) board; smaller boards scale into the same frame. */
const CELL = 46
const BOARD = 9 * CELL
const PAD = 22
const HUD_H = 34
export const LOGICAL_W = BOARD + PAD * 2
export const LOGICAL_H = HUD_H + PAD * 2 + BOARD

/** Board origin (below the HUD, inside the padding). */
const OX = PAD
const OY = HUD_H + PAD

const BRIDGE = accent(1)
const ISLAND = accent(0)

/** Cell edge for one level's board size. */
export function cellSize(size: number): number {
  return BOARD / size
}

/** Logical centre of an island. */
export function centerOf(island: Island, size: number): { x: number, y: number } {
  const cs = cellSize(size)
  return { x: OX + (island.x + 0.5) * cs, y: OY + (island.y + 0.5) * cs }
}

/**
 * The island under a logical point, or null. The hit radius is generous so
 * small 9x9 cells stay clickable.
 * @param islands - the level's islands.
 * @param size - board edge length in cells.
 * @param x - logical x.
 * @param y - logical y.
 */
export function islandAt(islands: Island[], size: number, x: number, y: number): number | null {
  const cs = cellSize(size)
  const r = Math.max(10, cs * 0.42)
  for (let i = 0; i < islands.length; i += 1) {
    const c = centerOf(islands[i]!, size)
    if (Math.hypot(x - c.x, y - c.y) <= r) return i
  }
  return null
}

// Render-side effect state: win burst + per-frame particle ticking.
const particles = createParticles()
let prevWon = false
let lastFrame = 0

/** Draw one frame. */
export function renderHashi(
  ctx: CanvasRenderingContext2D,
  puzzle: HashiPuzzle,
  placed: Placed,
  selected: number | null,
  level: number,
  elapsed: number,
  paused: boolean,
  winText: string | null,
): void {
  const { size, islands } = puzzle
  const cs = cellSize(size)
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  const now = performance.now()
  const dt = Math.min(50, lastFrame === 0 ? 16 : now - lastFrame)
  lastFrame = now

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Board panel.
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, OX + 2, OY + 2, BOARD - 4, BOARD - 4, 12)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()

  // Corner lattice: a faint dot per grid intersection.
  ctx.fillStyle = 'rgba(226,226,238,0.13)'
  for (let gx = 0; gx <= size; gx += 1) {
    for (let gy = 0; gy <= size; gy += 1) {
      ctx.beginPath()
      ctx.arc(OX + gx * cs, OY + gy * cs, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const deg = degrees(islands, placed)
  const r = Math.max(9, cs * 0.3)

  // Bridges, drawn under the islands.
  ctx.lineCap = 'round'
  for (const bridge of placedBridges(islands, placed)) {
    const a = centerOf(islands[bridge.a]!, size)
    const b = centerOf(islands[bridge.b]!, size)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const trim = r + 4
    const sx = a.x + ux * trim
    const sy = a.y + uy * trim
    const ex = b.x - ux * trim
    const ey = b.y - uy * trim
    const gap = bridge.count === 2 ? 4.5 : 0
    ctx.strokeStyle = BRIDGE
    ctx.lineWidth = bridge.count === 2 ? 3 : 4
    glow(ctx, BRIDGE, 6)
    for (const sign of bridge.count === 2 ? [-1, 1] : [0]) {
      ctx.beginPath()
      ctx.moveTo(sx - uy * gap * sign, sy + ux * gap * sign)
      ctx.lineTo(ex - uy * gap * sign, ey + ux * gap * sign)
      ctx.stroke()
    }
    noGlow(ctx)
  }

  // Islands: dark discs, state-coloured rings, centred numbers.
  const pulse = 0.5 + 0.5 * Math.sin(now / 260)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < islands.length; i += 1) {
    const island = islands[i]!
    const c = centerOf(island, size)
    const over = deg[i]! > island.n
    const done = deg[i]! === island.n
    const color = over ? THEME.bad : done ? THEME.good : ISLAND
    ctx.fillStyle = THEME.panel
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    glow(ctx, color, done ? 10 : 6)
    ctx.stroke()
    noGlow(ctx)
    if (i === selected && winText === null) {
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      glow(ctx, THEME.gold, 14)
      ctx.beginPath()
      ctx.arc(c.x, c.y, r + 4 + pulse * 2, 0, Math.PI * 2)
      ctx.stroke()
      noGlow(ctx)
    }
    ctx.fillStyle = over ? THEME.bad : THEME.text
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`
    ctx.fillText(String(island.n), c.x, c.y + 0.5)
  }
  ctx.textBaseline = 'alphabetic'

  // Win burst (observed from the win text; logic untouched).
  const won = winText !== null
  if (won && !prevWon) particles.burst(OX + BOARD / 2, OY + BOARD / 2, THEME.gold, 26, 170)
  prevWon = won
  particles.tick(ctx, dt)

  // HUD: level, bridge count, uniqueness badge.
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  hudPair(ctx, PAD, 22, '关卡', `${level}/${LEVEL_SIZES.length}`, 'left')
  hudPair(ctx, LOGICAL_W - PAD, 22, '桥数 ', String(placed.size), 'right')
  const badge = puzzle.unique ? '唯一解' : '多解'
  ctx.font = '600 12px system-ui, sans-serif'
  const badgeW = ctx.measureText(badge).width + 16
  ctx.fillStyle = puzzle.unique ? 'rgba(158,206,106,0.16)' : 'rgba(226,226,238,0.08)'
  roundRectPath(ctx, LOGICAL_W / 2 - badgeW / 2, 8, badgeW, 18, 9)
  ctx.fill()
  ctx.fillStyle = puzzle.unique ? THEME.good : THEME.textMuted
  ctx.textAlign = 'center'
  ctx.fillText(badge, LOGICAL_W / 2, 22)

  if (winText !== null) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H - HUD_H, '完成！', `${winText} · 即将进入下一关`, THEME.gold)
    ctx.restore()
  } else if (paused) {
    ctx.save()
    ctx.translate(0, HUD_H)
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H - HUD_H, '已暂停', '面板恢复后继续', THEME.text)
    ctx.restore()
  }
}
