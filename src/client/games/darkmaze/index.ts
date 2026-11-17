/**
 * 手电迷宫游戏装配：WASD/方向键移动（移动即转身向）、鼠标或 Q/E 旋转手电
 * 朝向、R 重开本关（同 seed 同盘）、P 暂停。连续帧循环驱动光锥平滑旋转、
 * 金币闪烁与 0.5s 全图闪现衰减；过关 1.4s 后自动进下一关并沿用剩余生命，
 * 五关全通或生命耗尽进入终局 overlay。onScore 随金币 / 过关即时上报累计分。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createDarkMazeState, moveDarkPlayer, rotateDarkPlayer, tickDarkMaze,
  type DarkDir, type DarkMazeState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, darkCellCenter, renderDarkMaze } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1400
const FINAL_LEVEL = 5
/** Q/E 每次旋转步长（弧度）。 */
const ROTATE_STEP = Math.PI / 12

/** 每关确定性种子：R 重开重放同一张图。 */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9 + 0x51ed270b) >>> 0
}

const KEY_DIR: Record<string, DarkDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createDarkMazeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: darkmaze needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  let state: DarkMazeState = createDarkMazeState(levelSeed(level), level)
  let running = false
  let score = 0
  let lastScore = -1
  let clearedTotal = 0
  let finished = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const startLevel = (next: number, lives: number, resetRun: boolean): void => {
    level = next
    if (resetRun) {
      clearedTotal = 0
      finished = false
      score = 0
    }
    state = createDarkMazeState(levelSeed(level), level, lives)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      // 沿用剩余生命进入下一关；五关全通则停在终局 overlay。
      startLevel(Math.min(level + 1, FINAL_LEVEL), state.lives, false)
    }, delayMs)
  }

  const tryMove = (dir: DarkDir): void => {
    const result = moveDarkPlayer(state, dir)
    if (!result.moved) return
    if (result.coin) score += 10
    if (result.cleared) {
      clearedTotal += 1
      score += 100 + state.lives * 20
      if (level >= FINAL_LEVEL) finished = true
      else if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
    reportScore()
    loop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const lx = ((event.clientX - rect.left) / rect.width) * LOGICAL_W
    const ly = ((event.clientY - rect.top) / rect.height) * LOGICAL_H
    const c = darkCellCenter(state.maze, state.player.x, state.player.y)
    rotateDarkPlayer(state, Math.atan2(ly - c.py, lx - c.px))
    loop.markDirty()
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
      // 游戏中：重开本关（同 seed）；终局：整轮从第 1 关重来。
      if (state.status === 'gameover' || finished) startLevel(1, 3, true)
      else startLevel(level, 3, false)
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running) return
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      event.preventDefault()
      if (state.status !== 'playing') return
      rotateDarkPlayer(state, state.facing + (event.code === 'KeyQ' ? -ROTATE_STEP : ROTATE_STEP))
      loop.markDirty()
      return
    }
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    if (state.status !== 'playing') return
    tryMove(dir)
  }

  // 连续模式：光锥平滑旋转、金币闪烁、闪现衰减都要每帧推进。
  const loop = createFrameLoop(frame => {
    tickDarkMaze(state, frame.dt * 1000)
    if (frame.render) renderDarkMaze(ctx, state, { paused: false, finished })
  })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    if (advanceTimer !== 0) {
      // 冻结自动进关计时：保存剩余毫秒，恢复时续接。
      advanceRemaining = Math.max(0, advanceAt - performance.now())
      window.clearTimeout(advanceTimer)
      advanceTimer = 0
    }
    renderDarkMaze(ctx, state, { paused: true, finished })
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
  canvas.addEventListener('mousemove', onMouseMove)
  focusGameHost(host)
  running = true
  loop.start()
  renderDarkMaze(ctx, state, { paused: false, finished })

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
      canvas.removeEventListener('mousemove', onMouseMove)
    },
  }
}

export const darkmazeGame: MiniGameDefinition = {
  id: 'darkmaze',
  title: '手电迷宫 DarkMaze',
  icon: '🌃',
  description: '黑暗中只有一束手电——记忆走过的路，找到出口。',
  controls: ['WASD/方向键：移动（同时转向）', '鼠标 / Q·E：旋转手电朝向', 'R：重开（终局后重开整轮）', 'P：暂停'],
  create: createDarkMazeGame,
}
