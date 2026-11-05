/**
 * 「光速穿梭 Lightspeed」游戏定义：把纯逻辑接入面板生命周期——
 * rAF 循环（街机 continuous 模式）、←/→ 转向、P 暂停、R 重开、
 * 过关短暂展示后跃迁下一关，onScore 按分数变化上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createLightspeed, stepLightspeed, advanceLevel,
  type LightspeedState,
} from './logic.ts'
import { renderLightspeed, LS_RENDER_W, LS_RENDER_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 过关后展示跃迁画面的时长（毫秒）。 */
const CLEAR_HOLD_MS = 900

function createLightspeedGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LS_RENDER_W, LS_RENDER_H)
  if (initialFit === null) throw new Error('dsh-minigames: lightspeed needs a 2d canvas context')
  const ctx = initialFit.ctx

  let world: LightspeedState = createLightspeed()
  let running = false
  let lastScore = -1
  let clockMs = 0
  /** ≥0 时为过关展示倒计时；期间物理停走。 */
  let clearHoldMs = 0
  const input = { left: false, right: false }

  const reportScore = (): void => {
    if (world.score === lastScore) return
    lastScore = world.score
    options?.onScore?.(world.score)
  }

  const reset = (): void => {
    world = createLightspeed()
    lastScore = -1
    clearHoldMs = 0
    input.left = input.right = false
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault()
        input.left = true
        break
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault()
        input.right = true
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyR':
        reset()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        input.left = false
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = false
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    clockMs += f.wallMs
    if (clearHoldMs > 0) {
      clearHoldMs -= f.wallMs
      if (clearHoldMs <= 0) {
        clearHoldMs = 0
        advanceLevel(world)
      }
    } else {
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      stepLightspeed(world, f.dt * 1000, steer)
      if (world.result === 'levelClear') {
        reportScore()
        clearHoldMs = CLEAR_HOLD_MS
      }
    }
    reportScore()
    if (f.render) renderLightspeed(ctx, world, clockMs, false)
  }

  const loop = createFrameLoop(frame)

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderLightspeed(ctx, world, clockMs, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderLightspeed(ctx, world, 0, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const lightspeedGame: MiniGameDefinition = {
  id: 'lightspeed',
  title: '光速穿梭 Lightspeed',
  icon: '💫',
  description: '控制光子在多维空间中穿梭——避开引力井，利用引力弹弓加速冲刺。',
  controls: ['←/→ 或 A/D：转向', '借助引力井弹弓加速，速度越快到达分越高', 'P：暂停', 'R：重开'],
  create: createLightspeedGame,
}
