/**
 * 蚁群引路游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击使用
 * 当前工具（放/撤障碍石 或 滴糖水），Z 切换工具，X 直接切到糖水，
 * R 重开整局，P 暂停；continuous 帧循环（蚁群每帧都在动）。分数跨关
 * 累计，变化时经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createAntTrail, stepAntTrail, toggleStone, dropSugar, W, H, type AntTrailState } from './logic.ts'
import { renderAntTrail } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

function createAntTrailGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: anttrail needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: AntTrailState = createAntTrail()
  let running = false
  let lastScore = -1
  let toolMode: 'stone' | 'sugar' = 'stone'

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 点击 → 逻辑坐标 → 应用当前工具。 */
  const applyToolAt = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = ((clientX - rect.left) / rect.width) * W
    const y = ((clientY - rect.top) / rect.height) * H
    if (toolMode === 'stone') toggleStone(state, x, y)
    else dropSugar(state, x, y)
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    applyToolAt(event.clientX, event.clientY)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyZ':
        event.preventDefault()
        toolMode = toolMode === 'stone' ? 'sugar' : 'stone'
        loop.markDirty()
        break
      case 'KeyX':
        event.preventDefault()
        toolMode = 'sugar'
        loop.markDirty()
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

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepAntTrail(state, f.dt * 1000)
    reportScore()
    if (f.render) renderAntTrail(ctx, state, false, toolMode)
  }

  const loop = createFrameLoop(frame)

  const reset = (): void => {
    state = createAntTrail()
    lastScore = -1
    toolMode = 'stone'
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
    renderAntTrail(ctx, state, true, toolMode)
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
  renderAntTrail(ctx, state, false, toolMode)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const anttrailGame: MiniGameDefinition = {
  id: 'anttrail',
  title: '蚁群引路 AntTrail',
  icon: '🐜',
  description: '你不能指挥蚂蚁，只能改变世界——放障碍、滴糖水，让蚁群自己走出通往蚁巢的路。',
  controls: [
    '点击：使用当前工具（放/撤障碍石 或 滴糖水）',
    'Z：切换工具 · X：切到糖水',
    '糖水限时消退，需续滴引路；第 4 关起有瓢虫会吃蚂蚁',
    'R：重开',
    'P：暂停',
  ],
  create: createAntTrailGame,
}
