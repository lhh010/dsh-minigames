/**
 * 配方厨房游戏定义：把纯灶台逻辑接成 MiniGameInstance——点击订单卡换
 * 单、点击工位下单/取料、空格循环换单、R 重开一局、P 暂停（暂停即停
 * tick，倒计时与火候随之冻结）。continuous 帧循环：火苗/游标/倒计时
 * 每帧都在动。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createRecipeState, cycleOrder, pickup, placeStep, selectOrder, tickRecipe,
  type RecipeState,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, orderCardAt, renderRecipe, stationAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createRecipeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: recipe needs a 2d canvas context')
  const ctx = fit.ctx

  let state: RecipeState = createRecipeState((Date.now() & 0xffffffff) >>> 0)
  let running = true
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const loop = createFrameLoop((f) => {
    if (running && state.phase === 'playing') {
      // dt 已由调度器钳制（≤50ms）
      tickRecipe(state, Math.round(f.dt * 1000))
    }
    if (f.render) renderRecipe(ctx, state, !running)
  }, { mode: 'continuous' })

  const togglePause = (): void => {
    if (running) {
      running = false
      loop.pause()
    } else {
      running = true
      loop.resume()
    }
  }

  const restart = (): void => {
    state = createRecipeState((Date.now() & 0xffffffff) >>> 0)
    lastScore = -1
    reportScore()
    if (!running) {
      running = true
      loop.resume()
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.phase !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const card = orderCardAt(x, y)
    if (card !== null) {
      selectOrder(state, card)
      return
    }
    const station = stationAt(x, y)
    if (station === null) return
    const item = state.slots[station]
    if (item !== null && item !== undefined) {
      // 工位上有活：先试着取料，取不动（还在倒计时）时不做事
      pickup(state, station)
    } else {
      placeStep(state, state.selectedOrderIdx, station)
    }
    reportScore()
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
      if (running && state.phase === 'playing') cycleOrder(state)
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

export const recipeGame: MiniGameDefinition = {
  id: 'recipe',
  title: '配方厨房 Recipe',
  icon: '\u{1F468}\u200D\u{1F373}',
  description: '三分钟内复刻五道菜——记忆配方、掌控火候、安排出锅顺序，手忙脚乱才是厨房。',
  controls: ['点击订单卡：选中 · 空格：换单', '点击工位：下单 / 取料（绿区完美）', 'R：重开', 'P：暂停'],
  create: createRecipeGame,
}
