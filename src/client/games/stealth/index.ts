/**
 * 潜行渗透游戏装配：方向键/WASD 四向移动（守卫按节拍步进巡逻）、
 * R 重开本关（同 seed 同盘，生命回满）、P 暂停。dirty 按需帧循环：输入、
 * 守卫节拍与红闪期间才重绘；过关 1.4s 后自动进下一关并沿用剩余生命，
 * 五关全通或生命耗尽进入终局 overlay。onScore 随钻石 / 过关即时上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVEL_COUNT, START_LIVES, createStealthState, movePlayer, tickStealth,
  type Dir, type StealthState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderStealth } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1400

/** 每关确定性种子：R 重开重放同一张图。 */
function levelSeed(level: number): number {
  return (level * 0x9e3779b9 + 0x51ed270b) >>> 0
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function createStealthGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'stealth-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: stealth needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  let state: StealthState = createStealthState(levelSeed(level), level)
  let running = false
  let score = 0
  let lastScore = -1
  let finished = false
  let lastBeats = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const startLevel = (next: number, resetRun: boolean): void => {
    level = next
    if (resetRun) {
      finished = false
      score = 0
      state = createStealthState(levelSeed(level), level)
    } else {
      state = createStealthState(levelSeed(level), level, START_LIVES, score)
    }
    lastBeats = 0
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      if (level >= LEVEL_COUNT) {
        finished = true
        loop.markDirty()
        return
      }
      score = state.score
      reportScore()
      startLevel(Math.min(level + 1, LEVEL_COUNT), false)
    }, delayMs)
  }

  const tryMove = (dir: Dir): void => {
    const result = movePlayer(state, dir)
    if (!result.moved) return
    if (result.diamond || result.cleared) {
      score = state.score
      reportScore()
    }
    if (result.cleared) {
      if (level >= LEVEL_COUNT) {
        if (running) scheduleAdvance(ADVANCE_MS)
        else advanceRemaining = ADVANCE_MS
      } else if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
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
      // 游戏中：重开本关（同 seed，生命回满）；终局：整轮从第 1 关重来。
      if (state.status === 'gameover' || finished) startLevel(1, true)
      else startLevel(level, false)
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (!running) return
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    if (state.status !== 'playing') return
    tryMove(dir)
  }

  // dirty 模式：守卫节拍、输入与红闪期间才重绘；模拟每帧照常推进。
  const loop = createFrameLoop(frame => {
    tickStealth(state, frame.dt * 1000)
    if (state.beats !== lastBeats || state.caughtFlashMs > 0) {
      lastBeats = state.beats
      loop.markDirty()
    }
    if (frame.render) renderStealth(ctx, state, view())
  }, { mode: 'dirty' })

  const view = (): { paused: boolean; finished: boolean; nowMs: number } => ({
    paused: !running, finished, nowMs: performance.now(),
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
    renderStealth(ctx, state, view())
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
  renderStealth(ctx, state, view())

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

export const stealthGame: MiniGameDefinition = {
  id: 'stealth',
  title: '潜行渗透 Stealth',
  icon: '🕶',
  description: '守卫的视野锥扫来扫去——掐准巡逻节拍，从阴影溜到保险柜。',
  controls: [
    '方向键 / WASD：四向移动；守卫按节拍巡逻，走位卡准间隙',
    '胜利：抵达金色保险柜过关（共 5 关）；被任一视野锥照到扣 1 命并回起点',
    '守卫视野会被墙挡住；拐角与墙后是安全盲区',
    '钻石可选收集，每颗 +30 分；过关另得 100 分 + 剩余生命 ×20',
    '第 4 关起守卫有听觉：连续快速移动会累积警觉、满格临时扩锥；R 重开 P 暂停',
  ],
  create: createStealthGame,
}
