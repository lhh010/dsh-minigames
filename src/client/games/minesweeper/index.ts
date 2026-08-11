/**
 * Minesweeper game definition: wires the pure grid logic into a
 * {@link MiniGameInstance} — mouse click reveals, right-click flags, a
 * double-click chord, and a restart key. Tracks the solve time and reports a
 * time-based score (faster = higher) on win, which the panel stores as the
 * best (i.e. shortest) solve.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createMinesweeperState, chord, reveal, revealAllMines, tick, toggleFlag, type MinesweeperState } from './logic.ts'
import { COLS, ROWS } from './logic.ts'
import { renderMinesweeper, LOGICAL_W, LOGICAL_H, CELL, HUD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

/** Time-based score: a faster solve -> a higher score (the panel keeps the max). */
function solveScore(elapsed: number): number {
  return Math.max(0, Math.round(1000 - elapsed * 2))
}

function createMinesweeperGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: minesweeper needs a 2d canvas context')
  const ctx = fit.ctx

  let state: MinesweeperState = createMinesweeperState()
  let running = false
  let raf = 0
  let last = 0
  let reported = false // report the solve score once per solve

  const cellFromEvent = (event: MouseEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    return { r, c }
  }

  const onMouseDown = (event: MouseEvent): void => {
    const cell = cellFromEvent(event)
    if (cell === null) return
    if (event.button === 2) {
      event.preventDefault()
      if (!state.over && !state.won) toggleFlag(state, cell.r, cell.c)
      return
    }
    if (event.button !== 0 || state.over || state.won) return
    if (reveal(state, cell.r, cell.c) && state.over) revealAllMines(state)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  const onDoubleClick = (event: MouseEvent): void => {
    const cell = cellFromEvent(event)
    if (cell === null) return
    chord(state, cell.r, cell.c)
    if (state.over) revealAllMines(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createMinesweeperState()
      reported = false
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    tick(state, dt)
    if (state.won && !reported) {
      reported = true
      options?.onScore?.(solveScore(state.elapsed))
    }
    renderMinesweeper(ctx, state)
  }

  const startLoop = (): void => {
    if (raf !== 0) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stopLoop = (): void => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    stopLoop()
  }
  const resume = (): void => {
    if (running) return
    running = true
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('dblclick', onDoubleClick)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderMinesweeper(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const minesweeperGame: MiniGameDefinition = {
  id: 'minesweeper',
  title: '扫雷',
  icon: '💣',
  description: '经典扫雷：左键翻开、右键标旗、双击数字自动展开周围，排完即胜。',
  controls: ['左键：翻开', '右键：标旗', '双击数字：自动展开', 'R：重开', 'P：暂停'],
  create: createMinesweeperGame,
}
