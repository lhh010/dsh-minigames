/**
 * 接雨水 (Rainwater) 游戏定义：把纯逻辑接入 {@link MiniGameInstance}。
 * 5 关递进（槽位 8→14、目标 4→12）：点击柱升高 1 格（耗 1 砖）、右键或
 * Shift+点击降低（拆回砖），总蓄水达标即过关计分（60 + 目标×10 + 剩余
 * 预算×8），1.5 秒后自动进入下一关；最后一关达成后全部通关。R 重开本
 * 关（保留之前累计分）、P 暂停。onScore 上报跨关累计分（仅变化时）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVEL_COUNT, W, H, canLower, canRaise, createLevel, createRainwater, lowerColumn,
  nextLevel, raiseColumn, type RainwaterState,
} from './logic.ts'
import { columnAt, renderRainwater } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500

function createRainwaterGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: rainwater needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = (Date.now() & 0x7fffffff) >>> 0
  let state: RainwaterState = createRainwater(seed, 1)
  /** 进入当前关前的累计分（R 重开本关时恢复）。 */
  let scoreAtLevelStart = 0
  let running = false
  let advanceTimer = 0
  let advanceRemaining = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.totalScore === lastScore) return
    lastScore = state.totalScore
    options?.onScore?.(state.totalScore)
  }

  /** 过关后自动进入下一关（暂停安全的剩余时间模式）。 */
  const scheduleAdvance = (delayMs: number): void => {
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      scoreAtLevelStart = state.totalScore
      state = nextLevel(state)
      loop.markDirty()
    }, delayMs)
  }

  const restartLevel = (): void => {
    clearTimeout(advanceTimer)
    advanceTimer = 0
    advanceRemaining = 0
    if (state.finished) {
      scoreAtLevelStart = 0
      state = createRainwater(seed, 1)
    } else {
      state = createLevel(state.seed, state.run, state.level, scoreAtLevelStart)
    }
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  /** 对某列加高或拆砖（右键 / Shift = 拆）。 */
  const applyColumn = (col: number, lower: boolean): void => {
    if (!running || state.phase !== 'playing') return
    if (lower) {
      if (canLower(state, col)) lowerColumn(state, col)
    } else {
      if (canRaise(state, col)) raiseColumn(state, col)
    }
    // raiseColumn 可能就地过关（TS 不会因函数调用撤销属性收窄，经局部变量重读）。
    const phaseAfter: string = state.phase
    if (phaseAfter === 'won') {
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * W) / rect.width
    const col = columnAt(state, x)
    if (col === null) return
    if (event.button === 2 || event.shiftKey) {
      event.preventDefault()
      applyColumn(col, true)
    } else if (event.button === 0) {
      applyColumn(col, false)
    }
  }
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restartLevel()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  // 脏标记渲染：静态盘面只在输入 / 过关变化时重绘。
  const loop = createFrameLoop(f => {
    if (f.render) renderRainwater(ctx, state, !running && state.phase === 'playing')
  }, { mode: 'dirty' })

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
      advanceRemaining = ADVANCE_MS
    }
    loop.pause()
    renderRainwater(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      advanceRemaining = 0
      scheduleAdvance(ADVANCE_MS)
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
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
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const rainwaterGame: MiniGameDefinition = {
  id: 'rainwater',
  title: '接雨水 Rainwater',
  icon: '☔',
  description: '堆砌挡板围出洼地——能蓄多少水全看你墙怎么砌。',
  controls: [
    '点击柱子升高 1 格（耗 1 砖）',
    '右键或 Shift+点击：拆回 1 砖',
    '蓄水达到目标即过关，砖越省分越高',
    'R：重开本关 · P：暂停',
  ],
  create: createRainwaterGame,
}
