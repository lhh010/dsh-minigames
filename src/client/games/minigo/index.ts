/**
 * Mini Go game definition: wires the pure rules and the heuristic AI into a
 * {@link MiniGameInstance} — click to place, the AI replies after a short
 * delay, P passes, two passes end the game and settle by area scoring.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  BLACK, WHITE, KOMI, WIN_THRESHOLD, AI_LEVELS,
  createBoard, play, isLegal, areaScore, rc,
  type GoBoard,
} from './logic.ts'
import { chooseMove } from './ai.ts'
import { renderMiniGo, LOGICAL_W, LOGICAL_H, pointAt, type MiniGoView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'

const AI_DELAY_MS = 450

function createMiniGoGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: minigo needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 0
  let board: GoBoard = createBoard(9)
  let prev: GoBoard | null = null
  let lastMove = -1
  let captures = { black: 0, white: 0 }
  let moves = 0
  let hover = -1
  let over = false
  let winner: 0 | 1 | 2 = 0
  let blackArea = 0
  let whiteArea = 0
  let passes = 0
  let running = false
  let raf = 0
  let last = 0
  let aiAt = 0
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (!over) return
    const base = winner === BLACK ? 100 + (level + 1) * 10 : 10 + (level + 1)
    const margin = winner === BLACK ? Math.min(40, Math.max(0, Math.floor(blackArea - WIN_THRESHOLD))) : 0
    const score = base + margin
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const restart = (): void => {
    board = createBoard(9)
    prev = null
    lastMove = -1
    captures = { black: 0, white: 0 }
    moves = 0
    over = false
    winner = 0
    blackArea = 0
    whiteArea = 0
    passes = 0
    aiAt = 0
    lastScore = -1
  }

  const finish = (): void => {
    const s = areaScore(board, KOMI)
    blackArea = s.black
    whiteArea = s.white
    winner = s.winner
    over = true
    reportScore()
    const mid = rc(board, Math.floor(board.cells.length / 2))
    particles.burst(LOGICAL_W / 2, 40 + mid.r * 30, THEME.gold, 18, 160)
  }

  const applyPlay = (i: number, color: number): boolean => {
    const res = play(board, i, color)
    if (res === null) return false
    prev = board
    board = res.board
    if (res.captured.length > 0) {
      if (color === BLACK) captures.black += res.captured.length
      else captures.white += res.captured.length
      for (const s of res.captured) {
        const p = rc(board, s)
        particles.burst(20 + p.c * 30, 40 + p.r * 30, color === BLACK ? THEME.good : THEME.bad, 6, 90)
      }
    }
    lastMove = i
    moves += 1
    passes = 0
    return true
  }

  const aiMove = (): void => {
    const m = chooseMove(board, WHITE, level, prev)
    if (m < 0) {
      passes += 1
      if (passes >= 2) { finish(); return }
      return
    }
    if (!applyPlay(m, WHITE)) {
      // The AI must never pass on an illegal move: fall back to any legal move.
      const fallback = isLegal(board, m, WHITE, prev) ? m : -1
      if (fallback < 0) { passes += 1; if (passes >= 2) finish() }
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || over) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const i = pointAt(x, y)
    hover = i
    if (i < 0) return
    if (board.cells[i] !== 0) return
    if (!isLegal(board, i, BLACK, prev)) return
    if (applyPlay(i, BLACK)) aiAt = performance.now() + AI_DELAY_MS
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    hover = pointAt(x, y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (over || !running) return
      passes += 1
      if (passes >= 2) finish()
      else aiAt = performance.now() + AI_DELAY_MS
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    if (!over && aiAt > 0 && now >= aiAt) {
      aiAt = 0
      aiMove()
    }
    const view: MiniGoView = {
      board, lastMove, levelLabel: AI_LEVELS[level]!.label,
      captures, moves, hover, over, winner, blackArea, whiteArea,
    }
    renderMiniGo(ctx, view)
    particles.tick(ctx, dt)
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  last = performance.now()
  raf = requestAnimationFrame(frame)

  return {
    start: () => { running = true },
    pause: () => { running = false },
    resume: () => { running = true; last = performance.now() },
    destroy: () => {
      running = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const miniGoGame: MiniGameDefinition = {
  id: 'minigo',
  title: '迷你围棋',
  icon: '⚫',
  description: '9×9 迷你围棋：气、提子、禁自杀、劫，AI 随关卡加深（L1 贪心 / L2 提子 / L3 两层搜索）。',
  controls: ['点击交点落子', 'P：弃一手（连续两手终局）', 'R：重开'],
  create: createMiniGoGame,
}
