/**
 * 悠闲钓鱼游戏定义：把纯逻辑接成 {@link MiniGameInstance}——按住
 * （鼠标 / 触摸 / 空格）收线，咬钩窗口内按住刺鱼，搏斗中收放交替；
 * continuous 帧循环推进模拟与渲染，R 重开、P 暂停，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createFishing, stepFishing, W, H, type FishingState } from './logic.ts'
import { renderFishing } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createFishingGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: fishing needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: FishingState = createFishing(seed, round)
  let running = false
  let lastScore = -1
  let holding = false

  const setHold = (down: boolean): void => {
    if (state.phase === 'over' && down) return
    holding = down
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    setHold(true)
  }
  const onPointerUp = (): void => {
    setHold(false)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        setHold(true)
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
    if (event.code === 'Space') setHold(false)
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    // 结束阶段也推进（飘字老化），但 holding 不再生效。
    const effHolding = state.phase === 'over' ? false : holding
    stepFishing(state, f.dt * 1000, effHolding)
    reportScore()
    if (f.render) renderFishing(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createFishing(seed, round)
    lastScore = -1
    holding = false
    loop.markDirty()
    renderFishing(ctx, state, false)
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
    renderFishing(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderFishing(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const fishingGame: MiniGameDefinition = {
  id: 'fishing',
  title: '悠闲钓鱼 Fishing',
  icon: '🎣',
  description: '按住收线与鱼搏斗：拉力太猛线断、太松跑鱼，鱼越大分越高。',
  controls: ['按住鼠标 / 触摸 / 空格：收线（咬钩时按住刺鱼）', '看右侧张力条：绿→黄→红，红区断线（3 次）· 松开回张力', '一局 120 秒 · R：重开 · P：暂停'],
  create: createFishingGame,
}
