/**
 * 2048 game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — arrow/WASD input, keyboard cursor with Enter to
 * slide, and game-over restart.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { create2048State, move2048, type Game2048State } from './logic.ts'
import { render2048, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function create2048Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: 2048 needs a 2d canvas context')
  const ctx = fit.ctx

  let state: Game2048State = create2048State()
  let running = false
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const DIR_KEYS: Record<string, 0 | 1 | 2 | 3> = {
    ArrowUp: 0, KeyW: 0,
    ArrowRight: 1, KeyD: 1,
    ArrowDown: 2, KeyS: 2,
    ArrowLeft: 3, KeyA: 3,
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const dir = DIR_KEYS[event.code]
    if (dir !== undefined) {
      event.preventDefault()
      if (!running) return // paused: freeze the board
      if (move2048(state, dir)) {
        reportScore()
        loop.markDirty()
      }
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = create2048State()
      lastScore = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    void f.dt
    if (f.render) render2048(ctx, state, false)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    render2048(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  render2048(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const game2048: MiniGameDefinition = {
  id: '2048',
  title: '2048',
  icon: '🔢',
  description: '方向键滑动合并数字，合成 2048 即达成，继续挑战更高分。',
  controls: ['方向键 / WASD：滑动合并', 'R：重开', 'P：暂停'],
  create: create2048Game,
}
