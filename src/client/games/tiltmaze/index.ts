/**
 * 旋转迷宫 game definition：把纯逻辑接成 {@link MiniGameInstance}——
 * 按住 ←/→（或 A/D）旋转整个盘面，小球受屏幕重力在迷宫中滚动；
 * 连续帧循环推进物理子步，终点孔过关、碰尖刺或超时失败。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  W, H, SPIN_SPEED, SUBSTEP,
  createState, mulberry32, stepSubsteps,
  type TiltMazeState, type Vec,
} from './logic.ts'
import { renderTiltMaze } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 拖尾最大采样点数。 */
const TRAIL_MAX = 18

function createTiltMazeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: tiltmaze needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: TiltMazeState = createState(Date.now() & 0x7fffffff, 1)
  let paused = false
  let lastReported = -1
  const trail: Vec[] = []

  const reportScore = (): void => {
    if (state.score !== lastReported) {
      lastReported = state.score
      options?.onScore?.(state.score)
    }
  }

  const startLevel = (level: number): void => {
    state = createState(state.seed, level)
    trail.length = 0
    lastReported = -1
    reportScore()
    loop.markDirty()
  }

  /** 进入下一关（第 5 关后循环回 1）。 */
  const advance = (): void => {
    const next = state.level >= 5 ? 1 : state.level + 1
    window.setTimeout(() => { if (!destroyed) startLevel(next) }, 1200)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createState(Date.now() & 0x7fffffff, state.level)
      trail.length = 0
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'BracketLeft') {
      event.preventDefault()
      startLevel(Math.max(1, state.level - 1))
    } else if (event.code === 'BracketRight') {
      event.preventDefault()
      startLevel(Math.min(5, state.level + 1))
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'KeyA' || event.code === 'KeyD') {
      if (keySpin() === 0) state.spin = 0
    }
  }

  /** 当前按住的旋转键产生的输入方向。 */
  const keySpin = (): -1 | 0 | 1 => {
    const left = held.has('ArrowLeft') || held.has('KeyA')
    const right = held.has('ArrowRight') || held.has('KeyD')
    if (left && !right) return -1
    if (right && !left) return 1
    return 0
  }
  const held = new Set<string>()

  const onKD = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const code = event.code
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
      event.preventDefault()
      held.add(code)
      state.spin = keySpin()
    } else {
      onKeyDown(event)
    }
  }
  const onKU = (event: KeyboardEvent): void => {
    held.delete(event.code)
    if (keySpin() === 0) state.spin = 0
  }

  // 触屏：按住画布左半 / 右半旋转。
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    focusGameHost(host)
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    state.spin = x < rect.width / 2 ? -1 : 1
    canvas.setPointerCapture(event.pointerId)
  }
  const onPointerUp = (): void => { state.spin = 0 }

  const loop = createFrameLoop(f => {
    if (!paused && state.status === 'playing') {
      const substeps = Math.min(48, Math.max(1, Math.round(f.dt / SUBSTEP)))
      stepSubsteps(state, substeps)
      // 拖尾采样。
      trail.push({ x: state.bx, y: state.by })
      if (trail.length > TRAIL_MAX) trail.shift()
      const outcome: string = state.status
      if (outcome === 'won') {
        reportScore()
        advance()
      } else if (outcome === 'lost') {
        reportScore()
        window.setTimeout(() => { if (!destroyed && state.status === 'lost') startLevel(state.level) }, 1100)
      }
    }
    renderTiltMaze(ctx, state, { paused, nowMs: performance.now(), dtMs: f.dt * 1000, trail })
  })

  const pause = (): void => {
    if (paused) return
    paused = true
    loop.pause()
    renderTiltMaze(ctx, state, { paused: true, nowMs: performance.now(), dtMs: 0, trail })
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

  let destroyed = false
  window.addEventListener('keydown', onKD)
  window.addEventListener('keyup', onKU)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  focusGameHost(host)
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      destroyed = true
      loop.destroy()
      window.removeEventListener('keydown', onKD)
      window.removeEventListener('keyup', onKU)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      initialFit.dispose()
    },
  }
}

export const tiltmazeGame: MiniGameDefinition = {
  id: 'tiltmaze',
  title: '旋转迷宫 Tilt Maze',
  icon: '🎡',
  description: '小球自己会滚——你转动的是整个迷宫：旋转盘子引导小球躲陷阱达终点。',
  controls: [
    '按住 ←/→ 或 A/D：旋转盘面（触屏按住左/右半屏）',
    '小球进终点孔过关 · 碰尖刺或超时失败',
    'R：重开 · P：暂停 · [ / ]：切换关卡',
  ],
  create: createTiltMazeGame,
}
