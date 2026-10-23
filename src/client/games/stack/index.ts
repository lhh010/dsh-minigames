/**
 * Stack game definition: wires the pure tower logic into a
 * {@link MiniGameInstance} — click/Space/↓ drops the sliding block, the
 * trimmed overlap becomes the next layer, R restarts, P pauses; on collapse
 * click or Space restarts from the overlay.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createState, drop, step, type StackState } from './logic.ts'
import { renderStack } from './render.ts'
import { STACK_W, STACK_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createStackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, STACK_W, STACK_H)
  if (fit === null) throw new Error('dsh-minigames: stack needs a 2d canvas context')
  const ctx = fit.ctx

  let state: StackState = createState((Math.random() * 0xffffffff) >>> 0)
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const doDrop = (): void => {
    if (state.over || !running) return
    drop(state)
    reportScore()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (state.over) {
      reset()
      return
    }
    if (running) doDrop()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
      case 'ArrowDown':
        event.preventDefault()
        if (state.over) reset()
        else if (running) doDrop()
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

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    // Clamped dt: a background tab never teleports the slider.
    const dt = Math.min(50, Math.max(0, now - last))
    last = now
    step(state, dt)
    renderStack(ctx, state)
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
    state = createState((Math.random() * 0xffffffff) >>> 0)
    lastScore = -1
    reportScore()
    if (running) startLoop()
    renderStack(ctx, state)
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
  renderStack(ctx, state)

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

export const stackGame: MiniGameDefinition = {
  id: 'stack',
  title: 'Tower Stack 堆塔',
  icon: '🏗️',
  description: '在滑动的方块落下时精准堆叠，完美对齐保持宽度，偏移越多塔越窄。',
  controls: ['点击 / 空格 / ↓：落下', 'R：重开', 'P：暂停'],
  create: createStackGame,
}
