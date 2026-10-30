/**
 * Maze game definition: wires the pure maze logic into a
 * {@link MiniGameInstance} — arrows/WASD move the player cell-to-cell through
 * open walls toward the far-corner exit. Five levels ramp 11×9 → 19×17 cells
 * (same seed per level → identical maze on R restart); after L5 the run wraps
 * back to L1. On win: overlay 「第 X 关完成 · Y 步（最短 Z 步）」+ particles +
 * onScore(level), auto-advance 1.5s later. Turn-based; no undo (movement is
 * free) and P toggles pause — panel-driven pause freezes the auto-advance via
 * the stored-remainder pattern. [ / ] jump between unlocked levels (bounded
 * to the persisted highest reached). The highest level reached persists per
 * game id, so re-entering resumes where the player left off.
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
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

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

  // Level memory: resume at the highest level reached (persisted per game id).
  let level = Math.min(readLevel('maze'), 5)
  const startSize = levelSize(level)
  let maze: Maze = generateMaze(levelSeed(level), startSize.w, startSize.h)
  let shortest = solveLength(maze)
  let player = { x: 0, y: 0 }
  const trail: { x: number; y: number }[] = []
  let moves = 0
  let winText: string | null = null
  let running = false
  let lastScore = -1
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next > 5 ? 1 : next // wrap after L5
    saveLevel('maze', level) // progress memory: never regresses
    const { w, h } = levelSize(level)
    maze = generateMaze(levelSeed(level), w, h)
    shortest = solveLength(maze)
    player = { x: 0, y: 0 }
    trail.length = 0
    moves = 0
    winText = null
    loop.markDirty()
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
    loop.markDirty()
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
      startLevel(level) // same seed → the same maze
      return
    }
    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      // 切换关卡：先取消待跳转的自动推进计时器，再从全新关卡开始。
      if (advanceTimer !== 0) {
        window.clearTimeout(advanceTimer)
        advanceTimer = 0
      }
      advanceRemaining = 0
      const max = Math.min(readLevel('maze'), 5)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 1 && next <= max) startLevel(next)
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running) return // paused: gameplay keys are dead (R stays alive)
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    tryMove(dir)
  }

  // 脏标记渲染：回合制盘面只在移动 / 胜负 / 重开时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    if (f.render) renderMaze(ctx, maze, { player, trail, level, moves, shortest, winText, paused: false })
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    if (advanceTimer !== 0) {
      // Freeze the auto-advance: keep the remaining delay for resume.
      advanceRemaining = Math.max(0, advanceAt - performance.now())
      window.clearTimeout(advanceTimer)
      advanceTimer = 0
    }
    renderMaze(ctx, maze, { player, trail, level, moves, shortest, winText, paused: true })
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

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderMaze(ctx, maze, { player, trail, level, moves, shortest, winText, paused: false })

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
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
  controls: ['方向键 / WASD：移动', 'R：重开本关（同一迷宫）', '[ ]：切换关卡（已通关范围）', 'P：暂停'],
  create: createMazeGame,
}
