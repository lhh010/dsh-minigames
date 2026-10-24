/**
 * 桥 (Hashi) game definition: wires the pure logic into a
 * {@link MiniGameInstance} — 5 seeded levels ramping 5x5 → 9x9 (same seed per
 * level, so R replays a level exactly). Click an island, then an island in
 * the same row/column to cycle their bridge 0→1→2→0; Backspace/Z removes the
 * last bridge. A level is solved when every island has exactly its number of
 * bridge ends, all islands form one connected group and no bridges cross;
 * the win overlay, a particle burst and onScore(level) fire, and the next
 * level starts 1.5s later (stored-remainder pattern keeps that timer
 * pause-safe); P toggles pause. The highest level reached persists per game
 * id, so re-entering resumes where the player left off.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVEL_SIZES, cycleBridge, isSolved, legalLine, puzzleFromSeed, removeLastBridge,
  type Placed,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, islandAt, renderHashi } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const ADVANCE_MS = 1500

/** Board edge in cells per level: L1 5x5 … L5 9x9. */
function levelSize(level: number): number {
  return LEVEL_SIZES[Math.min(level, LEVEL_SIZES.length) - 1]!
}

/** Deterministic per-level seed; one seed per level keeps replays identical. */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9) >>> 0
}

function createHashiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: hashi needs a 2d canvas context')
  const ctx = fit.ctx

  // Level memory: resume at the highest level reached (persisted per game id).
  let level = Math.min(readLevel('hashi'), LEVEL_SIZES.length)
  let puzzle = puzzleFromSeed(levelSeed(level), levelSize(level))
  let placed: Placed = new Map()
  let selected: number | null = null
  let elapsed = 0
  let winText: string | null = null
  let running = false
  let raf = 0
  let last = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next > LEVEL_SIZES.length ? 1 : next // wrap after L5
    saveLevel('hashi', level) // progress memory: never regresses
    puzzle = puzzleFromSeed(levelSeed(level), levelSize(level))
    placed = new Map()
    selected = null
    elapsed = 0
    winText = null
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const checkWinNow = (): void => {
    if (winText !== null || !isSolved(puzzle.islands, placed)) return
    winText = `第 ${level} 关完成 · 用时 ${Math.floor(elapsed)} 秒`
    reportScore()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // paused at the win: arm on resume
  }

  /** Pick an island, or bridge the current selection to it (0→1→2→0 cycle). */
  const pickIsland = (index: number): void => {
    if (selected === null) {
      selected = index
      return
    }
    if (selected === index) {
      selected = null // clicking the selected island again clears it
      return
    }
    if (!legalLine(puzzle.islands, selected, index)) {
      selected = index // not in line: switch the selection instead
      return
    }
    placed = cycleBridge(placed, selected, index)
    checkWinNow()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || winText !== null) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const index = islandAt(puzzle.islands, puzzle.size, x, y)
    if (index === null) {
      selected = null // a click on empty water clears the selection
      return
    }
    pickIsland(index)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level) // same seed → same puzzle
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running || winText !== null) return
    if (event.code === 'Backspace' || event.code === 'KeyZ') {
      event.preventDefault()
      placed = removeLastBridge(placed)
      checkWinNow()
    } else if (event.code === 'Escape') {
      event.preventDefault()
      selected = null
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    if (winText === null) elapsed += dt
    renderHashi(ctx, puzzle, placed, selected, level, elapsed, false, winText)
  }

  const startLoop = (): void => {
    if (raf !== 0) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stopLoop = (): void => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    stopLoop()
    renderHashi(ctx, puzzle, placed, selected, level, elapsed, true, winText)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const hashiGame: MiniGameDefinition = {
  id: 'hashi',
  title: '桥 Hashi',
  icon: '🌉',
  description: '按数字搭桥连接所有小岛：每岛桥数等于其数字，且全图连通。',
  controls: [
    '点击岛屿 A 再点同一直线岛屿 B：搭桥（再点加双桥，第三次拆除）',
    'Backspace / Z：拆除上一座桥',
    'Esc：取消选择',
    'R：重开本关',
    'P：暂停',
  ],
  create: createHashiGame,
}
