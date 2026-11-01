/**
 * 太极游戏定义：把简化太极逻辑接入 MiniGameInstance —— 点击（自由格）
 * 循环 空→白→黑→空（白圈预置格锁定不可改），全盘填满且每行每列黑白
 * 各半、正交相邻不取相同符号时过关。H 闪烁一个与解不符的格 2.5 秒
 * （任何提示都放弃时间奖励）。已持久化的关卡从上次进度继续；P 暂停；
 * R 重开；[ ] 在已到达关卡间切换。盘面为 dirty 帧循环，空闲零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  BLACK, computeScore, EMPTY, isWon, levelSize, puzzleFromSeed, WHITE,
  type CellValue, type TaijiPuzzle,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderTaiji } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createTaijiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('taiji') - 1
  let puzzle: TaijiPuzzle
  let grid: CellValue[] = []
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
  /** 提示覆盖：一个与解不符的格，-1 为隐藏。 */
  let hintCell = -1
  let hintTimer = 0
  /** 本关用过提示 → 过关时放弃时间奖励。 */
  let hintUsed = false
  const particles = createParticles()

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    puzzle = puzzleFromSeed(display * 0x9e3779b9, levelSize(display), display)
    const total = puzzle.size * puzzle.size
    grid = new Array<CellValue>(total).fill(EMPTY)
    for (const [cell, v] of puzzle.clues) grid[cell] = v
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    hintCell = -1
    hintTimer = 0
    hintUsed = false
    loop.markDirty()
  }

  // 先按当前展示级生成一份，供首次 fitCanvas 定尺寸；真正的关卡加载在
  // loop 建好后由 startLevel 完成。
  puzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, levelSize(level + 1), level + 1)
  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: taiji needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: taiji needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('taiji', next + 1) // 持久化为 1 基；level 为 0 基
      startLevel(next)
      refit(puzzle.size)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, grid)) return
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

  /** 点击循环：空→白→黑→空；给定格锁定。 */
  const cycleCell = (cell: number): void => {
    if (!running || solved || cell < 0) return
    if (puzzle.clues.has(cell)) return
    const v = grid[cell] ?? EMPTY
    grid[cell] = (v === EMPTY ? WHITE : v === WHITE ? BLACK : EMPTY) as CellValue
    loop.markDirty()
    checkSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const hit = cellAt(puzzle.size, x, y)
    if (hit !== null) cycleCell(hit.r * puzzle.size + hit.c)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
      refit(puzzle.size)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      // 提示：随机闪一个玩家放错/未放的格 2.5 秒（展示该格应放颜色）。
      if (!running || solved) return
      event.preventDefault()
      const wrong: number[] = []
      for (let i = 0; i < grid.length; i += 1) {
        if (grid[i] !== puzzle.solution[i]) wrong.push(i)
      }
      if (wrong.length === 0) return
      hintCell = wrong[Math.floor(Math.random() * wrong.length)]!
      hintTimer = 2.5
      hintUsed = true
      loop.markDirty()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('taiji'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) {
        startLevel(next)
        refit(puzzle.size)
      }
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
        hintCell = -1
      }
      // 提示期间展示应放颜色：临时写入再还原。
      loop.markDirty()
    }
    const animating = particles.size() > 0
    if (f.render || animating || hintTimer > 0) {
      const shown = hintTimer > 0 && hintCell >= 0 ? grid.slice() : grid
      if (hintTimer > 0 && hintCell >= 0) shown[hintCell] = puzzle.solution[hintCell]!
      renderTaiji(ctx, puzzle, shown, false, winText, hintTimer > 0 ? hintCell : -1)
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
    renderTaiji(ctx, puzzle, grid, true, winText, -1)
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

  // 初始关卡在 loop 建好后加载（startLevel 依赖 loop.markDirty）。
  startLevel(level)
  refit(puzzle.size)

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

export const taijiGame: MiniGameDefinition = {
  id: 'taiji',
  title: '太极 Taiji',
  icon: '☯',
  description: '在白圈标记处放置黑白 tiles，让每行每列的黑白数量平衡且相邻不取相同符号。',
  controls: ['点击格子循环 白→黑→空（白圈格锁定）', 'H：提示（弃时间奖励）· R：重开本关', '[ ]：切换关卡 · P：暂停'],
  create: createTaijiGame,
}
