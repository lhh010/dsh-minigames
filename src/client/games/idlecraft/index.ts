/**
 * 小作坊 IdleCraft 游戏定义：把纯经济逻辑接成 MiniGameInstance——空格或
 * 点击大齿轮敲打、1-5 购买对应机器、U 花钱提前解锁下一级（全局 ×2）、
 * R 重开本局、P 暂停（暂停即停表，倒计时与自动产出全部冻结）、结算后 N
 * 进下一局。continuous 帧循环：齿轮旋转、按压动画、数字滚动与飘字逐帧
 * 变化；dt 累加驱动固定 100ms 逻辑 tick（调度器已钳制单帧 dt ≤ 50ms）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS, TICK_MS, buyMachine, clickForge, createIdleCraftState, tickIdleCraft, unlockNextTier,
  type IdleCraftState, type TierIndex,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, createIdleCraftView, hammerHit, pushFloat, renderIdleCraft } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createIdleCraftGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: idlecraft needs a 2d canvas context')
  const ctx = fit.ctx

  let state: IdleCraftState = createIdleCraftState((Date.now() & 0xffffffff) >>> 0, 0)
  const view = createIdleCraftView()
  let running = true
  let lastScore = -1

  const reportScore = (): void => {
    const score = Math.floor(state.totalProduced)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const restart = (levelIndex: number): void => {
    state = createIdleCraftState((Date.now() & 0xffffffff) >>> 0, levelIndex)
    view.shownTotal = 0
    view.floats.length = 0
    view.press = 0
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

  const hammer = (): void => {
    if (!running || state.phase !== 'playing') return
    const gain = clickForge(state)
    if (gain > 0) {
      view.press = 110
      pushFloat(view, '+' + (Math.round(gain * 10) / 10))
      reportScore()
    }
  }

  const loop = createFrameLoop((f) => {
    if (running && state.phase === 'playing') {
      acc += f.dt * 1000
      while (acc >= TICK_MS) {
        acc -= TICK_MS
        tickIdleCraft(state)
        reportScore()
        if (state.phase !== 'playing') {
          pushFloat(view, state.phase === 'won' ? '达标！' : '时间到')
          break
        }
      }
    }
    renderIdleCraft(ctx, state, view, f.dt * 1000, !running)
  }, { mode: 'continuous' })
  let acc = 0

  const onMouseDown = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (state.phase !== 'playing') return
    if (hammerHit(x, y)) {
      hammer()
      return
    }
    // 卡片区点击 = 购买对应机器（与数字键等价，y 反推卡号）
    if (x >= 200 && x <= 704 && y >= 96 && y < 96 + 5 * 62) {
      const tier = Math.floor((y - 96) / 62) as TierIndex
      if (buyMachine(state, tier)) reportScore()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space') {
      event.preventDefault()
      hammer()
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      restart(state.levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      if (running && state.phase === 'playing' && unlockNextTier(state)) {
        pushFloat(view, '升级 ×2！')
        reportScore()
      }
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (state.phase !== 'playing' && state.levelIndex < LEVELS.length - 1) {
        restart(state.levelIndex + 1)
      }
    } else if (/^Digit[1-5]$/.test(event.code)) {
      event.preventDefault()
      if (!running || state.phase !== 'playing') return
      buyMachine(state, (Number(event.code.slice(5)) - 1) as TierIndex)
      reportScore()
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

export const idlecraftGame: MiniGameDefinition = {
  id: 'idlecraft',
  title: '小作坊 IdleCraft',
  icon: '⏳',
  description: '点击、升级、等产出——三分钟内把小作坊滚成自动印钞机。',
  controls: [
    '空格或点击大齿轮敲打产出齿轮；产出受全局倍率与冲刺加成',
    '1-5（或点卡片）买机器，价格按已购台数 1.15^n 递增，第 3 局起 1.2^n',
    'U 花钱提前解锁下一级机器并全局 ×2；总产出达里程碑阈值则免费自动解锁',
    '最后 30 秒冲刺：全部产出 ×1.5（右上角提示）',
    '180 秒结束总产出 ≥ 目标即胜；R 重开、P 暂停（停表）、结算后 N 下一局',
  ],
  create: createIdleCraftGame,
}
