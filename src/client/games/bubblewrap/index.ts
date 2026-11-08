/**
 * 泡泡纸游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击或按住
 * 拖动扫过泡泡逐个捏爆（pointerdown/move，按住期间 pointermove 命中即捏），
 * continuous 帧循环推进 combo 窗口与渲染，R 重开（分数归零、回到第 1 板）、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。零失败、无时限。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createBubbleWrap, popAtPoint, stepBubbleWrap, W, H, type BubbleWrapState } from './logic.ts'
import { renderBubbleWrap } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createBubbleWrapGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: bubblewrap needs a 2d canvas context')
  const ctx = fit.ctx

  let state: BubbleWrapState = createBubbleWrap()
  let running = false
  let lastScore = -1

  // 指针位置（CSS 像素）→ 逻辑坐标。
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }
  let pressing = false
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    pressing = true
    const p = toLogical(event)
    popAtPoint(state, p.x, p.y)
    reportScore()
    loop.markDirty()
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (!pressing) return
    const p = toLogical(event)
    popAtPoint(state, p.x, p.y)
    reportScore()
    loop.markDirty()
  }
  const onPointerUp = (): void => {
    pressing = false
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

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepBubbleWrap(state, paused ? 0 : f.dt * 1000)
    reportScore()
    if (f.render) renderBubbleWrap(ctx, state, paused)
  }
  const loop = createFrameLoop(frame)
  let paused = false

  const reset = (): void => {
    state = createBubbleWrap()
    lastScore = -1
    pressing = false
    paused = false
    loop.markDirty()
    renderBubbleWrap(ctx, state, false)
  }

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderBubbleWrap(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderBubbleWrap(ctx, state, false)

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
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const bubblewrapGame: MiniGameDefinition = {
  id: 'bubblewrap',
  title: '泡泡纸 Bubble Wrap',
  icon: '✨',
  description: '无限解压：捏爆一板又一板泡泡纸，连捏 combo 计数。',
  controls: ['点击 / 按住拖动扫过：捏爆泡泡（连捏加成）', '一板全爆自动换新板，配色随板号轮换 · 零失败无时限', 'R：重开 · P：暂停'],
  create: createBubbleWrapGame,
}
