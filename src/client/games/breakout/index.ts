/**
 * Breakout game definition: wires the pure physics into a
 * {@link MiniGameInstance} — mouse moves the paddle, click launches, and the
 * ball speeds up each cleared level.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createBreakoutState, movePaddle, stepBreakout, type BreakoutState } from './logic.ts'
import { renderBreakout, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createBreakoutGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: breakout needs a 2d canvas context')
  const ctx = fit.ctx

  let state: BreakoutState = createBreakoutState()
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const paddleFromEvent = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    movePaddle(state, x)
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (state.over) return
    paddleFromEvent(event)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.over) return
    paddleFromEvent(event)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault()
      movePaddle(state, state.paddleX - 26)
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault()
      movePaddle(state, state.paddleX + 26)
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      state = createBreakoutState()
      lastScore = -1
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
    if (!state.over) {
      stepBreakout(state, dt)
      reportScore()
    }
    renderBreakout(ctx, state)
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

  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderBreakout(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const breakoutGame: MiniGameDefinition = {
  id: 'breakout',
  title: '打砖块',
  icon: '🧱',
  description: '移动挡板反弹小球打碎砖块，清完进入下一关；小球会变成所消除方块的颜色，同色消除得分×3。',
  controls: ['鼠标 / ←→：移动挡板', 'R：重开', 'P：暂停'],
  create: createBreakoutGame,
}
