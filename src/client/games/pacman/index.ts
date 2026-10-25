/**
 * Pac-Man game definition: wires the pure maze logic into a
 * {@link MiniGameInstance} — arrow/WASD steer Pac-Man, restart, pause; score
 * is reported live.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createPacmanState, stepPacman, type Dir, type PacmanState } from './logic.ts'
import { renderPacman, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  KeyW: 0,
  KeyD: 1,
  KeyS: 2,
  KeyA: 3,
}

function createPacmanGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: pacman needs a 2d canvas context')
  const ctx = fit.ctx

  let state: PacmanState = createPacmanState()
  let t = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const dir = KEY_DIR[event.code]
    if (dir !== undefined) {
      event.preventDefault()
      if (!state.over && !state.won) state.intent = dir
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createPacmanState()
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    t += f.dt
    stepPacman(state, f.dt)
    reportScore()
    if (f.render) renderPacman(ctx, state, t, false)
  })

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderPacman(ctx, state, t, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderPacman(ctx, state, 0, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const pacmanGame: MiniGameDefinition = {
  id: 'pacman',
  title: '吃豆人',
  icon: '🟡',
  description: '经典吃豆人：吃掉所有豆子过关，力量豆可反吃幽灵。',
  controls: ['方向键 / WASD：移动', 'R：重开', 'P：暂停'],
  create: createPacmanGame,
}
