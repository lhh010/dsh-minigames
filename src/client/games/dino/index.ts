/**
 * Dino runner game definition: wires the pure engine and canvas renderer into
 * a {@link MiniGameInstance} (rAF loop, keyboard + click input, pause/resume,
 * restart on game over).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createDinoState, step, VIEW_W, GROUND_Y, type DinoState } from './engine.ts'
import { renderDino } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

/** How long the game over screen waits before accepting a restart. */
const RESTART_DELAY = 400

function createDinoGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, VIEW_W, GROUND_Y + 20)
  if (fit === null) throw new Error('dsh-minigames: dino needs a 2d canvas context')
  const ctx = fit.ctx

  let state: DinoState = createDinoState()
  let running = false
  let raf = 0
  let last = 0
  let overSince = 0
  let jumpEdge = false
  let duckHeld = false
  let lastScore = -1

  const reportScore = (): void => {
    const score = Math.floor(state.score)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault()
      if (state.over) {
        if (performance.now() - overSince > RESTART_DELAY) reset()
        return
      }
      jumpEdge = true
    } else if (event.code === 'ArrowDown') {
      event.preventDefault()
      duckHeld = true
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowDown') duckHeld = false
  }
  const onClick = (): void => {
    if (state.over) {
      if (performance.now() - overSince > RESTART_DELAY) reset()
      return
    }
    jumpEdge = true
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    step(state, dt, { jump: jumpEdge, duck: duckHeld })
    jumpEdge = false
    if (state.over && overSince === 0) {
      overSince = now
      reportScore()
    }
    reportScore()
    renderDino(ctx, state)
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
    state = createDinoState()
    overSince = 0
    jumpEdge = false
    duckHeld = false
    lastScore = -1
    reportScore()
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

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('click', onClick)
  focusGameHost(host)
  running = true
  startLoop()
  renderDino(ctx, state)

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
      canvas.removeEventListener('click', onClick)
    },
  }
}

export const dinoGame: MiniGameDefinition = {
  id: 'dino',
  title: '恐龙跳一跳',
  icon: '🦖',
  description: 'Chrome 经典小恐龙：空格/点击跳跃，↓ 蹲下躲鸟，速度越来越快。',
  controls: ['空格 / ↑ / 点击：跳跃', '↓：蹲下躲鸟', 'P：暂停'],
  create: createDinoGame,
}
