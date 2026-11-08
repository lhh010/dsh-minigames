/**
 * 帆船远航游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染，键盘 ←→ 掌舵、↑↓ 调帆角，R 重开、P 暂停，
 * 累计分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createSailing, stepSailing, W, H, type SailingState, type SailingInput } from './logic.ts'
import { renderSailing } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createSailingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: sailing needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: SailingState = createSailing((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  const input: SailingInput = { left: false, right: false, sailOut: false, sailIn: false }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
        event.preventDefault()
        input.right = true
        break
      case 'ArrowUp':
        event.preventDefault()
        input.sailOut = true
        break
      case 'ArrowDown':
        event.preventDefault()
        input.sailIn = true
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
        input.left = false
        break
      case 'ArrowRight':
        input.right = false
        break
      case 'ArrowUp':
        input.sailOut = false
        break
      case 'ArrowDown':
        input.sailIn = false
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
    stepSailing(state, f.dt * 1000, input)
    reportScore()
    if (f.render) renderSailing(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createSailing((seed + round) >>> 0)
    lastScore = -1
    input.left = input.right = input.sailOut = input.sailIn = false
    loop.markDirty()
    renderSailing(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderSailing(ctx, state, true)
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
  renderSailing(ctx, state, false)

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

export const sailingGame: MiniGameDefinition = {
  id: 'sailing',
  title: '帆船远航 Sailing',
  icon: '⛵',
  description: '调帆借风驶过浮标赛道——理解风矢量与帆角的物理航行挑战。',
  controls: ['←→：掌舵 · ↑↓：调帆角', '按编号顺序穿过浮标圈，用时越短分越高', '顶风死角无动力 · R：重开 · P：暂停'],
  create: createSailingGame,
}
