/**
 * 牧羊犬游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键/WASD
 * 连续移动牧羊犬，R 重开整局，P 暂停；continuous 帧循环（羊群每帧都在
 * 动）。分数跨关累计，变化时经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createSheepdog, stepSheepdog, W, H, type SheepdogState, type SheepdogInput } from './logic.ts'
import { renderSheepdog } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createSheepdogGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: sheepdog needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SheepdogState = createSheepdog()
  let running = false
  let lastScore = -1

  const input: SheepdogInput = { up: false, down: false, left: false, right: false }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        input.right = true
        break
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        input.up = true
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        input.down = true
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
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
      case 'ArrowUp':
      case 'KeyW':
        input.up = false
        break
      case 'ArrowDown':
      case 'KeyS':
        input.down = false
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepSheepdog(state, f.dt * 1000, input)
    reportScore()
    if (f.render) renderSheepdog(ctx, state, false)
  }

  const loop = createFrameLoop(frame)

  const reset = (): void => {
    state = createSheepdog()
    lastScore = -1
    input.up = input.down = input.left = input.right = false
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderSheepdog(ctx, state, true)
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
  renderSheepdog(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const sheepdogGame: MiniGameDefinition = {
  id: 'sheepdog',
  title: '牧羊犬 Sheepdog',
  icon: '🐑',
  description: '汪！把散落的羊群赶回围栏——羊会躲你，会扎堆，也会傻乎乎乱跑。',
  controls: ['方向键 / WASD：移动牧羊犬', '绕到羊群后方驱赶，直冲会驱散羊群', '后两关有狼：靠近可把它们吓跑', 'R：重开', 'P：暂停'],
  create: createSheepdogGame,
}
