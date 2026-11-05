/**
 * 极速反应 game definition：多轮信号反应测试——灯变绿立刻按空格或
 * 点击，反应越快分越高；抢按或超时扣命，3 命 10 轮。R 重开、P 暂停；
 * 命中与通关事件粒子庆祝，onScore 随得分变化上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { W, H, ROUND_COUNT, createReaction, pressReaction, stepReaction } from './logic.ts'
import { renderReaction } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createReactionGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: reaction needs a 2d canvas context')
  const ctx = initialFit.ctx

  const state = createReaction()
  let paused = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score !== lastScore) {
      lastScore = state.score
      options?.onScore?.(state.score)
    }
  }

  const press = (): void => {
    if (paused || state.over) return
    pressReaction(state)
    loop.markDirty()
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    press()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      const fresh = createReaction(undefined, state.bestMs)
      Object.assign(state, fresh)
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      press()
    }
  }

  const loop = createFrameLoop(f => {
    if (!paused) {
      stepReaction(state, f.dt * 1000)
      for (const ev of state.events) {
        if (ev.type === 'hit') {
          particles.burst(W / 2, H / 2 + 10, THEME.good, 20, 220)
          reportScore()
        } else if (ev.type === 'foul' || ev.type === 'miss') {
          particles.burst(W / 2, H / 2 + 10, THEME.bad, 16, 200)
        } else if (ev.type === 'complete') {
          reportScore()
        }
      }
      if (state.phase === 'go' || state.phase === 'feedback' || particles.size() > 0) loop.markDirty()
    }
    renderReaction(ctx, state, paused)
    particles.tick(ctx, f.dt * 1000)
  })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderReaction(ctx, state, true)
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
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      initialFit.dispose()
    },
  }
}

export const reactionGame: MiniGameDefinition = {
  id: 'reaction',
  title: '极速反应 Reaction',
  icon: '⚡',
  description: '测试你的反应速度：看信号立刻按键，越快分越高。',
  controls: [
    '空格 / 点击画布：灯变绿立刻按',
    '抢按或超时 -1 命（共 3 命）· 共 ' + ROUND_COUNT + ' 轮',
    'R：重开 · P：暂停',
  ],
  create: createReactionGame,
}
