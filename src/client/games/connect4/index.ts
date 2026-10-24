/**
 * Connect Four game definition: wires the pure rules and the alpha-beta AI
 * into a {@link MiniGameInstance} — click a column (or press 1-7) to drop,
 * the AI replies after a short delay; levels ramp the search depth.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  COLS, RED, YELLOW, createBoard, drop, findWinner, isFull, result,
  legalColumns, dropRow, type GameResult,
} from './logic.ts'
import { chooseMove } from './ai.ts'
import { renderConnect4, LOGICAL_W, LOGICAL_H, colAt, type Connect4View } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'

const AI_DELAY_MS = 350
/** Per-level AI search depth (ply). */
const LEVEL_DEPTH = [1, 3, 5, 7]
const WIN_STREAK_MULT = [1, 1.5, 2, 3]

function createConnect4Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: connect4 needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 0
  let board = createBoard()
  let lastMove = -1
  let hoverCol = -1
  let over: GameResult = 'playing'
  let winCells: readonly number[] | null = null
  let record = { w: 0, d: 0, l: 0 }
  let winStreak = 0
  let running = false
  let raf = 0
  let last = 0
  let aiAt = 0
  let lastScore = -1
  const particles = createParticles()

  const depth = (): number => LEVEL_DEPTH[Math.min(level, LEVEL_DEPTH.length - 1)]!

  const reportScore = (): void => {
    if (over === 'playing') return
    const d = depth()
    let score: number
    if (over === 'red') {
      const mult = WIN_STREAK_MULT[Math.min(winStreak, WIN_STREAK_MULT.length - 1)]!
      score = Math.round((10 * d + 10) * mult)
    } else if (over === 'draw') {
      score = 5 * d
    } else {
      score = 1
    }
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const restart = (): void => {
    board = createBoard()
    lastMove = -1
    over = 'playing'
    winCells = null
    aiAt = 0
    lastScore = -1
  }

  const settle = (): void => {
    const w = findWinner(board)
    if (w !== null) {
      winCells = w.cells
      over = w.color === RED ? 'red' : 'yellow'
      if (over === 'red') { record.w += 1; winStreak += 1 }
      else { record.l += 1; winStreak = 0 }
    } else if (isFull(board)) {
      over = 'draw'
      record.d += 1
      winStreak = 0
    } else return
    reportScore()
    if (over === 'red') {
      // Advance after a short celebration.
      window.setTimeout(() => {
        if (level < LEVEL_DEPTH.length - 1) level += 1
        restart()
      }, 1400)
    }
  }

  const aiMove = (): void => {
    const col = chooseMove(board, YELLOW, depth())
    if (col < 0) { settle(); return }
    const res = drop(board, col, YELLOW)
    if (res === null) { settle(); return }
    board = res.board
    lastMove = col * 6 + res.row
    settle()
  }

  const playerDrop = (col: number): void => {
    if (over !== 'playing' || aiAt > 0) return
    const res = drop(board, col, RED)
    if (res === null) return
    board = res.board
    lastMove = col * 6 + res.row
    settle()
    if (over === 'playing') aiAt = performance.now() + AI_DELAY_MS
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const col = colAt(x, y)
    hoverCol = col
    if (col >= 0) playerDrop(col)
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    hoverCol = colAt(x, y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    const m = /^Digit([1-7])$/.exec(event.code)
    if (m !== null) {
      event.preventDefault()
      playerDrop(Number(m[1]) - 1)
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    if (over === 'playing' && aiAt > 0 && now >= aiAt) {
      aiAt = 0
      aiMove()
    }
    const view: Connect4View = {
      board, hoverCol, lastMove,
      levelLabel: `L${level + 1}·深度${depth()}`,
      record, result: over, winCells,
    }
    renderConnect4(ctx, view)
    particles.tick(ctx, dt)
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  last = performance.now()
  raf = requestAnimationFrame(frame)

  // Sanity export for tests/debug: the first legal column helper is unused
  // in the glue but keeps the import list honest.
  void legalColumns
  void dropRow
  void COLS

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

export const connect4Game: MiniGameDefinition = {
  id: 'connect4',
  title: '四子棋',
  icon: '🔴',
  description: '七列落子四连即胜：AI 用 α-β 剪枝搜索，关卡越深越强（深度 1→7）。',
  controls: ['点击列 / 数字键 1-7：落子', 'R：重开'],
  create: createConnect4Game,
}
