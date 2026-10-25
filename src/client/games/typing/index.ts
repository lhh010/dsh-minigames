/**
 * Typing-meteors game definition: wires the pure falling-word logic into a
 * {@link MiniGameInstance} — rAF loop with clamped dt, letter keys with
 * preventDefault while the host has focus, ESC clears the lock, particle
 * bursts on completed words, pause (dt-driven, so fall/spawn freeze
 * exactly), and R restart.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createTypingState, escapeLock, tickTyping, typeLetter, type TypingState,
} from './logic.ts'
import { renderTyping, LOGICAL_W, LOGICAL_H, WORD_FONT } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createTypingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: typing needs a 2d canvas context')
  const ctx = fit.ctx

  let state: TypingState
  let running = false
  let lastScore = -1
  const particles = createParticles()

  // Measure word width with the real canvas font so spawn clamping matches
  // the rendered text exactly.
  const newState = (): TypingState => {
    ctx.font = WORD_FONT
    const state = createTypingState(Math.random, text => ctx.measureText(text).width)
    return state
  }
  state = newState()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** Handle one letter key against the current lock. */
  const inputLetter = (ch: string): void => {
    if (state.over) return
    const locked = state.lockId === null ? null : state.words.find(word => word.id === state.lockId)
    const result = typeLetter(state, ch)
    if (result === 'complete' && locked !== undefined && locked !== null) {
      particles.burst(locked.x + locked.text.length * 5, locked.y, accent(2), 14, 150)
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // Browser shortcuts (Ctrl/Cmd+R reload, Alt combos) stay with the browser.
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const letter = /^[a-zA-Z]$/.test(event.key) ? event.key : null
    // Gameplay letters take precedence over the R/P hotkeys: while a lock is
    // live every letter feeds it, and with no lock a letter that starts an
    // on-field word locks it instead of triggering the hotkey.
    if (letter !== null && running && !state.over) {
      const lockLive = state.lockId !== null && state.words.some(word => word.id === state.lockId)
      const startsWord = !lockLive && state.words.some(word => word.text[0] === letter.toLowerCase())
      if (lockLive || startsWord) {
        event.preventDefault()
        inputLetter(letter)
        return
      }
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = newState()
      lastScore = -1
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Escape') {
      event.preventDefault()
      if (running) escapeLock(state)
    } else if (letter !== null) {
      event.preventDefault()
      if (running) inputLetter(letter)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const dtMs = f.dt * 1000
    tickTyping(state, dtMs)
    reportScore()
    if (f.render) {
      const shakeDx = state.shake > 0 ? Math.sin(state.shake / 18) * 4 : 0
      renderTyping(ctx, state, false, shakeDx)
      particles.tick(ctx, dtMs)
    }
  }

  const loop = createFrameLoop(frame)
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
    // Frozen because all timing is dt-driven; nothing to store.
    renderTyping(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderTyping(ctx, state, false)

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

export const typingGame: MiniGameDefinition = {
  id: 'typing',
  title: '打字流星',
  icon: '🌠',
  description: '输入单词首字母锁定流星，拼完整个单词即可消除，别让单词落到底线。',
  controls: ['字母键：输入单词', 'Esc：取消锁定', 'R：重开', 'P：暂停'],
  create: createTypingGame,
}
