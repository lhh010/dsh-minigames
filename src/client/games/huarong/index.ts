/**
 * Huarong (15-puzzle, 4x4) game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — click a tile in the empty's row/column (or use
 * arrow keys) to slide, an interpolated slide animation, a move/time HUD, and
 * a solved overlay. Reports an efficiency score on solve (fewer moves = higher).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createHuarongState, slideAt, slideDirection, shuffle,
  type HuarongState, type Slide,
} from './logic.ts'
import { renderHuarong, LOGICAL_W, LOGICAL_H, CELL, HUD_H, type HuarongView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const SLIDE_MS = 120

/** The arrow direction each key maps to (tile motion: 0 up, 1 right, 2 down, 3 left). */
const KEY_DIR: Record<string, number> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
}

/** Time-based score: a faster solve -> a higher score (the panel keeps the max). */
function solveScore(elapsed: number): number {
  return Math.max(0, Math.round(1000 - elapsed * 2))
}

function createHuarongGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: huarong needs a 2d canvas context')
  const ctx = fit.ctx

  let state: HuarongState = createHuarongState()
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  let slideEntries: Slide[] = []
  let slideT = 0
  let reported = false // report the solve score once per solve

  const reportScore = (): void => {
    const score = solveScore(state.elapsed)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const cellFromEvent = (event: PointerEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null
    return { r, c }
  }

  /** Apply a slide (logical) and start its animation; no-op while animating or solved. */
  const applySlide = (slides: Slide[] | null): void => {
    if (slides === null || slides.length === 0 || slideEntries.length > 0 || state.solved) return
    slideEntries = slides
    slideT = 0
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (slideEntries.length > 0) return
    if (state.solved) {
      newPuzzle()
      return
    }
    const cell = cellFromEvent(event)
    if (cell === null) return
    applySlide(slideAt(state, cell.r, cell.c))
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
      newPuzzle()
      return
    }
    if (state.solved || slideEntries.length > 0) return
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    applySlide(slideDirection(state, dir))
  }

  /** Shuffle a fresh puzzle and reset the score reporting. */
  const newPuzzle = (): void => {
    shuffle(state)
    reported = false
    lastScore = -1
  }

  const advance = (dt: number): void => {
    if (!state.solved) state.elapsed += dt
    if (slideEntries.length > 0) {
      slideT += dt * 1000
      if (slideT >= SLIDE_MS) {
        slideEntries = []
        slideT = 0
        if (state.solved && !reported) {
          reported = true
          reportScore()
        }
      }
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    advance(dt)
    const view: HuarongView = {
      slides: slideEntries.length > 0 ? { entries: slideEntries, t: Math.min(1, slideT / SLIDE_MS) } : null,
      solved: state.solved,
    }
    renderHuarong(ctx, state, view)
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

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderHuarong(ctx, state, { slides: null, solved: state.solved })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const huarongGame: MiniGameDefinition = {
  id: 'huarong',
  title: '华容道',
  icon: '🔢',
  description: '16 格数字华容道（15-puzzle）：滑动方块按 1..15 排列，用时越短分数越高。',
  controls: ['点击 / 方向键：滑动方块', 'R：重新打乱', 'P：暂停'],
  create: createHuarongGame,
}
