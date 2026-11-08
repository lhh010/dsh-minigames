/**
 * 切水果游戏定义：把纯逻辑接成 {@link MiniGameInstance}——指针按住拖动
 * 产生刀光轨迹（pointerdown/move/up，一次按下到抬起为一次挥刀，抬起时
 * 结算同种连击与一刀多切奖励），continuous 帧循环推进模拟与渲染，
 * R 重开、P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { beginSwipe, createFruitSlash, pushTrail, settleSwipe, stepFruitSlash, W, H, type FruitSlashState } from './logic.ts'
import { renderFruitSlash } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createFruitSlashGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: fruitslash needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: FruitSlashState = createFruitSlash(seed, round)
  let running = false
  let lastScore = -1

  // 指针位置（逻辑坐标）→ 轨迹点。
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }
  let slashing = false
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    slashing = true
    beginSwipe(state)
    const p = toLogical(event)
    pushTrail(state, p.x, p.y)
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (!slashing) return
    const p = toLogical(event)
    pushTrail(state, p.x, p.y)
  }
  const onPointerUp = (): void => {
    slashing = false
    // 抬起即结算本刀的同种连击与多切奖励（纯函数，飘字入 state.floats）。
    settleSwipe(state)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
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

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (!state.over) stepFruitSlash(state, f.dt * 1000)
    else stepFruitSlash(state, 0)
    reportScore()
    if (f.render) renderFruitSlash(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createFruitSlash(seed, round)
    lastScore = -1
    slashing = false
    loop.markDirty()
    renderFruitSlash(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderFruitSlash(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderFruitSlash(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const fruitslashGame: MiniGameDefinition = {
  id: 'fruitslash',
  title: '切水果 Fruit Slash',
  icon: '🗡️',
  description: '按住鼠标划出刀光切开抛来的 8 种水果，避开炸弹与炸弹链，同种连击、一刀多切加倍！',
  controls: ['按住拖动：刀光切割（一刀可多切）', '小水果分更高（西瓜+5 ~ 猕猴桃+20）· 同种连击 / 多切上浮', '炸弹或漏接直接扣命（5 命）· R：重开 · P：暂停'],
  create: createFruitSlashGame,
}
