/**
 * Slitherlink game definition: wires the pure puzzle logic into a
 * {@link MiniGameInstance} — left-click toggles an edge line, right-click or
 * Shift+click marks a cross; solving a level fires onScore and auto-advances.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVEL_SIZES, edgeCount, isSolved, puzzleFromSeed, type EdgeState, type SlitherlinkPuzzle,
} from './logic.ts'
import { renderSlitherlink, logicalW, logicalH, edgeAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'

const ADVANCE_MS = 1500

function createSlitherlinkGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  let level = 0
  let puzzle: SlitherlinkPuzzle = puzzleFromSeed(1, ...LEVEL_SIZES[0]!)
  let edges: EdgeState[] = new Array<EdgeState>(edgeCount(puzzle.w, puzzle.h)).fill(0)
  let hover = -1
  let solved = false
  let running = false
  let raf = 0
  let last = 0
  let startedAt = 0
  let elapsed = '0:00'
  let advanceTimer = 0
  let advanceRemaining = 0
  let lastScore = -1
  const particles = createParticles()
  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.w), logicalH(puzzle.h))
  if (initialFit === null) throw new Error('dsh-minigames: slitherlink needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (w: number, h: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(w), logicalH(h))
    if (next === null) throw new Error('dsh-minigames: slitherlink needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    const [w, h] = LEVEL_SIZES[level % LEVEL_SIZES.length]!
    puzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, w, h)
    edges = new Array<EdgeState>(edgeCount(w, h)).fill(0)
    solved = false
    hover = -1
    startedAt = performance.now()
    // Re-fit the canvas for the new grid size.
    refit(w, h)
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isSolved(edges, puzzle.clues, puzzle.w, puzzle.h)) return
    solved = true
    if (level + 1 !== lastScore) {
      lastScore = level + 1
      options?.onScore?.(level + 1)
    }
    const cx = logicalW(puzzle.w) / 2
    const cy = logicalH(puzzle.h) / 2
    particles.burst(cx, cy, THEME.gold, 18, 170)
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  const toggleEdge = (i: number, mode: 'line' | 'cross'): void => {
    if (solved || i < 0 || i >= edges.length) return
    edges[i] = mode === 'line'
      ? (edges[i] === 1 ? 0 : 1) as EdgeState
      : (edges[i] === 2 ? 0 : 2) as EdgeState
    checkSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.w)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.h)) / rect.height
    const i = edgeAt(puzzle.w, puzzle.h, x, y)
    if (i < 0) return
    const cross = event.button === 2 || event.shiftKey
    toggleEdge(i, cross ? 'cross' : 'line')
  }

  const onContextMenu = (event: MouseEvent): void => { event.preventDefault() }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.w)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.h)) / rect.height
    hover = edgeAt(puzzle.w, puzzle.h, x, y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(level)
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    if (!solved && startedAt > 0) {
      const secs = Math.floor((now - startedAt) / 1000)
      elapsed = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, '0')}`
    }
    renderSlitherlink(ctx, {
      w: puzzle.w, h: puzzle.h, clues: puzzle.clues, edges, hover,
      levelLabel: `第 ${level + 1} 关`, unique: puzzle.unique, elapsed,
      solved, paused: false,
    })
    particles.tick(ctx, dt)
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startedAt = performance.now()
  last = performance.now()
  raf = requestAnimationFrame(frame)

  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = ADVANCE_MS
    }
    renderSlitherlink(ctx, {
      w: puzzle.w, h: puzzle.h, clues: puzzle.clues, edges, hover,
      levelLabel: `第 ${level + 1} 关`, unique: puzzle.unique, elapsed,
      solved, paused: true,
    })
  }
  const resume = (): void => {
    if (running) return
    running = true
    last = performance.now()
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    raf = requestAnimationFrame(frame)
  }

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      cancelAnimationFrame(raf)
      clearTimeout(advanceTimer)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const slitherlinkGame: MiniGameDefinition = {
  id: 'slitherlink',
  title: '数回 Slitherlink',
  icon: '⭕',
  description: '画一条闭合线圈：每个数字表示它四周边线的条数，5×5 起步逐关变大。',
  controls: ['左键：画线/取消', '右键或 Shift+左键：标记叉', 'R：重开本关'],
  create: createSlitherlinkGame,
}
