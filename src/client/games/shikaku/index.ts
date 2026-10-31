/**
 * 四角填方 game definition: wires the pure rect-partition logic into a
 * MiniGameInstance — drag from any cell to draw a rectangle; releasing
 * commits it when it covers exactly one clue whose number equals the rect
 * area (invalid drags just vanish), clicking a committed rect removes it.
 * Covering the whole board fires onScore with the time bonus and
 * auto-advances 1.5s later. Persisted level resumes where the player left
 * off; P pauses (advance timer freezes via the stored-remainder pattern);
 * R restarts the CURRENT level; [ ] switches within reached levels.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  computeScore, isWon, levelSize, puzzleFromSeed, rectAllowed,
  type Rect, type ShikakuPuzzle,
} from './logic.ts'
import { cellAt, logicalH, logicalW, rectPixels, renderShikaku } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function normalizeRect(a: { r: number; c: number }, b: { r: number; c: number }): Rect {
  return [
    Math.min(a.r, b.r), Math.min(a.c, b.c),
    Math.max(a.r, b.r), Math.max(a.c, b.c),
  ]
}

function createShikakuGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // Persisted level is 1-based; this game's level index is 0-based.
  let level = readLevel('shikaku') - 1
  let puzzle: ShikakuPuzzle
  let rects: Rect[] = []
  let dragAnchor: { r: number; c: number } | null = null
  let dragRect: Rect | null = null
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

  puzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, levelSize(level + 1))

  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.size), logicalH(puzzle.size))
  if (initialFit === null) throw new Error('dsh-minigames: shikaku needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: shikaku needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    const display = level + 1
    puzzle = puzzleFromSeed(display * 0x9e3779b9, levelSize(display))
    rects = []
    dragAnchor = null
    dragRect = null
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
      saveLevel('shikaku', next + 1) // persisted 1-based; level is 0-based
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(puzzle.size, rects)) return
    solved = true
    dragAnchor = null
    dragRect = null
    winText = '第 ' + (level + 1) + ' 关完成 · ' + elapsed
    if (level !== lastScoreLevel) {
      lastScoreLevel = level
      options?.onScore?.(computeScore(level + 1, elapsedSecs))
    }
    const p = rectPixels(puzzle.size, [0, 0, puzzle.size - 1, puzzle.size - 1])
    particles.burst(p.x + p.w / 2, p.y + p.h / 2, THEME.gold, 20, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  const cellFromEvent = (event: PointerEvent): { r: number; c: number } | null => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.size)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.size)) / rect.height
    return cellAt(puzzle.size, x, y)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || solved) return
    const cell = cellFromEvent(event)
    if (cell === null) return
    // Clicking inside a committed rect removes it (re-drag to fix).
    const hit = rects.findIndex(rect =>
      cell.r >= rect[0] && cell.r <= rect[2] && cell.c >= rect[1] && cell.c <= rect[3])
    if (hit >= 0) {
      rects.splice(hit, 1)
      loop.markDirty()
      return
    }
    dragAnchor = cell
    dragRect = normalizeRect(cell, cell)
    canvas.setPointerCapture(event.pointerId)
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!running || dragAnchor === null) return
    const cell = cellFromEvent(event)
    if (cell === null) return
    const next = normalizeRect(dragAnchor, cell)
    if (dragRect === null || next.join() !== dragRect.join()) {
      dragRect = next
      loop.markDirty()
    }
  }

  const onPointerUp = (): void => {
    if (dragAnchor === null) return
    const rect = dragRect
    dragAnchor = null
    dragRect = null
    if (rect !== null && !solved && running && rectAllowed(puzzle.size, puzzle.clues, rect)) {
      rects.push(rect)
      loop.markDirty()
      checkSolved()
    } else {
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
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = Math.min(readLevel('shikaku'), 10)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next < max) startLevel(next)
    } else if (event.code === 'KeyZ' || event.code === 'Backspace') {
      event.preventDefault()
      if (!running || solved) return
      rects.pop()
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
      const dragOk = dragRect !== null && rectAllowed(puzzle.size, puzzle.clues, dragRect)
      renderShikaku(ctx, puzzle, rects, dragRect, dragOk, false, winText)
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    dragAnchor = null
    dragRect = null
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderShikaku(ctx, puzzle, rects, null, false, true, winText)
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

export const shikakuGame: MiniGameDefinition = {
  id: 'shikaku',
  title: '四角填方 Shikaku',
  icon: '▭',
  description: '把棋盘切成矩形，每个矩形恰好包含一个数字，且面积等于该数字。',
  controls: ['拖拽画矩形 · 松开确认（不合法自动取消）', '点击已放矩形可移除 · Z 撤销', 'R：重开本关 · [ ]：切换关卡 · P：暂停'],
  create: createShikakuGame,
}
