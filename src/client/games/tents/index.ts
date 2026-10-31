/**
 * 露营帐篷 game definition: wires the pure tents logic into a
 * MiniGameInstance — click (or arrows + Space/Enter) toggles a tent on a
 * grass cell; illegal placements (tree cell / touching an existing tent)
 * are rejected by the toggle guard. Solving (every tree matched, all
 * row/column counts met, no touching tents) fires onScore with the time
 * bonus and auto-advances 1.5s later. Persisted level resumes where the
 * player left off; P pauses (advance timer freezes via the stored-remainder
 * pattern); R restarts the CURRENT level; [ ] switches within reached
 * levels.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  canPlaceTent, computeScore, isWon, levelSize, levelTrees, puzzleFromSeed,
  type TentsPuzzle,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderTents } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createTentsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // Persisted level is 1-based; this game's level index is 0-based.
  let level = readLevel('tents') - 1
  let puzzle: TentsPuzzle
  let tents: number[] = []
  let cursor = -1
  let solved = false
  let running = false
  let elapsedSecs = 0
  let shownSec = -1
  let elapsed = '0:00'
  let winText: string | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  const particles = createParticles()

  const initial = puzzleFromSeed((level + 1) * 0x9e3779b9, levelSize(level + 1), levelTrees(level + 1))
  if (initial === null) throw new Error('dsh-minigames: tents level generation failed')
  puzzle = initial

  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: tents needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: tents needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    const fresh = puzzleFromSeed(display * 0x9e3779b9, levelSize(display), levelTrees(display))
    if (fresh === null) return // deterministic per level: cannot happen after first roll
    puzzle = fresh
    tents = []
    cursor = -1
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    refit(puzzle.size)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('tents', next + 1) // persisted 1-based; level is 0-based
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, tents)) return
    solved = true
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      options?.onScore?.(computeScore(level + 1, elapsedSecs))
    }
    const center = cellCenter(puzzle.size, Math.floor((puzzle.size * puzzle.size) / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** Toggle a tent on cell; illegal placements (tree / touching tent) are ignored. */
  const toggleCell = (cell: number): void => {
    if (!running || solved || cell < 0) return
    const at = tents.indexOf(cell)
    if (at >= 0) {
      tents.splice(at, 1)
      loop.markDirty()
      return
    }
    if (!canPlaceTent(puzzle.size, puzzle.trees, tents, cell)) return
    tents.push(cell)
    loop.markDirty()
    checkSolved()
  }

  /** Cells that make a row/column exceed its clue (red outline feedback). */
  const overflowCells = (): number[] => {
    const size = puzzle.size
    const badRows = new Set<number>()
    const badCols = new Set<number>()
    const rowCount = new Array<number>(size).fill(0)
    const colCount = new Array<number>(size).fill(0)
    for (const t of tents) {
      rowCount[Math.floor(t / size)]! += 1
      colCount[t % size]! += 1
    }
    for (let i = 0; i < size; i += 1) {
      if (rowCount[i]! > puzzle.rowCounts[i]!) badRows.add(i)
      if (colCount[i]! > puzzle.colCounts[i]!) badCols.add(i)
    }
    if (badRows.size === 0 && badCols.size === 0) return []
    return tents.filter(t => badRows.has(Math.floor(t / size)) || badCols.has(t % size))
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const cell = cellAt(puzzle.size, x, y)
    if (cell >= 0) {
      cursor = cell
      toggleCell(cell)
    }
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
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('tents'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) startLevel(next)
    } else if (event.code.startsWith('Arrow') || event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (!running) return
      const size = puzzle.size
      const r = cursor < 0 ? Math.floor(size / 2) : Math.floor(cursor / size)
      const c = cursor < 0 ? Math.floor(size / 2) : cursor % size
      if (event.code === 'ArrowUp') cursor = Math.max(0, r - 1) * size + c
      else if (event.code === 'ArrowDown') cursor = Math.min(size - 1, r + 1) * size + c
      else if (event.code === 'ArrowLeft') cursor = r * size + Math.max(0, c - 1)
      else if (event.code === 'ArrowRight') cursor = r * size + Math.min(size - 1, c + 1)
      else { toggleCell(cursor); return }
      loop.markDirty()
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
    const animating = particles.size() > 0
    if (f.render || animating) {
      renderTents(ctx, puzzle, tents, cursor, overflowCells(), false, winText)
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
    renderTents(ctx, puzzle, tents, cursor, overflowCells(), true, winText)
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
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const tentsGame: MiniGameDefinition = {
  id: 'tents',
  title: '露营帐篷 Tents',
  icon: '⛺',
  description: '在每棵树旁搭一顶帐篷，帐篷之间互不相邻，且每行每列数量与提示一致。',
  controls: ['点击 / 方向键 + 空格：搭或拆帐篷', '帐篷不能挨着（斜着也不行）', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createTentsGame,
}
