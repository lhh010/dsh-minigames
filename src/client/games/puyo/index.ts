/**
 * 噗呦噗呦游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous 帧循环
 * 推进下落/连锁与渲染；←→ 移动、↑ 旋转（踢墙）、↓ 软降，R 重开（换局号）、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createPuyoState, stepPuyo, PUYO_IDLE, type PuyoInput, type PuyoState } from './logic.ts'
import { renderPuyo, W, H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { createParticles } from '../theme.ts'

/** 每局种子：挂载时取一次，重开换局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createPuyoGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: puyo needs a 2d canvas context')
  const ctx = initialFit.ctx
  host.style.background = 'linear-gradient(180deg, #181822 0%, #10101a 100%)'

  const seed = dailySeed()
  let round = 0
  let state: PuyoState = createPuyoState(seed, round)
  let running = false
  let lastScore = -1
  // 边沿触发输入：keydown 置位，帧内消费后清空。
  let queued: PuyoInput = { ...PUYO_IDLE }
  let softHeld = false
  const particles = createParticles()

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        if (!event.repeat) queued.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        if (!event.repeat) queued.right = true
        break
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault()
        if (!event.repeat) queued.rotate = true
        break
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault()
        softHeld = true
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
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowDown' || event.code === 'KeyS') softHeld = false
  }

  /** 每帧向上报最新总分。 */
  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const input: PuyoInput = { left: queued.left, right: queued.right, rotate: queued.rotate, softDrop: softHeld }
    queued = { ...PUYO_IDLE }
    stepPuyo(state, f.dt * 1000, input)
    state.events.length = 0
    reportScore()
    if (f.render) renderPuyo(ctx, state, false, f.dt * 1000, particles)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createPuyoState(seed, round)
    lastScore = -1
    queued = { ...PUYO_IDLE }
    softHeld = false
    loop.markDirty()
    renderPuyo(ctx, state, false, 0, particles)
    // 结束后按 R：直接回到下落状态。
    if (!running) {
      running = true
      loop.start()
    }
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderPuyo(ctx, state, true, 0, particles)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  // 切走标签页/失焦时自动暂停，避免后台跳帧。
  const onBlur = (): void => {
    if (running) pause()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  running = true
  loop.start()
  renderPuyo(ctx, state, false, 0, particles)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      host.style.background = ''
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const puyoGame: MiniGameDefinition = {
  id: 'puyo',
  title: '噗呦噗呦 Puyo',
  icon: '🫘',
  description: '经典成对下落消除：四连通同色即消、重力压实、连锁倍率平方起飞。',
  controls: [
    '← →：移动 · ↑：旋转（贴墙/贴底自动踢位）',
    '↓：软降加速，触底再按即锁定',
    '四连通同色 ≥4 消除；连锁得分 = 消数 × 10 × chain²',
    '井顶溢出即结束 · R：重开 · P：暂停',
  ],
  create: createPuyoGame,
}
