/**
 * 合成大西瓜游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←→ 移动
 * 投放列（指针移动同样生效）、空格/点击投放（400ms 冷却），continuous
 * 帧循环推进确定性物理与渲染，R 重开、P 暂停，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createSuika,
  dropFruit,
  moveDrop,
  stepSuika,
  W,
  H,
  type SuikaState,
} from './logic.ts'
import { renderSuika } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每按一次 ←/→ 投放列移动的 px。 */
const MOVE_STEP = 18

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createSuikaGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: suika needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: SuikaState = createSuika((seed + round) >>> 0)
  let running = false
  let paused = false
  let lastScore = -1

  // 指针横坐标（逻辑坐标）。
  const toLogicalX = (event: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect()
    return ((event.clientX - rect.left) / rect.width) * W
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (state.phase !== 'play' || paused) return
    moveDrop(state, toLogicalX(event))
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase !== 'play' || paused) return
    event.preventDefault()
    moveDrop(state, toLogicalX(event))
    dropFruit(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault()
        if (state.phase === 'play' && !paused) moveDrop(state, state.dropX - MOVE_STEP)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (state.phase === 'play' && !paused) moveDrop(state, state.dropX + MOVE_STEP)
        break
      case 'Space':
        event.preventDefault()
        if (state.phase === 'play' && !paused) dropFruit(state)
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
    if (!running || paused) return
    stepSuika(state, f.dt * 1000)
    reportScore()
    if (f.render) renderSuika(ctx, state, false, f.dt * 1000)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createSuika((seed + round) >>> 0)
    lastScore = -1
    paused = false
    if (running) loop.start()
    loop.markDirty()
    renderSuika(ctx, state, false, 0)
  }

  const togglePause = (): void => {
    if (state.phase !== 'play') return
    paused = !paused
    if (paused) {
      loop.pause()
      renderSuika(ctx, state, true, 0)
    } else {
      loop.resume()
    }
  }
  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderSuika(ctx, state, true, 0)
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    loop.resume()
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderSuika(ctx, state, false, 0)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const suikaGame: MiniGameDefinition = {
  id: 'suika',
  title: '合成大西瓜 Suika',
  icon: '🍉',
  description: '投放水果，同种相碰合成更大的——别堆过警戒线，看看你能合成出大西瓜吗。',
  controls: ['←→ 移动投放列（指针移动同样生效），空格 / 点击投放', '同级水果相碰合成更大的并得分，合成出大西瓜 +500', '堆过黄色警戒线结束 · R：重开 · P：暂停'],
  create: createSuikaGame,
}
