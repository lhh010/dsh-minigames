/**
 * Maze game definition: wires the pure maze logic into a
 * {@link MiniGameInstance} — arrows/WASD move the player cell-to-cell through
 * open walls toward the far-corner exit. Five levels ramp 11×9 → 19×17 cells
 * (same seed per level → identical maze on R restart); after L5 the run wraps
 * back to L1. On win: overlay 「第 X 关完成 · Y 步（最短 Z 步）」+ particles +
 * onScore(level), auto-advance 1.5s later. Turn-based; no undo (movement is
 * free) and no pause hotkey — panel-driven pause freezes the auto-advance via
 * the stored-remainder pattern.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { canMove, generateMaze, solveLength, type Maze, type MazeDir } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, TRAIL_MAX, renderMaze } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'

const ADVANCE_MS = 1500
/** Cell grid size per level: L1 11×9, +2×2 per level up to L5 19×17. */
function levelSize(level: number): { w: number; h: number } {
  const step = Math.min(level, 5) - 1
  return { w: 11 + step * 2, h: 9 + step * 2 }
}
/** Deterministic per-level seed: replays of a level are identical. */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9) >>> 0
}

/** The direction each key maps to. */
const KEY_DIR: Record<string, MazeDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createMazeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: maze needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  let maze: Maze = generateMaze(levelSeed(1), 11, 9)
  let shortest = solveLength(maze)
  let player = { x: 0, y: 0 }
  const trail: { x: number; y: number }[] = []
  let moves = 0
  let winText: string | null = null
  let running = false
  let raf = 0
  let lastScore = -1
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let last = 0

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next > 5 ? 1 : next // wrap after L5
    const { w, h } = levelSize(level)
    maze = generateMaze(levelSeed(level), w, h)
    shortest = solveLength(maze)
    player = { x: 0, y: 0 }
    trail.length = 0
    moves = 0
    winText = null
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const tryMove = (dir: MazeDir): void => {
    if (winText !== null) return
    if (!canMove(maze, player.x, player.y, dir)) return
    trail.push({ ...player })
    if (trail.length > TRAIL_MAX) trail.shift()
    const delta = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[dir] as [number, number]
    player = { x: player.x + delta[0], y: player.y + delta[1] }
    moves += 1
    if (player.x === maze.w - 1 && player.y === maze.h - 1) {
      winText = `第 ${level} 关完成 · ${moves} 步（最短 ${shortest} 步）`
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS // paused mid-burst: arm on resume
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (advanceTimer !== 0) {
        window.clearTimeout(advanceTimer)
        advanceTimer = 0
      }
      advanceRemaining = 0
      const { w, h } = levelSize(level)
      maze = generateMaze(levelSeed(level), w, h)
      shortest = solveLength(maze)
      player = { x: 0, y: 0 }
      trail.length = 0
      moves = 0
      winText = null
      return
    }
    if (!running) return // paused: gameplay keys are dead (R stays alive)
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    tryMove(dir)
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    last = now
    renderMaze(ctx, maze, { player, trail, level, moves, shortest, winText })
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
  const pause = (): void => {
    running = false
    stopLoop()
    if (advanceTimer !== 0) {
      // Freeze the auto-advance: keep the remaining delay for resume.
      advanceRemaining = Math.max(0, advanceAt - performance.now())
      window.clearTimeout(advanceTimer)
      advanceTimer = 0
    }
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

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()
  renderMaze(ctx, maze, { player, trail, level, moves, shortest, winText })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      if (advanceTimer !== 0) window.clearTimeout(advanceTimer)
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const mazeGame: MiniGameDefinition = {
  id: 'maze',
  title: '迷宫',
  icon: '🌀',
  description: '随机完美迷宫：穿过唯一通路走到右下角出口，5 关逐渐变大。',
  controls: ['方向键 / WASD：移动', 'R：重开本关（同一迷宫）'],
  create: createMazeGame,
}
