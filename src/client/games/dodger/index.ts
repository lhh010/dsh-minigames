/**
 * Dodger game definition: wires the pure logic into a
 * {@link MiniGameInstance} — mouse-follow as primary control (pointer sets the
 * chase target), arrows/WASD as fallback, R restart, P pause.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createDodger, stepDodger, setTarget, W, H, type DodgerState } from './logic.ts'
import { renderDodger } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createDodgerGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: dodger needs a 2d canvas context')
  const ctx = fit.ctx

  let state: DodgerState = createDodger()
  let running = false
  let lastScore = -1

  const input = { up: false, down: false, left: false, right: false }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onPointerMove = (event: PointerEvent): void => {
    // CSS px → logical arena coordinates.
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    setTarget(state, x, y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // Modifier chords (Ctrl/Cmd+R reload, Alt+letter menus) are browser
    // commands, never game input — swallow-none.
    if (event.ctrlKey || event.altKey || event.metaKey) return
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
        input.up = true
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        input.down = true
        break
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
        input.up = false
        break
      case 'ArrowDown':
      case 'KeyS':
        input.down = false
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepDodger(state, f.dt * 1000, input)
    reportScore()
    if (f.render) renderDodger(ctx, state, false)
  }

  const loop = createFrameLoop(frame)

  const reset = (): void => {
    state = createDodger()
    lastScore = -1
    input.up = input.down = input.left = input.right = false
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
    renderDodger(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointermove', onPointerMove)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderDodger(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const dodgerGame: MiniGameDefinition = {
  id: 'dodger',
  title: '弹幕躲避',
  icon: '💠',
  description: '移动光点在弹幕中穿行，贴弹擦过加分，活得越久弹幕越密越快。',
  controls: ['鼠标：跟随移动', 'WASD / 方向键：移动', 'R：重开', 'P：暂停'],
  create: createDodgerGame,
}
