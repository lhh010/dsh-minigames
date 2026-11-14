/**
 * 磁极迷宫游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进确定性物理与渲染；空格 / 点击翻转活动磁铁极性（全场唯一
 * 操作），R 重开、P 暂停，累计分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createMagnet, stepMagnet, flipPolarity, W, H, type MagnetState } from './logic.ts'
import { renderMagnet } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createMagnetGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: magnet needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: MagnetState = createMagnet((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        flipPolarity(state)
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

  // 点击画布同样翻转极性（触屏 / 鼠标唯一操作）。
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    flipPolarity(state)
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepMagnet(state, f.dt * 1000)
    reportScore()
    if (f.render) renderMagnet(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createMagnet((seed + round) >>> 0)
    lastScore = -1
    loop.markDirty()
    renderMagnet(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderMagnet(ctx, state, true)
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
  renderMagnet(ctx, state, false)

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

export const magnetGame: MiniGameDefinition = {
  id: 'magnet',
  title: '磁极迷宫 Magnet',
  icon: '🧲',
  description: '切换磁极吸引或排斥钢球——极性一翻，全局反转。',
  controls: [
    '空格 / 点击：翻转磁极（全场唯一操作）',
    '把钢球引进发光终点槽，避开尖刺（3 命）',
    'R：重开 · P：暂停',
  ],
  create: createMagnetGame,
}
