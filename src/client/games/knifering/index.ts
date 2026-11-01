/**
 * 飞刀转盘游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击画布或
 * 空格从正上方插刀，continuous 帧循环推进转盘模拟与渲染，R 重开、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createKnifeRing, throwKnife, stepKnifeRing, beginNextLevel,
  W, H, type KnifeRingState,
} from './logic.ts'
import { renderKnifeRing } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createKnifeRingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: knifering needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: KnifeRingState = createKnifeRing(seed, round)
  let running = false
  let lastScore = -1

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (!state.over) throwKnife(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        if (!state.over && running) throwKnife(state)
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

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const wasBreak = state.breakMs > 0
    stepKnifeRing(state, f.dt * 1000)
    // 过关停顿归零的一帧装配下一关（确定性参数）。
    if (wasBreak && state.breakMs <= 0 && !state.over && state.knives.length === 0 && state.remaining <= 0) {
      beginNextLevel(state, seed)
    }
    reportScore()
    if (f.render) renderKnifeRing(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createKnifeRing(seed, round)
    lastScore = -1
    loop.markDirty()
    renderKnifeRing(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderKnifeRing(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderKnifeRing(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const kniferingGame: MiniGameDefinition = {
  id: 'knifering',
  title: '飞刀转盘 Knife Ring',
  icon: '🔪',
  description: '往旋转的转盘上插飞刀：刀不能碰到已有的刀，插满一圈过关，转盘越转越快。',
  controls: [
    '点击 / 空格：从正上方插刀（碰刀 -1 命，共 3 命）',
    '每关刀数递增 · 转盘会变速甚至换向 · 每 3 关预置障碍刀',
    'R：重开 · P：暂停',
  ],
  create: createKnifeRingGame,
}
