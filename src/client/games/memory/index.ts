/**
 * Memory-match game definition: wires the pure deck logic into a
 * {@link MiniGameInstance} — click to flip cards (with a brief mismatch
 * reveal), restart, and a moves counter.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createMemoryState, flip, type MemoryState } from './logic.ts'
import { COLS, PAIRS } from './logic.ts'
import { renderMemory, LOGICAL_W, LOGICAL_H, CELL, HUD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const MISMATCH_MS = 600

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
  let lockUntil = 0 // brief reveal window after a mismatch
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
    if (state.finished) return
    if (performance.now() < lockUntil) return
    const index = indexFromEvent(event)
    if (index === null) return
    const result = flip(state, index)
    if (result === 'mismatch') lockUntil = performance.now() + MISMATCH_MS
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createMemoryState()
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
  renderMemory(ctx, state)

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

export const memoryGame: MiniGameDefinition = {
  id: 'memory',
  title: '记忆翻牌',
  icon: '🃏',
  description: '翻开两张配对，全部配对完成即胜，步数越少越好。',
  controls: ['点击：翻牌', 'R：重开', 'P：暂停'],
  create: createMemoryGame,
}
