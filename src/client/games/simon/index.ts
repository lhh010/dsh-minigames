/**
 * Simon game definition: wires the pure sequence logic into a
 * {@link MiniGameInstance} — the sequence flashes pad by pad, the player
 * repeats it with clicks or A/S/D/F keys, rounds grow and speed up, and
 * pause freezes the show timers via the stored-remainder pattern.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  FLASH_MS, advanceShow, createSimonState, flashInterval, press, startRound,
  type SimonState,
} from './logic.ts'
import { PAD_KEYS } from './logic.ts'
import { renderSimon, padAt, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const START_DELAY_MS = 700
const ROUND_CLEAR_MS = 800
const PRESS_FLASH_MS = 180

function createSimonGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: simon needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SimonState = createSimonState()
  let running = false
  let raf = 0
  let last = 0
  let lit: number | null = null
  let stepTimer = 0 // timeout for the next flash start / round-start gap
  let stepAt = 0 // absolute deadline of stepTimer
  let litOffTimer = 0 // timeout that turns the lit pad off
  let litOffAt = 0 // absolute deadline of litOffTimer
  let stepRemaining = 0 // paused remainder of stepTimer
  let litRemaining = 0 // paused remainder of litOffTimer
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const clearTimers = (): void => {
    clearTimeout(stepTimer)
    stepTimer = 0
    clearTimeout(litOffTimer)
    litOffTimer = 0
  }

  const lightPad = (pad: number, ms: number): void => {
    lit = pad
    clearTimeout(litOffTimer)
    litOffAt = performance.now() + ms
    litOffTimer = window.setTimeout(() => {
      lit = null
      litOffTimer = 0
    }, ms)
  }

  /** Fire one flash step: light the current pad, advance, arm the next step. */
  const step = (): void => {
    const pad = state.sequence[state.showIndex]
    if (pad === undefined) return
    lightPad(pad, FLASH_MS)
    advanceShow(state)
    if (state.phase === 'showing') scheduleStep(Math.max(50, flashInterval(state.round) - FLASH_MS))
  }

  const scheduleStep = (delayMs: number): void => {
    stepAt = performance.now() + delayMs
    stepTimer = window.setTimeout(step, delayMs)
  }

  const inputPad = (pad: number): void => {
    if (state.phase !== 'input') return
    lightPad(pad, PRESS_FLASH_MS)
    const result = press(state, pad)
    if (result === 'round-clear') {
      reportScore()
      startRound(state)
      scheduleStep(ROUND_CLEAR_MS)
    }
    // 'wrong' -> over; render shows the overlay, 按 R 重开.
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // paused: freeze input
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const pad = padAt(x, y)
    if (pad !== null) inputPad(pad)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimers()
      stepRemaining = 0
      litRemaining = 0
      lit = null
      state = createSimonState()
      lastScore = -1
      startRound(state)
      if (running) scheduleStep(START_DELAY_MS)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else {
      const pad = PAD_KEYS.indexOf(event.code as (typeof PAD_KEYS)[number])
      if (pad !== -1) {
        event.preventDefault()
        if (running) inputPad(pad)
      }
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    last = now
    void last
    renderSimon(ctx, state, lit, false)
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
    if (!running) return
    running = false
    // Freeze the show/input timers: stop them and keep the remainders.
    if (stepTimer !== 0) {
      clearTimeout(stepTimer)
      stepTimer = 0
      stepRemaining = Math.max(0, stepAt - performance.now())
    }
    if (litOffTimer !== 0) {
      clearTimeout(litOffTimer)
      litOffTimer = 0
      litRemaining = Math.max(0, litOffAt - performance.now())
    }
    stopLoop()
    renderSimon(ctx, state, lit, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    // Resume frozen timers from where they stopped.
    if (stepRemaining > 0) {
      scheduleStep(stepRemaining)
    } else if (state.phase === 'showing' && stepTimer === 0) {
      scheduleStep(START_DELAY_MS)
    }
    stepRemaining = 0
    if (lit !== null && litRemaining > 0) {
      lightPad(lit, litRemaining)
    }
    litRemaining = 0
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startRound(state)
  scheduleStep(START_DELAY_MS)
  startLoop()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      clearTimers()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const simonGame: MiniGameDefinition = {
  id: 'simon',
  title: 'Simon 记忆序列',
  icon: '🎵',
  description: '记住闪烁序列并复现，回合越往后越长越快。',
  controls: ['点击 / A S D F：按键', 'R：重开', 'P：暂停'],
  create: createSimonGame,
}
