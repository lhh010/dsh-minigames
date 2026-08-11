/**
 * 跳一跳 game definition: wires the pure hop logic into a
 * {@link MiniGameInstance} — hold to charge, release to jump; miss the
 * platform and the run ends.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { charge, createHopState, jump, startCharge, stepHop, type HopState } from './logic.ts'
import { renderHop, VIEW_W, VIEW_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createHopGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (fit === null) throw new Error('dsh-minigames: hop needs a 2d canvas context')
  const ctx = fit.ctx

  let state: HopState = createHopState()
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onMouseDown = (): void => {
    if (state.over) return
    startCharge(state)
  }

  const onMouseUp = (): void => {
    if (state.over || !state.jumping) {
      jump(state)
      reportScore()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      if (state.over) return
      startCharge(state)
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      state = createHopState()
      lastScore = -1
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      if (state.over || !state.jumping) {
        jump(state)
        reportScore()
      }
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    charge(state, dt)
    stepHop(state, dt)
    reportScore()
    renderHop(ctx, state)
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

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  startLoop()
  renderHop(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const hopGame: MiniGameDefinition = {
  id: 'hop',
  title: '跳一跳',
  icon: '🦘',
  description: '按住蓄力、松开起跳，跳到下一个平台；落点越准加分越多。',
  controls: ['按住 / 点击：蓄力', '松开：起跳', 'R：重开', 'P：暂停'],
  create: createHopGame,
}
