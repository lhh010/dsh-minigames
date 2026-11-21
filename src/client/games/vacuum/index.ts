/**
 * 清扫规划游戏装配：方向键/WASD 或点击相邻格移动，R 重开本关（同
 * seed 同盘），P 暂停。dirty 帧循环——盘面只在交互/粒子活跃时重绘。
 * 过关 1.4s 自动进下一关；五关全通或电量耗尽进入 overlay，R 重开。
 * onScore：每新清扫一格 +1、过关 +150、全通 +500，变化时上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createVacuumState, tryMove, FINAL_LEVEL,
  type VacuumDir, type VacuumMoveResult, type VacuumState,
} from './logic.ts'
import { renderVacuum, vacuumCellCenter, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { createParticles } from '../theme.ts'

const ADVANCE_MS = 1400

/** 每关确定性种子：R 重开重放同一张图。 */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9 + 0x51ed270b) >>> 0
}

const KEY_DIR: Record<string, VacuumDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createVacuumGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: vacuum needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  let state: VacuumState = createVacuumState(levelSeed(level), level)
  let running = false
  let score = 0
  let lastScore = -1
  let allDone = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  const particles = createParticles()

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const startLevel = (next: number, resetRun: boolean): void => {
    level = next
    if (resetRun) {
      score = 0
      allDone = false
    }
    state = createVacuumState(levelSeed(level), level)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      if (level >= FINAL_LEVEL) allDone = true
      else startLevel(level + 1, false)
      loop.markDirty()
    }, delayMs)
  }

  const afterMove = (result: VacuumMoveResult): void => {
    if (result.cleanedNew) score += 1
    if (result.catBump) {
      const c = vacuumCellCenter(state, state.robot.x, state.robot.y)
      particles.burst(c.cx, c.cy, '#f7768e', 8, 110)
    }
    if (result.recharged) {
      const dock = state.room.dock
      const c = vacuumCellCenter(state, dock.x, dock.y)
      particles.burst(c.cx, c.cy, '#e0af68', 10, 120)
    }
    if (result.won) {
      score += 150
      if (level >= FINAL_LEVEL) score += 500
      const c = vacuumCellCenter(state, state.robot.x, state.robot.y)
      particles.burst(c.cx, c.cy, '#9ece6a', 26, 170)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
    reportScore()
    loop.markDirty()
  }

  const doMove = (dir: VacuumDir): void => {
    if (!running || state.status !== 'playing') return
    afterMove(tryMove(state, dir))
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (advanceTimer !== 0) {
        window.clearTimeout(advanceTimer)
        advanceTimer = 0
      }
      advanceRemaining = 0
      // 游戏中：重开本关（同 seed）；终局：整轮从第 1 关重来。
      if (allDone) startLevel(1, true)
      else startLevel(level, false)
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    doMove(dir)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const lx = ((event.clientX - rect.left) / rect.width) * LOGICAL_W
    const ly = ((event.clientY - rect.top) / rect.height) * LOGICAL_H
    const c = vacuumCellCenter(state, 0, 0)
    const gx = Math.floor((lx - c.ox) / c.cs)
    const gy = Math.floor((ly - c.oy) / c.cs)
    const dx = gx - state.robot.x
    const dy = gy - state.robot.y
    if (Math.abs(dx) + Math.abs(dy) !== 1) return
    doMove(dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up')
  }

  const draw = (paused: boolean): void => {
    renderVacuum(ctx, state, { paused, allDone })
    particles.tick(ctx, 16)
  }

  // dirty 模式：交互与粒子触发重绘，静止盘面零重绘。
  const loop = createFrameLoop(frame => {
    if (!running) return
    if (frame.render || particles.size() > 0) draw(false)
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
      // 冻结自动进关计时：保存剩余毫秒，恢复时续接。
      advanceRemaining = Math.max(0, advanceAt - performance.now())
      window.clearTimeout(advanceTimer)
      advanceTimer = 0
    }
    draw(true)
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
  canvas.addEventListener('pointerdown', onPointerDown)
  focusGameHost(host)
  running = true
  loop.start()
  draw(false)

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
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const vacuumGame: MiniGameDefinition = {
  id: 'vacuum',
  title: '清扫规划 Vacuum',
  icon: '🧹',
  description: '电量有限家具挡路——规划一条路线把每个角落都吸干净。',
  controls: [
    '方向键 / WASD 或点击相邻格：移动，经过的格子即被清扫',
    '每移动一格 -1 电量；踩回充电桩 ⚡ 自动充满，但充电次数有限',
    '清扫全部可达格过关；被家具围死的格子不计入分母',
    '第 4 关起有宠物猫：撞上 -5 电量并被弹开',
    'R：重开本关　P：暂停',
  ],
  create: createVacuumGame,
}
