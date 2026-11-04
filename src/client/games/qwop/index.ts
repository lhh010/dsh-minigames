/**
 * 手忙脚乱 QWOP 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * continuous 帧循环推进模拟与渲染；Q/W 驱动左/右大腿、O/P 驱动左/右
 * 小腿，R 重开、P 暂停；距离分（米）经 onScore 上报（最高分由面板管
 * 理），渲染层另显示本次会话最佳。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createQwop, stepQwop, distanceScore, W, H, type QwopState, type QwopInput } from './logic.ts'
import { renderQwop } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createQwopGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: qwop needs a 2d canvas context')
  const ctx = fit.ctx

  let state: QwopState = createQwop()
  let running = false
  let lastScore = -1
  // 本次会话最佳距离（米），仅渲染展示用；面板的 onScore 才是持久最高分。
  let best = 0

  const input: QwopInput = { q: false, w: false, o: false, p: false }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyQ':
        event.preventDefault()
        input.q = true
        break
      case 'KeyW':
        event.preventDefault()
        input.w = true
        break
      case 'KeyO':
        event.preventDefault()
        input.o = true
        break
      case 'KeyP':
        event.preventDefault()
        input.p = true
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'Escape':
        // P 已被右小腿占用，暂停走 Esc。
        event.preventDefault()
        togglePause()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyQ':
        input.q = false
        break
      case 'KeyW':
        input.w = false
        break
      case 'KeyO':
        input.o = false
        break
      case 'KeyP':
        input.p = false
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepQwop(state, f.dt * 1000, input)
    if (state.dist > best) best = state.dist
    // 距离即分数，变化才上报。
    const score = distanceScore(state)
    if (score !== lastScore) {
      lastScore = score
      options?.onScore?.(score)
    }
    if (f.render) renderQwop(ctx, state, input, false, best)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    state = createQwop()
    lastScore = -1
    input.q = input.w = input.o = input.p = false
    loop.markDirty()
    renderQwop(ctx, state, input, false, best)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderQwop(ctx, state, input, true, best)
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
  renderQwop(ctx, state, input, false, best)

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

export const qwopGame: MiniGameDefinition = {
  id: 'qwop',
  title: '手忙脚乱 QWOP',
  icon: '🏃',
  description: 'Q/W 控制大腿、O/P 控制小腿——把跑步健将挪出 50 米，膝盖着地就重来。',
  controls: ['Q / W：左 / 右大腿前摆（迈步接住前扑的躯干）', 'O / P：左 / 右小腿蹬伸（蹬地起跳 + 推进）', '膝盖着地 / 躯干趴地即摔倒 · R：重开 · Esc：暂停'],
  create: createQwopGame,
}
