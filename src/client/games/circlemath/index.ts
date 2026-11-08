/**
 * 圆周挑战游戏定义：把纯逻辑接入 MiniGameInstance —— 点击扇区或 方向键
 * ↑/↓ 切换活动环，←/→ 将活动环旋转一步（计步）；所有径向列的数字之
 * 和都等于目标和时过关，步数超过上限判负。H 提示金色高亮一个未达标
 * 列并显示目标和 2.5 秒（用过提示过关时步数奖励归零）。已持久化的关
 * 卡从上次进度继续；P 暂停；R 重开；[ ] 在已到达关卡间切换。盘面为
 * dirty 帧循环，空闲零重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  columnSums, computeScore, initialState, levelConfig, puzzleFromSeed, rotateRing,
  type CircleState,
} from './logic.ts'
import { CANVAS_H, CANVAS_W, pointToRing, radialPoint, renderCircleMath, type CircleView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
const HINT_SECONDS = 2.5

function createCircleMathGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基。
  let level = readLevel('circlemath')
  let state: CircleState
  let activeRing = 0
  let running = false
  let endTitle = ''
  let endText: string | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  /** 提示列下标，-1 为隐藏。 */
  let hintColumn = -1
  let hintTimer = 0
  /** 本关用过提示 → 过关时步数奖励归零。 */
  let hintUsed = false
  const particles = createParticles()

  const startLevel = (next: number): void => {
    level = next
    const cfg = levelConfig(level)
    state = initialState(puzzleFromSeed(level * 0x9e3779b9, level), cfg.maxSteps)
    activeRing = 0
    endTitle = ''
    endText = null
    hintColumn = -1
    hintTimer = 0
    hintUsed = false
    loop.markDirty()
  }

  const initialFit = fitCanvas(host, canvas, CANVAS_W, CANVAS_H)
  if (initialFit === null) throw new Error('dsh-minigames: circlemath needs a 2d canvas context')
  const fit = initialFit
  const ctx = fit.ctx

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('circlemath', next)
      startLevel(next)
    }, delayMs)
  }

  const onFinish = (): void => {
    if (state.status === 'won') {
      endTitle = '过关'
      endText = '第 ' + level + ' 关 · ' + state.steps + ' 步 · 下一关…'
      if (level !== lastScoreLevel) {
        lastScoreLevel = level
        options?.onScore?.(computeScore(level, state.steps, state.maxSteps, hintUsed))
      }
      const p = radialPoint(state.puzzle.sectors, 0, CANVAS_W / 3)
      particles.burst(p.x, p.y, THEME.gold, 20, 170)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    } else {
      endTitle = '步数用尽'
      endText = '第 ' + level + ' 关失败 · 按 R 重试'
    }
    loop.markDirty()
  }

  const rotate = (dir: number): void => {
    if (!running || state.status !== 'playing') return
    const next = rotateRing(state, activeRing, dir)
    if (next === state) return
    state = next
    loop.markDirty()
    if (state.status !== 'playing') onFinish()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * CANVAS_W) / rect.width
    const y = ((event.clientY - rect.top) * CANVAS_H) / rect.height
    const hit = pointToRing(state.puzzle, x, y)
    if (hit === null) return
    if (hit.ring !== activeRing) {
      activeRing = hit.ring
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
    } else if (event.code === 'KeyH') {
      // 提示：金色高亮一个未达标列并显示其目标和。
      if (!running || state.status !== 'playing') return
      event.preventDefault()
      // 只闪当前未达标的列（都已达标即已过关，不可达）。
      const wrong: number[] = []
      const sums = columnSums(state.puzzle, state.offsets)
      for (let col = 0; col < state.puzzle.sectors; col += 1) {
        if (sums[col] !== state.puzzle.target) wrong.push(col)
      }
      if (wrong.length === 0) return
      hintColumn = wrong[Math.floor(Math.random() * wrong.length)]!
      hintTimer = HINT_SECONDS
      hintUsed = true
      loop.markDirty()
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault()
      if (!running || state.status !== 'playing') return
      const delta = event.code === 'ArrowUp' ? -1 : 1
      activeRing = (activeRing + delta + state.puzzle.rings) % state.puzzle.rings
      loop.markDirty()
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault()
      rotate(event.code === 'ArrowLeft' ? -1 : 1)
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 1 && next <= Math.min(readLevel('circlemath'), 5)) startLevel(next)
    }
  }

  const loop = createFrameLoop(f => {
    if (hintTimer > 0) {
      hintTimer -= f.dt
      if (hintTimer <= 0) {
        hintTimer = 0
        hintColumn = -1
      }
      loop.markDirty()
    }
    const animating = particles.size() > 0
    if (f.render || animating || hintTimer > 0) {
      const view: CircleView = {
        activeRing,
        level,
        steps: state.steps,
        maxSteps: state.maxSteps,
        paused: !running && endText === null,
        endText,
        endTitle,
        hintColumn,
      }
      renderCircleMath(ctx, state.puzzle, state.offsets, view)
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
    const view: CircleView = {
      activeRing, level, steps: state.steps, maxSteps: state.maxSteps,
      paused: true, endText, endTitle, hintColumn: -1,
    }
    renderCircleMath(ctx, state.puzzle, state.offsets, view)
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

  // 初始关卡在 loop 建好后加载（startLevel 依赖 loop.markDirty）。
  startLevel(level)

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

export const circlemathGame: MiniGameDefinition = {
  id: 'circlemath',
  title: '圆周挑战 Circle Math',
  icon: '🎡',
  description: '圆盘上的数字推演：旋转圆环让数字对齐求和——锻炼空间思维与速算。',
  controls: [
    '点击扇区或 ↑↓：切换活动环 · ←→：旋转一步（计步）',
    'H：提示闪一列（弃步数奖励）· R：重开 · P：暂停',
    '[ ]：切换关卡 · 列和外圈的数字为当前列和',
  ],
  create: createCircleMathGame,
}
