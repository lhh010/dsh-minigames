/**
 * 过河青蛙 game definition: wires the deterministic frogger logic into a
 * {@link MiniGameInstance} — arrows/WASD hop one cell; crossing every road
 * lane to the goal row scores and advances the level (faster, denser
 * traffic); a car hit costs one of three lives and resets the frog to the
 * start row; zero lives ends the run (R restarts). Score accrues per
 * crossing via onScore. P pauses (sim clock freezes; the stored-remainder
 * pattern keeps a pending level advance exact).
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  COLS, LANES, clampCol, crossingScore, isHit, levelFromSeed,
  type FroggerLevel,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, cellCenter, renderFrogger } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const START_ROW = LANES + 1
const GOAL_ROW = 0
const LIVES = 3
/** Death freeze before the frog resets (seconds). */
const DEATH_FREEZE = 0.7

function createFroggerGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: frogger needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  let spec: FroggerLevel = levelFromSeed(level * 0x9e3779b9, level)
  let frog = { row: START_ROW, col: Math.floor(COLS / 2) }
  let lives = LIVES
  let score = 0
  let t = 0
  let deadFreeze = 0
  let dead = false
  let gameOver = false
  let running = false
  const particles = createParticles()

  const reportScore = (): void => {
    options?.onScore?.(score)
  }

  const resetFrog = (): void => {
    frog = { row: START_ROW, col: Math.floor(COLS / 2) }
  }

  const restart = (): void => {
    level = 1
    spec = levelFromSeed(level * 0x9e3779b9, level)
    lives = LIVES
    score = 0
    t = 0
    deadFreeze = 0
    dead = false
    gameOver = false
    resetFrog()
    reportScore()
    loop.markDirty()
  }

  const die = (): void => {
    dead = true
    deadFreeze = DEATH_FREEZE
    lives -= 1
    const c = cellCenter(frog.row, frog.col)
    particles.burst(c.x, c.y, THEME.bad, 16, 200)
    if (lives <= 0) gameOver = true
    loop.markDirty()
  }

  const hop = (dr: number, dc: number): void => {
    if (gameOver || dead) return
    const row = Math.max(GOAL_ROW, Math.min(START_ROW, frog.row + dr))
    const col = clampCol(frog.col + dc)
    if (row === frog.row && col === frog.col) return
    frog = { row, col }
    loop.markDirty()
    if (row === GOAL_ROW) {
      // Safe crossing: score, celebrate, next level.
      score += crossingScore(level)
      reportScore()
      const c = cellCenter(row, col)
      particles.burst(c.x, c.y, THEME.gold, 18, 200)
      level += 1
      spec = levelFromSeed(level * 0x9e3779b9, level)
      resetFrog()
      loop.markDirty()
    } else if (row >= 1 && row <= LANES && isHit(spec, LANES - row, col, t)) {
      die()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const code = event.code
    if (code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running) return
    if (code === 'ArrowUp' || code === 'KeyW') { event.preventDefault(); hop(-1, 0) }
    else if (code === 'ArrowDown' || code === 'KeyS') { event.preventDefault(); hop(1, 0) }
    else if (code === 'ArrowLeft' || code === 'KeyA') { event.preventDefault(); hop(0, -1) }
    else if (code === 'ArrowRight' || code === 'KeyD') { event.preventDefault(); hop(0, 1) }
  }

  const loop = createFrameLoop(f => {
    if (!running) return
    if (!gameOver) {
      t += f.dt
      if (dead) {
        deadFreeze -= f.dt
        if (deadFreeze <= 0) {
          dead = false
          resetFrog()
          loop.markDirty()
        }
      } else if (frog.row >= 1 && frog.row <= LANES && isHit(spec, LANES - frog.row, frog.col, t)) {
        die()
      }
    }
    renderFrogger(ctx, spec, t, frog, dead, lives, score, level, false, gameOver)
    particles.tick(ctx, f.dt * 1000)
  })

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderFrogger(ctx, spec, t, frog, dead, lives, score, level, true, gameOver)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

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
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const froggerGame: MiniGameDefinition = {
  id: 'frogger',
  title: '过河青蛙 Frogger',
  icon: '🐸',
  description: '操控青蛙跳过川流不息的车道抵达对岸，车速与车流随关卡加密。',
  controls: ['方向键 / WASD：跳一格', '碰到车损失一条命（共 3 条）', 'R：重开 · P：暂停'],
  create: createFroggerGame,
}
