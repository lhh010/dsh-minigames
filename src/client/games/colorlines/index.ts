/**
 * Color Lines (五连珠) game definition: select a ball (click or arrows +
 * Enter), then click a reachable empty cell to slide it over a clear
 * orthogonal path; 5+ in a row clears and skips that turn's spawn.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createColorLinesState, moveBall, type ColorLinesState, type Position,
} from './logic.ts'
import { renderColorLines, LOGICAL_W, LOGICAL_H, HUD_H, CELL, GAP, type ColorLinesView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const CLEAR_MS = 300

function createColorLinesGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: colorlines needs a 2d canvas context')
  const ctx = fit.ctx

  let state: ColorLinesState = createColorLinesState()
  let running = false
  let lastScore = -1

  let selected: Position | null = null
  let cursor: Position = { r: 0, c: 0 }
  /** Clear flash animation while non-null. */
  let clearing: { cells: Position[]; t: number } | null = null

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const cellFromEvent = (event: PointerEvent): Position | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor((x - GAP) / (CELL + GAP))
    const r = Math.floor((y - HUD_H - GAP) / (CELL + GAP))
    if (r < 0 || r > 8 || c < 0 || c > 8) return null
    return { r, c }
  }

  const attemptMove = (to: Position): void => {
    if (selected === null) return
    const from = selected
    const result = moveBall(state, from, to)
    if (!result.moved) return
    selected = null
    reportScore()
    if (result.cleared.length > 0) {
      clearing = { cells: result.cleared, t: 0 }
    }
  }

  /** Click / Enter on the cursor cell: pick up a ball or slide the held one. */
  const activate = (cell: Position): void => {
    if (state.over || clearing !== null) return
    const color = state.grid[cell.r]![cell.c]!
    if (selected === null) {
      if (color !== 0) selected = cell
      return
    }
    if (cell.r === selected.r && cell.c === selected.c) {
      selected = null // toggle off
      return
    }
    if (color !== 0) {
      selected = cell // re-select another ball
      return
    }
    attemptMove(cell)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running) return // paused: freeze the board
    const cell = cellFromEvent(event)
    if (cell !== null) {
      cursor = cell
      activate(cell)
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (!running && event.code.startsWith('Arrow')) return // paused: freeze the board
    switch (event.code) {
      case 'ArrowUp':
        event.preventDefault()
        cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
        break
      case 'ArrowDown':
        event.preventDefault()
        cursor = { r: Math.min(8, cursor.r + 1), c: cursor.c }
        break
      case 'ArrowLeft':
        event.preventDefault()
        cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
        break
      case 'ArrowRight':
        event.preventDefault()
        cursor = { r: cursor.r, c: Math.min(8, cursor.c + 1) }
        break
      case 'Enter':
      case 'Space':
        event.preventDefault()
        if (!running) return // paused: freeze the board
        activate(cursor)
        break
      case 'KeyR':
        event.preventDefault()
        state = createColorLinesState()
        selected = null
        clearing = null
        lastScore = -1
        reportScore()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
    loop.markDirty()
  }

  const loop = createFrameLoop((f) => {
    if (clearing !== null) {
      clearing.t += f.dt
      if (clearing.t >= CLEAR_MS / 1000) {
        clearing = null
        loop.markDirty()
      }
    }
    // Repaint on change, or while the clear-flash animation is still live.
    if (f.render || clearing !== null) {
      const view: ColorLinesView = { selected, cursor, clearing }
      renderColorLines(ctx, state, view)
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderColorLines(ctx, state, { selected, cursor, clearing: null })

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

export const colorLinesGame: MiniGameDefinition = {
  id: 'colorlines',
  title: '五连珠',
  icon: '🔮',
  description: '移动彩球连成五连胜：同色直线（含斜线）5 颗即消除，消除的回合不补充新球。',
  controls: ['点击 / 方向键+回车：选球再选落点', 'R：重开', 'P：暂停'],
  create: createColorLinesGame,
}
