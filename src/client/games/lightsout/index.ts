/**
 * Lights Out game definition: wires the pure toggle logic into a
 * {@link MiniGameInstance} — click or arrow-navigate + Space/Enter toggles a
 * cell and its neighbors; Z/Backspace rewinds the last move; R restarts the
 * CURRENT level (deterministic per-level scramble, so the initial board is
 * identical); clearing a level fires onScore, bursts particles, and
 * auto-advances 1.5s later. Panel-driven pause (and the P hotkey) freezes
 * the advance timer via the stored-remainder pattern.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { SIZE, isSolved, scramble, scrambleCount, toggleAt } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, cellAt, cellCenter, renderLights, type Cursor } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
/** Undo history cap: rewind stays bounded and cheap. */
const MAX_HISTORY = 200

interface UndoEntry {
  board: ReturnType<typeof toggleAt>
  moves: number
}

function createLightsOutGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: lightsout needs a 2d canvas context')
  const ctx = fit.ctx

  // Level memory: the highest level reached persists in localStorage, so
  // re-entering the game resumes where the player left off instead of
  // restarting at level 1 every mount (per-level seeds stay deterministic).
  const LS_REACHED = 'dsh-minigames:lightsout:reached'
  const readReached = (): number => {
    try {
      const saved = window.localStorage.getItem(LS_REACHED)
      if (saved !== null) {
        const n = Number(saved)
        if (Number.isFinite(n) && n >= 1) return Math.floor(n)
      }
    } catch { /* storage unavailable */ }
    return 1
  }
  const saveReached = (lv: number): void => {
    try { window.localStorage.setItem(LS_REACHED, String(lv)) } catch { /* storage unavailable */ }
  }

  let level = readReached()
  let moves = 0
  // Deterministic per-level seed; one seed per level keeps replays identical.
  let board = scramble(level * 0x9e3779b9, scrambleCount(level))
  let cursor: Cursor = { r: 2, c: 2 }
  let winText: string | null = null
  let running = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const history: UndoEntry[] = []
  const particles = createParticles()

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next
    moves = 0
    board = scramble(level * 0x9e3779b9, scrambleCount(level))
    winText = null
    history.length = 0
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const move = (r: number, c: number): void => {
    if (winText !== null) return // frozen during the win overlay
    history.push({ board, moves })
    if (history.length > MAX_HISTORY) history.shift()
    moves += 1
    board = toggleAt(board, r, c)
    loop.markDirty()
    if (isSolved(board)) {
      winText = `第 ${level} 关完成 · ${moves} 步`
      saveReached(level + 1)
      reportScore()
      const center = cellCenter(r, c)
      particles.burst(center.x, center.y, THEME.gold, 14, 150)
      for (let i = 0; i < SIZE; i += 1) {
        const edge = cellCenter(i, c)
        particles.burst(edge.x, edge.y, THEME.good, 3, 90)
      }
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS // paused mid-burst: arm on resume
    }
  }

  /** Rewind the last move (board + move counter); no-op at level start. */
  const undo = (): void => {
    if (winText !== null) return
    const entry = history.pop()
    if (entry === undefined) return
    board = entry.board
    moves = entry.moves
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // paused: freeze input
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = cellAt(x, y)
    if (cell !== null) {
      cursor = cell
      move(cell.r, cell.c)
    }
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
    } else if (event.code.startsWith('Arrow') || event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (!running) return
      if (event.code === 'ArrowUp') cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
      else if (event.code === 'ArrowDown') cursor = { r: Math.min(SIZE - 1, cursor.r + 1), c: cursor.c }
      else if (event.code === 'ArrowLeft') cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
      else if (event.code === 'ArrowRight') cursor = { r: cursor.r, c: Math.min(SIZE - 1, cursor.c + 1) }
      else move(cursor.r, cursor.c)
      loop.markDirty()
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    // Static board: repaint only when the scheduler allows it or a burst is
    // still on the board.
    if (!f.render && particles.size() === 0) return
    renderLights(ctx, LOGICAL_W, LOGICAL_H, board, cursor, level, moves, false, winText)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame)

  const pause = (): void => {
    if (!running) return
    running = false
    // Freeze the advance timer: stop it and keep the remainder.
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderLights(ctx, LOGICAL_W, LOGICAL_H, board, cursor, level, moves, true, winText)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const lightsOutGame: MiniGameDefinition = {
  id: 'lightsout',
  title: '点灯 Lights Out',
  icon: '💡',
  description: '点亮或熄灭十字形相邻的灯，把整块面板全部熄灭。',
  controls: ['点击 / 方向键 + 空格或回车：切换', 'Z / Backspace：回退一步', 'R：重开本关', 'P：暂停'],
  create: createLightsOutGame,
}
