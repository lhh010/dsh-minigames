/**
 * Pseudo-3D racing game definition: wires the pure road logic and the
 * perspective canvas renderer into a {@link MiniGameInstance} — rAF loop,
 * keyboard input (steer / throttle / brake / handbrake / pause), distance-based
 * score reporting, and restart.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createRacingState, step, type RacingInput, type RacingState } from './logic.ts'
import { renderRacing, VIEW_W, VIEW_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createRacingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (fit === null) throw new Error('dsh-minigames: racing needs a 2d canvas context')
  const ctx = fit.ctx

  let state: RacingState = createRacingState()
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  const input: RacingInput = {
    left: false,
    right: false,
    throttle: false,
    brake: false,
    handbrake: false,
  }

  const reportScore = (): void => {
    const score = state.score
    // Report in 10-point steps to keep the panel header and best-score writes
    // cheap (the score accrues quickly from distance at high speed).
    if (score < lastScore + 10 && !state.over) return
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        input.right = true
        break
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        input.throttle = true
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        input.brake = true
        break
      case 'Space':
        event.preventDefault()
        input.handbrake = true
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyR':
        if (state.over) reset()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
      case 'ArrowUp':
      case 'KeyW':
        input.throttle = false
        break
      case 'ArrowDown':
      case 'KeyS':
        input.brake = false
        break
      case 'Space':
        input.handbrake = false
        break
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    step(state, dt, input)
    reportScore()
    renderRacing(ctx, state)
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

  const reset = (): void => {
    state = createRacingState()
    lastScore = -1
    input.left = input.right = input.throttle = input.brake = input.handbrake = false
    reportScore()
    if (running) startLoop()
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
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  startLoop()
  renderRacing(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const racingGame: MiniGameDefinition = {
  id: 'racing',
  title: '3D 赛车',
  icon: '🏎️',
  description: '伪 3D 无尽赛车：加速飞驰，躲避多种障碍物，分数越高速度越快！',
  controls: ['A/← 左转', 'D/→ 右转', 'W/↑ 加速', 'S/↓ 刹车', '空格 手刹', 'P 暂停'],
  create: createRacingGame,
}
