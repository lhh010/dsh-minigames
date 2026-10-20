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

function createDodgerGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: dodger needs a 2d canvas context')
  const ctx = fit.ctx

  let state: DodgerState = createDodger()
  let running = false
  let raf = 0
  let last = 0
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

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    // Clamped dt: a background tab or hitch never teleports bullets.
    const dt = Math.min(50, Math.max(0, now - last))
    last = now
    stepDodger(state, dt, input)
    reportScore()
    renderDodger(ctx, state)
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
    state = createDodger()
    lastScore = -1
    input.up = input.down = input.left = input.right = false
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

  canvas.addEventListener('pointermove', onPointerMove)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  startLoop()
  renderDodger(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
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
