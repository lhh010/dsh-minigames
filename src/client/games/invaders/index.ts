/**
 * 小蜜蜂游戏定义：把纯逻辑接成 {@link MiniGameInstance}——键盘 ←→/AD 移动
 * 炮台、空格/J 开火（按住连发，冷却由逻辑层节流），continuous 帧循环推进
 * 模拟与渲染，R 重开、P 暂停，分数经 onScore 上报累计分（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createInvaders, stepInvaders, W, H, type InvadersState } from './logic.ts'
import { renderInvaders } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createInvadersGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: invaders needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: InvadersState = createInvaders(seed, round)
  let running = false
  let lastScore = -1

  // 按住的键集合（仅移动 / 开火键；R/P 在 keydown 即时处理）。
  const held = new Set<string>()
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        held.add('left')
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        held.add('right')
        break
      case 'Space':
      case 'KeyJ':
        event.preventDefault()
        held.add('fire')
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
        held.delete('left')
        break
      case 'ArrowRight':
      case 'KeyD':
        held.delete('right')
        break
      case 'Space':
      case 'KeyJ':
        held.delete('fire')
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
    stepInvaders(state, f.dt * 1000, {
      left: held.has('left'),
      right: held.has('right'),
      fire: held.has('fire'),
    })
    reportScore()
    if (f.render) renderInvaders(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createInvaders(seed, round)
    lastScore = -1
    loop.markDirty()
    renderInvaders(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderInvaders(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderInvaders(ctx, state, false)

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
    },
  }
}

export const invadersGame: MiniGameDefinition = {
  id: 'invaders',
  title: '小蜜蜂 Space Invaders',
  icon: '👾',
  description: '经典波次射击：左右移动 + 开火，消灭整波外星人，别被子弹击中。',
  controls: ['←→ / AD：移动炮台 · 空格 / J：开火（按住连发）', '掩体会被双方子弹打蚀 · 清空整波进入下一波（更快更低更凶）', '3 条命 · R：重开 · P：暂停'],
  create: createInvadersGame,
}
