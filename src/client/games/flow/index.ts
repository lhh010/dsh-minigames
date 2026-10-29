/**
 * 管道连线 game definition: wires the pure path logic into a
 * {@link MiniGameInstance} — pointer drag from a dot extends that color's
 * pipe (re-entering the own pipe truncates it, dragging another dot switches
 * colors), lifting the pointer keeps the path. Solving a level (every cell
 * filled, every pair dot-to-dot) fires onScore with the time bonus and
 * auto-advances 1.5s later. The internal level index is 0-based while the
 * displayed and persisted level is 1-based; sizes wrap 5×5→9×9. P toggles
 * pause (advance timer freezes via the stored-remainder pattern); R
 * restarts the CURRENT level with the same seed.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  computeScore, connectedCount, extendPath, grabPath, isWon, pathComplete,
  levelPairs, levelSize, puzzleFromSeed, type CellPaths, type FlowPuzzle,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderFlow } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createFlowGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // Persisted level is 1-based; this game's level index is 0-based.
  let level = readLevel('flow') - 1
  let puzzle: FlowPuzzle = makePuzzle(level)
  let paths: CellPaths = puzzle.dots.map(() => null)
  let dragging = -1
  let hoverCell = -1
  let solved = false
  let running = false
  let elapsedSecs = 0
  let shownSec = -1
  let elapsed = '0:00'
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  /** Hint overlay: the color whose solution path flashes (−1 = none). */
  let hintColor = -1
  let hintTimer = 0
  /** Any hint used this level → the time bonus is forfeited on win. */
  let hintUsed = false
  const particles = createParticles()

  function makePuzzle(lv: number): FlowPuzzle {
    const display = lv + 1
    return puzzleFromSeed(display * 0x9e3779b9, levelSize(display), levelPairs(display))
  }

  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: flow needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: flow needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    puzzle = makePuzzle(level)
    paths = puzzle.dots.map(() => null)
    dragging = -1
    hoverCell = -1
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    hintColor = -1
    hintTimer = 0
    hintUsed = false
    refit(puzzle.size)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('flow', next + 1) // persisted 1-based; `level` is 0-based
      startLevel(next)
    }, delayMs)
  }

  const view = () => ({
    puzzle,
    paths,
    activeColor: dragging,
    hoverCell,
    levelLabel: `第 ${level + 1} 关`,
    elapsed,
    connected: `${connectedCount(puzzle, paths)}/${puzzle.dots.length}`,
    solved,
    paused: false,
    hintColor: hintTimer > 0 ? hintColor : -1,
  })

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, paths)) return
    solved = true
    dragging = -1
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      // A hint forfeits the time bonus — the base score stands.
      const score = hintUsed
        ? computeScore(level + 1, Infinity)
        : computeScore(level + 1, elapsedSecs)
      options?.onScore?.(score)
    }
    const center = cellCenter(puzzle.size, Math.floor((puzzle.size * puzzle.size) / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  const cellFromEvent = (event: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    return cellAt(puzzle.size, x, y)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || solved) return
    const cell = cellFromEvent(event)
    if (cell < 0) return
    for (let c = 0; c < puzzle.dots.length; c += 1) {
      if (puzzle.dots[c]!.includes(cell)) {
        dragging = c
        paths = grabPath(puzzle, paths, c, cell)
        canvas.setPointerCapture(event.pointerId)
        loop.markDirty()
        return
      }
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!running) return
    const cell = cellFromEvent(event)
    if (cell !== hoverCell) {
      hoverCell = cell
      loop.markDirty()
    }
    if (dragging < 0 || solved || cell < 0) return
    const next = extendPath(puzzle, paths, dragging, cell)
    if (next !== paths) {
      paths = next
      loop.markDirty()
      checkSolved()
    }
  }

  const onPointerUp = (): void => {
    if (dragging < 0) return
    dragging = -1
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // Restart the CURRENT level (same seed → identical puzzle); drop any
      // pending auto-advance first so the win overlay cannot skip forward.
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      // Hint: flash one unfinished color's solution path for 2.5s. Any hint
      // this level forfeits the time bonus (base score stands). Answers the
      // "this level feels unsolvable" wall with proof it is not.
      if (!running || solved || puzzle.solution.length === 0) return
      event.preventDefault()
      let target = -1
      for (let c = 0; c < puzzle.dots.length; c += 1) {
        if (!pathComplete(puzzle, c, paths[c] ?? null)) { target = c; break }
      }
      if (target === -1) return
      hintColor = target
      hintTimer = 2.5
      hintUsed = true
      loop.markDirty()
    }
  }

  // 脏标记渲染：盘面只在输入、粒子或计时秒数变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    if (running && !solved) {
      // 计时按 f.dt 累积：挂起恢复后不会跳秒。
      elapsedSecs += f.dt
      const secs = Math.floor(elapsedSecs)
      if (secs !== shownSec) {
        shownSec = secs
        elapsed = `${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, '0')}`
        loop.markDirty()
      }
    }
    if (hintTimer > 0) {
      hintTimer -= f.dt
      if (hintTimer <= 0) {
        hintTimer = 0
        hintColor = -1
      }
      loop.markDirty()
    }
    const animating = particles.size() > 0
    if (f.render || animating || hintTimer > 0) {
      renderFlow(ctx, view())
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
    dragging = -1
    // Freeze the advance timer: stop it and keep the remainder.
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderFlow(ctx, { ...view(), activeColor: -1, paused: true })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
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
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const flowGame: MiniGameDefinition = {
  id: 'flow',
  title: '管道连线 Flow',
  icon: '🔵',
  description: '把同色圆点用管道连起来并填满整个棋盘，管道路径不能交叉重叠。',
  controls: ['从圆点拖动画线，松开保留', '回到自己的线上可截断', 'H：提示一条解线（弃时间奖励）', 'R：重开本关 · P：暂停'],
  create: createFlowGame,
}
