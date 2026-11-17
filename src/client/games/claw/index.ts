/**
 * 抓娃娃机游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击 / 空格
 * 两段锁定（水平 → 前后），爪摆动下落夹取，夹中护送到出口，途中可能
 * 滑落；continuous 帧循环推进模拟与渲染（摆动 + 爪动画常动），R 重开、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createClaw, stepClaw, pressClaw, W, H, type ClawState } from './logic.ts'
import { renderClaw } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createClawGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: claw needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let run = 0
  let state: ClawState = createClaw(seed, run)
  let running = false
  let lastScore = -1

  const press = (): void => {
    if (state.phase === 'over') return
    pressClaw(state)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    press()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        press()
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
    // 结束阶段也推进（粒子与摆动残留），但点击不再生效。
    stepClaw(state, f.dt * 1000)
    reportScore()
    if (f.render) renderClaw(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    run += 1
    state = createClaw(seed, run)
    lastScore = -1
    loop.markDirty()
    renderClaw(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderClaw(ctx, state, true)
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
  renderClaw(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const clawGame: MiniGameDefinition = {
  id: 'claw',
  title: '抓娃娃机 Claw',
  icon: '🧸',
  description: '左右移动，前后微调，一爪下去——稳稳夹起还是遗憾滑落？',
  controls: [
    '点击 / 空格：锁定水平位置，再点锁定前后并下爪',
    '爪会摆动：夹中靠对准娃娃中心，大娃宽容、钥匙扣高分',
    '每轮 5 币 × 3 轮 · R：重开 · P：暂停',
  ],
  create: createClawGame,
}
