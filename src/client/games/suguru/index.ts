/**
 * 数块游戏定义：把填数逻辑接入 MiniGameInstance —— 点击（或方向键）
 * 选中格子，数字键输入 1..区域大小，空格循环 +1，0/退格清空；给定格
 * 锁定不可改。冲突（区域内重复 / 王邻域同数）实时红显。H 闪烁一个
 * 填错/未填格的应填值 2.5 秒（任何提示都放弃时间奖励）。S 切换 AI 演
 * 示：分帧受限回溯求解器每帧只吃有限节点，逐步把盘面填完。R 重开、
 * P 暂停、[ ] 在已到达关卡间切换；readLevel/saveLevel 持久化进度。
 * dirty 帧循环：静止时零重绘。生成 ≤2ms，无需缓存。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  computeScore, isWon, levelSize, puzzleFromSeed,
  type SuguruPuzzle,
} from './logic.ts'
import { createStepSolver, type StepSolver } from './ai.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderSuguru } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
/** AI 演示每帧的搜索节点预算（分帧，绝不一次算完整盘）。 */
const AI_NODES_PER_FRAME = 1200

function createSuguruGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('suguru') - 1
  let puzzle: SuguruPuzzle
  let grid: number[] = []
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
  /** 提示覆盖：一个填错/未填格，-1 为隐藏。 */
  let hintCell = -1
  let hintTimer = 0
  /** 本关用过提示/演示 → 过关时放弃时间奖励。 */
  let hintUsed = false
  /** AI 演示状态：null 为关闭。 */
  let demo: StepSolver | null = null
  const particles = createParticles()

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    puzzle = puzzleFromSeed(display * 0x9e3779b9, levelSize(display))
    grid = new Array<number>(puzzle.size * puzzle.size).fill(0)
    for (const [cell, v] of puzzle.givens) grid[cell] = v
    cursor = -1
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    hintCell = -1
    hintTimer = 0
    hintUsed = false
    demo = null
    loop.markDirty()
  }

  // 先按当前展示级生成一份（生成 ≤2ms），供首次 fitCanvas 定尺寸；真正
  // 的关卡加载在 loop 建好后由 startLevel 完成。
  puzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, levelSize(level + 1))
  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: suguru needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: suguru needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('suguru', next + 1) // 持久化为 1 基；level 为 0 基
      startLevel(next)
      refit(puzzle.size)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, grid)) return
    solved = true
    demo = null
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      // 用过提示/演示则放弃时间奖励 —— 只保留基础分。
      options?.onScore?.(computeScore(level + 1, hintUsed ? Infinity : elapsedSecs))
    }
    const center = cellCenter(puzzle.size, Math.floor(puzzle.size / 2), Math.floor(puzzle.size / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** 写入一个格子：给定格不可改。 */
  const setCell = (cell: number, value: number): void => {
    if (!running || solved || cell < 0) return
    if (puzzle.givens.has(cell)) return
    grid[cell] = value
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
      cursor = hit.r * puzzle.size + hit.c
      loop.markDirty()
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
      refit(puzzle.size)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      // 提示：随机闪一个玩家填错/未填格的应填值 2.5 秒。本关任何提示
      // 都放弃时间奖励（只保留基础分）。
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
    } else if (event.code === 'KeyS') {
      // AI 演示开关：从当前盘面分帧求解（每帧限额节点）。
      if (!running || solved) return
      event.preventDefault()
      if (demo === null) {
        demo = createStepSolver(puzzle, grid)
        hintUsed = true
      } else {
        demo = null
      }
      loop.markDirty()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('suguru'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) {
        startLevel(next)
        refit(puzzle.size)
      }
    } else if (event.code === 'Space') {
      // 空格：选中格数值循环 +1（给定格跳过）。
      event.preventDefault()
      if (!running || solved || cursor < 0 || demo !== null) return
      if (!puzzle.givens.has(cursor)) {
        const span = puzzle.regionSizes[puzzle.region[cursor]!]!
        setCell(cursor, ((grid[cursor] ?? 0) % span) + 1)
      }
    } else if (event.code === 'Backspace' || event.code === 'Delete' || event.code === 'Digit0' || event.code === 'Numpad0') {
      event.preventDefault()
      if (!running || solved || cursor < 0 || demo !== null) return
      setCell(cursor, 0)
    } else if (event.code.startsWith('Digit') || event.code.startsWith('Numpad')) {
      event.preventDefault()
      if (!running || solved || demo !== null) return
      const d = Number(event.code.slice(-1))
      const span = cursor >= 0 ? puzzle.regionSizes[puzzle.region[cursor]!]! : 0
      if (Number.isInteger(d) && d >= 1 && d <= span) setCell(cursor, d)
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      if (!running) return
      const size = puzzle.size
      const r = cursor < 0 ? Math.floor(size / 2) : Math.floor(cursor / size)
      const c = cursor < 0 ? Math.floor(size / 2) : cursor % size
      if (event.code === 'ArrowUp') cursor = Math.max(0, r - 1) * size + c
      else if (event.code === 'ArrowDown') cursor = Math.min(size - 1, r + 1) * size + c
      else if (event.code === 'ArrowLeft') cursor = r * size + Math.max(0, c - 1)
      else cursor = r * size + Math.min(size - 1, c + 1)
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
        hintCell = -1
      }
      loop.markDirty()
    }
    // AI 演示：每帧限额节点，绝不一次算完整个搜索。
    if (demo !== null && running && !solved) {
      const status = demo.step(AI_NODES_PER_FRAME)
      if (status === 'done') {
        for (let i = 0; i < grid.length; i += 1) grid[i] = demo.grid[i] ?? 0
        demo = null
        checkSolved()
      } else if (status === 'stuck') {
        demo = null
      } else {
        for (let i = 0; i < grid.length; i += 1) grid[i] = demo.grid[i] ?? 0
      }
      loop.markDirty()
    }
    const animating = particles.size() > 0
    if (f.render || animating || hintTimer > 0 || demo !== null) {
      renderSuguru(ctx, puzzle, grid, level + 1, cursor, false, winText, hintTimer > 0 ? hintCell : -1)
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
    renderSuguru(ctx, puzzle, grid, level + 1, cursor, true, winText, -1)
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

export const suguruGame: MiniGameDefinition = {
  id: 'suguru',
  title: '数块 Suguru',
  icon: '🔆',
  description: '把盘面填入 1-n：每块区域数字不重复，相邻（含斜向）格子数字不同——数独与数回的合体。',
  controls: ['点击/方向键选格 · 数字键输入 · 空格循环 +1', '0/退格清空 · H：提示（弃时间奖励） · S：AI 演示', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createSuguruGame,
}
