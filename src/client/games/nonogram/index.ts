/**
 * Nonogram game definition: wires the pure pattern logic into a
 * {@link MiniGameInstance} — 6 seeded levels; left-click / Space fills,
 * right-click / Shift+Space crosses (X), arrow keys move the cursor; filled
 * cells matching the pattern win, onScore fires, and the next level starts
 * 1.5s later (stored-remainder pattern keeps the advance timer paused-safe).
 * The highest level reached persists through the shared level-progress
 * helper, so a remount resumes there instead of restarting at level 1.
 * P toggles pause; R restarts the CURRENT level (same seed → same pattern).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS, SIZE, checkWin, cluesFrom, makePattern, type Cell, type Clues,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, cellAt, renderNonogram, type Cursor } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const ADVANCE_MS = 1500

/** Deterministic per-level seed; one seed per level keeps replays identical. */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9) >>> 0
}

function emptyCells(): Cell[][] {
  return Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0))
}

function createNonogramGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: nonogram needs a 2d canvas context')
  const ctx = fit.ctx

  let level = readLevel('nonogram')
  let pattern = makePattern(levelSeed(level))
  let clues: Clues = cluesFrom(pattern)
  let cells = emptyCells()
  let cursor: Cursor = { r: 0, c: 0 }
  let elapsed = 0
  let winText: string | null = null
  let running = false
  let raf = 0
  let last = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next
    pattern = makePattern(levelSeed(level))
    clues = cluesFrom(pattern)
    cells = emptyCells()
    cursor = { r: 0, c: 0 }
    elapsed = 0
    winText = null
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      // Level 6 completes the set; loop back to a fresh round.
      const next = level % LEVELS + 1
      saveLevel('nonogram', next)
      startLevel(next)
    }, delayMs)
  }

  /** Toggle fill at a cell (empty/crossed → filled, filled → empty). */
  const fillAt = (r: number, c: number): void => {
    cells[r]![c] = cells[r]![c] === 1 ? 0 : 1
    checkWinNow()
  }

  /** Toggle the X mark at a cell (empty → crossed, crossed → empty). */
  const crossAt = (r: number, c: number): void => {
    cells[r]![c] = cells[r]![c] === 2 ? 0 : 2
  }

  const checkWinNow = (): void => {
    if (winText !== null || !checkWin(cells, pattern)) return
    winText = `第 ${level} 关完成 · 用时 ${Math.floor(elapsed)} 秒`
    reportScore()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // paused at the win: arm on resume
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || winText !== null) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const cell = cellAt(x, y)
    if (cell === null) return
    cursor = cell
    if (event.button === 2 || event.shiftKey) crossAt(cell.r, cell.c)
    else if (event.button === 0) fillAt(cell.r, cell.c)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault() // right-click is a game action, not a menu
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level) // same seed → same pattern
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running || winText !== null) return
    if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      if (event.code === 'ArrowUp') cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
      else if (event.code === 'ArrowDown') cursor = { r: Math.min(SIZE - 1, cursor.r + 1), c: cursor.c }
      else if (event.code === 'ArrowLeft') cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
      else cursor = { r: cursor.r, c: Math.min(SIZE - 1, cursor.c + 1) }
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (event.shiftKey) crossAt(cursor.r, cursor.c)
      else fillAt(cursor.r, cursor.c)
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    if (winText === null) elapsed += dt
    renderNonogram(ctx, cells, clues, cursor, level, elapsed, false, winText)
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
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    stopLoop()
    renderNonogram(ctx, cells, clues, cursor, level, elapsed, true, winText)
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
  canvas.addEventListener('contextmenu', onContextMenu)
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
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const nonogramGame: MiniGameDefinition = {
  id: 'nonogram',
  title: '数织 Nonogram',
  icon: '🧩',
  description: '按行列数字提示涂满方格，还原隐藏图案；每关唯一解。',
  controls: [
    '点击 / 空格：涂格（再按取消）',
    '右键 / Shift+空格：标记 ✗',
    '方向键：移动光标',
    'R：重开本关',
    'P：暂停',
  ],
  create: createNonogramGame,
}
