/**
 * 洞穴飞行游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染，按住鼠标/触屏或空格施加推力、松开下坠，
 * R 重开、P 暂停，距离（米）经 onScore 上报（最高分由面板管理，
 * 本会话最佳同时留作结束遮罩展示）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createCopter, stepCopter, W, H, type CopterState } from './logic.ts'
import { renderCopter } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createCopterGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: copter needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: CopterState = createCopter((seed + round) >>> 0)
  let running = false
  let lastScore = -1
  let best = 0
  let holding = false

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        holding = true
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
    if (event.code === 'Space') holding = false
  }
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    holding = true
  }
  const onPointerUp = (): void => {
    holding = false
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    if (state.score > best) best = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepCopter(state, f.dt * 1000, holding)
    reportScore()
    if (f.render) renderCopter(ctx, state, false, best)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createCopter((seed + round) >>> 0)
    lastScore = -1
    holding = false
    loop.markDirty()
    renderCopter(ctx, state, false, best)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    holding = false
    loop.pause()
    renderCopter(ctx, state, true, best)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderCopter(ctx, state, false, best)

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
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    },
  }
}

export const copterGame: MiniGameDefinition = {
  id: 'copter',
  title: '洞穴飞行 Copter',
  icon: '🚁',
  description: '按住上升、松开下坠——驾直升机穿越不断收窄的钟乳石洞穴，撞壁即焚。',
  controls: ['按住鼠标 / 触屏 / 空格：上升', '松开：下坠 · 距离（米）即分数', '洞穴随深入收窄 · R：重开 · P：暂停'],
  create: createCopterGame,
}
