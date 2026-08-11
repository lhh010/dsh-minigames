/**
 * Snake game definition: wires the pure grid logic into a
 * {@link MiniGameInstance} — arrow/WASD input, a tick timer that speeds up
 * with score, and a game-over restart.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createSnakeState, stepSnake, turn, type SnakeState } from './logic.ts'
import { renderSnake, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const TICK_BASE = 180
const TICK_MIN = 70

/** Tick interval in ms — faster as the snake grows. */
function tickFor(score: number): number {
  return Math.max(TICK_MIN, TICK_BASE - score * 6)
}

function createSnakeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: snake needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SnakeState = createSnakeState()
  let running = false
  let raf = 0
  let last = 0
  let tickAcc = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault(); turn(state, 0); break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault(); turn(state, 2); break
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault(); turn(state, 3); break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault(); turn(state, 1); break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }

  const reset = (): void => {
    state = createSnakeState()
    tickAcc = 0
    lastScore = -1
    reportScore()
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    if (!state.over) {
      tickAcc += dt * 1000
      const interval = tickFor(state.score)
      while (tickAcc >= interval && !state.over) {
        tickAcc -= interval
        stepSnake(state)
        reportScore()
      }
    }
    renderSnake(ctx, state)
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

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderSnake(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const snakeGame: MiniGameDefinition = {
  id: 'snake',
  title: '贪吃蛇',
  icon: '🐍',
  description: '经典贪吃蛇：方向键移动，吃食物变长；穿越边界会从对侧出现。',
  controls: ['方向键 / WASD：移动', 'R：重开', 'P：暂停'],
  create: createSnakeGame,
}
