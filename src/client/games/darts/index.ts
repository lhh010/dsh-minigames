/**
 * 飞镖 501 游戏定义：把纯逻辑接成 MiniGameInstance。鼠标移动瞄准，
 * 点击 / 空格掷镖（落点 = 瞄准点 + 手抖漂移），方向键微调瞄准；R 重开、
 * P 暂停。dirty 渲染 + 出镖粒子动画（动画期间主动标脏）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LOGICAL_H, LOGICAL_W, BOARD_R, createDartsState, runAiTurn, throwDart,
  type DartsState,
} from './logic.ts'
import { BOARD_CX, BOARD_CY, aimHint, renderDarts, type UiPhase } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 键盘微调步长（镖盘半径倍率）。 */
const KEY_STEP = 0.02
/** 瞄准点最大半径。 */
const AIM_MAX = 1.15

function createDartsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: darts needs a 2d canvas context')
  const ctx = fit.ctx

  let seed = Math.floor(Math.random() * 0x80000000)
  let state: DartsState = createDartsState(seed, true)
  let phase: UiPhase = 'ready'
  let aim = { x: 0, y: 0 }
  let t = 0
  /** 出镖动画剩余毫秒（期间持续标脏让粒子飞完）。 */
  let animMs = 0
  let lastScore = -1

  const reportScore = (): void => {
    const score = 501 - state.human.remaining
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const clampAim = (): void => {
    const r = Math.hypot(aim.x, aim.y)
    if (r > AIM_MAX) {
      aim = { x: aim.x / r * AIM_MAX, y: aim.y / r * AIM_MAX }
    }
  }

  let aiPendingMs = 0
  const maybeAiTurn = (): void => {
    if (state.turn === 'ai' && state.winner === null) {
      // 第三镖落点先给玩家看清楚：AI 回合延迟 900ms 再开始。
      aiPendingMs = 900
    }
    if (state.winner !== null && phase === 'playing') phase = 'over'
  }

  const runAiNow = (): void => {
    if (state.turn !== 'ai' || state.winner !== null) return
    runAiTurn(state)
    animMs = Math.max(animMs, 420)
    if (state.winner !== null) phase = 'over'
    reportScore()
  }

  const doThrow = (): void => {
    if (phase !== 'playing' || state.turn !== 'human' || state.winner !== null) return
    const res = throwDart(state, aim.x, aim.y, t)
    if (res !== null) {
      animMs = 360
      reportScore()
      maybeAiTurn()
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (phase !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const sx = (event.clientX - rect.left) / rect.width * LOGICAL_W
    const sy = (event.clientY - rect.top) / rect.height * LOGICAL_H
    aim = { x: (sx - BOARD_CX) / BOARD_R, y: (BOARD_CY - sy) / BOARD_R }
    clampAim()
    loop.markDirty()
  }

  const onClick = (): void => {
    if (phase === 'ready' || phase === 'paused') {
      phase = 'playing'
    } else if (phase === 'over') {
      restart()
    } else {
      doThrow()
    }
    loop.markDirty()
  }

  const restart = (): void => {
    seed = Math.floor(Math.random() * 0x80000000)
    state = createDartsState(seed, true)
    aim = aimHint(state)
    phase = 'playing'
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (phase === 'playing') phase = 'paused'
      else if (phase === 'paused') phase = 'playing'
      loop.markDirty()
      return
    }
    if (phase !== 'playing') return
    let moved = true
    if (event.code === 'ArrowLeft') aim = { x: aim.x - KEY_STEP, y: aim.y }
    else if (event.code === 'ArrowRight') aim = { x: aim.x + KEY_STEP, y: aim.y }
    else if (event.code === 'ArrowUp') aim = { x: aim.x, y: aim.y + KEY_STEP }
    else if (event.code === 'ArrowDown') aim = { x: aim.x, y: aim.y - KEY_STEP }
    else if (event.code === 'Space') {
      event.preventDefault()
      doThrow()
      moved = false
    } else moved = false
    if (moved) {
      clampAim()
      loop.markDirty()
    }
  }

  const frame = (f: FrameInfo): void => {
    if (phase === 'playing') t += f.dt
    if (aiPendingMs > 0) {
      aiPendingMs -= f.wallMs
      loop.markDirty()
      if (aiPendingMs <= 0) runAiNow()
    }
    if (animMs > 0) {
      animMs -= f.wallMs
      loop.markDirty()
    }
    if (f.render) renderDarts(ctx, state, aim, t, phase)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (phase === 'playing') phase = 'paused'
    loop.pause()
    loop.markDirty()
  }
  const resume = (): void => {
    loop.resume()
    if (phase === 'paused' || phase === 'ready') phase = 'playing'
    loop.markDirty()
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  aim = aimHint(state)
  loop.start()
  loop.markDirty()
  renderDarts(ctx, state, aim, 0, phase)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const dartsGame: MiniGameDefinition = {
  id: 'darts',
  title: '飞镖 Darts',
  icon: '🪃',
  description: '五十环靶上做减法——手要稳、心要算，恰好归零且最后一镖必须双倍。',
  controls: ['鼠标移动：瞄准', '点击 / 空格：掷镖', '方向键：微调', 'P：暂停', 'R：重开'],
  create: createDartsGame,
}
