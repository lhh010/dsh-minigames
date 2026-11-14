/**
 * 套圈达人游戏定义：把纯逻辑接成 {@link MiniGameInstance}——按住（鼠标/
 * 空格）蓄力、松开抛环；dirty 调度下瞄准静态零重绘，飞行/蓄力阶段逐帧
 * markDirty 走 continuous 语义；R 重开、P 暂停，分数变化经 onScore 上报
 * （最高分由面板管理）。粒子系统由本层持有，消费 logic 事件后叠加绘制。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  W, H,
  createRingToss, pressCharge, releaseThrow, stepRingToss,
  type RingTossState,
} from './logic.ts'
import { renderRingToss } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { createParticles } from '../theme.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createRingTossGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: ringtoss needs a 2d canvas context')
  const ctx = initialFit.ctx

  const seed = dailySeed()
  let round = 0
  let state: RingTossState = createRingToss((seed + round) >>> 0)
  const particles = createParticles()
  let running = false
  let lastScore = -1

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      // 暂停时不响应蓄力，避免遮罩下偷抛。
      if (!running || state.phase !== 'aim') return
      event.preventDefault()
      pressCharge(state)
      return
    }
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
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || !running) return
    if (state.phase === 'charge') {
      event.preventDefault()
      releaseThrow(state)
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase !== 'aim') return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    pressCharge(state)
  }
  const onPointerUp = (event: PointerEvent): void => {
    if (state.phase !== 'charge') return
    event.preventDefault()
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    releaseThrow(state)
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  // 粒子消费 logic 事件：套中在柱顶爆金色，擦柱在碰点冒小白点。
  const consumeEvents = (): void => {
    for (const ev of state.events) {
      if (ev.type === 'hit') particles.burst(ev.x, ev.y, ev.value >= 25 ? '#e0af68' : '#7dcfff', 14, 150)
      else if (ev.type === 'clank') particles.burst(ev.x, ev.y, '#e2e2ee', 5, 90)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepRingToss(state, f.dt * 1000)
    consumeEvents()
    reportScore()
    // 蓄力条增长 / 飞行 / 滑落展示都是逐帧动画：标记 dirty 让 dirty 模式
    // 连续重绘；静态瞄准阶段不标记，空闲零重绘。
    if (state.phase === 'charge' || state.phase === 'flying' || state.phase === 'settle') loop.markDirty()
    if (f.render || particles.size() > 0) {
      renderRingToss(ctx, state, false)
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const reset = (): void => {
    round += 1
    state = createRingToss((seed + round) >>> 0)
    lastScore = -1
    loop.markDirty()
    renderRingToss(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderRingToss(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderRingToss(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const ringtossGame: MiniGameDefinition = {
  id: 'ringtoss',
  title: '套圈达人 Ring Toss',
  icon: '🎪',
  description: '抛出圆环套住立柱——抛物线与碰撞的嘉年华绝技。',
  controls: [
    '按住鼠标或空格蓄力，松开抛出圆环（力度决定远近）',
    '近柱 5 分 · 中柱 10 · 金柱 25，连续套中连击倍数加成，第二轮起起风',
    '每轮 5 环共 3 轮 · R：重开 · P：暂停',
  ],
  create: createRingTossGame,
}
