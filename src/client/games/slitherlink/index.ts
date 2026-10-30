/**
 * Slitherlink game definition: wires the pure puzzle logic into a
 * {@link MiniGameInstance} — left-click toggles an edge line, right-click or
 * Shift+click marks a cross; solving a level fires onScore and auto-advances.
 * The internal level index is 0-based while the displayed and persisted
 * level is 1-based; the highest level reached persists through the shared
 * level-progress helper, so a remount resumes there instead of restarting
 * at the first puzzle. P toggles pause (run clock and advance timer freeze
 * via the stored-remainder pattern); R restarts the CURRENT level; [ / ]
 * jump between unlocked levels (bounded to the persisted highest reached).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVEL_SIZES, checkClues, edgeCount, isSolved, puzzleFromSeed, type EdgeState, type SlitherlinkPuzzle,
} from './logic.ts'
import { renderSlitherlink, logicalW, logicalH, edgeAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createSlitherlinkGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // Persisted level is 1-based; this game's level index is 0-based.
  let level = readLevel('slitherlink') - 1
  let puzzle: SlitherlinkPuzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, ...LEVEL_SIZES[level % LEVEL_SIZES.length]!)
  let edges: EdgeState[] = new Array<EdgeState>(edgeCount(puzzle.w, puzzle.h)).fill(0)
  let hover = -1
  let solved = false
  let running = false
  let startedAt = 0
  let pausedAt = 0
  let elapsed = '0:00'
  /** HUD 当前已显示的整秒数，用于按秒置脏。 */
  let shownSec = -1
  let advanceTimer = 0
  let advanceAt = 0
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
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('slitherlink', next + 1) // persisted 1-based; `level` is 0-based
      startLevel(next)
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
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  const toggleEdge = (i: number, mode: 'line' | 'cross'): void => {
    if (solved || i < 0 || i >= edges.length) return
    edges[i] = mode === 'line'
      ? (edges[i] === 1 ? 0 : 1) as EdgeState
      : (edges[i] === 2 ? 0 : 2) as EdgeState
    loop.markDirty()
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
    const next = edgeAt(puzzle.w, puzzle.h, x, y)
    if (next !== hover) {
      hover = next
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // Restart the CURRENT level; drop any pending auto-advance first so
      // the win overlay cannot skip straight to the next level.
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      // 切换关卡：先取消待跳转的自动推进计时器，再从全新关卡开始。
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = readLevel('slitherlink') - 1 // 0-based index bound
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next <= max) startLevel(next)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  // 脏标记渲染：盘面只在输入、悬停、粒子或计时秒数变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    if (!solved && startedAt > 0) {
      const secs = Math.floor((performance.now() - startedAt) / 1000)
      // HUD 计时按整秒显示：仅当显示秒变化时置脏。
      if (secs !== shownSec) {
        shownSec = secs
        elapsed = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, '0')}`
        loop.markDirty()
      }
    }
    const animating = particles.size() > 0
    if (f.render || animating) {
      renderSlitherlink(ctx, {
        w: puzzle.w, h: puzzle.h, clues: puzzle.clues, edges, hover,
        levelLabel: `第 ${level + 1} 关`, unique: puzzle.unique, elapsed,
        solved, paused: false,
        cluesAllSatisfied: checkClues(edges, puzzle.clues, puzzle.w, puzzle.h),
      })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    // Freeze the run clock: shift startedAt forward by the paused span on resume.
    pausedAt = performance.now()
    // Freeze the advance timer: stop it and keep the remainder.
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderSlitherlink(ctx, {
      w: puzzle.w, h: puzzle.h, clues: puzzle.clues, edges, hover,
      levelLabel: `第 ${level + 1} 关`, unique: puzzle.unique, elapsed,
      solved, paused: true,
      cluesAllSatisfied: checkClues(edges, puzzle.clues, puzzle.w, puzzle.h),
    })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (pausedAt > 0) {
      startedAt += performance.now() - pausedAt
      pausedAt = 0
    }
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startedAt = performance.now()
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
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
  controls: ['左键：画线/取消', '右键或 Shift+左键：标记叉', 'R：重开本关', '[ ]：切换关卡（已通关范围）', 'P：暂停'],
  create: createSlitherlinkGame,
}
