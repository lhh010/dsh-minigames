/**
 * 杂技抛球游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击画布
 * 任意位置即对该位置附近的球施加拍击冲量，底部双手托盘跟随指针移动
 * （纯视觉）；continuous 帧循环推进固定子步物理与渲染，R 重开（换局
 * 号）、P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createJuggle, stepJuggle, W, H, type JuggleState } from './logic.ts'
import { renderJuggle } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createJuggleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: juggle needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: JuggleState = createJuggle(seed, round)
  let running = false
  let lastScore = -1
  // 本帧待结算的点击点（逻辑坐标）；托盘中心跟随指针移动。
  let pendingTap: { x: number, y: number } | null = null
  let trayX = W / 2

  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    const p = toLogical(event)
    pendingTap = p
    trayX = p.x
  }
  const onPointerMove = (event: PointerEvent): void => {
    trayX = toLogical(event).x
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }
  const onBlur = (): void => {
    pendingTap = null
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (!state.over) stepJuggle(state, f.dt * 1000, { tap: pendingTap })
    else stepJuggle(state, 0, { tap: null })
    pendingTap = null
    reportScore()
    if (f.render) renderJuggle(ctx, state, trayX, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createJuggle(seed, round)
    lastScore = -1
    pendingTap = null
    trayX = W / 2
    loop.markDirty()
    renderJuggle(ctx, state, trayX, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderJuggle(ctx, state, trayX, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  running = true
  loop.start()
  renderJuggle(ctx, state, trayX, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const juggleGame: MiniGameDefinition = {
  id: 'juggle',
  title: '杂技抛球 Juggle',
  icon: '\ud83c\udfaa',
  description: '把球拍向空中并接住——同时保持的球越多，分数涨得越快。',
  controls: [
    '点击画面任意位置：把附近的球向上拍（越近冲量越大）',
    '球坠出底部丢 1 命（共 3 命）\u00b7 每 10 秒场上多 1 球（最多 6）\u00b7 连拍涨连击倍率',
    'R：重开 \u00b7 P：暂停',
  ],
  create: createJuggleGame,
}
