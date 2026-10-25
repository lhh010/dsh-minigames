/**
 * Flappy game definition: wires the pure physics into a
 * {@link MiniGameInstance} — click / space to flap, restart, pause. Score is
 * reported live.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createFlappyState, flap, stepFlappy, type FlappyState } from './logic.ts'
import { renderFlappy, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createFlappyGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: flappy needs a 2d canvas context')
  const ctx = fit.ctx

  let state: FlappyState = createFlappyState()
  let wingT = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onPointerDown = (): void => {
    if (state.over) return
    flap(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      if (!state.over) flap(state)
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      state = createFlappyState()
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    wingT += f.dt
    stepFlappy(state, f.dt)
    reportScore()
    if (f.render) renderFlappy(ctx, state, wingT, false)
  })

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderFlappy(ctx, state, wingT, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderFlappy(ctx, state, 0, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const flappyGame: MiniGameDefinition = {
  id: 'flappy',
  title: 'Flappy',
  icon: '🐦',
  description: '点击或空格让小鸟振翅，穿过柱子缝隙，越远分越高。',
  controls: ['点击 / 空格 / ↑：振翅', 'R：重开', 'P：暂停'],
  create: createFlappyGame,
}
