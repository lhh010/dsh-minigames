/**
 * Pac-Man canvas renderer: the shared gradient background, dark wall blocks
 * with a soft rim, glowing dots and power pellets, a gold Pac-Man and stable
 * accent ghosts, a score/lives HUD, and overlays from the theme kit. Eat
 * bursts are render-side observations only (previous score module variable).
 */
import type { PacmanState, Dir } from './logic.ts'
import { CELL, COLS, ROWS } from './logic.ts'
import { THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow } from '../theme.ts'

export const HUD_H = 30
export const LOGICAL_W = COLS * CELL
export const LOGICAL_H = HUD_H + ROWS * CELL

const WALL = '#23233a'
const WALL_EDGE = '#34344e'
const DOT = '#c8b088'

// Render-side effect state: particles, the frame clock, and the previous
// score used to detect eats.
const particles = createParticles()
let prevScore = 0
let prevFrameMs = 0

/** Draw one frame; `t` is a running seconds counter for flicker effects. */
export function renderPacman(ctx: CanvasRenderingContext2D, state: PacmanState, t: number): void {
  const nowMs = performance.now()
  const dtMs = prevFrameMs === 0 ? 16 : Math.min(50, nowMs - prevFrameMs)
  prevFrameMs = nowMs

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // Eat burst at the player (observed score change; logic untouched).
  if (state.score > prevScore) {
    const gain = state.score - prevScore
    particles.burst(state.px, HUD_H + state.py, gain >= 100 ? accent(4) : THEME.gold, gain >= 100 ? 22 : 10, gain >= 100 ? 170 : 120)
  }
  prevScore = state.score

  // Maze.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const x = c * CELL
      const y = HUD_H + r * CELL
      const cell = state.grid[r]![c]!
      if (cell === '#') {
        ctx.fillStyle = WALL
        ctx.fillRect(x, y, CELL, CELL)
        ctx.fillStyle = WALL_EDGE
        ctx.fillRect(x + 1, y + 1, CELL - 2, 3)
      } else if (cell === '.') {
        ctx.fillStyle = DOT
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, 2.5, 0, Math.PI * 2)
        ctx.fill()
      } else if (cell === 'o') {
        const pulse = 4 + Math.sin(t * 8) * 1.5
        glow(ctx, THEME.gold, 8)
        ctx.fillStyle = THEME.gold
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, pulse, 0, Math.PI * 2)
        ctx.fill()
        noGlow(ctx)
      }
    }
  }

  // Ghosts: wavy skirt + eyes that follow the travel direction; one stable
  // accent per ghost id, blue-and-white flicker while frightened.
  const DIR_OFFSET: Record<Dir, readonly [number, number]> = {
    0: [0, -2],
    1: [2, 0],
    2: [0, 2],
    3: [-2, 0],
  }
  state.ghosts.forEach((ghost, i) => {
    const frightened = state.fright > 0
    const flicker = frightened && Math.floor(t * 8) % 2 === 0
    const bodyColor = frightened ? (flicker ? '#ffffff' : accent(5)) : accent(4 + i)
    ctx.fillStyle = bodyColor
    glow(ctx, bodyColor, 10)
    const gy = HUD_H + ghost.y
    const r = CELL * 0.42
    ctx.beginPath()
    ctx.arc(ghost.x, gy, r, Math.PI, 0)
    // Skirt: three teeth whose points wave as the ghost "walks".
    const phase = t * 10 + i * 2
    ctx.lineTo(ghost.x + r, gy + r)
    ctx.lineTo(ghost.x + r - r * (2 / 3), gy + r - 4 + Math.sin(phase) * 2.5)
    ctx.lineTo(ghost.x + r - r * (1 / 3), gy + r)
    ctx.lineTo(ghost.x, gy + r - 4 + Math.sin(phase + Math.PI) * 2.5)
    ctx.lineTo(ghost.x - r + r * (1 / 3), gy + r)
    ctx.lineTo(ghost.x - r + r * (2 / 3), gy + r - 4 + Math.sin(phase + Math.PI * 0.5) * 2.5)
    ctx.lineTo(ghost.x - r, gy + r)
    ctx.closePath()
    ctx.fill()
    noGlow(ctx)
    // Eyes look the way the ghost is moving.
    if (!frightened) {
      const [ex, ey] = DIR_OFFSET[ghost.dir]
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ghost.x - 4, gy - 2, 3.5, 0, Math.PI * 2)
      ctx.arc(ghost.x + 4, gy - 2, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = THEME.bgBottom
      ctx.beginPath()
      ctx.arc(ghost.x - 4 + ex, gy - 2 + ey, 1.8, 0, Math.PI * 2)
      ctx.arc(ghost.x + 4 + ex, gy - 2 + ey, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  // Pac-Man: gold disc with a chewing mouth facing the travel direction.
  // The mouth is the *complement* of the swept wedge: fill everything except
  // the opening angle, so the disc keeps its round shape with a bite.
  const mouth = 0.12 + 0.5 * Math.abs(Math.sin(t * 12))
  const angles: Record<Dir, [number, number]> = {
    0: [-Math.PI / 2 - mouth, -Math.PI / 2 + mouth],
    1: [-mouth, mouth],
    2: [Math.PI / 2 - mouth, Math.PI / 2 + mouth],
    3: [Math.PI - mouth, Math.PI + mouth],
  }
  const [a0, a1] = angles[state.dir]
  ctx.fillStyle = THEME.gold
  glow(ctx, THEME.gold, 12)
  ctx.beginPath()
  ctx.moveTo(state.px, HUD_H + state.py)
  // Arc from the far edge of the mouth to the near edge (clockwise sweep
  // covers the whole disc except the mouth wedge).
  ctx.arc(state.px, HUD_H + state.py, CELL * 0.44, a1, a0)
  ctx.closePath()
  ctx.fill()
  noGlow(ctx)

  // HUD.
  hudPair(ctx, 10, 20, '得分', `${state.score}`)
  hudPair(ctx, LOGICAL_W - 10, 20, '生命', '♥'.repeat(Math.max(0, state.lives)), 'right', THEME.bad)

  particles.tick(ctx, dtMs)

  if (state.over) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '游戏结束', `得分 ${state.score} · 按 R 重新开始`, THEME.bad)
  } else if (state.won) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关啦！', `得分 ${state.score} · 按 R 重新开始`, THEME.gold)
  }
}
