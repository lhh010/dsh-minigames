/**
 * 记独游戏定义：把涂黑逻辑接入 MiniGameInstance —— 点击（或方向键 + 空格）
 * 在黑/白之间切换格子；当每行每列白格数字互不重复、黑格互不相邻且白格
 * 连通时过关。关卡按展示级在页面生命周期内缓存（按关卡确定性生成）。H
 * 闪烁一个应涂黑格 2.5 秒（任何提示都放弃时间奖励）。已持久化的关卡
 * 从上次进度继续；P 暂停（过关倒计时用剩余时间冻结模式）；R 重开；
 * [ ] 在已到达关卡间切换。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  computeScore, isWon, levelSize, puzzleFromSeed,
  type HitoriPuzzle,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderHitori } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createHitoriGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('hitori') - 1
  let puzzle: HitoriPuzzle
  let blacks = new Set<number>()
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
  /** 提示覆盖：一个应涂黑格，空数组为隐藏。 */
  let hintCells: number[] = []
  let hintTimer = 0
  /** 本关用过提示 → 过关时放弃时间奖励。 */
  let hintUsed = false
  const particles = createParticles()

  /** 页面生命周期谜题缓存：每个展示级只生成一次。 */
  const puzzleCache = new Map<number, HitoriPuzzle>()
  const makePuzzle = (display: number): HitoriPuzzle => {
    const hit = puzzleCache.get(display)
    if (hit !== undefined) return hit
    const fresh = puzzleFromSeed(display * 0x9e3779b9, levelSize(display))
    if (fresh === null) throw new Error('dsh-minigames: hitori level generation failed')
    puzzleCache.set(display, fresh)
    return fresh
  }

  puzzle = makePuzzle(level + 1)

  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: hitori needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: hitori needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    puzzle = makePuzzle(display)
    blacks = new Set()
    cursor = -1
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    hintCells = []
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
      saveLevel('hitori', next + 1) // 持久化为 1 基；level 为 0 基
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, blacks)) return
    solved = true
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      // 用过提示则放弃时间奖励 —— 只保留基础分。
      options?.onScore?.(computeScore(level + 1, hintUsed ? Infinity : elapsedSecs))
    }
    const center = cellCenter(puzzle.size, Math.floor(puzzle.size / 2), Math.floor(puzzle.size / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** 在黑/白之间切换一个格子。 */
  const toggleCell = (cell: number): void => {
    if (!running || solved || cell < 0) return
    if (blacks.has(cell)) blacks.delete(cell)
    else blacks.add(cell)
    loop.markDirty()
    checkSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const hit = cellAt(puzzle.size, x, y)
    if (hit !== null) {
      const cell = hit.r * puzzle.size + hit.c
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
    } else if (event.code === 'KeyH') {
      // 提示：闪烁一个玩家尚未涂黑且应涂黑的格子 2.5 秒。本关任何提示
      // 都放弃时间奖励（只保留基础分）。
      if (!running || solved) return
      event.preventDefault()
      const total = puzzle.size * puzzle.size
      const target = puzzle.solution.findIndex((want, i) => want && !blacks.has(i))
      if (target < 0 || target >= total) return
      hintCells = [target]
      hintTimer = 2.5
      hintUsed = true
      loop.markDirty()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('hitori'), 5)
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
    if (hintTimer > 0) {
      hintTimer -= f.dt
      if (hintTimer <= 0) {
        hintTimer = 0
        hintCells = []
      }
      loop.markDirty()
    }
    const animating = particles.size() > 0
    if (f.render || animating || hintTimer > 0) {
      renderHitori(ctx, puzzle, blacks, cursor, false, winText, hintTimer > 0 ? hintCells : [])
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
    renderHitori(ctx, puzzle, blacks, cursor, true, winText, [])
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

export const hitoriGame: MiniGameDefinition = {
  id: 'hitori',
  title: '记独 Hitori',
  icon: '🔘',
  description: '涂黑若干格子，让每行每列的白色格数字都不重复，黑格不能相邻，白格保持连通。',
  controls: ['点击 / 方向键 + 空格：涂黑或还原', 'H：提示一个黑格（弃时间奖励）', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createHitoriGame,
}
