/**
 * Memory-match game definition: wires the pure deck logic into a
 * {@link MiniGameInstance} — click to flip cards (a mismatched pair stays
 * face-up for one second, then both flip back together), restart, and a
 * moves counter.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createMemoryState, flip, resetFlip, type MemoryState } from './logic.ts'
import { COLS, PAIRS } from './logic.ts'
import { renderMemory, LOGICAL_W, LOGICAL_H, CELL, HUD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const REVEAL_MS = 1000

function createMemoryGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: memory needs a 2d canvas context')
  const ctx = fit.ctx

  let state: MemoryState = createMemoryState()
  let running = false
  let lockUntil = 0 // ignore clicks while a mismatched pair is on display
  let flipTimer = 0 // timeout that flips a mismatched pair back down
  let revealRemaining = 0 // reveal time left when paused (pause must freeze it)
  let lastScore = -1

  const reportScore = (): void => {
    // Score by fewest moves: fewer moves -> higher score.
    const score = Math.max(0, 500 - state.moves * 5)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const indexFromEvent = (event: MouseEvent): number | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= 4 || c < 0 || c >= COLS) return null
    return r * COLS + c
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // paused: freeze the board
    if (state.finished) return
    if (performance.now() < lockUntil) return
    const index = indexFromEvent(event)
    if (index === null) return
    const result = flip(state, index)
    if (result === 'mismatch') {
      // Reveal both cards for a full second, then flip them back together.
      lockUntil = performance.now() + REVEAL_MS
      flipTimer = window.setTimeout(() => {
        resetFlip(state)
        reportScore()
        loop.markDirty()
      }, REVEAL_MS)
    }
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(flipTimer)
      flipTimer = 0
      revealRemaining = 0
      state = createMemoryState()
      lockUntil = 0
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    void f.dt
    if (f.render) renderMemory(ctx, state, false)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    // Freeze the mismatch reveal: stop the timer and keep the remainder.
    if (flipTimer !== 0) {
      clearTimeout(flipTimer)
      flipTimer = 0
      revealRemaining = Math.max(0, lockUntil - performance.now())
    }
    loop.pause()
    renderMemory(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    // Resume a frozen reveal from where it stopped.
    if (revealRemaining > 0 && state.flipped.length >= 2) {
      lockUntil = performance.now() + revealRemaining
      flipTimer = window.setTimeout(() => {
        resetFlip(state)
        reportScore()
        loop.markDirty()
      }, revealRemaining)
    }
    revealRemaining = 0
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderMemory(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(flipTimer)
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const memoryGame: MiniGameDefinition = {
  id: 'memory',
  title: '记忆翻牌',
  icon: '🃏',
  description: '翻开两张配对，全部配对完成即胜，步数越少越好。',
  controls: ['点击：翻牌', 'R：重开', 'P：暂停'],
  create: createMemoryGame,
}
