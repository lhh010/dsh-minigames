/**
 * Gomoku game definition: wires the pure board logic into a
 * {@link MiniGameInstance} — click to place your stone, a simple heuristic AI
 * replies, restart on win/lose.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { chooseAiMove, createGomokuState, place, type GomokuState } from './logic.ts'
import { SIZE } from './logic.ts'
import { renderGomoku, LOGICAL_W, LOGICAL_H, CELL, HUD_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const AI_DELAY_MS = 500

function createGomokuGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: gomoku needs a 2d canvas context')
  const ctx = fit.ctx

  let state: GomokuState = createGomokuState()
  let running = false
  let raf = 0
  let last = 0
  let aiAt = 0 // timestamp when the AI should move
  let lastScore = -1

  const reportScore = (): void => {
    // Score by wins: each win adds 100 points.
    const score = Math.max(0, Math.floor((performance.now() - 0) * 0)) + (state.winner === 1 && state.over ? 100 : 0)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const indexFromEvent = (event: MouseEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const c = Math.round((x - CELL / 2) / CELL)
    const r = Math.round((y - HUD_H - CELL / 2) / CELL)
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
    return { r, c }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.over || state.turn !== 1) return
    const cell = indexFromEvent(event)
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
      state = createGomokuState()
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
      reportScore()
    }
    void dt
    renderGomoku(ctx, state)
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
  renderGomoku(ctx, state)

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

export const gomokuGame: MiniGameDefinition = {
  id: 'gomoku',
  title: '五子棋',
  icon: '⚫',
  description: '15x15 五子棋 vs AI：五子连珠即胜，AI 会进攻也会堵你。',
  controls: ['点击：落子', 'R：重新开始', 'P：暂停'],
  create: createGomokuGame,
}
