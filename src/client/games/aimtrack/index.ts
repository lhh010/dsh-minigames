/**
 * FPS aim-tracking game definition: wires the pure tracking logic into a
 * {@link MiniGameInstance}. The mouse is captured via the Pointer Lock API —
 * the crosshair stays fixed at the screen centre and raw mouse movement
 * rotates the view; the left button shoots with recoil and shake. Clicking
 * the canvas enters the lock; Esc or P exits to a paused overlay.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createFpsTrackState, shoot, tickFpsTrack, turn, LOGICAL_W, LOGICAL_H, type FpsTrackState } from './logic.ts'
import { renderAimTrack } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** Ready = click to capture the mouse; playing = locked and ticking. */
type Phase = 'ready' | 'playing' | 'paused' | 'over'

function createAimTrackGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: aimtrack needs a 2d canvas context')
  const ctx = fit.ctx

  let state: FpsTrackState = createFpsTrackState()
  let phase: Phase = 'ready'
  let t = 0
  let lastScore = -1

  const reportScore = (): void => {
    const score = Math.floor(state.score)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const lockMouse = (): void => {
    try {
      const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined
      result?.catch(() => { /* e.g. Esc-pressed during the request */ })
    } catch {
      // Pointer Lock unavailable (rare): fall back to raw mouse deltas.
    }
  }

  const onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === canvas
    if (locked) {
      // Captured: start or resume the round.
      if (phase !== 'playing') phase = 'playing'
    } else if (phase === 'playing') {
      // Esc or browser release: park on the pause overlay.
      phase = 'paused'
    }
    loop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (phase !== 'playing') return
    // Pointer Lock reports raw deltas; without it, fall back to last-position.
    if (document.pointerLockElement === canvas) {
      turn(state, event.movementX, event.movementY)
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (phase === 'playing' && event.button === 0) {
      shoot(state)
      reportScore()
    }
  }

  const onClick = (): void => {
    // Enter (or re-enter) the mouse lock from the ready / paused / over views.
    if (phase === 'over') {
      state = createFpsTrackState()
      lastScore = -1
    }
    if (phase !== 'playing') lockMouse()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      state = createFpsTrackState()
      lastScore = -1
      if (phase === 'over') phase = 'ready'
      loop.markDirty()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (phase === 'playing') {
        phase = 'paused'
        if (document.pointerLockElement === canvas) document.exitPointerLock()
      } else if (phase === 'paused') {
        lockMouse() // re-capture via the click-free key (allowed in most browsers)
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (phase === 'playing') {
      t += f.dt
      tickFpsTrack(state, f.dt)
      reportScore()
      if (state.over && phase === 'playing') {
        phase = 'over'
        if (document.pointerLockElement === canvas) document.exitPointerLock()
      }
    }
    if (f.render) renderAimTrack(ctx, state, t, phase)
  }

  const loop = createFrameLoop(frame)

  const pause = (): void => {
    if (phase === 'playing') {
      phase = 'paused'
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
    loop.markDirty()
  }
  const resume = (): void => {
    // The panel asks us to resume; we need a click to re-capture the mouse.
    if (phase === 'paused' || phase === 'ready') phase = 'ready'
  }

  document.addEventListener('pointerlockchange', onPointerLockChange)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()
  renderAimTrack(ctx, state, 0, phase)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      loop.destroy()
      fit.dispose()
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const aimTrackGame: MiniGameDefinition = {
  id: 'aimtrack',
  title: '跟枪练习',
  icon: '🎯',
  description: 'FPS 跟枪：点击锁定鼠标，准星固定屏幕中央，转动视角压住上下左右漂移的靶子，左键射击。',
  controls: ['点击：锁定鼠标开始', '鼠标：转动视角', '左键：射击', 'P：暂停（Esc 释放鼠标）', 'R：重开'],
  create: createAimTrackGame,
}
