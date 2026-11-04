/**
 * 重力翻转游戏定义：把纯逻辑接成 {@link MiniGameInstance}——空格 / 点击
 * 翻转重力，R 重开、P 暂停，continuous 帧循环推进固定子步模拟与渲染，
 * 距离分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createGravFlip, stepGravFlip, W, H, type GravFlipState } from './logic.ts'
import { renderGravFlip } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createGravFlipGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: gravflip needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: GravFlipState = createGravFlip((seed + round) >>> 0)
  let running = false
  let lastScore = -1
  // 帧内待消费的一次翻转（按下即置位，帧末清零）。
  let flipQueued = false

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        flipQueued = true
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
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    flipQueued = true
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepGravFlip(state, f.dt * 1000, flipQueued)
    flipQueued = false
    reportScore()
    if (f.render || state.phase === 'dead') renderGravFlip(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createGravFlip((seed + round) >>> 0)
    lastScore = -1
    flipQueued = false
    loop.markDirty()
    renderGravFlip(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderGravFlip(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('pointerdown', onPointerDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderGravFlip(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const gravflipGame: MiniGameDefinition = {
  id: 'gravflip',
  title: '重力翻转 Gravity Flip',
  icon: '🔄',
  description: '一键翻转重力：在地板与天花板之间穿梭，躲开尖刺与激光——手速与节奏的考验。',
  controls: [
    '空格 / 点击：翻转重力（贴地板 ↔ 贴天花板）',
    '躲开尖刺、屏障窄窗与周期激光，越跑越快',
    '距离即分数 · R：重开 · P：暂停',
  ],
  create: createGravFlipGame,
}
