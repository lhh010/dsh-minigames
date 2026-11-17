/**
 * 炮台对决游戏定义：把纯逻辑接成 {@link MiniGameInstance}——在画布上拖拽
 * 定炮口仰角（0-90 度），点击/拖拽底部力度条定力度，空格发射；
 * ↑↓ 微调角度、←→ 微调力度，R 重开、P 暂停。continuous 帧循环
 * 推进弹道与粒子，比赛得分（胜局 ×100 + 夺冠加成）经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createArtillery,
  fireShot,
  stepArtillery,
  W,
  H,
  type ArtilleryState,
} from './logic.ts'
import { renderArtillery, POWER_BAR } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每场种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 由当前状态计算上报分数：每胜一局 100 分，整场夺冠再加 150。 */
function scoreOf(state: ArtilleryState): number {
  return state.pointsPlayer * 100 + (state.phase === 'matchOver' && state.winner === 'player' ? 150 : 0)
}

function createArtilleryGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: artillery needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: ArtilleryState = createArtillery((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  /** 指针事件坐标 → 逻辑坐标。 */
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }

  /** 力度条命中区域（含周围点击容差）。 */
  const inPowerBar = (x: number, y: number): boolean =>
    x >= POWER_BAR.x - 10 && x <= POWER_BAR.x + POWER_BAR.w + 10 && y >= POWER_BAR.y - 12 && y <= POWER_BAR.y + POWER_BAR.h + 12

  /** 拖拽状态：'aim' 拖炮口 / 'power' 拖力度条。 */
  let dragging: 'none' | 'aim' | 'power' = 'none'
  const applyAngle = (x: number, y: number): void => {
    const px = state.player.x
    const py = state.player.y - 14
    const dx = Math.max(6, x - px)
    const dy = py - y
    let a = (Math.atan2(Math.max(0, dy), dx) * 180) / Math.PI
    state.player.angle = Math.max(0, Math.min(90, Math.round(a)))
  }
  const applyPower = (x: number): void => {
    const k = (x - POWER_BAR.x) / POWER_BAR.w
    state.power = Math.max(1, Math.min(100, Math.round(k * 100)))
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase !== 'aim' || state.turn !== 'player') return
    const p = toLogical(event)
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    if (inPowerBar(p.x, p.y)) {
      dragging = 'power'
      applyPower(p.x)
    } else {
      dragging = 'aim'
      applyAngle(p.x, p.y)
    }
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (dragging === 'none') return
    const p = toLogical(event)
    if (dragging === 'power') applyPower(p.x)
    else applyAngle(p.x, p.y)
  }
  const onPointerUp = (): void => {
    dragging = 'none'
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const aiming = state.phase === 'aim' && state.turn === 'player'
    switch (event.code) {
      case 'ArrowUp':
        if (!aiming) return
        event.preventDefault()
        state.player.angle = Math.min(90, state.player.angle + 1)
        break
      case 'ArrowDown':
        if (!aiming) return
        event.preventDefault()
        state.player.angle = Math.max(0, state.player.angle - 1)
        break
      case 'ArrowRight':
        if (!aiming) return
        event.preventDefault()
        state.power = Math.min(100, state.power + 1)
        break
      case 'ArrowLeft':
        if (!aiming) return
        event.preventDefault()
        state.power = Math.max(1, state.power - 1)
        break
      case 'Space':
        if (!aiming) return
        event.preventDefault()
        fireShot(state, state.player.angle, state.power)
        break
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
    const s = scoreOf(state)
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepArtillery(state, f.dt * 1000)
    reportScore()
    if (f.render) renderArtillery(ctx, state, false, f.dt * 1000)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createArtillery((seed + round) >>> 0)
    lastScore = -1
    dragging = 'none'
    loop.markDirty()
    renderArtillery(ctx, state, false, 16)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderArtillery(ctx, state, true, 0)
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
  renderArtillery(ctx, state, false, 16)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const artilleryGame: MiniGameDefinition = {
  id: 'artillery',
  title: '炮台对决 Artillery',
  icon: '🧨',
  description: '调整角度与力度，算好风——一发入魂还是差之毫厘，都在抛物线里。',
  controls: ['拖拽炮口定角度 0-90°，点击/拖拽底部力度条定力度', '空格发射 · ↑↓ 微调角度 · ←→ 微调力度', '命中炸坑会改变地形 · 5 局记分 · R：重开 · P：暂停'],
  create: createArtilleryGame,
}
