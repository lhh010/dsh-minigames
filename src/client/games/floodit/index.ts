/**
 * Flood It 游戏定义：把纯逻辑接成 {@link MiniGameInstance} —— 点击底部
 * 六色大色板（或按 1-6）把左上连通片换色合并，限定步数内把整盘染成
 * 单色即过关。H 高亮贪心下一步色；R 重开本关；P 暂停；[ ] 在已解锁
 * 关卡间切换。内部关卡号为 0 基，展示与持久化为 1 基（共享
 * level-progress 助手），重挂载时从上次进度继续。计分按关卡累计上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  COLOR_COUNT, boardSizeForLevel, componentOf, createLevel, flood, greedyNextColor, scoreFor,
  type FloodItState,
} from './logic.ts'
import { logicalH, logicalW, paletteColorAt, renderFloodIt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 900

function createFloodItGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡为 1 基；内部 0 基。
  let level = readLevel('floodit') - 1
  let state: FloodItState = createLevel(0x5eed17, level)
  let hover = -1
  let hint = -1
  let running = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let totalScore = 0
  let lastScore = -1
  const particles = createParticles()
  const initialFit = fitCanvas(host, canvas, logicalW(state.size), logicalH(state.size))
  if (initialFit === null) throw new Error('dsh-minigames: floodit needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (size: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(size), logicalH(size))
    if (next === null) throw new Error('dsh-minigames: floodit needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const lost = (): boolean => !state.won && state.steps >= state.maxSteps

  const startLevel = (next: number): void => {
    level = next
    state = createLevel(0x5eed17, level)
    hover = -1
    hint = -1
    refit(boardSizeForLevel(level))
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('floodit', next + 1) // 持久化 1 基；level 为 0 基
      startLevel(next)
    }, delayMs)
  }

  const reportScore = (): void => {
    if (totalScore !== lastScore) {
      lastScore = totalScore
      options?.onScore?.(totalScore)
    }
  }

  const checkEnd = (): void => {
    if (state.won) {
      const gained = scoreFor(level, state.maxSteps - state.steps)
      totalScore += gained
      reportScore()
      hint = -1
      const cx = logicalW(state.size) / 2
      const cy = logicalH(state.size) / 2
      particles.burst(cx, cy, THEME.gold, 20, 170)
      loop.markDirty()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    } else if (lost()) {
      hint = -1
      loop.markDirty()
    }
  }

  const applyColor = (color: number): void => {
    if (!running || state.won || lost()) return
    const next = flood(state, color)
    if (next === state) return // 无效操作：不消耗步数
    state = next
    hint = -1
    loop.markDirty()
    checkEnd()
  }

  const toLogical = (event: MouseEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * logicalW(state.size)) / rect.width,
      y: ((event.clientY - rect.top) * logicalH(state.size)) / rect.height,
    }
  }

  /** 过关展示中立即进入下一关（清掉自动计时）。 */
  const advanceNow = (): void => {
    if (!state.won || advanceTimer === 0) return
    clearTimeout(advanceTimer)
    advanceTimer = 0
    const next = level + 1
    saveLevel('floodit', next + 1)
    startLevel(next)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (state.won) {
      advanceNow()
      return
    }
    const { x, y } = toLogical(event)
    const color = paletteColorAt(state.size, x, y)
    if (color >= 0) applyColor(color)
  }

  const onMouseMove = (event: MouseEvent): void => {
    const { x, y } = toLogical(event)
    const next = paletteColorAt(state.size, x, y)
    if (next !== hover) {
      hover = next
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (state.won && (event.code === 'Space' || event.code === 'Enter')) {
      event.preventDefault()
      advanceNow()
      return
    }
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
      event.preventDefault()
      if (!state.won && !lost()) {
        hint = greedyNextColor(state)
        loop.markDirty()
      }
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = readLevel('floodit') - 1 // 0 基上界
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next <= max) startLevel(next)
    } else if (event.code.startsWith('Digit')) {
      const n = Number(event.code.slice(5))
      if (n >= 1 && n <= COLOR_COUNT) {
        event.preventDefault()
        applyColor(n - 1)
      }
    }
  }

  // 脏标记渲染：盘面只在输入、悬停、提示、粒子或过关时重绘。
  const loop = createFrameLoop(f => {
    const animating = particles.size() > 0
    if (f.render || animating) {
      renderFloodIt(ctx, {
        size: state.size,
        board: state.board,
        inFlood: componentOf(state.board, state.size, 0, 0),
        movesLeft: state.maxSteps - state.steps,
        maxSteps: state.maxSteps,
        levelLabel: '第 ' + String(level + 1) + ' 关',
        timeSec: performance.now() / 1000,
        hint,
        hover,
        won: state.won,
        lost: lost(),
        paused: false,
        subtitle: '得分 ' + String(scoreFor(level, state.maxSteps - state.steps)) + ' · 点击或空格进入下一关',
      })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const drawPaused = (): void => {
    renderFloodIt(ctx, {
      size: state.size,
      board: state.board,
      inFlood: componentOf(state.board, state.size, 0, 0),
      movesLeft: state.maxSteps - state.steps,
      maxSteps: state.maxSteps,
      levelLabel: '第 ' + String(level + 1) + ' 关',
      timeSec: performance.now() / 1000,
      hint,
      hover,
      won: state.won,
      lost: lost(),
      paused: true,
      subtitle: '',
    })
  }
  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    drawPaused()
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
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const flooditGame: MiniGameDefinition = {
  id: 'floodit',
  title: '填色 Flood It',
  icon: '🎨',
  description: '从左上角开始换色，相邻同色连片扩张——在限定步数内把整盘染成单色。',
  controls: ['点击色板或 1-6：把左上连片换成该色', 'H：提示贪心下一步色', 'R：重开本关', '[ ]：切换关卡（已通关范围）', 'P：暂停'],
  create: createFloodItGame,
}
