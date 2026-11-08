/**
 * 蹦蹦跳游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染，键盘 ←→/AD 横移，指针按住拖动同样横移，
 * R 重开、P 暂停，高度分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createJumper, stepJumper, heightScore, W, H, type JumperState, type JumperInput } from './logic.ts'
import { renderJumper } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createJumperGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: jumper needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: JumperState = createJumper((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  const input: JumperInput = { left: false, right: false }
  // 指针目标逻辑 x（null = 无指针输入）；按住画布拖动时接管横移。
  let pointerX: number | null = null

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        pointerX = null
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        pointerX = null
        input.right = true
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
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
    }
  }

  /** 指针事件 → 逻辑 x（画布 CSS 尺寸 → 逻辑坐标系）。 */
  const logicalPointerX = (event: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect()
    return rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * W : W / 2
  }
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    pointerX = logicalPointerX(event)
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (pointerX === null) return
    pointerX = logicalPointerX(event)
  }
  const onPointerUp = (): void => {
    pointerX = null
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    // 指针输入：以指针逻辑 x 与小家伙 x 的偏差驱动左右（键盘优先）。
    const effective: JumperInput = { left: input.left, right: input.right }
    if (pointerX !== null && !input.left && !input.right) {
      const delta = pointerX - state.x
      if (delta < -6) effective.left = true
      else if (delta > 6) effective.right = true
    }
    stepJumper(state, f.dt * 1000, effective)
    // 高度即分数，变化才上报。
    const score = heightScore(state)
    if (score !== lastScore) {
      lastScore = score
      options?.onScore?.(score)
    }
    if (f.render) renderJumper(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createJumper((seed + round) >>> 0)
    lastScore = -1
    input.left = input.right = false
    pointerX = null
    loop.markDirty()
    renderJumper(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderJumper(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderJumper(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    },
  }
}

export const jumperGame: MiniGameDefinition = {
  id: 'jumper',
  title: '蹦蹦跳 Jumper',
  icon: '🪂',
  description: '自动弹跳的小家伙不断向上：左右移动踩平台，避开尖刺与破碎板，越高分越高。',
  controls: ['←→ / A D：左右移动（可按住指针拖动）', '蓝板普通 · 青板横移 · 金板踩一次碎 · 红板尖刺勿碰', '1 条命 · R：重开 · P：暂停'],
  create: createJumperGame,
}
