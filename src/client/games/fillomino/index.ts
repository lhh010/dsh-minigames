/**
 * 装填方块游戏定义：把填数逻辑接入 MiniGameInstance —— 点击（或方向键）
 * 选中格子，数字键输入（区域大小可到两位数，支持两位输入：首位后 800ms
 * 内输入第二位即合并提交，超时按个位提交；超过盘面最大区域值的输入按
 * 个位处理或忽略）。空格循环 +1，0/退格清空；每个相同数字的连通块
 * 大小恰好等于该数字时过关。H 闪烁一个填错/未填格的答案 2.5 秒（任何
 * 提示都放弃时间奖励）。已持久化的关卡从上次进度继续；P 暂停（过关
 * 倒计时用剩余时间冻结模式）；R 重开；[ ] 在已到达关卡间切换。生成
 * ≤2ms，无需缓存。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  computeScore, isWon, levelSize, puzzleFromSeed,
  type FilloPuzzle,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderFillo } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
/** 两位输入首位的等待窗口：超时按个位提交。 */
const DIGIT_TIMEOUT_MS = 800

function createFilloGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('fillomino') - 1
  let puzzle: FilloPuzzle
  let grid: number[] = []
  /** 盘面允许的最大区域值：最大 clue + 2（再大的组永远无收益）。 */
  let maxRegion = 1
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
  /** 本关用过提示 → 过关时放弃时间奖励。 */
  let hintUsed = false
  /** 两位输入缓冲：等待第二位的首位数字，-1 为空。 */
  let digitBuffer = -1
  let digitTimer = 0
  const particles = createParticles()

  const clearDigitBuffer = (): void => {
    digitBuffer = -1
    if (digitTimer !== 0) {
      clearTimeout(digitTimer)
      digitTimer = 0
    }
  }

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    puzzle = puzzleFromSeed(display * 0x9e3779b9, levelSize(display))
    const total = puzzle.size * puzzle.size
    grid = new Array<number>(total).fill(0)
    for (const [cell, v] of puzzle.clues) grid[cell] = v
    maxRegion = Math.max(1, ...puzzle.clues.values()) + 2
    cursor = -1
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    hintCell = -1
    hintTimer = 0
    hintUsed = false
    clearDigitBuffer()
    loop.markDirty()
  }

  // 先按当前展示级生成一份（生成 ≤2ms），供首次 fitCanvas 定尺寸；真正
  // 的关卡加载在 loop 建好后由 startLevel 完成。
  puzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, levelSize(level + 1))
  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: fillomino needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: fillomino needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('fillomino', next + 1) // 持久化为 1 基；level 为 0 基
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

  /** 写入一个格子：clue 锁定格不可改。 */
  const setCell = (cell: number, value: number): void => {
    if (!running || solved || cell < 0) return
    if (puzzle.clues.has(cell)) return
    grid[cell] = value
    loop.markDirty()
    checkSolved()
  }

  /**
   * 数字键输入：首位进入缓冲等待第二位；两位值超过 maxRegion 时按首位
   * 个位处理（首位也超界则忽略）。
   */
  const inputDigit = (cell: number, d: number): void => {
    if (cell < 0 || puzzle.clues.has(cell)) return
    if (digitBuffer === -1) {
      if (d * 10 > maxRegion) {
        // 以 d 开头的两位值必然超界：直接按个位提交。
        if (d <= maxRegion) setCell(cell, d)
        return
      }
      digitBuffer = d
      digitTimer = window.setTimeout(() => {
        digitTimer = 0
        const first = digitBuffer
        digitBuffer = -1
        if (first <= maxRegion) setCell(cell, first)
      }, DIGIT_TIMEOUT_MS)
      return
    }
    // 第二位到达：合并提交。
    const first = digitBuffer
    clearDigitBuffer()
    const two = first * 10 + d
    if (two <= maxRegion) setCell(cell, two)
    else if (first <= maxRegion) setCell(cell, first)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    const hit = cellAt(puzzle.size, x, y)
    if (hit !== null) {
      cursor = hit.r * puzzle.size + hit.c
      clearDigitBuffer()
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
      // 提示：随机闪一个玩家填错/未填格的答案 2.5 秒。本关任何提示都
      // 放弃时间奖励（只保留基础分）。
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
      const max = Math.min(readLevel('fillomino'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) {
        startLevel(next)
        refit(puzzle.size)
      }
    } else if (event.code === 'Space') {
      // 空格：选中格数值循环 +1（clue 格跳过）。
      event.preventDefault()
      if (!running || solved || cursor < 0) return
      if (!puzzle.clues.has(cursor)) {
        setCell(cursor, ((grid[cursor] ?? 0) % maxRegion) + 1)
      }
    } else if (event.code === 'Backspace' || event.code === 'Delete' || event.code === 'Digit0' || event.code === 'Numpad0') {
      event.preventDefault()
      if (!running || solved || cursor < 0) return
      clearDigitBuffer()
      setCell(cursor, 0)
    } else if (event.code.startsWith('Digit') || event.code.startsWith('Numpad')) {
      event.preventDefault()
      if (!running) return
      const d = Number(event.code.slice(-1))
      if (Number.isInteger(d) && d >= 1) inputDigit(cursor, d)
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
      clearDigitBuffer()
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
    const animating = particles.size() > 0
    if (f.render || animating || hintTimer > 0) {
      renderFillo(ctx, puzzle, grid, cursor, false, winText, hintTimer > 0 ? hintCell : -1)
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
    clearDigitBuffer()
    loop.pause()
    renderFillo(ctx, puzzle, grid, cursor, true, winText, -1)
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
      clearDigitBuffer()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const fillominoGame: MiniGameDefinition = {
  id: 'fillomino',
  title: '装填方块 Fillomino',
  icon: '🧩',
  description: '填入数字，让每个相同数字的连通块大小恰好等于该数字。',
  controls: ['点击选中 · 数字键输入（可两位）', '空格循环 +1 · 0/退格清空 · H：提示（弃时间奖励）', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createFilloGame,
}