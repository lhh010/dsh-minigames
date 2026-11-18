/**
 * 起重机游戏定义：把纯逻辑接成 {@link MiniGameInstance}——空格 / 点击
 * 抓取与抛下（吊钩摆动中，时机决定抓在哪、甩多远），R 重开、P 暂停；
 * continuous 帧循环推进摆动 / 抛落模拟与渲染，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createCrane, stepCrane, pressCrane, W, H, type CraneState } from './logic.ts'
import { renderCrane } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createCraneGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: crane needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let run = 0
  let state: CraneState = createCrane(seed, run)
  let running = false
  let lastScore = -1

  const press = (): void => {
    if (state.phase === 'over') return
    pressCrane(state)
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
    // 结束阶段也推进（粒子与摆动残留），但按键不再生效。
    stepCrane(state, f.dt * 1000)
    reportScore()
    if (f.render) renderCrane(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    run += 1
    state = createCrane(seed, run)
    lastScore = -1
    loop.markDirty()
    renderCrane(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderCrane(ctx, state, true)
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
  renderCrane(ctx, state, false)

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

export const craneGame: MiniGameDefinition = {
  id: 'crane',
  title: '起重机 Crane',
  icon: '🏗',
  description: '吊起集装箱按颜色码放——摇摆的吊臂下，每一落都讲究。',
  controls: [
    '空格 / 点击：抓取吊钩下的顶箱；再按抛下（摆速决定甩多远）',
    '箱要大下小上码到金色目标柱，偏了会倒塔；后两关还要同色相邻',
    '共 5 关递进 · R：重开 · P：暂停',
  ],
  create: createCraneGame,
}
