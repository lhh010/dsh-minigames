import { describe, expect, it, vi } from 'vitest'
import { createFrameLoop } from '../src/client/games/frame-scheduler.ts'

/** rAF stub: manually pump frames with controlled timestamps. */
function rafStub() {
  let now = 0
  const pending: FrameRequestCallback[] = []
  const original = globalThis.requestAnimationFrame
  const cancelOriginal = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    pending.push(cb)
    return pending.length
  }
  globalThis.cancelAnimationFrame = () => { pending.length = 0 }
  return {
    /** Advance by ms and fire the pending callbacks. */
    pump(ms: number): void {
      now += ms
      const cbs = [...pending]
      pending.length = 0
      for (const cb of cbs) cb(now)
    },
    restore(): void {
      globalThis.requestAnimationFrame = original
      globalThis.cancelAnimationFrame = cancelOriginal
    },
  }
}

describe('frame-scheduler', () => {
  it('clamps dt to 0.05s on long stalls', () => {
    const raf = rafStub()
    const dts: number[] = []
    const loop = createFrameLoop(f => { dts.push(f.dt) })
    loop.start()
    raf.pump(16)
    raf.pump(16)
    raf.pump(5000) // 5s stall (tab hidden)
    raf.pump(16)
    loop.destroy()
    raf.restore()
    expect(dts[0]).toBeCloseTo(0.016, 2)
    expect(dts[2]).toBe(0.05) // clamped, not 5
    expect(dts[3]).toBeCloseTo(0.016, 2)
  })

  it('starts skipping renders after a contended streak and recovers', () => {
    const raf = rafStub()
    const renders: boolean[] = []
    const loop = createFrameLoop(f => { renders.push(f.render) })
    loop.start()
    // First frame: last=0 → wallMs=16 (fresh clock), render=true.
    // Then sustained contention: skipping kicks in after the streak.
    for (let i = 0; i < 8; i += 1) raf.pump(50)
    for (let i = 0; i < 3; i += 1) raf.pump(16) // recovery
    loop.destroy()
    raf.restore()
    // Early frames render; deep in the skip zone they don't; recovery restores.
    expect(renders[0]).toBe(true)
    expect(renders[4]).toBe(false)
    expect(renders[5]).toBe(false)
    expect(renders[renders.length - 1]).toBe(true)
  })

  it('markDirty forces the next frame to render even while skipping', () => {
    const raf = rafStub()
    const renders: boolean[] = []
    let loop!: ReturnType<typeof createFrameLoop>
    loop = createFrameLoop(f => {
      renders.push(f.render)
      if (renders.length === 4) loop.markDirty()
    })
    loop.start()
    for (let i = 0; i < 6; i += 1) raf.pump(50)
    loop.destroy()
    raf.restore()
    expect(renders[4]).toBe(true) // dirty beat the skip
    expect(renders[5]).toBe(false) // back to skipping
  })

  it('pause stops the loop; resume restarts with a fresh clock', () => {
    const raf = rafStub()
    let calls = 0
    const loop = createFrameLoop(() => { calls += 1 })
    loop.start()
    raf.pump(16)
    loop.pause()
    raf.pump(16)
    raf.pump(16)
    expect(calls).toBe(1)
    loop.resume()
    raf.pump(16)
    expect(calls).toBe(2)
    loop.destroy()
    raf.restore()
    expect(loop.running).toBe(false)
  })

  it('a short hiccup (1-2 long frames) does not skip renders', () => {
    const raf = rafStub()
    const renders: boolean[] = []
    const loop = createFrameLoop(f => { renders.push(f.render) })
    loop.start()
    raf.pump(16)
    raf.pump(60) // single hiccup
    raf.pump(16)
    loop.destroy()
    raf.restore()
    expect(renders.every(r => r)).toBe(true)
  })

  it('dirty mode renders ONLY on markDirty (idle = zero repaints)', () => {
    const raf = rafStub()
    const renders: boolean[] = []
    let loop!: ReturnType<typeof createFrameLoop>
    loop = createFrameLoop(f => {
      renders.push(f.render)
      if (renders.length === 2) loop.markDirty()
    }, { mode: 'dirty' })
    loop.start()
    for (let i = 0; i < 5; i += 1) raf.pump(16)
    loop.destroy()
    raf.restore()
    // Frame 0: initial dirty. Frame 1: idle → false. Frame 2: marked → true.
    // Frames 3-4: idle → false.
    expect(renders).toEqual([true, false, true, false, false])
  })
})
