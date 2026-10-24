/**
 * 舒尔特方格 Schulte Grid game definition: wires the pure grid logic into a
 * {@link MiniGameInstance} — click cells in ascending order 1..n²; wrong
 * clicks flash red and add +500ms to the run; the timer starts on the first
 * click; finishing fires onScore with a faster-is-higher time score, bursts
 * particles, and auto-advances 1.5s later. R restarts the CURRENT level
 * (deterministic per-level seed → the same shuffle). Panel-driven pause
 * and the P hotkey freeze both the run clock and the advance timer via
 * the stored-remainder pattern. The highest level reached persists through
 * the shared level-progress helper, so a remount resumes there instead of
 * restarting at level 1.
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { WRONG_PENALTY_MS, gridSizeFor, isCorrectClick, makeGrid, scoreFor } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, cellAt, cellCenter, renderSchulte, type WrongFlash } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'

const ADVANCE_MS = 1500

function createSchulteGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: schulte needs a 2d canvas context')
  const ctx = fit.ctx

  let level = readLevel('schulte')
  // Deterministic per-level seed: one seed per level keeps R-replays identical.
  const seedFor = (lv: number): number => lv * 0x9e3779b9
  let grid = makeGrid(seedFor(level), gridSizeFor(level))
  let lockedCount = 0
  let wrongCount = 0
  // 0 = timer not started yet (starts on the first click).
  let startAt = 0
  let pausedElapsed = 0
  let wrong: WrongFlash | null = null
  let wrongAt = 0
  let winText: string | null = null
  let running = false
  let raf = 0
  let last = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  const particles = createParticles()

  const wallElapsed = (): number => (startAt === 0 ? 0 : performance.now() - startAt)
  /** Penalized elapsed: wall clock + 500ms per wrong click (HUD + overlay). */
  const penalizedElapsed = (): number => wallElapsed() + wrongCount * WRONG_PENALTY_MS

  const startLevel = (next: number): void => {
    level = next
    grid = makeGrid(seedFor(level), gridSizeFor(level))
    lockedCount = 0
    wrongCount = 0
    startAt = 0
    pausedElapsed = 0
    wrong = null
    winText = null
  }

  const finishLevel = (): void => {
    // scoreFor applies the wrong-click penalty itself; pass raw wall time.
    const score = scoreFor(wallElapsed(), wrongCount)
    winText = `完成 · ${(penalizedElapsed() / 1000).toFixed(1)} 秒`
    options?.onScore?.(score)
    const center = cellCenter(grid.length - 1, level)
    particles.burst(center.x, center.y, THEME.gold, 16, 150)
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // paused mid-burst: arm on resume
  }

  const click = (index: number): void => {
    if (winText !== null) return // frozen during the finish overlay
    if (startAt === 0) startAt = performance.now()
    const expected = lockedCount + 1
    if (isCorrectClick(grid, expected, index)) {
      lockedCount = expected
      if (lockedCount === grid.length) finishLevel()
    } else {
      wrongCount += 1
      wrong = { index, ageMs: 0 }
      wrongAt = performance.now()
    }
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('schulte', next)
      startLevel(next)
    }, delayMs)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running) return // paused: freeze input
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const index = cellAt(x, y, level)
    if (index >= 0) click(index)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // Restart the CURRENT level: same seed → the same shuffle.
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    if (wrong !== null) {
      wrong = { index: wrong.index, ageMs: now - wrongAt }
      if (wrong.ageMs > 200) wrong = null
    }
    renderSchulte(ctx, LOGICAL_W, LOGICAL_H, grid, level, lockedCount, wrong, penalizedElapsed(), wrongCount, false, winText)
    particles.tick(ctx, dt)
  }

  const startLoop = (): void => {
    if (raf !== 0) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stopLoop = (): void => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    // Freeze the run clock: keep the elapsed remainder, restore on resume.
    pausedElapsed = wallElapsed()
    // Freeze the advance timer: stop it and keep the remainder.
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    stopLoop()
    renderSchulte(ctx, LOGICAL_W, LOGICAL_H, grid, level, lockedCount, wrong, penalizedElapsed(), wrongCount, true, winText)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (startAt !== 0) startAt = performance.now() - pausedElapsed
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    startLoop()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startLoop()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      stopLoop()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const schulteGame: MiniGameDefinition = {
  id: 'schulte',
  title: '舒尔特方格 Schulte Grid',
  icon: '🔲',
  description: '按 1 到 N² 的顺序依次点击打乱数字，越快越好。',
  controls: ['点击 / 触摸：按顺序点数字', 'R：重开本关', 'P：暂停'],
  create: createSchulteGame,
}
