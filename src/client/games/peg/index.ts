/**
 * Peg Solitaire (孔明棋) game definition: wires the pure jump logic into a
 * {@link MiniGameInstance} — click a peg then a landing hole (or arrows +
 * Enter to pick and land), Z/Backspace rewinds the last jump, R restarts the
 * CURRENT level. Winning a level fires onScore with the level number, bursts
 * particles, and auto-advances 1.5s later (wrapping L3 back to L1). Invalid
 * picks flash a brief toast.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { BOARD_MASK, CENTER, LEVELS, START_BOARDS, applyMove, isWin, jumpedPeg, legalMoves, pegCount, type PegBoard } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, holeAt, holeCenter, renderPeg } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, accent, createParticles } from '../theme.ts'

const ADVANCE_MS = 1500
const TOAST_MS = 900
/** Undo history cap: rewind stays bounded and cheap. */
const MAX_HISTORY = 200

interface PegHistory {
  board: PegBoard
}

function createPegGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: peg needs a 2d canvas context')
  const ctx = fit.ctx

  const history: PegHistory[] = []

  let level = 0
  let board: PegBoard = START_BOARDS[0]!.slice()
  let cursor = CENTER
  let selected: number | null = null
  let toast: string | null = null
  let toastTimer = 0
  let running = false
  let raf = 0
  let last = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const particles = createParticles()

  const won = (): boolean => isWin(board, level)
  const stuck = (): boolean => !won() && pegCount(board) > 1 && legalMoves(board).length === 0

  // Scoring: the fewer pegs remain, the better. The panel keeps the HIGHEST
  // score, so report cleared pegs (start − remaining); both a win and a
  // deadlock settle the round and bank the cleared count.
  const clearedPegs = (): number => pegCount(START_BOARDS[level]!) - pegCount(board)

  const reportScore = (): void => {
    const score = clearedPegs()
    if (score <= lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const showToast = (text: string): void => {
    toast = text
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast = null
      toastTimer = 0
    }, TOAST_MS)
  }

  const startLevel = (next: number): void => {
    level = ((next % LEVELS.length) + LEVELS.length) % LEVELS.length
    board = START_BOARDS[level]!.slice()
    cursor = CENTER
    selected = null
    history.length = 0
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const hints = (): number[] => (selected === null ? [] : legalMoves(board).filter(([from]) => from === selected).map(([, to]) => to))

  /** Click/Enter on a hole: pick a peg, re-pick another peg, or land a jump. */
  const activate = (index: number): void => {
    if (won() || stuck()) return // frozen behind the overlay
    if (selected === null) {
      if (board[index] === 1) selected = index
      else showToast('先选一枚棋子')
      return
    }
    if (board[index] === 1) {
      selected = index // re-pick another peg
      return
    }
    const next = applyMove(board, selected, index)
    if (next === null) {
      showToast('不能跳到这里')
      return
    }
    history.push({ board })
    if (history.length > MAX_HISTORY) history.shift()
    const center = holeCenter(index)
    const mid = jumpedPeg(selected, index)!
    const midC = holeCenter(mid)
    particles.burst(midC.x, midC.y, accent(mid), 8, 110)
    board = next
    selected = null
    cursor = index
    if (won() || stuck()) reportScore()
    if (won()) {
      particles.burst(center.x, center.y, THEME.gold, 16, 150)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS // paused mid-burst: arm on resume
    }
  }

  /**
   * Rewind the last jump. A STUCK (dead-end) board is rewindable — that is
   * the whole point of undo after a dead end. A WIN is final (reverting it
   * would let the player re-play the winning move for score).
   */
  const undo = (): void => {
    if (won()) return
    const entry = history.pop()
    if (entry === undefined) return
    board = entry.board
    selected = null
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // paused: freeze input
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const index = holeAt(x, y)
    if (index !== null) {
      cursor = index
      activate(index)
    }
  }

  /** Step the cursor to the nearest hole in a direction, or stay if none. */
  const stepCursor = (dr: number, dc: number): void => {
    let r = Math.floor(cursor / 7)
    let c = cursor % 7
    for (;;) {
      r += dr
      c += dc
      if (r < 0 || r >= 7 || c < 0 || c >= 7) return
      const index = r * 7 + c
      if (BOARD_MASK[index] === 1) {
        cursor = index
        return
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // Restart the CURRENT level: same start board.
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyZ' || event.code === 'Backspace') {
      event.preventDefault()
      if (!running) return
      undo()
    } else if (event.code === 'Escape') {
      event.preventDefault()
      if (!running) return
      selected = null
    } else if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      if (!running) return
      activate(cursor)
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      if (!running) return
      if (event.code === 'ArrowUp') stepCursor(-1, 0)
      else if (event.code === 'ArrowDown') stepCursor(1, 0)
      else if (event.code === 'ArrowLeft') stepCursor(0, -1)
      else if (event.code === 'ArrowRight') stepCursor(0, 1)
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    renderPeg(ctx, {
      board, cursor, selected, hints: hints(), levelDisplay: level + 1,
      levelName: LEVELS[level]!.name, toast, win: won(), stuck: stuck(),
      cleared: clearedPegs(),
    }, false)
    particles.tick(ctx, dt)
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
  const pause = (): void => {
    if (!running) return
    running = false
    // Freeze the advance timer: stop it and keep the remainder.
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    stopLoop()
    renderPeg(ctx, {
      board, cursor, selected, hints: [], levelDisplay: level + 1,
      levelName: LEVELS[level]!.name, toast, win: won(), stuck: stuck(),
      cleared: clearedPegs(),
    }, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      clearTimeout(toastTimer)
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const pegGame: MiniGameDefinition = {
  id: 'peg',
  title: '孔明棋 Peg Solitaire',
  icon: '🔻',
  description: '跳过相邻棋子落入空位并吃掉它——清掉的棋子越多得分越高，满盘下到只剩一枚为完美。',
  controls: ['点击 / 方向键 + 回车：选子并落子', 'Z / Backspace：回退一步', 'R：重开本关'],
  create: createPegGame,
}
