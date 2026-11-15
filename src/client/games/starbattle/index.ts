/**
 * 星之战 game definition: wires the pure starbattle logic into a
 * MiniGameInstance — click cycles a cell 空→星→✗ (right-click marks ✗
 * directly), conflicts (over-cap line/region or touching stars) glow red as
 * instant feedback without blocking input, and when every row/column/region
 * holds exactly k pairwise-non-adjacent stars the level is won: onScore fires
 * with the time bonus and the game auto-advances 1.5s later. H plants one
 * correct star (3 per level), R restarts the same puzzle, P pauses (timer
 * freezes via the stored-remainder pattern). Persisted level resumes after a
 * refresh. Render loop is dirty-mode: repaints only on change plus star-pop
 * animation frames.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  computeScore, cycleMark, isWon, levelSize, puzzleFromSeed,
  type StarPuzzle,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderStarBattle } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
const POP_MS = 220
const MAX_HINTS = 3

function createStarBattleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // Persisted level is 1-based; this game's level index is 0-based.
  let level = readLevel('starbattle') - 1
  let puzzle: StarPuzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, levelSize(level + 1))
  let marks: number[] = new Array<number>(puzzle.size * puzzle.size).fill(0)
  let hintsLeft = MAX_HINTS
  let solved = false
  let running = false
  let elapsedSecs = 0
  let shownSec = -1
  let elapsed = '0:00'
  let winText: string | null = null
  let hover = -1
  let animUntil = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  const bornAt = new Map<number, number>()
  const particles = createParticles()

  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: starbattle needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: starbattle needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const starCells = (): number[] => {
    const out: number[] = []
    for (let i = 0; i < marks.length; i += 1) if (marks[i] === 1) out.push(i)
    return out
  }

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    puzzle = puzzleFromSeed(display * 0x9e3779b9, levelSize(display))
    marks = new Array<number>(puzzle.size * puzzle.size).fill(0)
    hintsLeft = MAX_HINTS
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    hover = -1
    bornAt.clear()
    refit(puzzle.size)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('starbattle', next + 1) // persisted 1-based; level is 0-based
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, starCells())) return
    solved = true
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      options?.onScore?.(computeScore(level + 1, elapsedSecs))
    }
    const center = cellCenter(puzzle.size, Math.floor(puzzle.size / 2), Math.floor(puzzle.size / 2))
    particles.burst(center.x, center.y, THEME.gold, 24, 180)
    animUntil = performance.now() + POP_MS
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** 点击循环：空 → 星 → ✗ → 空；冲突不阻止，仅红显。 */
  const cycleCell = (cell: number): void => {
    if (!running || solved || cell < 0) return
    const next = cycleMark(marks[cell] as 0 | 1 | 2)
    marks[cell] = next
    if (next === 1) {
      bornAt.set(cell, performance.now())
      animUntil = Math.max(animUntil, performance.now() + POP_MS)
      const { x, y } = cellCenter(puzzle.size, Math.floor(cell / puzzle.size), cell % puzzle.size)
      particles.burst(x, y, THEME.gold, 6, 90)
      loop.markDirty()
      checkSolved()
      return
    }
    if (next === 0) bornAt.delete(cell)
    loop.markDirty()
  }

  /** 右键：直接打/撤 ✗ 标记。 */
  const toggleCross = (cell: number): void => {
    if (!running || solved || cell < 0) return
    marks[cell] = marks[cell] === 2 ? 0 : 2
    if (marks[cell] !== 1) bornAt.delete(cell)
    loop.markDirty()
  }

  /** H：放一颗正确星（限 MAX_HINTS 次）。 */
  const useHint = (): void => {
    if (!running || solved || hintsLeft <= 0) return
    const target = puzzle.solution.find(s => marks[s] !== 1)
    if (target === undefined) return
    hintsLeft -= 1
    marks[target] = 1
    bornAt.set(target, performance.now())
    animUntil = Math.max(animUntil, performance.now() + POP_MS)
    const { x, y } = cellCenter(puzzle.size, Math.floor(target / puzzle.size), target % puzzle.size)
    particles.burst(x, y, THEME.good, 8, 110)
    loop.markDirty()
    checkSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || event.button !== 0) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const hit = cellAt(puzzle.size, x, y)
    if (hit !== null) cycleCell(hit.r * puzzle.size + hit.c)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const hit = cellAt(puzzle.size, x, y)
    if (hit !== null) toggleCross(hit.r * puzzle.size + hit.c)
  }

  const onMouseMove = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const hit = cellAt(puzzle.size, x, y)
    const next = hit === null ? -1 : hit.r * puzzle.size + hit.c
    if (next !== hover) {
      hover = next
      loop.markDirty()
    }
  }

  const onMouseLeave = (): void => {
    if (hover !== -1) {
      hover = -1
      loop.markDirty()
    }
  }

  /** P 键：运行中暂停，暂停中恢复。 */
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      useHint()
    }
  }

  const loop = createFrameLoop(f => {
    if (running && !solved) {
      elapsedSecs += f.dt
      const secs = Math.floor(elapsedSecs)
      if (secs !== shownSec) {
        shownSec = secs
        const mm = String(Math.floor(secs / 60))
        const ss = String(secs % 60).padStart(2, '0')
        elapsed = mm + ':' + ss
        loop.markDirty()
      }
    }
    const now = performance.now()
    const animating = now < animUntil || particles.size() > 0
    if (f.render || animating) {
      renderStarBattle(ctx, puzzle, {
        marks, level: level + 1, placed: starCells().length, hintsLeft, elapsed,
        hover, bornAt, nowMs: now, paused: false, winText,
      })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderStarBattle(ctx, puzzle, {
      marks, level: level + 1, placed: starCells().length, hintsLeft, elapsed,
      hover, bornAt, nowMs: performance.now(), paused: true, winText,
    })
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    if (solved && advanceTimer === 0 && advanceRemaining > 0) scheduleAdvance(advanceRemaining)
  }

  host.addEventListener('mousedown', onMouseDown)
  host.addEventListener('contextmenu', onContextMenu)
  host.addEventListener('mousemove', onMouseMove)
  host.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('keydown', onKeyDown)

  return {
    start(): void {
      focusGameHost(host)
      running = true
      loop.start()
    },
    pause,
    resume,
    destroy(): void {
      running = false
      clearTimeout(advanceTimer)
      advanceTimer = 0
      loop.destroy()
      fit.dispose()
      host.removeEventListener('mousedown', onMouseDown)
      host.removeEventListener('contextmenu', onContextMenu)
      host.removeEventListener('mousemove', onMouseMove)
      host.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

/** 星之战 Star Battle：每行每列每区恰 k 颗互不邻接的星。 */
export const starbattleGame: MiniGameDefinition = {
  id: 'starbattle',
  title: '星之战 StarBattle',
  icon: '⭐',
  description: '每行每列每个区域放同样数量的星（9×9 前一颗，之后两颗）——但它们谁也不能挨着谁。',
  controls: ['点击：空 → 星 → ✗（循环）', '右键：直接标记 ✗ · H：提示（限 3 次）', 'R：重开本关 · P：暂停'],
  create: createStarBattleGame,
}
