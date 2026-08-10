/**
 * Match-3 (消消乐) canvas renderer: a HUD strip (level, score/target progress),
 * the gem board, the click-removal animation (flash + falling gems), and the
 * win/lose overlays. Palette tuned for the DSH dark shell.
 */
import type { Match3State, Position } from './logic.ts'

export const CELL = 44
/** Board dimensions in cells (square). */
export const BOARD_CELLS = 8
export const HUD_H = 40
export const BOARD_W = BOARD_CELLS * CELL
export const BOARD_H = BOARD_CELLS * CELL
export const LOGICAL_W = BOARD_W
export const LOGICAL_H = HUD_H + BOARD_H

/** Gem fill colors by kind (1..5). */
const GEM_COLORS = ['', '#e45756', '#4c9ae8', '#5abf6b', '#e8c84c', '#b07cc9']
const GEM_DARK = ['', '#a83a3a', '#3a72b8', '#3f8f4e', '#b89a30', '#86579c']
const BOARD_BG = '#15151b'
const GRID_LINE = 'rgba(255,255,255,0.05)'
const CURSOR = '#ffe08a'
const TEXT = '#d8d8e0'
const MUTED = '#7a7a8a'

/** What the game wants rendered this frame. */
export interface Match3View {
  /** Keyboard cursor cell. */
  cursor: Position | null
  /** Clear animation: removed cells flashing, kept cells falling. */
  clear: {
    removed: Position[]
    falls: { from: Position; to: Position }[]
    /** 0..1 */
    t: number
    /** Score popup text, e.g. "+160". */
    scoreText: string
  } | null
  result: Match3State['result']
}

/** The grid the renderer draws (the pre-removal grid during the clear phase). */
export type DisplayGrid = number[][]

function cellX(c: number): number {
  return c * CELL + CELL / 2
}

function cellY(r: number): number {
  return HUD_H + r * CELL + CELL / 2
}

/** Draw one gem shape at (cx, cy), radius r. */
function drawGem(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number): void {
  const color = GEM_COLORS[kind]!
  const dark = GEM_DARK[kind]!
  ctx.fillStyle = color
  switch (kind) {
    case 1: // circle
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
      ctx.fill()
      break
    case 2: // rounded square
      ctx.beginPath()
      ctx.roundRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2, r * 0.25)
      ctx.fill()
      break
    case 3: // triangle
      ctx.beginPath()
      ctx.moveTo(cx, cy - r * 0.7)
      ctx.lineTo(cx - r * 0.7, cy + r * 0.6)
      ctx.lineTo(cx + r * 0.7, cy + r * 0.6)
      ctx.closePath()
      ctx.fill()
      break
    case 4: // diamond
      ctx.beginPath()
      ctx.moveTo(cx, cy - r * 0.75)
      ctx.lineTo(cx + r * 0.6, cy)
      ctx.lineTo(cx, cy + r * 0.75)
      ctx.lineTo(cx - r * 0.6, cy)
      ctx.closePath()
      ctx.fill()
      break
    default: // star (5 points)
      ctx.beginPath()
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r * 0.75 : r * 0.34
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const px = cx + Math.cos(angle) * radius
        const py = cy + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      break
  }
  ctx.strokeStyle = dark
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.arc(cx - r * 0.2, cy - r * 0.28, r * 0.18, 0, Math.PI * 2)
  ctx.fill()
}

function drawHud(ctx: CanvasRenderingContext2D, state: Match3State): void {
  ctx.fillStyle = '#1b1b22'
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.fillStyle = TEXT
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`第 ${state.level} 关`, 10, 16)
  ctx.textAlign = 'right'
  ctx.fillText(`得分 ${state.score} / ${state.target}`, LOGICAL_W - 10, 16)
  // Progress bar.
  const progress = Math.min(1, state.score / state.target)
  ctx.fillStyle = '#26262e'
  ctx.fillRect(10, 24, LOGICAL_W - 20, 6)
  ctx.fillStyle = '#5abf6b'
  ctx.fillRect(10, 24, (LOGICAL_W - 20) * progress, 6)
  ctx.fillStyle = MUTED
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText('点击同色四连通块消除', 10, 37)
}

/** Draw one frame. `grid` is the display grid (pre-removal during the clear phase). */
export function renderMatch3(
  ctx: CanvasRenderingContext2D,
  state: Match3State,
  grid: DisplayGrid,
  view: Match3View,
): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = BOARD_BG
  ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
  drawHud(ctx, state)

  // Faint board grid.
  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 1
  for (let i = 1; i < BOARD_CELLS; i += 1) {
    ctx.beginPath()
    ctx.moveTo(i * CELL + 0.5, HUD_H)
    ctx.lineTo(i * CELL + 0.5, LOGICAL_H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, HUD_H + i * CELL + 0.5)
    ctx.lineTo(BOARD_W, HUD_H + i * CELL + 0.5)
    ctx.stroke()
  }

  // Gems. During the clear phase the falling gems glide down while the
  // removed cells flash in place.
  const clear = view.clear
  const falling = new Map<string, { from: Position; to: Position }>()
  if (clear !== null) {
    for (const fall of clear.falls) falling.set(`${fall.from.r},${fall.from.c}`, fall)
  }
  const removedSet = new Set(clear?.removed.map(p => `${p.r},${p.c}`) ?? [])

  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[0]!.length; c += 1) {
      const key = `${r},${c}`
      const kind = grid[r]![c]!
      if (kind === 0 || removedSet.has(key)) continue
      const fall = falling.get(key)
      if (fall !== undefined && clear !== null) {
        // Interpolate the fall (ease-in for a gravity feel).
        const k = clear.t * clear.t
        const x = cellX(fall.from.c)
        const y = cellY(fall.from.r) + (cellY(fall.to.r) - cellY(fall.from.r)) * k
        drawGem(ctx, kind, x, y, CELL * 0.42)
      } else {
        drawGem(ctx, kind, cellX(c), cellY(r), CELL * 0.42)
      }
    }
  }

  // Removed cells flash.
  if (clear !== null) {
    const pulse = 0.4 + 0.5 * Math.abs(Math.sin(clear.t * 24))
    for (const p of clear.removed) {
      ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`
      ctx.fillRect(p.c * CELL + 2, HUD_H + p.r * CELL + 2, CELL - 4, CELL - 4)
    }
    // Score popup rising from the removed group's center.
    const bottomRow = Math.max(...clear.removed.map(p => p.r))
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 14px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.globalAlpha = Math.max(0, 1 - clear.t)
    ctx.fillText(clear.scoreText, BOARD_W / 2, cellY(bottomRow) - 8 - clear.t * 22)
    ctx.globalAlpha = 1
  }

  // Keyboard cursor.
  if (view.cursor !== null) {
    const p = view.cursor
    ctx.strokeStyle = CURSOR
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(p.c * CELL + 3, HUD_H + p.r * CELL + 3, CELL - 6, CELL - 6)
    ctx.setLineDash([])
  }

  // Result overlays.
  if (view.result === 'win') {
    ctx.fillStyle = 'rgba(21,21,27,0.55)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#ffe08a'
    ctx.font = 'bold 26px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('过 关 ！', BOARD_W / 2, HUD_H + BOARD_H / 2 - 6)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`第 ${state.level} 关完成 · 目标 ${state.target}`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 22)
  } else if (view.result === 'lose') {
    ctx.fillStyle = 'rgba(21,21,27,0.6)'
    ctx.fillRect(0, HUD_H, BOARD_W, BOARD_H)
    ctx.fillStyle = '#e45756'
    ctx.font = 'bold 26px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('游 戏 结 束', BOARD_W / 2, HUD_H + BOARD_H / 2 - 12)
    ctx.fillStyle = TEXT
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillText(`得分 ${state.score} / 目标 ${state.target} · 按 R 重新开始`, BOARD_W / 2, HUD_H + BOARD_H / 2 + 16)
  }
}
