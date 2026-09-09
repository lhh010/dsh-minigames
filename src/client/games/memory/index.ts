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
  let raf = 0
  let last = 0
  let lockUntil = 0 // ignore clicks while a mismatched pair is on display
  let flipTimer = 0 // timeout that flips a mismatched pair back down
  let revealRemaining = 0
  let lastScore = -1

  const reportScore = (): void => {
    // 只在通关时上报，避免第一次翻牌的临时分数被面板当成最高分。
    if (!state.finished) return
    // Score by fewest moves: fewer moves -> higher score.
    const score = Math.max(0, 500 - state.moves * 5)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const reset = (): void => {
    clearTimeout(flipTimer)
    flipTimer = 0
    revealRemaining = 0
    lockUntil = 0
    state = createMemoryState()
    lastScore = -1
    reportScore()
  }

  const scheduleFlipReset = (): void => {
    if (revealRemaining <= 0) return
    flipTimer = window.setTimeout(() => {
      flipTimer = 0
      if (!running) return
      resetFlip(state)
      lockUntil = 0
      revealRemaining = 0
      reportScore()
    }, revealRemaining)
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
    if (!running) return
    if (state.finished) return
    if (performance.now() < lockUntil) return
    const index = indexFromEvent(event)
    if (index === null) return
    const result = flip(state, index)
    if (result === 'mismatch') {
      // Reveal both cards for a full second, then flip them back together.
      revealRemaining = REVEAL_MS
      lockUntil = performance.now() + revealRemaining
      scheduleFlipReset()
    }
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.repeat && (event.code === 'KeyP' || event.code === 'KeyR')) return
    if (!running && event.code !== 'KeyP' && event.code !== 'KeyR') return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (options?.onRestartRequest) options.onRestartRequest()
      else reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (options?.onPauseRequest) options.onPauseRequest()
      else togglePause()
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000))
    last = now
    void dt
    renderMemory(ctx, state)
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
    if (flipTimer !== 0) {
      clearTimeout(flipTimer)
      flipTimer = 0
      revealRemaining = Math.max(0, lockUntil - performance.now())
      lockUntil = 0
    }
    stopLoop()
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (revealRemaining > 0) {
      lockUntil = performance.now() + revealRemaining
      scheduleFlipReset()
    }
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderMemory(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
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
