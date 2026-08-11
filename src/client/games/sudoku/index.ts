/**
 * Sudoku game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — click a free cell, type 1-9 to fill / 0 to
 * clear, arrow keys move the cursor, D cycles difficulty, and a solve
 * reports a time-based score (faster = higher).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createSudokuState, place, tick, type Difficulty, type SudokuState } from './logic.ts'
import { renderSudoku, LOGICAL_W, LOGICAL_H, CELL, HUD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

/** Time-based score: a faster solve -> a higher score (the panel keeps the max). */
function solveScore(elapsed: number): number {
  return Math.max(0, Math.round(1000 - elapsed * 2))
}

const DIFF_CYCLE: Difficulty[] = ['easy', 'normal', 'hard']

function createSudokuGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: sudoku needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SudokuState = createSudokuState()
  let difficulty: Difficulty = 'normal'
  let cursor = { r: 0, c: 0 }
  let running = false
  let raf = 0
  let last = 0
  let reported = false

  const newPuzzle = (): void => {
    state = createSudokuState(undefined, difficulty)
    reported = false
  }

  const cellFromEvent = (event: MouseEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= 9 || c < 0 || c >= 9) return null
    return { r, c }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.won) {
      newPuzzle()
      return
    }
    const cell = cellFromEvent(event)
    if (cell === null) return
    cursor = cell
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      newPuzzle()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyD') {
      event.preventDefault()
      difficulty = DIFF_CYCLE[(DIFF_CYCLE.indexOf(difficulty) + 1) % DIFF_CYCLE.length]!
      newPuzzle()
      return
    }
    if (state.won) return
    if (event.code.startsWith('Digit')) {
      event.preventDefault()
      const n = Number(event.code.slice(5))
      if (n >= 0 && n <= 9) place(state, cursor.r, cursor.c, n)
    } else if (event.code === 'Backspace' || event.code === 'Delete') {
      event.preventDefault()
      place(state, cursor.r, cursor.c, 0)
    } else if (event.code === 'ArrowUp') {
      event.preventDefault()
      cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
    } else if (event.code === 'ArrowDown') {
      event.preventDefault()
      cursor = { r: Math.min(8, cursor.r + 1), c: cursor.c }
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault()
      cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
    } else if (event.code === 'ArrowRight') {
      event.preventDefault()
      cursor = { r: cursor.r, c: Math.min(8, cursor.c + 1) }
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
    renderSudoku(ctx, state, difficulty, cursor)
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
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderSudoku(ctx, state, difficulty, cursor)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const sudokuGame: MiniGameDefinition = {
  id: 'sudoku',
  title: '数独',
  icon: '🧩',
  description: '9×9 数独：填满且无冲突即胜，D 键切难度，越快分越高。',
  controls: ['点击：选中格子', '1-9：填入 / 0：清除', '方向键：移动光标', 'D：切换难度', 'R：新题', 'P：暂停'],
  create: createSudokuGame,
}
