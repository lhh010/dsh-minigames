/**
 * 移动篮筐游戏定义：把纯逻辑接成 {@link MiniGameInstance}——在篮球附近
 * 按住向反方向拖拽（弹弓式）松手出手，continuous 帧循环推进模拟与渲染，
 * 篮筐随投数升级运动模式（静止 → 浮沉 → 巡逻 → 复合 8 字），R 重开、
 * P 暂停，累计分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  beginAim,
  createMovingHoop,
  releaseAim,
  stepMovingHoop,
  updateAim,
  W,
  H,
  ORIGIN,
  type MovingHoopState,
} from './logic.ts'
import { renderMovingHoop } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 按下点距篮球多远内视为抓住篮球 px。 */
const GRAB_RADIUS = 56

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createMovingHoopGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: movinghoop needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: MovingHoopState = createMovingHoop((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  // 指针位置（逻辑坐标）。
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }
  let pressed = false
  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase !== 'aim') return
    const p = toLogical(event)
    // 只允许在篮球附近按下开始瞄准。
    if (Math.hypot(p.x - ORIGIN.x, p.y - ORIGIN.y) > GRAB_RADIUS) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    pressed = true
    beginAim(state, p.x, p.y)
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (!pressed) return
    const p = toLogical(event)
    updateAim(state, p.x, p.y)
  }
  const onPointerUp = (): void => {
    if (!pressed) return
    pressed = false
    releaseAim(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
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
    // 结束 / 展示阶段也要推进限时、结算计时、篮筐运动与飘字，dt 照常传入。
    stepMovingHoop(state, f.dt * 1000)
    reportScore()
    if (f.render) renderMovingHoop(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createMovingHoop((seed + round) >>> 0)
    lastScore = -1
    pressed = false
    loop.markDirty()
    renderMovingHoop(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderMovingHoop(ctx, state, true)
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
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderMovingHoop(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const movinghoopGame: MiniGameDefinition = {
  id: 'movinghoop',
  title: '移动篮筐 Moving Hoop',
  icon: '🎯',
  description: '没有防守，但篮筐会动：浮沉、巡逻到画圆弧，预判轨迹提前出手。',
  controls: ['按住篮球拖拽瞄准，松手出手（拖得越远力越大）', '篮筐随投数升级运动，预判轨迹槽提前出手；空心入网得分更高、连击有倍乘', '60 秒或 20 投结束 · R：重开 · P：暂停'],
  create: createMovingHoopGame,
}
