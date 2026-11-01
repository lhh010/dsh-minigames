/**
 * 接鸡蛋游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←→/AD 按住
 * 步进移动篮子，指针移动 / 按下时篮子向指针目标位插值追赶（键盘按下
 * 即接管）；continuous 帧循环推进模拟与渲染，R 重开（换局号）、P 暂停，
 * 分数经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createEggCatcher, stepEggCatcher, W, H, type EggCatcherState, type EggInput } from './logic.ts'
import { renderEggCatcher } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createEggCatcherGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: eggcatcher needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: EggCatcherState = createEggCatcher(seed, round)
  let running = false
  let lastScore = -1

  // 键盘按住集合与指针目标位：键盘方向优先，指针移动随时接管。
  let leftHeld = false
  let rightHeld = false
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
    pointerX = toLogicalX(event)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        leftHeld = true
        pointerX = null
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        rightHeld = true
        pointerX = null
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
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') leftHeld = false
    else if (event.code === 'ArrowRight' || event.code === 'KeyD') rightHeld = false
  }
  const onBlur = (): void => {
    leftHeld = false
    rightHeld = false
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const input: EggInput = {
      dir: leftHeld === rightHeld ? 0 : rightHeld ? 1 : -1,
      pointerX,
    }
    if (!state.over) stepEggCatcher(state, f.dt * 1000, input)
    else stepEggCatcher(state, 0, input)
    reportScore()
    if (f.render) renderEggCatcher(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createEggCatcher(seed, round)
    lastScore = -1
    leftHeld = false
    rightHeld = false
    pointerX = null
    loop.markDirty()
    renderEggCatcher(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderEggCatcher(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  running = true
  loop.start()
  renderEggCatcher(ctx, state, false)

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
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const eggcatcherGame: MiniGameDefinition = {
  id: 'eggcatcher',
  title: '接鸡蛋 Egg Catcher',
  icon: '🐣',
  description: '移动篮子接住下落的鸡蛋，金黄蛋加分、臭蛋扣命——越来越快。',
  controls: [
    '←→ / AD：移动篮子 · 也可移动指针牵引篮子',
    '普通蛋 +1 · 金黄蛋 +5 · 臭蛋💀碰篮扣 1 命 · 漏蛋扣 1 命（共 5 命）',
    'R：重开 · P：暂停',
  ],
  create: createEggCatcherGame,
}
