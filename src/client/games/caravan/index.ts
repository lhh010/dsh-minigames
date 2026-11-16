/**
 * 丝路商队游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击相邻
 * 城市移动、点击/键盘买卖、数字键选商品、空格结束今天，R 重开、
 * P 暂停；dirty 帧循环按需重绘，驼队行进与事件卡翻开的短暂动画期间
 * 逐帧推进，分数（资产额）经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  buy, createCaravan, endDay, move, netWorth, sell, LEVELS, W, H,
  type CaravanState,
} from './logic.ts'
import { renderCaravan, type CaravanAnim, type CaravanHit } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换局号但同局可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 驼队一段行程的动画时长（秒）。 */
const MOVE_S = 0.55
/** 事件卡翻开动画时长（秒）。 */
const CARD_S = 1.2

function createCaravanGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: caravan needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let run = 0
  let level = 0
  let state: CaravanState = createCaravan(seed, level)
  let running = false
  let lastScore = -1
  let anim: CaravanAnim | null = null
  const hits: CaravanHit[] = []

  const render = (paused: boolean): void => {
    renderCaravan(ctx, state, paused, anim, hits)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const qty = event.shiftKey ? 5 : 1
    if (event.code >= 'Digit1' && event.code <= 'Digit5' && !event.repeat) {
      event.preventDefault()
      state.selectedGood = Number(event.code.slice(5)) - 1
      loop.markDirty()
      render(false)
      return
    }
    switch (event.code) {
      case 'KeyB':
        event.preventDefault()
        if (!event.repeat) buy(state, state.selectedGood, qty)
        break
      case 'KeyS':
        event.preventDefault()
        if (!event.repeat) sell(state, state.selectedGood, qty)
        break
      case 'Space':
        event.preventDefault()
        if (!event.repeat && state.phase === 'playing') {
          endDay(state)
          anim = { fromIdx: state.cityIdx, toIdx: state.cityIdx, t: 1, cardT: 0 }
        }
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        return
      case 'KeyP':
        event.preventDefault()
        togglePause()
        return
      default:
        return
    }
    loop.markDirty()
    render(false)
  }

  /** 点击 → 逻辑坐标：按 canvas 的 CSS 尺寸等比换算。 */
  const toLogical = (ev: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    const k = rect.width > 0 ? W / rect.width : 1
    return { x: (ev.clientX - rect.left) * k, y: (ev.clientY - rect.top) * k }
  }

  const onPointerDown = (ev: PointerEvent): void => {
    if (!running || state.phase !== 'playing') return
    const p = toLogical(ev)
    for (const h of hits) {
      if (p.x < h.x || p.y < h.y || p.x >= h.x + h.w || p.y >= h.y + h.h) continue
      if (h.kind === 'city' && h.payload !== state.cityIdx) {
        const from = state.cityIdx
        if (move(state, h.payload)) {
          anim = { fromIdx: from, toIdx: h.payload, t: 0, cardT: 1 }
        }
      } else if (h.kind === 'buy') {
        buy(state, h.payload, ev.shiftKey ? 5 : 1)
      } else if (h.kind === 'sell') {
        sell(state, h.payload, ev.shiftKey ? 5 : 1)
      }
      break
    }
    loop.markDirty()
    render(false)
  }

  const reportScore = (): void => {
    const score = netWorth(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 动画推进；返回是否仍在播放（需要继续逐帧）。 */
  const tickAnim = (dt: number): boolean => {
    if (anim === null) return false
    let live = false
    if (anim.t < 1) {
      anim.t = Math.min(1, anim.t + dt / MOVE_S)
      live = true
    }
    if (anim.cardT < 1) {
      anim.cardT = Math.min(1, anim.cardT + dt / CARD_S)
      live = true
    }
    if (!live) anim = null
    return live
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const animating = tickAnim(f.dt)
    reportScore()
    if (animating) loop.markDirty()
    if (f.render) render(false)
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const reset = (): void => {
    run += 1
    if (state.phase === 'won') level = Math.min(level + 1, LEVELS.length - 1)
    state = createCaravan((seed + run * 101) | 0, level)
    lastScore = -1
    anim = null
    loop.markDirty()
    render(false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    render(true)
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
  render(false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const caravanGame: MiniGameDefinition = {
  id: 'caravan',
  title: '丝路商队 Caravan',
  icon: '🐫',
  description: '驼铃声里买低卖高——路线、仓位与行情的商队艺术。',
  controls: [
    '点击相邻城市启程（耗移动力与水，绿洲补水）；到访后行情才精确',
    '数字键 1-5 选商品 · B 买入 / S 卖出 · 加按 Shift 一次 5 件（也可点按钮）',
    '空格：结束今天（补给 + 事件卡）· 限时达标过关 · R：重开 · P：暂停',
  ],
  create: createCaravanGame,
}
