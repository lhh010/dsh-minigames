/**
 * 转碟杂技游戏定义：把纯逻辑接成 {@link MiniGameInstance}——←→/AD 按
 * 住移动杂技演员，空格为最近的碟子补转（点击式冷却），R 重开（换局
 * 号）、P 暂停；continuous 帧循环推进逻辑与渲染，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createPlates, stepPlates, W, H, type PlatesState } from './logic.ts'
import { renderPlates } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createPlatesGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: plates needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: PlatesState = createPlates(seed, round)
  let running = false
  let lastScore = -1
  // 按住方向键状态；空格为点击式（keydown 且非重复时置位一帧）。
  let leftHeld = false
  let rightHeld = false
  let spinPressed = false

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        leftHeld = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        rightHeld = true
        break
      case 'Space':
        event.preventDefault()
        if (!event.repeat) spinPressed = true
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
        leftHeld = false
        break
      case 'ArrowRight':
      case 'KeyD':
        rightHeld = false
        break
    }
  }
  const onBlur = (): void => {
    leftHeld = false
    rightHeld = false
    spinPressed = false
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const dtMs = state.over ? 0 : f.dt * 1000
    stepPlates(state, dtMs, { left: leftHeld, right: rightHeld, spin: spinPressed })
    spinPressed = false
    reportScore()
    if (f.render) renderPlates(ctx, state, f.dt * 1000, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createPlates(seed, round)
    lastScore = -1
    leftHeld = false
    rightHeld = false
    spinPressed = false
    loop.markDirty()
    renderPlates(ctx, state, 0, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderPlates(ctx, state, 0, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  running = true
  loop.start()
  renderPlates(ctx, state, 0, false)

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
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const platesGame: MiniGameDefinition = {
  id: 'plates',
  title: '转碟杂技 Plates',
  icon: '🍽️',
  description: '长杆上的碟子越转越慢——手忙脚乱地逐个补转，别让任何一个掉下来。',
  controls: [
    '←→ / AD：左右移动杂技演员',
    '空格：为最近的碟子补转（+0.5，冷却 1 秒）· 转速过低会摇晃预警，归零掉碟扣 1 命（共 3 命）',
    '每 15 秒场上多 1 碟（最多 6）· 得分 = 每秒 10 × 碟数',
    'R：重开 · P：暂停',
  ],
  create: createPlatesGame,
}
