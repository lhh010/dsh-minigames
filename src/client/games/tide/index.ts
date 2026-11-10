/**
 * 潮汐赶海游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 /
 * WASD 网格移动（keydown 触发，不监听 repeat），R 重开、P 暂停，
 * continuous 帧循环推进潮汐模拟与渲染，分数经 onScore 上报（最高分由
 * 面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createTide, stepTide, moveTide, W, H, type TideState } from './logic.ts'
import { renderTide } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createTideGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: tide needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let run = 0
  let state: TideState = createTide(seed, run)
  let running = false
  let lastScore = -1

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        if (!event.repeat) moveTide(state, 0, -1)
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        if (!event.repeat) moveTide(state, 0, 1)
        break
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        if (!event.repeat) moveTide(state, -1, 0)
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        if (!event.repeat) moveTide(state, 1, 0)
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
    stepTide(state, f.dt * 1000)
    reportScore()
    if (f.render) renderTide(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    run += 1
    state = createTide(seed, run)
    lastScore = -1
    loop.markDirty()
    renderTide(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderTide(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderTide(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const tideGame: MiniGameDefinition = {
  id: 'tide',
  title: '潮汐赶海 Tide',
  icon: '🌊',
  description: '退潮拾贝正欢，涨潮不等人——读懂潮汐表，在浪来之前全身而退。',
  controls: ['方向键 / WASD：在滩涂上移动，踩到物品自动拾取', '越深（×4 带）越贵：贝壳 1 · 海星 3 · 珍珠 10，价值按深度带翻倍', '躲开水线：被淹扣 1 命 · 3 命 5 轮 · R：重开 · P：暂停'],
  create: createTideGame,
}
