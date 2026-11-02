/**
 * 弹弓复仇 game definition：拖拽弹弓发射鸟弹（aim 期间按下拖拽松手），
 * 轰塌堡垒消灭全部小猪过关；空格/回车过关进下一关，R 重试本关，
 * [ ] 切换已解锁关卡。粒子消费 break/pig 事件；弹道虚影记录上一弹
 * 轨迹供瞄准参考。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS, createSlingshot, dragToVelocity, launch, stepAndJudge,
  type SlingshotState,
} from './logic.ts'
import { renderSlingshot } from './render.ts'
import { W, H, SLING, BALL_R } from './logic.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createSlingshotGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: slingshot needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  let level = Math.min(Math.max(readLevel('slingshot'), 1), LEVELS.length)
  let state = createSlingshot(1, level)
  let running = false
  let paused = false
  let lastScore = -1
  let lastLevelCleared = -1
  /** 拖拽瞄准（aim 阶段）。 */
  let aim: { from: { x: number, y: number }, to: { x: number, y: number } } | null = null
  /** 上一弹轨迹。 */
  let trail: { x: number, y: number }[] = []
  const particles = createParticles()

  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * W) / rect.width,
      y: ((event.clientY - rect.top) * H) / rect.height,
    }
  }

  const reportScore = (): void => {
    const total = (level - 1) * 300 + state.stars * 100
    if (total !== lastScore) {
      lastScore = total
      options?.onScore?.(total)
    }
  }

  const startLevel = (lv: number): void => {
    level = Math.min(Math.max(lv, 1), LEVELS.length)
    state = createSlingshot(1, level)
    aim = null
    trail = []
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (paused || state.phase !== 'aim') return
    const p = toLogical(event)
    // 只能在弹弓附近开始拖拽。
    if (Math.hypot(p.x - SLING.x, p.y - SLING.y) > 70) return
    event.preventDefault()
    aim = { from: { x: SLING.x, y: SLING.y }, to: p }
    canvas.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (aim === null) return
    const p = toLogical(event)
    aim.to = p
    loop.markDirty()
  }

  const onPointerUp = (): void => {
    if (aim === null) return
    const v = dragToVelocity(aim.from.x - aim.to.x, aim.from.y - aim.to.y)
    const a = aim
    aim = null
    if (v !== null && !paused && state.phase === 'aim') {
      trail = []
      launch(state, v.vx, v.vy)
      void a
    }
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      const max = Math.min(readLevel('slingshot'), LEVELS.length)
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 1 && next <= Math.max(1, max)) startLevel(next)
    } else if (event.code === 'Space' || event.code === 'Enter') {
      if (state.phase === 'won') {
        event.preventDefault()
        if (level !== lastLevelCleared) {
          lastLevelCleared = level
          saveLevel('slingshot', level + 1)
        }
        if (level < LEVELS.length) startLevel(level + 1)
        else startLevel(level)
        reportScore()
      }
    }
  }

  const loop = createFrameLoop(f => {
    if (!paused) {
      stepAndJudge(state, f.dt * 1000)
      // 记录本弹轨迹。
      if (state.bird !== null && trail.length < 400) trail.push({ x: state.bird.x, y: state.bird.y })
      // 事件 → 粒子。
      for (const ev of state.events) {
        if (ev.type === 'break') {
          particles.burst(ev.x, ev.y, ev.mat === 'ice' ? '#bfe4f5' : ev.mat === 'stone' ? '#8f97a8' : '#b98a4e', 14, 160)
        } else if (ev.type === 'pig') {
          particles.burst(ev.x, ev.y, THEME.good, 16, 180)
        } else if (ev.type === 'land') {
          particles.burst(ev.x, Math.min(ev.y, 380), 'rgba(200,200,210,0.8)', 6, 100)
        }
      }
      state.events.length = 0
      if (state.phase === 'won' && level !== lastLevelCleared) {
        lastLevelCleared = level
        saveLevel('slingshot', level + 1)
        reportScore()
      }
      if (state.bird !== null || particles.size() > 0) loop.markDirty()
    }
    renderSlingshot(ctx, state, aim, trail, paused)
    particles.tick(ctx, f.dt * 1000)
  })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderSlingshot(ctx, state, null, trail, true)
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (paused) resume()
    else pause()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const slingshotGame: MiniGameDefinition = {
  id: 'slingshot',
  title: '弹弓复仇 Slingshot',
  icon: '🐦',
  description: '拉满弹弓轰塌堡垒：木石冰材质各有耐久，把绿猪全部砸下来——剩弹越多星越多。',
  controls: [
    '在弹弓处按下拖拽瞄准，松手发射',
    '空格：过关进下一关 · R：重试本关 · [ ]：切换关卡',
    'P：暂停',
  ],
  create: createSlingshotGame,
}
