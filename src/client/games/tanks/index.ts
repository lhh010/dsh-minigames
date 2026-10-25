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
import { createFrameLoop } from '../frame-scheduler.ts'

function createTanksGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, TANK_W, TANK_H)
  if (fit === null) throw new Error('dsh-minigames: tanks needs a 2d canvas context')
  const ctx = fit.ctx

  let world: WorldState = createWorld()
  let lastScore = -1

  const input: PlayerInput = { up: false, down: false, left: false, right: false, fire: false }

  const reportScore = (): void => {
    if (world.score === lastScore) return
    lastScore = world.score
    options?.onScore?.(world.score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
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
        togglePause()
        break
      case 'KeyR':
        if (world.result !== 'none') reset()
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

  const loop = createFrameLoop((f) => {
    stepWorld(world, f.dt, input)
    reportScore()
    if (f.render) renderTanks(ctx, world, false)
  })

  const reset = (): void => {
    world = createWorld()
    lastScore = -1
    input.up = input.down = input.left = input.right = input.fire = false
    reportScore()
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderTanks(ctx, world, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  loop.start()
  renderTanks(ctx, world, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
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
