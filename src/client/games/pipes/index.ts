/**
 * Pipes game definition: wires the pure pipe logic into a
 * {@link MiniGameInstance} — click a tile (or move a cursor with arrows and
 * rotate with Space/Enter) to rotate it 90°, a 90s per-level countdown ends
 * the game at zero, and a connected source→sink board scores +200 and
 * auto-advances to a bigger board (or N immediately). The countdown is
 * dt-driven inside the frame loop, so pausing (P) freezes both the timer and
 * input; R restarts from level 1.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  advanceLevel, checkWin, createPipesState, rotateTile, tick,
  type PipesState,
} from './logic.ts'
import { renderPipes, LOGICAL_W, LOGICAL_H, CELL, HUD_H, MARGIN } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const AUTO_ADVANCE_MS = 1500
const MAX_SIZE = 8

/** The cursor delta each arrow key maps to. */
const KEY_MOVE: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function createPipesGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: pipes needs a 2d canvas context')
  const ctx = fit.ctx

  let state: PipesState = createPipesState()
  let running = false
  let lastScore = -1
  let cursor: { r: number; c: number } | null = null
  // Seconds accumulated in the 'won' state; dt-driven so pause freezes it.
  let wonElapsed = 0

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const restart = (): void => {
    state = createPipesState(1, 0, state.rng)
    cursor = null
    wonElapsed = 0
    reportScore()
    loop.markDirty()
  }

  /** Rotate the tile at the cursor/cell and check for the win transition. */
  const rotateAt = (r: number, c: number): void => {
    if (state.status !== 'playing') return
    if (rotateTile(state, r, c)) {
      loop.markDirty()
      if (checkWin(state)) {
        wonElapsed = 0
        reportScore()
      }
    }
  }

  const moveCursor = (dr: number, dc: number): void => {
    const size = state.board.size
    if (cursor === null) {
      cursor = { r: Math.floor(size / 2), c: Math.floor(size / 2) }
      loop.markDirty()
      return
    }
    cursor.r = Math.min(size - 1, Math.max(0, cursor.r + dr))
    cursor.c = Math.min(size - 1, Math.max(0, cursor.c + dc))
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running) return // paused: freeze input
    if (state.status === 'over') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const boardPx = state.board.size * CELL
    const ox = MARGIN + ((MAX_SIZE - state.board.size) * CELL) / 2
    const oy = HUD_H + MARGIN + ((MAX_SIZE - state.board.size) * CELL) / 2
    if (x < ox || y < oy || x >= ox + boardPx || y >= oy + boardPx) return
    const c = Math.floor((x - ox) / CELL)
    const r = Math.floor((y - oy) / CELL)
    cursor = { r, c }
    rotateAt(r, c)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      if (state.status === 'won') {
        advanceLevel(state)
        cursor = null
        wonElapsed = 0
        loop.markDirty()
      }
      return
    }
    if (!running) return // paused: freeze input
    const move = KEY_MOVE[event.code]
    if (move !== undefined) {
      event.preventDefault()
      moveCursor(move[0], move[1])
      return
    }
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (cursor !== null) rotateAt(cursor.r, cursor.c)
    }
  }

  const advance = (dt: number): void => {
    if (state.status === 'playing') tick(state, dt)
    // Auto-advance after the burst, unless the player already pressed N.
    if (state.status === 'won') {
      wonElapsed += dt
      if (wonElapsed >= AUTO_ADVANCE_MS / 1000) {
        advanceLevel(state)
        cursor = null
        wonElapsed = 0
        loop.markDirty()
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    advance(f.dt)
    if (f.render) renderPipes(ctx, state, { paused: false, cursor })
  }

  const loop = createFrameLoop(frame)
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
    renderPipes(ctx, state, { paused: true, cursor })
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderPipes(ctx, state, { paused: false, cursor })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const pipesGame: MiniGameDefinition = {
  id: 'pipes',
  title: '接水管',
  icon: '🚰',
  description: '旋转水管铺出一条从水源到汇的水路：越往后棋盘越大，每关限时 90 秒。',
  controls: ['点击 / 方向键+空格：旋转水管', 'N：下一关（过关后）', 'P：暂停 · R：重开'],
  create: createPipesGame,
}
