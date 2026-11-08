/**
 * 交叉路口 game definition：把确定性调度逻辑接成 MiniGameInstance ——
 * 空格（或点击画布）请求切换信号灯相位（NS 绿 / EW 绿，黄灯过渡固定
 * 1.5s，最短绿灯 3s）；绿灯方向的车通过路口计分（每辆 +10，外加存活
 * 秒数），红灯方向排队；两车相撞或任一方向排队超过 7 辆即结束。
 * R 重开，P 暂停。分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createTrafficState, requestSwitch, stepTraffic } from './logic.ts'
import { HUD_H, LOGICAL_H, LOGICAL_W, renderTraffic } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 开局 seed（固定，便于成绩公平比较）。 */
const RUN_SEED = 0x1f2e3d4c

function createTrafficGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: traffic needs a 2d canvas context')
  const ctx = fit.ctx

  let state = createTrafficState(RUN_SEED)
  let paused = false
  let reported = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score !== reported) {
      reported = state.score
      options?.onScore?.(state.score)
    }
  }

  const restart = (): void => {
    state = createTrafficState(RUN_SEED)
    reported = -1
    reportScore()
    loop.markDirty()
  }

  const togglePhase = (): void => {
    if (state.over !== null || paused) return
    requestSwitch(state)
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const code = event.code
    if (code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (code === 'KeyP') {
      event.preventDefault()
      if (state.over !== null) return
      paused = !paused
      if (paused) loop.pause()
      else loop.resume()
      loop.markDirty()
      return
    }
    if (code === 'Space') {
      event.preventDefault()
      togglePhase()
    }
  }

  const onClick = ():void => {
    togglePhase()
  }

  const loop = createFrameLoop(frame => {
    if (!paused && state.over === null) {
      const before = state.passed
      stepTraffic(state, frame.dt)
      if (state.over === 'crash' && state.crashAt !== null) {
        particles.burst(state.crashAt.x, HUD_H + state.crashAt.y, THEME.bad, 22, 220)
      }
      if (state.passed !== before || state.over !== null) loop.markDirty()
      reportScore()
    }
    renderTraffic(ctx, state, paused)
    particles.tick(ctx, frame.dt * 1000)
  })

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('click', onClick)
  focusGameHost(host)
  loop.start()

  return {
    start: () => {
      if (!paused) loop.resume()
    },
    pause: () => {
      paused = true
      loop.pause()
      renderTraffic(ctx, state, true)
    },
    resume: () => {
      if (state.over === null) paused = false
      loop.resume()
    },
    destroy: () => {
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('click', onClick)
      fit.dispose()
    },
  }
}

export const trafficGame: MiniGameDefinition = {
  id: 'traffic',
  title: '交叉路口 Traffic',
  icon: '🚦',
  description: '调度红绿灯相位让车流安全通过——拥堵与碰撞的调度艺术。',
  controls: ['空格 / 点击：切换红绿灯相位（黄灯过渡 1.5 秒）', '碰撞或排队超 7 辆即结束', 'R：重开 · P：暂停'],
  create: createTrafficGame,
}
