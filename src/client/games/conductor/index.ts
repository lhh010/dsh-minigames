/**
 * 列车调度游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击道岔
 * 切换 A/B 方向，空格按住加速 ×2，R 重开、P 暂停；continuous 帧循环
 * 推进模拟与渲染，本关完成后自动装载下一关，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createConductor, stepConductor, toggleSwitch, switchHitTest, startNextLevel,
  W, H, type ConductorState,
} from './logic.ts'
import { renderConductor } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createConductorGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: conductor needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let run = 0
  let state: ConductorState = createConductor(seed, run)
  let running = false
  let fast = false
  let lastScore = -1

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        if (!event.repeat) fast = true
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
    if (event.code === 'Space') fast = false
  }
  const onPointerDown = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = ((event.clientX - rect.left) * W) / rect.width
    const y = ((event.clientY - rect.top) * H) / rect.height
    toggleSwitch(state, switchHitTest(state, x, y))
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepConductor(state, f.dt * 1000 * (fast ? 2 : 1))
    if (state.status === 'cleared') startNextLevel(state)
    reportScore()
    if (f.render) renderConductor(ctx, state, false, f.wallMs)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    run += 1
    state = createConductor(seed, run)
    fast = false
    lastScore = -1
    loop.markDirty()
    renderConductor(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderConductor(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderConductor(ctx, state, false)

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
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const conductorGame: MiniGameDefinition = {
  id: 'conductor',
  title: '列车调度 Conductor',
  icon: '🚂',
  description: '铁轨上的列车不会刹车——扳好道岔，让每列火车准点到站，别让它们相撞。',
  controls: ['点击道岔：切换 A / B 方向，把每列火车引向同色站台', '空格：按住加速 ×2 · 错色到站计 1 次失误，3 次失败', '两列火车进同一站台即相撞 · R：重开 · P：暂停'],
  create: createConductorGame,
}
