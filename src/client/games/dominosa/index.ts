/**
 * 多米诺分解游戏定义：把纯逻辑（./logic.ts）接入 MiniGameInstance ——
 * 点击一格选中，再点击相邻格配对；点击已配对的格子拆除该对；方向键移动
 * cursor、空格等同点击。配对覆盖全盘且多米诺组合各出现一次时触发
 * onScore（含时间奖励）并在 1.5 秒后自动进入下一关。进度持久化续玩；
 * P 暂停（过关倒计时用 stored-remainder 模式冻结）；R 重开；[ ] 在已
 * 到达的关卡内切换。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { adjacent, computeScore, isWon, levelOrder, puzzleFromSeed, type DominoPuzzle } from './logic.ts'
import { cellAt, cellCenter, cols, logicalH, logicalW, renderDominosa, rows } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createDominosaGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；本游戏的 level 为 0 基。
  let level = readLevel('dominosa') - 1
  let puzzle: DominoPuzzle
  let pairs: [number, number][] = []
  let selected: number | null = null
  let cursor = { r: 0, c: 0 }
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
  let hoverPair: [number, number] | null = null
  const particles = createParticles()

  const startLevel = (lv: number): void => {
    level = lv
    const display = level + 1
    const next = puzzleFromSeed(display * 0x9e3779b9, levelOrder(display))
    if (next === null) return
    puzzle = next
    pairs = []
    selected = null
    hoverPair = null
    cursor = { r: 0, c: 0 }
    solved = false
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    refit(puzzle.order)
    loop.markDirty()
  }

  const initial = puzzleFromSeed((level + 1) * 0x9e3779b9, levelOrder(level + 1))
  if (initial === null) throw new Error('dsh-minigames: dominosa failed to generate a puzzle')
  puzzle = initial

  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.order), logicalH(puzzle.order))
  if (initialFit === null) throw new Error('dsh-minigames: dominosa needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (order: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(order), logicalH(order))
    if (next === null) throw new Error('dsh-minigames: dominosa needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('dominosa', next + 1) // 持久化为 1 基；level 为 0 基
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle, pairs)) return
    solved = true
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      options?.onScore?.(computeScore(level + 1, elapsedSecs))
    }
    const center = cellCenter(puzzle.order, Math.floor(rows(puzzle.order) / 2), Math.floor(cols(puzzle.order) / 2))
    particles.burst(center.x, center.y, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  /** 已包含某格的配对下标，无则 -1。 */
  const pairIndexContaining = (cell: number): number => {
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i]!
      if (pair[0] === cell || pair[1] === cell) return i
    }
    return -1
  }

  /** 点击（鼠标或空格）一个格子：选中、配对或拆除。 */
  const clickCell = (cell: number): void => {
    if (!running || solved) return
    const paired = pairIndexContaining(cell)
    if (paired >= 0) {
      // 点击已配对的格子：拆除该对。
      pairs.splice(paired, 1)
      selected = null
      hoverPair = null
      loop.markDirty()
      return
    }
    if (selected === null) {
      selected = cell
      hoverPair = null
      loop.markDirty()
      return
    }
    if (selected === cell) {
      selected = null
      hoverPair = null
      loop.markDirty()
      return
    }
    if (adjacent(cols(puzzle.order), selected, cell)
      && pairIndexContaining(selected) < 0 && pairIndexContaining(cell) < 0) {
      pairs.push([selected, cell])
      selected = null
      hoverPair = null
      loop.markDirty()
      checkSolved()
      return
    }
    selected = cell
    hoverPair = null
    loop.markDirty()
  }

  /** 根据指针位置更新悬停预览（选中格 + 相邻未配对悬停格）。 */
  const updateHover = (x: number, y: number): void => {
    let next: [number, number] | null = null
    const cell = cellAt(puzzle.order, x, y)
    if (running && !solved && selected !== null && cell !== null) {
      const idx = cell.r * cols(puzzle.order) + cell.c
      if (idx !== selected && adjacent(cols(puzzle.order), selected, idx)
        && pairIndexContaining(idx) < 0 && pairIndexContaining(selected) < 0) {
        next = [selected, idx]
      }
    }
    if (next?.[0] !== hoverPair?.[0] || next?.[1] !== hoverPair?.[1]) {
      hoverPair = next
      loop.markDirty()
    }
  }

  const pointFromEvent = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * logicalW(puzzle.order)) / rect.width,
      y: ((event.clientY - rect.top) * logicalH(puzzle.order)) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const { x, y } = pointFromEvent(event)
    const cell = cellAt(puzzle.order, x, y)
    if (cell === null) return
    cursor = cell
    clickCell(cell.r * cols(puzzle.order) + cell.c)
    updateHover(x, y)
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running) return
    const { x, y } = pointFromEvent(event)
    updateHover(x, y)
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
      const max = Math.min(readLevel('dominosa'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) startLevel(next)
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault()
      if (!running) return
      const r = rows(puzzle.order)
      const c = cols(puzzle.order)
      if (event.code === 'ArrowUp') cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c }
      else if (event.code === 'ArrowDown') cursor = { r: Math.min(r - 1, cursor.r + 1), c: cursor.c }
      else if (event.code === 'ArrowLeft') cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) }
      else cursor = { r: cursor.r, c: Math.min(c - 1, cursor.c + 1) }
      hoverPair = null
      loop.markDirty()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (running) clickCell(cursor.r * cols(puzzle.order) + cursor.c)
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
      renderDominosa(ctx, puzzle, pairs, hoverPair, cursor, false, winText)
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
    renderDominosa(ctx, puzzle, pairs, null, cursor, true, winText)
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
  canvas.addEventListener('mousemove', onMouseMove)
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
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const dominosaGame: MiniGameDefinition = {
  id: 'dominosa',
  title: '多米诺分解 Dominosa',
  icon: '🁫',
  description: '把数字盘配对成相邻的多米诺，每种组合（如 3-5）恰好出现一次。',
  controls: ['点击一格再点击相邻格配对', '点击已配对的格子拆开', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createDominosaGame,
}
