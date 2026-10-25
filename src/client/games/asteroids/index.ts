/**
 * Asteroids game definition: wires the pure vector logic into a
 * {@link MiniGameInstance} — an rAF loop, WASD/arrows to steer and thrust,
 * space to fire, P pause, R restart.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createAsteroids, updateAsteroids, type AsteroidsState, type PlayerInput,
} from './logic.ts'
import { renderAsteroids, AST_W, AST_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createAsteroidsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, AST_W, AST_H)
  if (fit === null) throw new Error('dsh-minigames: asteroids needs a 2d canvas context')
  const ctx = fit.ctx

  let world: AsteroidsState = createAsteroids()
  let running = false
  let lastScore = -1

  const input: PlayerInput = { left: false, right: false, thrust: false, fire: false }

  const reportScore = (): void => {
    if (world.score === lastScore) return
    lastScore = world.score
    options?.onScore?.(world.score)
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
        input.thrust = true
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
        input.thrust = false
        break
      case 'Space':
        input.fire = false
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    updateAsteroids(world, f.dt * 1000, input)
    reportScore()
    if (f.render) renderAsteroids(ctx, world, false)
  }

  const loop = createFrameLoop(frame)

  const reset = (): void => {
    world = createAsteroids()
    lastScore = -1
    input.left = input.right = input.thrust = input.fire = false
    reportScore()
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderAsteroids(ctx, world, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderAsteroids(ctx, world, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const asteroidsGame: MiniGameDefinition = {
  id: 'asteroids',
  title: '小行星',
  icon: '☄️',
  description: '矢量小行星：惯性驾驶飞船，击碎岩石群，一波接一波地生存下去。每开一炮 -1 分，瞄准则生。',
  controls: ['A/D 或 ←/→：旋转', 'W 或 ↑：推进', '空格：开火（每发 -1 分）', 'P：暂停', 'R：重开'],
  create: createAsteroidsGame,
}
