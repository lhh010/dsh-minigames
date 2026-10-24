/**
 * 15-Puzzle 数字华容道 game definition: wires the pure slide logic into a
 * {@link MiniGameInstance} — arrow keys slide the tile adjacent to the blank
 * in the pressed direction, clicking an adjacent tile slides it; Z/Backspace
 * undoes, R restarts the CURRENT level (same seed → same scramble); levels
 * grow 3×3 → 4×4 → 5×5 and auto-advance 1.5s after the win overlay via the
 * stored-remainder pattern; P toggles pause. The highest level reached
 * persists per game id, so re-entering resumes where the player left off.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createSolved, isSolved, scrambleFrom, scrambleMovesFor, slide, type Dir,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderFifteen, tileAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'

const ADVANCE_MS = 1500
/** Undo history cap: rewind stays bounded and cheap. */
const MAX_HISTORY = 200
/** In-order board sizes per level (cycles 3 → 4 → 5 → 3 → ...). */
const SIZES = [3, 4, 5] as const

interface UndoEntry {
  board: number[]
  moves: number
}

function createFifteenGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: fifteen needs a 2d canvas context')
  const ctx = fit.ctx

  // Level memory: resume at the highest level reached (persisted per game id).
  let level = readLevel('fifteen')
  let moves = 0
  let par = 0
  const firstSize = SIZES[(level - 1) % SIZES.length]!
  // Deterministic per-level seed; one seed per level keeps replays identical.
  let board = scrambleFrom(createSolved(firstSize), level * 0x9e3779b9, scrambleMovesFor(firstSize)).board
  let winText: string | null = null
  let running = false
  let raf = 0
  let last = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const history: UndoEntry[] = []
  const particles = createParticles()

  const size = (): number => SIZES[(level - 1) % SIZES.length]!

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next
    saveLevel('fifteen', level) // progress memory: never regresses
    moves = 0
    const s = size()
    par = scrambleMovesFor(s)
    board = scrambleFrom(createSolved(s), level * 0x9e3779b9, par).board
    winText = null
    history.length = 0
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  /** Try one slide (direction or tile index); a legal slide counts a move. */
  const move = (m: Dir | number): void => {
    if (winText !== null) return // frozen during the win overlay
    const next = slide(board, m)
    if (next === null) return
    history.push({ board, moves })
    if (history.length > MAX_HISTORY) history.shift()
    moves += 1
    board = next
    if (isSolved(board)) {
      winText = `完成 · ${moves} 步（打乱 ${par} 步）`
      reportScore()
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 16, 150)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS // paused mid-burst: arm on resume
    }
  }

  /** Rewind the last slide (board + move counter); no-op at level start. */
  const undo = (): void => {
    if (winText !== null) return
    const entry = history.pop()
    if (entry === undefined) return
    board = entry.board
    moves = entry.moves
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // paused: freeze input
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const tile = tileAt(x, y, size())
    if (tile !== null) move(tile)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // Restart the CURRENT level: same seed → the same initial board.
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      winText = null
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyZ' || event.code === 'Backspace') {
      event.preventDefault()
      if (!running) return
      undo()
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      if (!running) return
      if (event.code === 'ArrowUp') move('up')
      else if (event.code === 'ArrowDown') move('down')
      else if (event.code === 'ArrowLeft') move('left')
      else if (event.code === 'ArrowRight') move('right')
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    renderFifteen(ctx, LOGICAL_W, LOGICAL_H, board, size(), level, moves, par, false, winText)
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
  const togglePause = (): void => {
    if (running) pause()
    else resume()
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
    renderFifteen(ctx, LOGICAL_W, LOGICAL_H, board, size(), level, moves, par, true, winText)
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
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const fifteenGame: MiniGameDefinition = {
  id: 'fifteen',
  title: '数字华容道 15-Puzzle',
  icon: '🔢',
  description: '滑动数字方块，把打乱的盘面恢复成 1 到 N 的顺序，关卡从 3×3 递进到 5×5。',
  controls: ['方向键：向该方向滑动紧邻空格的方块（也可点击）', 'Z / Backspace：撤销一步', 'R：重开本关', 'P：暂停'],
  create: createFifteenGame,
}
