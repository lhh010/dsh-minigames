/**
 * 阴阳双色游戏定义：把 YinYang 逻辑接入 MiniGameInstance —— 左键点击空格
 * 循环 黑→白→空（预标格不可改），右键直接清除；全部填满且黑/白各自四连
 * 通、无同色 2×2 时过关。关卡按展示级在页面生命周期内缓存（按关卡确定
 * 性生成）。H 提示填入一个确定色（本关任何提示都放弃时间奖励）；R 重
 * 开；P 暂停；[ ] 在已到达关卡间切换。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  BLACK, EMPTY, WHITE, boardFromSeed, computeScore, hintFromBoard,
  isSolvedGrid, levelSize, type YinYangBoard,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderYinYang } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createYinYangGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('yinyang') - 1
  let board: YinYangBoard
  let grid = new Int8Array(0)
  let solved = false
  let running = false
  let steps = 0
  let elapsedSecs = 0
  let shownSec = -1
  let elapsed = '0:00'
  let winText: string | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  /** 提示格下标（短暂金环强调），-1 为隐藏。 */
  let hintCell = -1
  let hintTimer = 0
  /** 本关用过提示 → 过关时放弃时间奖励。 */
  let hintUsed = false
  const particles = createParticles()

  /** 页面生命周期盘面缓存：每个展示级只生成一次。 */
  const boardCache = new Map<number, YinYangBoard>()
  const makeBoard = (display: number): YinYangBoard => {
    const hit = boardCache.get(display)
    if (hit !== undefined) return hit
    const fresh = boardFromSeed(display * 0x85ebca6b, levelSize(display))
    boardCache.set(display, fresh)
    return fresh
  }

  board = makeBoard(level + 1)
  grid = Int8Array.from(board.clues)

  const initialFit = fitCanvas(host, canvas, logicalW(board.size), logicalH(board.size))
  if (initialFit === null) throw new Error('dsh-minigames: yinyang needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: yinyang needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    board = makeBoard(level + 1)
    grid = Int8Array.from(board.clues)
    solved = false
    steps = 0
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    hintCell = -1
    hintTimer = 0
    hintUsed = false
    refit(board.size)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('yinyang', next + 1) // 持久化为 1 基；level 为 0 基
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isSolvedGrid(grid, board.size)) return
    solved = true
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      // 用过提示则放弃时间奖励 —— 只保留基础分。
      options?.onScore?.(computeScore(level + 1, hintUsed ? Infinity : elapsedSecs))
    }
    const center = cellCenter(board.size, Math.floor(board.size / 2), Math.floor(board.size / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** 左键循环：空→黑→白→空；右键清除。预标格不可改。 */
  const cycleCell = (cell: number, clearOnly: boolean): void => {
    if (!running || solved || cell < 0) return
    if (board.clues[cell] !== EMPTY) return
    const v = grid[cell]!
    grid[cell] = clearOnly ? EMPTY : v === EMPTY ? BLACK : v === BLACK ? WHITE : EMPTY
    steps += 1
    loop.markDirty()
    checkSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(board.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(board.size)) / rect.height
    const hit = cellAt(board.size, x, y)
    if (hit !== null) {
      if (event.button === 2) cycleCell(hit.r * board.size + hit.c, true)
      else if (event.button === 0) cycleCell(hit.r * board.size + hit.c, false)
    }
  }
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
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
      // 提示：填入一个确定色（单着推理优先）。本关任何提示都放弃时间奖励。
      if (!running || solved) return
      event.preventDefault()
      const hint = hintFromBoard(board, grid)
      if (hint === null) return
      grid[hint.cell] = hint.color
      hintCell = hint.cell
      hintTimer = 2.5
      hintUsed = true
      loop.markDirty()
      checkSolved()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('yinyang'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) startLevel(next)
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
      renderYinYang(ctx, board, grid, level + 1, steps, false, winText, hintTimer > 0 ? hintCell : -1)
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
    renderYinYang(ctx, board, grid, level + 1, steps, true, winText, -1)
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
  canvas.addEventListener('contextmenu', onContextMenu)
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
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const yinyangGame: MiniGameDefinition = {
  id: 'yinyang',
  title: '阴阳双色 YinYang',
  icon: '◐',
  description: '黑白双流互不触碰——一条河从两岸各引一道，缠出整个图腾。',
  controls: ['左键空格：黑 → 白 → 空 · 右键：清除', 'H：提示一格确定色（弃时间奖励）', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createYinYangGame,
}
