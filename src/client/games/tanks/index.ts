/**
 * Tank battle game definition: wires the pure world logic into a
 * {@link MiniGameInstance} — an rAF loop, WASD/arrows to move, space to fire,
 * P pause, R restart.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createWorld, stepWorld, type PlayerInput, type WorldState,
} from './logic.ts'
import { renderTanks, TANK_W, TANK_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createTanksGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, TANK_W, TANK_H)
  if (fit === null) throw new Error('dsh-minigames: tanks needs a 2d canvas context')
  const ctx = fit.ctx

  let world: WorldState = createWorld()
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  const input: PlayerInput = { up: false, down: false, left: false, right: false, fire: false }

  const reportScore = (): void => {
    if (world.score === lastScore) return
    lastScore = world.score
    options?.onScore?.(world.score)
  }

  const clearInput = (): void => {
    input.up = false
    input.down = false
    input.left = false
    input.right = false
    input.fire = false
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.repeat && (event.code === 'KeyP' || event.code === 'KeyR')) return
    if (!running && event.code !== 'KeyP' && event.code !== 'KeyR') return
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        input.up = true
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        input.down = true
        break
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
      case 'Space':
        event.preventDefault()
        input.fire = true
        break
      case 'KeyP':
        event.preventDefault()
        if (options?.onPauseRequest) {
          clearInput()
          options.onPauseRequest()
        }
        else togglePause()
        break
      case 'KeyR':
        event.preventDefault()
        if (options?.onRestartRequest) options.onRestartRequest()
        else if (world.result !== 'none') reset()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        input.up = false
        break
      case 'ArrowDown':
      case 'KeyS':
        input.down = false
        break
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
      case 'Space':
        input.fire = false
        break
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    stepWorld(world, dt, input)
    reportScore()
    renderTanks(ctx, world)
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
    world = createWorld()
    lastScore = -1
    clearInput()
    reportScore()
    if (running) startLoop()
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    clearInput()
    stopLoop()
  }
  const resume = (): void => {
    if (running) return
    running = true
    startLoop()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearInput)
  focusGameHost(host)
  running = true
  startLoop()
  renderTanks(ctx, world)

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
      window.removeEventListener('blur', clearInput)
    },
  }
}

export const tanksGame: MiniGameDefinition = {
  id: 'tanks',
  title: '坦克大战',
  icon: '🛡️',
  description: '2D 坦克对战（带 AI）：WASD/方向键移动，空格开火，消灭三波敌军。',
  controls: ['WASD / 方向键：移动', '空格：开火', 'P：暂停', 'R：重开'],
  create: createTanksGame,
}
