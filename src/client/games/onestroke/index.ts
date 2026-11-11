/**
 * 一笔画 (One Stroke) 游戏定义：把纯逻辑接入 {@link MiniGameInstance}——
 * 5 个种子关卡（边数 8→20、奇点 0/2 交替，同关卡同图，R 重开完全一致）。
 * 点击任一节点起笔，再点击相邻节点沿边移动；重复走已画的边判负，走进
 * 死点（剩余度为 0 且未画完）同样提示重开。H 切换提示（奇点金环 + 剩余
 * 度常显），画线动画期间逐帧标脏重绘。过关后 onScore(关卡) 上报并 1.5s
 * 后进入下一关（暂停安全的剩余时间模式）；最高关卡进度持久化。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS, initialState, isComplete, isStuck, levelGraph, startAt, tryMove,
  type StrokeState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, animationActive, nodeAt, renderOneStroke } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
const REPEAT_FAIL = '这条边已经画过 · 按 R 重开'
const STUCK_FAIL = '走到死点了 · 按 R 重开'

function createOneStrokeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: onestroke needs a 2d canvas context')
  const ctx = fit.ctx

  let level = Math.min(readLevel('onestroke'), LEVELS.length)
  let state: StrokeState = initialState(levelGraph(level))
  let hint = false
  let elapsed = 0
  let failText: string | null = null
  let winText: string | null = null
  let running = false
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
    level = next > LEVELS.length ? 1 : next
    saveLevel('onestroke', level)
    state = initialState(levelGraph(level))
    elapsed = 0
    failText = null
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

  const checkEnd = (): void => {
    if (winText !== null || failText !== null) return
    if (isComplete(state)) {
      winText = '第 ' + level + ' 关完成 · 用时 ' + Math.floor(elapsed) + ' 秒'
      loop.markDirty()
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    } else if (isStuck(state)) {
      failText = STUCK_FAIL
      loop.markDirty()
    }
  }

  /** 点击节点：未起笔则起笔；否则尝试沿边移动（重复边判负）。 */
  const pickNode = (index: number): void => {
    if (failText !== null || winText !== null) return
    if (state.at === null) {
      state = startAt(state, index)
      loop.markDirty()
      return
    }
    const result = tryMove(state, index)
    if (!result.ok) {
      if (result.reason === 'edge-drawn') {
        failText = REPEAT_FAIL
        loop.markDirty()
      }
      return
    }
    state = result.state
    loop.markDirty()
    checkEnd()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || winText !== null || failText !== null) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const index = nodeAt(state.graph, x, y)
    if (index !== null) pickNode(index)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running || winText !== null || failText !== null) return
    if (event.code === 'KeyH') {
      event.preventDefault()
      hint = !hint
      loop.markDirty()
    }
  }

  // 脏标记渲染：静态盘面只在输入变化时重绘；画线动画未结束时持续标脏。
  const loop = createFrameLoop(f => {
    if (winText === null && failText === null) elapsed += f.dt
    if (animationActive()) loop.markDirty()
    if (f.render) renderOneStroke(ctx, state, level, hint, !running && winText === null, failText, winText)
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
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderOneStroke(ctx, state, level, hint, true, failText, winText)
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
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const onestrokeGame: MiniGameDefinition = {
  id: 'onestroke',
  title: '一笔画 One Stroke',
  icon: '🖋️',
  description: '笔不离纸、每条线恰好画一次——欧拉告诉你哪些图能一笔画完。',
  controls: [
    '点击节点起笔，再点相邻节点沿边移动',
    '重复走已画的边或走进死点即失败',
    'H：提示（奇点金环 + 剩余度）',
    'R：重开 · P：暂停',
  ],
  create: createOneStrokeGame,
}
