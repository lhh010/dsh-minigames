/**
 * 淘金者游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 方向键 / WASD
 * 逐格移动挖掘，R 整局重开（新种子），P 暂停；dirty 帧循环 + 下落动画 /
 * 倒计时秒变期间逐帧，分数实时上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createGoldmineState, moveGoldmine, stepGoldmine, LOGICAL_W, LOGICAL_H, type Dir, type GoldmineState } from './logic.ts'
import { renderGoldmine } from './render.ts'
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

function createGoldmineGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: goldmine needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: GoldmineState = createGoldmineState(randomSeed())
  let t = 0
  let lastScore = -1
  let lastSecond = -1

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
      if (!state.over && !state.won && loop.running) {
        if (moveGoldmine(state, dir)) loop.markDirty()
      }
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createGoldmineState(randomSeed())
      lastScore = -1
      lastSecond = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    t += f.dt
    stepGoldmine(state, f.dt)
    reportScore()
    // 下落动画期间逐帧；倒计时整秒变化也置脏刷新 HUD。
    if (state.anims.length > 0) loop.markDirty()
    const sec = Math.ceil(state.timeLeft)
    if (sec !== lastSecond) {
      lastSecond = sec
      loop.markDirty()
    }
    if (f.render) renderGoldmine(ctx, state, t, false)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (loop.running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!loop.running) return
    loop.pause()
    renderGoldmine(ctx, state, t, true)
  }
  const resume = (): void => {
    loop.resume()
  }

  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderGoldmine(ctx, state, 0, false)

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

export const goldmineGame: MiniGameDefinition = {
  id: 'goldmine',
  title: '淘金者 Goldmine',
  icon: '⛏',
  description: '深入矿洞收集金块——氧气有限、梯子自己搭、怪石会滚，规划是唯一的生路。',
  controls: ['方向键 / WASD：移动 / 挖土 / 推圆石', '收齐金块后出口开启，抵达出口过关', 'R：重开', 'P：暂停'],
  create: createGoldmineGame,
}
