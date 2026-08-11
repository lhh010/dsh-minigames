/**
 * Pac-Man canvas renderer: a dark maze of glowing blue walls, dots and
 * flashing power pellets, a yellow Pac-Man with a mouth that faces its
 * direction, coloured ghosts (blue and flashing while frightened), and a
 * score/lives HUD.
 */
import type { PacmanState, Dir } from './logic.ts'
import { CELL, COLS, ROWS } from './logic.ts'

export const HUD_H = 30
export const LOGICAL_W = COLS * CELL
export const LOGICAL_H = HUD_H + ROWS * CELL

const BG = '#101018'
const WALL = '#2440c8'
const WALL_EDGE = '#3a5ae0'
const DOT = '#ffd9a0'
const TEXT = '#d8d8e0'
const PAC = '#ffd83d'
const GHOST_COLORS = ['#e45756', '#e88ac8']

/** Draw one frame; `t` is a running seconds counter for flicker effects. */
export function renderPacman(ctx: CanvasRenderingContext2D, state: PacmanState, t: number): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

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
        ctx.fillStyle = '#ffd9a0'
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, pulse, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Ghosts: wavy skirt + eyes that follow the travel direction.
  const DIR_OFFSET: Record<Dir, readonly [number, number]> = {
    0: [0, -2],
    1: [2, 0],
    2: [0, 2],
    3: [-2, 0],
  }
  state.ghosts.forEach((ghost, i) => {
    const frightened = state.fright > 0
    const flicker = frightened && Math.floor(t * 8) % 2 === 0
    ctx.fillStyle = frightened ? (flicker ? '#ffffff' : '#4c9ae8') : GHOST_COLORS[i % GHOST_COLORS.length]!
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
    // Eyes look the way the ghost is moving.
    if (!frightened) {
      const [ex, ey] = DIR_OFFSET[ghost.dir]
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ghost.x - 4, gy - 2, 3.5, 0, Math.PI * 2)
      ctx.arc(ghost.x + 4, gy - 2, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#15151b'
      ctx.beginPath()
      ctx.arc(ghost.x - 4 + ex, gy - 2 + ey, 1.8, 0, Math.PI * 2)
      ctx.arc(ghost.x + 4 + ex, gy - 2 + ey, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  // Pac-Man: yellow disc with a chewing mouth facing the travel direction.
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
  ctx.fillStyle = PAC
  ctx.beginPath()
  ctx.moveTo(state.px, HUD_H + state.py)
  // Arc from the far edge of the mouth to the near edge (clockwise sweep
  // covers the whole disc except the mouth wedge).
  ctx.arc(state.px, HUD_H + state.py, CELL * 0.44, a1, a0)
  ctx.closePath()
  ctx.fill()

  // HUD.
  ctx.fillStyle = '#15151b'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`得分 ${state.score}`, 10, 20)
  ctx.textAlign = 'right'
  ctx.fillText(`生命 ${'♥'.repeat(Math.max(0, state.lives))}`, LOGICAL_W - 10, 20)

  if (state.over) {
    overlay(ctx, '游 戏 结 束', `得分 ${state.score} · 按 R 重新开始`)
  } else if (state.won) {
    overlay(ctx, '过 关 啦 ！', `得分 ${state.score} · 按 R 重新开始`)
  }
}

function overlay(ctx: CanvasRenderingContext2D, title: string, sub: string): void {
  ctx.fillStyle = 'rgba(16,16,24,0.7)'
  ctx.fillRect(0, HUD_H, LOGICAL_W, ROWS * CELL)
  ctx.fillStyle = '#ffe08a'
  ctx.font = 'bold 24px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(title, LOGICAL_W / 2, HUD_H + (ROWS * CELL) / 2 - 8)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.fillText(sub, LOGICAL_W / 2, HUD_H + (ROWS * CELL) / 2 + 20)
}
