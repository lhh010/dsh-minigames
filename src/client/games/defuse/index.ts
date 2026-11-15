/**
 * 拆弹专家游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击线缆
 * 剪断（命中测试复用渲染层几何），R 重开、P 暂停（计时冻结），dirty
 * 帧循环：模拟每帧推进，画布只在状态变化 / 秒跳 / 红闪相位 / 粒子
 * 活动时重绘，分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createDefuse, cutWire, stepDefuse, W, H, type DefuseState } from './logic.ts'
import { defuseParticlesActive, renderDefuse, wireHitTest } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createDefuseGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: defuse needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: DefuseState = createDefuse(seed, round)
  let running = false
  let lastScore = -1
  /** 上次渲染画面签名（秒 + 红闪相位 + 结束/过渡标志）：变化才 markDirty。 */
  let lastRenderKey = ''

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || state.over || state.defuseMs > 0) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const px = ((event.clientX - rect.left) / rect.width) * W
    const py = ((event.clientY - rect.top) / rect.height) * H
    const index = wireHitTest(state, px, py)
    if (index !== null) {
      cutWire(state, index)
      loop.markDirty()
    }
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepDefuse(state, f.dt * 1000)
    reportScore()
    // dirty 模式：秒跳 / 末 10s 红闪相位 / 事件 / 粒子活动时强制重绘。
    const renderKey = String(Math.ceil(state.timeLeft / 1000)) + ':' + String(Math.floor(state.timeLeft / 250) % 2)
      + ':' + String(state.over) + ':' + String(state.defuseMs > 0)
    if (renderKey !== lastRenderKey || state.events.length > 0 || defuseParticlesActive()) {
      lastRenderKey = renderKey
      loop.markDirty()
    }
    if (f.render) renderDefuse(ctx, state, false)
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const reset = (): void => {
    round += 1
    state = createDefuse(seed, round)
    lastScore = -1
    lastRenderKey = ''
    loop.markDirty()
    renderDefuse(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderDefuse(ctx, state, true)
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
  renderDefuse(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const defuseGame: MiniGameDefinition = {
  id: 'defuse',
  title: '拆弹专家 Defuse',
  icon: '✂️',
  description: '读规则剪对线——倒计时归零之前，逻辑就是你的命。',
  controls: [
    '玩法：读左侧规则卡，对照面板属性（序列号 / 标记 / 电池 / 线数），点击线缆剪断所有「必须剪」的线',
    '剪到「不可剪」的线立即爆炸 · 剪完全部应剪线即拆除 · 计时归零爆炸 · 5 颗炸弹递进（线更多、规则更多、时限更短）',
    '点击线缆：剪断 · R：重开 · P：暂停（计时冻结）',
  ],
  create: createDefuseGame,
}
