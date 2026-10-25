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
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createStackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, STACK_W, STACK_H)
  if (fit === null) throw new Error('dsh-minigames: stack needs a 2d canvas context')
  const ctx = fit.ctx

  let state: StackState = createState((Math.random() * 0xffffffff) >>> 0)
  let running = false
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

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt * 1000)
    if (f.render) renderStack(ctx, state)
  }

  const loop = createFrameLoop(frame)

  const reset = (): void => {
    state = createState((Math.random() * 0xffffffff) >>> 0)
    lastScore = -1
    reportScore()
    renderStack(ctx, state)
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderStack(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
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
