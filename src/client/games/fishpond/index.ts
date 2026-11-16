/**
 * 鱼塘物语游戏定义：把纯鱼塘逻辑接成 MiniGameInstance——顶部标签在
 * 鱼塘/钓点/市场三区域间切换；鱼塘视图点击塘格语境化喂食/出售、点击
 * 「结束今天」翻日；钓点视图点击驱动抛竿 → 锁力度 → 提竿双段判定；
 * 市场视图点击商店卡买鱼苗/鱼粮/扩塘。R 重开本关、P 暂停、N 过关后
 * 进下一关。dirty 帧循环：进行期每帧标记重绘（鱼群巡游、波纹、力度条
 * 与浮漂动画持续变化），暂停/通关静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS, acknowledgeResult, beginCast, buyExpansion, buyFood, buyFry, createFishpondState,
  lockPower, nextDay, nextLevel, pondClick, strike, tickPower, tickWait,
  type FishpondState,
} from './logic.ts'
import {
  LOGICAL_W, LOGICAL_H, NEXT_DAY_RECT, navAt, pondSlotAt, renderFishpond, shopAt, type View,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createFishpondGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: fishpond needs a 2d canvas context')
  const ctx = fit.ctx

  let state: FishpondState = createFishpondState((Date.now() & 0xffffffff) >>> 0, 0)
  let view: View = 'pond'
  let running = true
  let lastScore = -1

  /** 分数 = 金币：只在变化时上报。 */
  const reportScore = (): void => {
    if (state.coins === lastScore) return
    lastScore = state.coins
    options?.onScore?.(state.coins)
  }

  /** 重开指定关卡（换新种子）。 */
  const restart = (levelIndex: number): void => {
    state = createFishpondState((Date.now() & 0xffffffff) >>> 0, levelIndex)
    view = 'pond'
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
      // 力度条扫描与等咬钩计时按 dt 推进（调度器已钳制 dt）
      tickPower(state, f.dt)
      tickWait(state, f.dt)
      // 鱼群巡游、水面波纹、力度条与浮漂动画逐帧变化
      loop.markDirty()
    }
    if (f.render) renderFishpond(ctx, state, view, !running)
  }, { mode: 'dirty' })

  /** 钓点视图点击：状态机推进（抛竿/锁力度/提竿/确认入塘）。 */
  const fishingClick = (): void => {
    const f = state.fishing
    if (f.status === 'idle') beginCast(state)
    else if (f.status === 'power') lockPower(state)
    else if (f.status === 'wait') strike(state)
    else acknowledgeResult(state)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    // 标签切换优先于一切区域交互
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const nav = navAt(x, y)
    if (nav !== null) {
      view = nav
      loop.markDirty()
      return
    }
    if (state.phase !== 'playing') return
    // 「结束今天」按钮在所有视图都可点（钓点/市场常驻按钮）。
    const inNextDay = x >= NEXT_DAY_RECT.x && x <= NEXT_DAY_RECT.x + NEXT_DAY_RECT.w
      && y >= NEXT_DAY_RECT.y && y <= NEXT_DAY_RECT.y + NEXT_DAY_RECT.h
    if (inNextDay) {
      nextDay(state)
    } else if (view === 'pond') {
      const slot = pondSlotAt(x, y, state)
      if (slot !== null) pondClick(state, slot)
    } else if (view === 'fish') {
      fishingClick()
    } else {
      const item = shopAt(x, y)
      if (item === null) return
      if (item.kind === 'fry') buyFry(state, item.species)
      else if (item.kind === 'food') buyFood(state)
      else buyExpansion(state)
    }
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
    } else if (event.code === 'Space') {
      event.preventDefault()
      // 空格：任何视图就地结束今天（体力回复入口常驻）。
      if (state.phase === 'playing') nextDay(state)
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (state.phase === 'won' && state.levelIndex < LEVELS.length - 1) {
        nextLevel(state)
        view = 'pond'
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

export const fishpondGame: MiniGameDefinition = {
  id: 'fishpond',
  title: '鱼塘物语 Fishpond',
  icon: '🐟',
  description: '钓上来，养大了，等个好价钱——鱼苗的颜色藏着下一代的秘密。',
  controls: [
    '点击标签：鱼塘 / 钓点 / 市场切换',
    '鱼塘：点击幼鱼喂食、点击成鱼两次出售、结束今天翻日',
    '钓点：点击抛竿 → 再点锁力度 → 浮漂下沉瞬间点击提竿',
    '市场：买鱼苗 / 鱼粮 / 扩建鱼塘',
    'N：过关后下一关',
    'R：重开',
    'P：暂停',
  ],
  create: createFishpondGame,
}
