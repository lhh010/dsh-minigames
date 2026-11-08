/**
 * 电梯调度游戏定义：把纯逻辑与渲染接成 {@link MiniGameInstance}（continuous
 * 帧循环、↑/↓ 选目标层、到站自动开门上下客、P 暂停、R 重开）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createElevatorState, setTarget, stepElevator, currentFloor, FLOORS, type ElevatorState } from './logic.ts'
import { renderElevator, VIEW_W, VIEW_H, carCenter } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { createParticles, THEME } from '../theme.ts'

/** 重开需要与结束按键错开一点，避免误触。 */
const RESTART_DELAY = 400

function createElevatorGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (fit === null) throw new Error('dsh-minigames: elevator needs a 2d canvas context')
  const ctx = fit.ctx

  const particles = createParticles()
  let state: ElevatorState = createElevatorState()
  let overSince = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.delivered === lastScore) return
    lastScore = state.delivered
    options?.onScore?.(state.delivered)
  }

  const moveTarget = (delta: number): void => {
    if (state.over) return
    const base = state.target ?? currentFloor(state)
    setTarget(state, base + delta)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      moveTarget(1)
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault()
      moveTarget(-1)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      if (!state.over || performance.now() - overSince > RESTART_DELAY) reset()
    }
  }
  const onClick = (): void => {
    if (state.over && performance.now() - overSince > RESTART_DELAY) reset()
  }

  const loop = createFrameLoop((f) => {
    const beforeInside = state.inside.length
    stepElevator(state, f.dt)
    // 送达：轿厢人数减少即迸发粒子（渲染层用固定 dt 推进粒子池）。
    if (state.inside.length < beforeInside) {
      const c = carCenter(state)
      particles.burst(c.x, c.y, THEME.good, 8, 120)
    }
    if (state.over && overSince === 0) overSince = performance.now()
    reportScore()
    if (f.render) renderElevator(ctx, state, particles, !loop.running && !state.over)
  })

  const reset = (): void => {
    state = createElevatorState()
    overSince = 0
    lastScore = -1
    reportScore()
    loop.markDirty()
    renderElevator(ctx, state, particles, false)
  }

  const togglePause = (): void => {
    if (state.over) return
    if (loop.running) pause()
    else resume()
  }

  const pause = (): void => {
    loop.pause()
    renderElevator(ctx, state, particles, true)
  }
  const resume = (): void => {
    loop.resume()
    loop.markDirty()
  }

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('click', onClick)
  focusGameHost(host)
  reportScore()
  loop.start()
  renderElevator(ctx, state, particles, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('click', onClick)
    },
  }
}

export const elevatorGame: MiniGameDefinition = {
  id: 'elevator',
  title: '电梯调度 Elevator',
  icon: '🏢',
  description: '接满整栋楼的乘客——停层决策与换乘效率的调度考验。',
  controls: ['\u2191 / \u2193（W/S）：选择目标层', '到站自动开门上下客（同方向，容量 8）', 'P：暂停 · R：重开'],
  create: createElevatorGame,
}
