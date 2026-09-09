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
import { renderMinesweeper, LOGICAL_W, LOGICAL_H, CELL, HUD_H, type MinesweeperMode } from './render.ts'
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
  let touchCell: { r: number; c: number } | null = null
  let mode: MinesweeperMode = 'reveal'

  const cellFromEvent = (event: MouseEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    return { r, c }
  }

  const clearTouch = (): void => {
    touchCell = null
  }

  const reset = (): void => {
    clearTouch()
    state = createMinesweeperState()
    reported = false
  }

  const modeFromEvent = (event: MouseEvent): MinesweeperMode | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (y < 0 || y >= HUD_H) return null
    if (x >= 88 && x < 134) return 'reveal'
    if (x >= 138 && x < 184) return 'flag'
    return null
  }

  const applyCellAction = (cell: { r: number; c: number }): void => {
    if (mode === 'flag') {
      toggleFlag(state, cell.r, cell.c)
    } else if (reveal(state, cell.r, cell.c) && state.over) {
      revealAllMines(state)
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    const selectedMode = modeFromEvent(event)
    if (selectedMode !== null) {
      mode = selectedMode
      renderMinesweeper(ctx, state, mode)
      return
    }
    if (!running) return
    const cell = cellFromEvent(event)
    if (cell === null) return
    if (event.pointerType === 'touch') {
      if (!running || state.over || state.won) return
      event.preventDefault()
      clearTouch()
      touchCell = cell
      return
    }
    if (event.button === 2) {
      event.preventDefault()
      if (!state.over && !state.won) toggleFlag(state, cell.r, cell.c)
      return
    }
    if (event.button !== 0 || state.over || state.won) return
    applyCellAction(cell)
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || touchCell === null) return
    const cell = touchCell
    clearTouch()
    if (running && !state.over && !state.won) applyCellAction(cell)
  }

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') clearTouch()
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  const onDoubleClick = (event: MouseEvent): void => {
    if (!running) return
    const cell = cellFromEvent(event)
    if (cell === null) return
    chord(state, cell.r, cell.c)
    if (state.over) revealAllMines(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.repeat && (event.code === 'KeyP' || event.code === 'KeyR')) return
    if (!running && event.code !== 'KeyP' && event.code !== 'KeyR') return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (options?.onRestartRequest) options.onRestartRequest()
      else reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (options?.onPauseRequest) options.onPauseRequest()
      else togglePause()
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
    renderMinesweeper(ctx, state, mode)
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
    clearTouch()
    stopLoop()
  }
  const resume = (): void => {
    if (running) return
    running = true
    startLoop()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('dblclick', onDoubleClick)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderMinesweeper(ctx, state, mode)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      clearTouch()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
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
  controls: ['轻触 / 翻开模式：翻开', '标旗模式 / 右键：标旗', '双击数字：自动展开', 'R：重开', 'P：暂停'],
  create: createMinesweeperGame,
}
