/**
 * 电流急急棒 game definition：指针移动电环（不按下也跟随，限速追踪），
 * 沿弯曲金属轨从起点走到终点；触电回检查点扣命，5 关通关。R 重开、
 * P 暂停；通关事件粒子庆祝。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { H, LEVEL_COUNT, W, createSteadyHand, setPointer, stepSteadyHand } from './logic.ts'
import { renderSteadyHand } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createSteadyHandGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: steadyhand needs a 2d canvas context')
  const ctx = initialFit.ctx

  const state = createSteadyHand(1)
  let running = false
  let paused = false
  let lastScore = -1
  const particles = createParticles()

  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * W) / rect.width,
      y: ((event.clientY - rect.top) * H) / rect.height,
    }
  }

  const reportScore = (): void => {
    if (state.score !== lastScore) {
      lastScore = state.score
      options?.onScore?.(state.score)
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    const p = toLogical(event)
    if (!paused) setPointer(state, p.x, p.y)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      const fresh = createSteadyHand(1, state.bestMs)
      Object.assign(state, fresh)
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop(f => {
    if (!paused) {
      stepSteadyHand(state, f.dt * 1000)
      for (const ev of state.events) {
        if (ev.type === 'shock') {
          particles.burst(state.ringX, state.ringY, THEME.bad, 14, 180)
        } else if (ev.type === 'clear') {
          particles.burst(state.ringX, state.ringY, THEME.gold, 20, 200)
          reportScore()
        } else if (ev.type === 'complete') {
          reportScore()
        }
      }
      if (state.flashMs > 0 || state.shakeMs > 0 || particles.size() > 0) loop.markDirty()
    }
    renderSteadyHand(ctx, state, paused)
    particles.tick(ctx, f.dt * 1000)
  })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderSteadyHand(ctx, state, true)
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

  canvas.addEventListener('pointermove', onPointerMove)
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
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      initialFit.dispose()
    },
  }
}

export const steadyhandGame: MiniGameDefinition = {
  id: 'steadyhand',
  title: '电流急急棒 Steady Hand',
  icon: '⚡',
  description: '捏着电环走过弯曲金属轨——碰到就通电报警，手有多稳路有多长。',
  controls: [
    '移动指针带动电环（限速跟随）',
    '触电回检查点 -1 命（共 3 命）',
    'R：重开 · P：暂停 · 共 ' + LEVEL_COUNT + ' 关',
  ],
  create: createSteadyHandGame,
}
