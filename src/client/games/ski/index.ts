/**
 * 高山滑雪游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染；←→/AD 横移或指针横向跟随（按键优先），R 重开、
 * P 暂停，累计分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createSki,
  stepSki,
  W,
  H,
  type SkiState,
} from './logic.ts'
import { renderSki } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createSkiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: ski needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: SkiState = createSki((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  // 输入状态：按键按下集合 + 指针目标 x（逻辑坐标）。
  const held = new Set<string>()
  let pointerX: number | null = null
  const toLogicalX = (event: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect()
    return ((event.clientX - rect.left) / rect.width) * W
  }
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    pointerX = toLogicalX(event)
  }
  const onPointerMove = (event: PointerEvent): void => {
    // 按住或悬停都跟随；离开画布由 leave/cancel 清除。
    if (event.buttons > 0 || event.pointerType === 'mouse') pointerX = toLogicalX(event)
  }
  const onPointerUp = (): void => {
    pointerX = null
  }
  const onPointerLeave = (): void => {
    pointerX = null
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        held.add(event.code)
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        held.add(event.code)
        break
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
  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.code)
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const left = held.has('ArrowLeft') || held.has('KeyA')
    const right = held.has('ArrowRight') || held.has('KeyD')
    // 按键优先：任一方向键按下时忽略指针目标。
    const px = left || right ? null : pointerX
    stepSki(state, f.dt * 1000, { left, right, pointerX: px })
    reportScore()
    if (f.render) renderSki(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createSki((seed + round) >>> 0)
    lastScore = -1
    pointerX = null
    held.clear()
    loop.markDirty()
    renderSki(ctx, state, false)
    // 结束后按 R：直接回到滑行状态。
    if (!running) {
      running = true
      loop.start()
    }
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderSki(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderSki(ctx, state, false)

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
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const skiGame: MiniGameDefinition = {
  id: 'ski',
  title: '高山滑雪 Ski',
  icon: '⛷️',
  description: '下坡滑雪躲避树木与岩石，穿过旗门加分，速度越来越快。',
  controls: ['←→ / AD：左右转弯（也可移动指针控制方向）', '穿过旗门 +50 分，撞树或岩石 -1 命（共 3 命）', 'R：重开 · P：暂停'],
  create: createSkiGame,
}
