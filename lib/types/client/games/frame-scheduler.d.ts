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
export interface FrameInfo {
    /** Clamped delta seconds (≤ 0.05). */
    dt: number;
    /** True when the canvas should be repainted this frame (dirty flag set,
     * particles active, or the scheduler is not currently skipping renders). */
    render: boolean;
    /** Raw wall-clock ms since the last callback (diagnostics). */
    wallMs: number;
}
export interface FrameLoop {
    start(): void;
    pause(): void;
    resume(): void;
    destroy(): void;
    /** Force the next frame to render regardless of contention skipping. */
    markDirty(): void;
    /** True while the loop is running. */
    readonly running: boolean;
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
    mode?: 'continuous' | 'dirty';
}
export declare function createFrameLoop(callback: (frame: FrameInfo) => void, options?: FrameLoopOptions): FrameLoop;
