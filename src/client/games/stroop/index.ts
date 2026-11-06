/**
 * 斯特鲁普游戏定义：把纯逻辑接成 {@link MiniGameInstance}——每帧以 dt
 * 推进限时，1-6 键或点击底部色块作答，答对触发火焰粒子，R 重开、
 * P 暂停（dirty 模式：剩余时间变化时每帧重绘，暂停时零重绘）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  COLOR_KEYS, answer, createStroopState, mulberry32, roundTimeLimit, tick,
  type StroopState,
} from './logic.ts'
import { INK_COLORS, LOGICAL_H, LOGICAL_W, createStroopParticles, renderStroop, swatchAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 作答反馈闪烁时长（毫秒）。 */
const FLASH_MS = 260

function createStroopGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: stroop needs a 2d canvas context')
  const ctx = fit.ctx

  let state: StroopState = createStroopState(mulberry32((Math.random() * 0xffffffff) >>> 0))
  let running = true
  let flash: 'good' | 'bad' | null = null
  let flashOffTimer = 0
  let lastScore = -1
  const particles = createStroopParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const setFlash = (kind: 'good' | 'bad'): void => {
    flash = kind
    clearTimeout(flashOffTimer)
    flashOffTimer = window.setTimeout(() => {
      flash = null
      loop.markDirty()
    }, FLASH_MS)
  }

  const draw = (dtMs: number): void => {
    renderStroop(ctx, state, roundTimeLimit(Math.min(state.round, 19)), particles, flash, !running, dtMs)
  }

  /** 作答入口：按颜色编号判定并给出反馈 / 粒子。 */
  const inputColor = (color: number): void => {
    if (state.phase !== 'prompt') return
    const ink = state.ink
    const result = answer(state, color)
    if (result === 'correct') {
      setFlash('good')
      if (state.combo >= 2) {
        particles.burst(LOGICAL_W / 2, 128, INK_COLORS[ink] ?? '#e0af68', 10 + state.combo * 2, 150)
      } else {
        particles.burst(LOGICAL_W / 2, 128, INK_COLORS[ink] ?? '#e0af68', 6, 120)
      }
    } else if (result === 'wrong') {
      setFlash('bad')
    }
    reportScore()
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const color = swatchAt(x, y)
    if (color !== null) inputColor(color)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(flashOffTimer)
      flash = null
      state = createStroopState(mulberry32((Math.random() * 0xffffffff) >>> 0))
      lastScore = -1
      reportScore()
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else {
      const color = COLOR_KEYS.indexOf(event.code as (typeof COLOR_KEYS)[number])
      if (color !== -1) {
        event.preventDefault()
        if (running) inputColor(color)
      }
    }
  }

  const loop = createFrameLoop((f) => {
    if (!running) return
    if (state.phase === 'prompt') {
      const before = state.phase
      tick(state, f.wallMs)
      if (before !== state.phase) reportScore()
    }
    if (f.render || flash !== null || particles.size() > 0 || state.phase === 'prompt') {
      draw(f.wallMs)
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    clearTimeout(flashOffTimer)
    draw(0)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  reportScore()
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(flashOffTimer)
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const stroopGame: MiniGameDefinition = {
  id: 'stroop',
  title: '斯特鲁普 Stroop',
  icon: '🔀',
  description: '字义与墨色的干扰对决：按墨色不按字义作答——大脑打架的反应挑战。',
  controls: ['1-6 键 / 点击色块：按墨色作答', 'R：重开', 'P：暂停'],
  create: createStroopGame,
}
