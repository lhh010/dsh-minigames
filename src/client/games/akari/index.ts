/**
 * 点灯游戏定义：把 Akari 逻辑接入 MiniGameInstance —— 点击白格放/取灯；
 * 所有白格被照亮、灯两两互不相见、数字墙邻灯数吻合时过关。关卡按展示级
 * 在页面生命周期内缓存（按关卡确定性生成）。H 提示标一个未照亮格 2.5 秒
 * （任何提示都放弃时间奖励）；R 重开；P 暂停；[ ] 在已到达关卡间切换。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  boardFromSeed, computeScore, isSolved, levelSize,
  type AkariBoard,
} from './logic.ts'
import { cellAt, cellCenter, logicalH, logicalW, renderAkari } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { litCells } from './logic.ts'

const ADVANCE_MS = 1500

function createAkariGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('akari') - 1
  let board: AkariBoard
  let lights = new Set<number>()
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
  /** 提示格下标（未照亮格），-1 为隐藏。 */
  let hintCell = -1
  let hintTimer = 0
  /** 本关用过提示 → 过关时放弃时间奖励。 */
  let hintUsed = false
  const particles = createParticles()

  /** 页面生命周期盘面缓存：每个展示级只生成一次。 */
  const boardCache = new Map<number, AkariBoard>()
  const makeBoard = (display: number): AkariBoard => {
    const hit = boardCache.get(display)
    if (hit !== undefined) return hit
    const fresh = boardFromSeed(display * 0x85ebca6b, levelSize(display))
    boardCache.set(display, fresh)
    return fresh
  }

  board = makeBoard(level + 1)

  const initialFit = fitCanvas(host, canvas, logicalW(board.size), logicalH(board.size))
  if (initialFit === null) throw new Error('dsh-minigames: akari needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: akari needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    board = makeBoard(level + 1)
    lights = new Set()
    solved = false
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
      saveLevel('akari', next + 1) // 持久化为 1 基；level 为 0 基
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isSolved(board, lights)) return
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

  /** 在白格上放/取一盏灯。 */
  const toggleCell = (cell: number): void => {
    if (!running || solved || cell < 0) return
    if (board.walls[cell] !== -1) return
    if (lights.has(cell)) lights.delete(cell)
    else lights.add(cell)
    loop.markDirty()
    checkSolved()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(board.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(board.size)) / rect.height
    const hit = cellAt(board.size, x, y)
    if (hit !== null) toggleCell(hit.r * board.size + hit.c)
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
      // 提示：标一个尚未照亮的白格 2.5 秒。本关任何提示都放弃时间奖励。
      if (!running || solved) return
      event.preventDefault()
      const lit = litCells(board, lights)
      const target = board.walls.findIndex((w, i) => w === -1 && !lit.has(i))
      if (target < 0) return
      hintCell = target
      hintTimer = 2.5
      hintUsed = true
      loop.markDirty()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('akari'), 5)
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
      renderAkari(ctx, board, lights, level + 1, false, winText, hintTimer > 0 ? hintCell : -1)
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
    renderAkari(ctx, board, lights, level + 1, true, winText, -1)
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

export const akariGame: MiniGameDefinition = {
  id: 'akari',
  title: '点灯 Akari',
  icon: '🪔',
  description: '在白格放灯泡照亮全盘——灯与灯不能互相看见，数字格限定周围灯数。',
  controls: ['点击白格：放 / 取灯泡', 'H：提示一个未照亮格（弃时间奖励）', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createAkariGame,
}
