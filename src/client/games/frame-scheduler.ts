/**
 * Shared frame scheduler for mini-games: dt clamping, dirty-flag rendering,
 * and adaptive frame skipping under main-thread contention.
 *
 * Why: the panel lives in the same page as the session transcript. When the
 * session streams, the main thread is busy and rAF callbacks get starved; a
 * game without a dt clamp then teleports its simulation (visible stutter),
 * and a static puzzle board that repaints every frame needlessly competes
 * with the transcript for the same thread.
 *
 * Usage (arcade game — continuous simulation):
 *   const loop = createFrameLoop(frame => {
 *     const dt = frame.dt            // clamped seconds
 *     step(dt); render()
 *   })
 *   loop.start(); loop.pause(); loop.resume(); loop.destroy()
 *
 * Usage (board/puzzle game — repaint only on change):
 *   const loop = createFrameLoop(frame => {
 *     const dt = frame.dt
 *     tickParticles(dt)
 *     if (frame.render || particlesActive()) render()
 *   })
 *   loop.markDirty()  // call after ANY state change (input, win, timer text)
 */

/** Max simulated seconds per frame: beyond this the frame is treated as a
 * stall (tab throttling, main-thread contention) and the excess is dropped —
 * the game slows down instead of teleporting. */
const MAX_DT_S = 0.05
/** When wall-clock frame time exceeds this, skip the render pass but still
 * step the simulation (keeps physics sane under contention). */
const CONTENDED_FRAME_MS = 40
/** Consecutive contended frames before the scheduler starts skipping renders
 * (a short hiccup should not flicker the canvas). */
const CONTENDED_STREAK = 3

export interface FrameInfo {
  /** Clamped delta seconds (≤ 0.05). */
  dt: number
  /** True when the canvas should be repainted this frame (dirty flag set,
   * particles active, or the scheduler is not currently skipping renders). */
  render: boolean
  /** Raw wall-clock ms since the last callback (diagnostics). */
  wallMs: number
}

export interface FrameLoop {
  start(): void
  pause(): void
  resume(): void
  destroy(): void
  /** Force the next frame to render regardless of contention skipping. */
  markDirty(): void
  /** True while the loop is running. */
  readonly running: boolean
}

export interface FrameLoopOptions {
  /**
   * 'continuous' (default): render every frame unless the scheduler is
   * contention-skipping — action games whose simulation changes every frame.
   * 'dirty': render ONLY when the dirty flag is set — board/puzzle games
   * whose canvas is static between interactions; idle = zero repaints.
   * Under sustained contention both modes stop repainting; the dirty flag
   * always wins (a marked-dirty frame renders even while skipping).
   */
  mode?: 'continuous' | 'dirty'
}

export function createFrameLoop(callback: (frame: FrameInfo) => void, options?: FrameLoopOptions): FrameLoop {
  let raf = 0
  let running = false
  let last = 0
  let dirty = true
  let contended = 0
  let skipping = false
  const continuous = (options?.mode ?? 'continuous') === 'continuous'

  const frame = (now: number): void => {
    if (!running) return
    raf = requestAnimationFrame(frame)
    const wallMs = last === 0 ? 16 : now - last
    last = now
    const dt = Math.min(MAX_DT_S, wallMs / 1000)
    // Contention detection: sustained long frames mean the main thread is
    // busy (session streaming); drop canvas repaints but keep the sim step.
    if (wallMs > CONTENDED_FRAME_MS) contended += 1
    else contended = 0
    if (contended >= CONTENDED_STREAK) skipping = true
    else if (contended === 0) skipping = false
    const render = dirty || (continuous && !skipping)
    dirty = false
    callback({ dt, render, wallMs })
  }

  const loop: FrameLoop = {
    start(): void {
      if (running) return
      running = true
      last = 0
      raf = requestAnimationFrame(frame)
    },
    pause(): void {
      if (!running) return
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    resume(): void {
      if (running) return
      running = true
      last = 0
      raf = requestAnimationFrame(frame)
    },
    destroy(): void {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    markDirty(): void {
      dirty = true
    },
    get running(): boolean {
      return running
    },
  }
  return loop
}
