/**
 * Whack-a-mole game definition: wires the pure round logic into a
 * {@link MiniGameInstance} — click holes to whack the mole, restart, pause.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createWhackState, tickWhack, whack, type WhackState } from './logic.ts'
import { renderWhack, LOGICAL_W, LOGICAL_H, CELL, HUD_H, COLS, ROWS } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

function createWhackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: whack needs a 2d canvas context')
  const ctx = fit.ctx

  let state: WhackState = createWhackState()
  let running = false
  let raf = 0
  let last = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const holeFromEvent = (event: MouseEvent): number | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    return r * COLS + c
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.over) return
    const hole = holeFromEvent(event)
    if (hole === null) return
    whack(state, hole)
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createWhackState()
      lastScore = -1
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    tickWhack(state, dt)
    reportScore()
    renderWhack(ctx, state)
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
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderWhack(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const whackGame: MiniGameDefinition = {
  id: 'whack',
  title: '打地鼠',
  icon: '🔨',
  description: '30 秒限时打地鼠：地鼠冒头就点，命中 +1、打空 -1。',
  controls: ['点击：打地鼠', 'R：重开', 'P：暂停'],
  create: createWhackGame,
}
