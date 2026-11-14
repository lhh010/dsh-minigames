/**
 * 地底挖矿游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 方向键/WASD
 * 挖掘移动，R 整局重开（新种子），P 暂停；continuous 帧循环，分数实时上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createDigState, stepDig, type Dir, type DigState } from './logic.ts'
import { renderDig, LOGICAL_W, LOGICAL_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  KeyW: 0,
  KeyD: 1,
  KeyS: 2,
  KeyA: 3,
}

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}

function createDigGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: dig needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: DigState = createDigState(randomSeed())
  let t = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const dir = KEY_DIR[event.code]
    if (dir !== undefined) {
      event.preventDefault()
      if (!state.over && !state.won) state.player.intent = dir
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createDigState(randomSeed())
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    t += f.dt
    stepDig(state, f.dt)
    reportScore()
    if (f.render) renderDig(ctx, state, t, false)
  })

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderDig(ctx, state, t, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderDig(ctx, state, 0, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const digGame: MiniGameDefinition = {
  id: 'dig',
  title: '地底挖矿 Dig',
  icon: '⛏️',
  description: '向下挖穿泥土收集宝石——头顶落石既是杀招也是武器。',
  controls: ['方向键 / WASD：挖掘移动', '收齐宝石后抵达底部出口', 'R：重开', 'P：暂停'],
  create: createDigGame,
}
