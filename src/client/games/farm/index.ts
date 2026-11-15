/**
 * 开心农场游戏定义：把纯农场逻辑接成 MiniGameInstance——点击田块执行
 * 语境化下一动作（翻地/播种/浇水/收获）、点击作物卡按市价买种并选中、
 * Q 循环切换待种作物、N 过关后进下一关、R 重开本关、P 暂停（暂停即停
 * tick）。dirty 帧循环：进行期每帧标记重绘（生长/成熟闪烁与天气横幅动
 * 画持续变化），结束/暂停静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  CROP_ORDER, LEVELS, TICK_MS, actOnTile, buySeed, createFarmState, selectCrop, tickFarm,
  type FarmState,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, cardAt, renderFarm, tileAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createFarmGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: farm needs a 2d canvas context')
  const ctx = fit.ctx

  let state: FarmState = createFarmState((Date.now() & 0xffffffff) >>> 0, 0)
  let running = true
  let lastScore = -1

  const reportScore = (): void => {
    if (state.money === lastScore) return
    lastScore = state.money
    options?.onScore?.(state.money)
  }

  const restart = (levelIndex: number): void => {
    state = createFarmState((Date.now() & 0xffffffff) >>> 0, levelIndex)
    lastScore = -1
    reportScore()
    if (!running) {
      running = true
      loop.resume()
    }
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (state.phase !== 'playing') return
    if (running) {
      running = false
      loop.pause()
    } else {
      running = true
      loop.resume()
    }
    loop.markDirty()
  }

  const loop = createFrameLoop((f) => {
    if (running && state.phase === 'playing') {
      // dt 已由调度器钳制（≤50ms）；累加驱动离散逻辑 tick
      acc += f.dt * 1000
      while (acc >= TICK_MS) {
        acc -= TICK_MS
        tickFarm(state)
        reportScore()
      }
      // 生长/成熟闪烁与天气横幅动画逐帧变化
      loop.markDirty()
    }
    if (f.render) renderFarm(ctx, state, !running)
  }, { mode: 'dirty' })
  let acc = 0

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.phase !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const card = cardAt(x, y)
    if (card !== null) {
      buySeed(state, card)
      reportScore()
      loop.markDirty()
      return
    }
    const tile = tileAt(x, y, state)
    if (tile === null) return
    actOnTile(state, tile)
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart(state.levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyQ') {
      event.preventDefault()
      if (state.phase === 'playing') {
        const next = CROP_ORDER[(CROP_ORDER.indexOf(state.selectedCrop) + 1) % CROP_ORDER.length]!
        selectCrop(state, next)
        loop.markDirty()
      }
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (state.phase === 'won') restart(Math.min(LEVELS.length - 1, state.levelIndex + 1))
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

export const farmGame: MiniGameDefinition = {
  id: 'farm',
  title: '开心农场 Farm',
  icon: '🌾',
  description: '翻地播种浇水收获一条龙——季节轮转与市场波动的经营时间管理。',
  controls: ['点击田块：翻地/播种/浇水/收获（语境化）', '点击作物卡：按市价买种并选中', 'Q：切换待种作物', 'N：过关后下一关', 'R：重开', 'P：暂停'],
  create: createFarmGame,
}
