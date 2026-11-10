/**
 * 汉堡师傅游戏定义：把纯订单逻辑接成 MiniGameInstance——展示期空格可
 * 立即跳过开做、点击配料按序复刻、R 重开一赛、P 暂停（暂停即停 tick，
 * 展示/倒计时随之冻结）。dirty 帧循环：活跃期每帧标记重绘（时间条与
 * 下落动画持续变化），结束/暂停静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createBurgerState, stackIngredient, skipShow, tickBurger,
  type BurgerState,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, ingredientAt, renderBurger } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createBurgerGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: burger needs a 2d canvas context')
  const ctx = fit.ctx

  let state: BurgerState = createBurgerState((Date.now() & 0xffffffff) >>> 0)
  let running = true
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const loop = createFrameLoop((f) => {
    if (running && state.phase !== 'over') {
      // dt 已由调度器钳制（≤50ms）；计时推进每帧都可能改变画面
      tickBurger(state, Math.round(f.dt * 1000))
      loop.markDirty()
    }
    if (f.render) renderBurger(ctx, state, !running)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) {
      running = false
      loop.pause()
    } else {
      running = true
      loop.resume()
    }
    loop.markDirty()
  }

  const restart = (): void => {
    state = createBurgerState((Date.now() & 0xffffffff) >>> 0)
    lastScore = -1
    reportScore()
    if (!running) {
      running = true
      loop.resume()
    }
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.phase !== 'building') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const ingredient = ingredientAt(x, y)
    if (ingredient === null) return
    stackIngredient(state, ingredient)
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (running && state.phase === 'showing') {
        skipShow(state)
        loop.markDirty()
      }
    }
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  reportScore()

  return {
    start: () => {
      if (running) return
      running = true
      loop.resume()
    },
    pause: () => {
      if (!running) return
      running = false
      loop.pause()
    },
    resume: () => {
      if (running) return
      running = true
      loop.resume()
    },
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const burgerGame: MiniGameDefinition = {
  id: 'burger',
  title: '汉堡师傅 Burger',
  icon: '🍔',
  description: '顾客点单一闪而过——凭记忆按顺序层层复刻，出餐越快小费越多。',
  controls: ['点击配料：按序堆层', '空格：跳过展示立即开做', 'R：重开', 'P：暂停'],
  create: createBurgerGame,
}
