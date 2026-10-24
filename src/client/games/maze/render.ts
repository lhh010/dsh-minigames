/**
 * Maze canvas renderer: neon wall segments on a dark grid, a glowing player
 * dot with a fading trail, a pulsing exit marker at the far corner, a
 * 关卡/步数 HUD, and the shared pause / level-clear overlays. Uses the shared
 * visual kit (../theme.ts).
 */
import { E, N, S, W, type Maze } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export const CELL = 34
export const HUD_H = 44
/** Fixed logical canvas sized to the largest level maze; smaller mazes center. */
export const MAX_COLS = 19
export const MAX_ROWS = 17
export const LOGICAL_W = MAX_COLS * CELL
export const LOGICAL_H = HUD_H + MAX_ROWS * CELL

const PLAYER_ACCENT = accent(0)
const WALL_COLOR = accent(5)
const GOAL_COLOR = THEME.gold
/** All four wall bits (closed-wall computation). */
const ALL = N | E | S | W
/** Trail length (positions kept fading behind the player). */
export const TRAIL_MAX = 14

/** What the game wants rendered this frame. */
export interface MazeView {
  /** Player cell position. */
  player: { x: number; y: number }
  /** Recent player positions, oldest first (length ≤ TRAIL_MAX). */
  trail: { x: number; y: number }[]
  /** 1-based level number for the HUD. */
  level: number
  /** Steps taken this level. */
  moves: number
  /** Shortest possible path length for the current maze. */
  shortest: number
  /** Level-complete overlay text (null while playing). */
  winText: string | null
  /** Show the pause overlay (the win overlay wins when both apply). */
  paused: boolean
}

/** Top-left pixel of the maze grid region for a w×h maze. */
export function gridOffset(maze: Maze): { ox: number; oy: number } {
  return {
    ox: ((MAX_COLS - maze.w) / 2) * CELL,
    oy: HUD_H + ((MAX_ROWS - maze.h) / 2) * CELL,
  }
}

/** Cell center in canvas pixels. */
export function cellCenter(maze: Maze, x: number, y: number): { px: number; py: number } {
  const { ox, oy } = gridOffset(maze)
  return { px: ox + x * CELL + CELL / 2, py: oy + y * CELL + CELL / 2 }
}

// Render-side burst pool: fires once per win transition.
const particles = createParticles()
let prevWin = false

/** Draw one frame. */
export function renderMaze(ctx: CanvasRenderingContext2D, maze: Maze, view: MazeView): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const { ox, oy } = gridOffset(maze)
  const wallLen = {
    [N]: (x: number, y: number) => [ox + x * CELL, oy + y * CELL, ox + (x + 1) * CELL, oy + y * CELL],
    [S]: (x: number, y: number) => [ox + x * CELL, oy + (y + 1) * CELL, ox + (x + 1) * CELL, oy + (y + 1) * CELL],
    [W]: (x: number, y: number) => [ox + x * CELL, oy + y * CELL, ox + x * CELL, oy + (y + 1) * CELL],
    [E]: (x: number, y: number) => [ox + (x + 1) * CELL, oy + y * CELL, ox + (x + 1) * CELL, oy + (y + 1) * CELL],
  } as const

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD.
  hudPair(ctx, 12, 18, '关卡 ', `${view.level}/5`)
  hudPair(ctx, 100, 18, '步数 ', String(view.moves))
  hudPair(ctx, LOGICAL_W - 12, 18, '最短 ', String(view.shortest), 'right')
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('方向键/WASD 移动 · R 重开本关 · P 暂停', 12, 36)

  // Faint cell floor.
  ctx.fillStyle = 'rgba(255,255,255,0.02)'
  for (let y = 0; y < maze.h; y += 1) {
    for (let x = 0; x < maze.w; x += 1) {
      ctx.fillRect(ox + x * CELL, oy + y * CELL, CELL, CELL)
    }
  }

  // Neon walls: stroke every closed wall segment (each interior wall drawn
  // once via its owning side; borders always drawn from the inside cell).
  ctx.strokeStyle = WALL_COLOR
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  glow(ctx, WALL_COLOR, 5)
  ctx.beginPath()
  for (let y = 0; y < maze.h; y += 1) {
    for (let x = 0; x < maze.w; x += 1) {
      const mask = maze.walls[y * maze.w + x]!
      const closed = ALL & ~mask
      const segs: number[][] = []
      if (closed & N) segs.push(wallLen[N](x, y))
      if (closed & S) segs.push(wallLen[S](x, y))
      if (closed & W) segs.push(wallLen[W](x, y))
      if (closed & E) segs.push(wallLen[E](x, y))
      for (const seg of segs) {
        ctx.moveTo(seg[0]!, seg[1]!)
        ctx.lineTo(seg[2]!, seg[3]!)
      }
    }
  }
  ctx.stroke()
  noGlow(ctx)

  // Pulsing exit marker at the far corner.
  const goal = cellCenter(maze, maze.w - 1, maze.h - 1)
  const pulse = 0.5 + 0.5 * Math.sin(now / 260)
  ctx.strokeStyle = GOAL_COLOR
  ctx.lineWidth = 2
  glow(ctx, GOAL_COLOR, 6 + pulse * 8)
  const r = 5 + pulse * 3
  ctx.beginPath()
  ctx.arc(goal.px, goal.py, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = GOAL_COLOR
  ctx.globalAlpha = 0.25 + 0.35 * pulse
  ctx.beginPath()
  ctx.arc(goal.px, goal.py, r - 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  noGlow(ctx)

  // Player trail: fading dots behind the current position.
  for (let i = 0; i < view.trail.length; i += 1) {
    const t = view.trail[i]!
    const c = cellCenter(maze, t.x, t.y)
    const alpha = ((i + 1) / view.trail.length) * 0.4
    ctx.globalAlpha = alpha
    ctx.fillStyle = PLAYER_ACCENT
    glow(ctx, PLAYER_ACCENT, 5)
    ctx.beginPath()
    ctx.arc(c.px, c.py, 4, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.globalAlpha = 1

  // Player dot.
  const p = cellCenter(maze, view.player.x, view.player.y)
  glow(ctx, PLAYER_ACCENT, 14)
  ctx.fillStyle = PLAYER_ACCENT
  ctx.beginPath()
  ctx.arc(p.px, p.py, 7, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)

  // Burst once on the win transition, then tick.
  if (view.winText === null) prevWin = false
  if (view.winText !== null && !prevWin) {
    particles.burst(goal.px, goal.py, THEME.gold, 26, 180)
  }
  prevWin = view.winText !== null
  particles.tick(ctx, 16)

  if (view.winText !== null) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', view.winText, THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续', THEME.text)
  }
}
