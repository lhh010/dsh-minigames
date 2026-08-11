/**
 * Othello game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — the player clicks to place black discs, the AI
 * answers after a short delay, and a win reports +100.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { chooseAiMove, createOthelloState, passTurn, place, type OthelloState } from './logic.ts'
import { renderOthello, LOGICAL_W, LOGICAL_H, CELL, HUD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const AI_DELAY_MS = 500

function createOthelloGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: othello needs a 2d canvas context')
  const ctx = fit.ctx

  let state: OthelloState = createOthelloState()
  let running = false
  let raf = 0
  let last = 0
  let aiAt = 0
  let lastScore = -1

  const reportScore = (): void => {
    // Score by wins: +100 per win.
    const score = state.winner === 1 && state.over ? 100 : 0
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const cellFromEvent = (event: MouseEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.floor(x / CELL)
    const r = Math.floor((y - HUD_H) / CELL)
    if (r < 0 || r >= 8 || c < 0 || c >= 8) return null
    return { r, c }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.over || state.turn !== 1) return
    const cell = cellFromEvent(event)
    if (cell === null) return
    if (place(state, cell.r, cell.c)) {
      reportScore()
      if (!state.over) aiAt = performance.now() + AI_DELAY_MS
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createOthelloState()
      aiAt = 0
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
    if (!state.over && state.turn === 2 && now >= aiAt) {
      const move = chooseAiMove(state)
      if (move !== null) place(state, move.r, move.c)
      else passTurn(state)
      reportScore()
    }
    void dt
    renderOthello(ctx, state)
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
  renderOthello(ctx, state)

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

export const othelloGame: MiniGameDefinition = {
  id: 'othello',
  title: '黑白棋',
  icon: '⚫',
  description: '黑白棋 vs AI：翻转夹住的对方棋子，角最重要，无棋可下自动让位。',
  controls: ['点击：落子', 'R：重开', 'P：暂停'],
  create: createOthelloGame,
}
