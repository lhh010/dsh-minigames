/**
 * Tower of Hanoi 河内塔 game definition: wires the pure move logic into a
 * {@link MiniGameInstance} — ←/→ or A/D select a rod, Enter/Space/↑ picks up
 * and drops the top disc (or click source then target rod); illegal drops
 * shake the board with a toast. Z/Backspace rewinds the last move; R restarts
 * the CURRENT level; completing a level (all discs on the rightmost rod)
 * fires onScore and auto-advances 1.5s later via the stored-remainder pause
 * pattern. There is no pause hotkey.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { applyMove, createStart, isWin, optimalFor, perfectSoFar, type HanoiState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderHanoi, rodAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'

const ADVANCE_MS = 1500
/** Discs per level; level index into this table, not a raw count. */
const LEVEL_DISCS = [3, 4, 5, 6, 7]
const TOAST_MS = 900
/** Undo history cap: rewind stays bounded and cheap. */
const MAX_HISTORY = 200

interface UndoEntry {
  state: HanoiState
  moves: number
}

function createHanoiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: hanoi needs a 2d canvas context')
  const ctx = fit.ctx

  let level = 1
  let discs = LEVEL_DISCS[level - 1]!
  let state = createStart(discs)
  let selected = 0
  let heldRod: number | null = null
  let moves = 0
  let toast: string | null = null
  let toastUntil = 0
  let winText: string | null = null
  let running = false
  let raf = 0
  let last = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const history: UndoEntry[] = []
  const particles = createParticles()

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next
    discs = LEVEL_DISCS[Math.min(next, LEVEL_DISCS.length) - 1]!
    state = createStart(discs)
    selected = 0
    heldRod = null
    moves = 0
    toast = null
    winText = null
    history.length = 0
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const showToast = (): void => {
    toast = '大盘不能压小盘'
    toastUntil = performance.now() + TOAST_MS
  }

  /** Try to drop the held disc on `to`; illegal drops shake with a toast. */
  const dropOn = (to: number): void => {
    if (heldRod === null) return
    if (to === heldRod) {
      heldRod = null // putting the disc back is not a move
      return
    }
    const next = applyMove(state, heldRod, to)
    if (next === null) {
      showToast()
      return
    }
    history.push({ state, moves })
    if (history.length > MAX_HISTORY) history.shift()
    state = next
    moves += 1
    heldRod = null
    selected = to
    if (isWin(state)) {
      winText = `完成 · ${moves} 步（最少 ${optimalFor(discs)} 步）`
      reportScore()
      const cx = (LOGICAL_W / 3) * 2.5
      particles.burst(cx, 120, THEME.gold, 16, 150)
      for (let rod = 0; rod < 3; rod += 1) particles.burst((LOGICAL_W / 3) * (rod + 0.5), 160, THEME.good, 4, 90)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS // paused mid-burst: arm on resume
    }
  }

  /** Pick up the top disc of `rod`, or attempt a drop when already holding. */
  const actOn = (rod: number): void => {
    if (winText !== null) return // frozen during the win overlay
    if (heldRod === null) {
      if (state.rods[rod]!.length === 0) {
        showToast()
        return
      }
      heldRod = rod
    } else {
      dropOn(rod)
    }
  }

  /** Rewind the last completed move; no-op at level start. */
  const undo = (): void => {
    if (winText !== null) return
    const entry = history.pop()
    if (entry === undefined) return
    state = entry.state
    moves = entry.moves
    heldRod = null
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return // paused: freeze input
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const rod = rodAt(x)
    if (rod !== null) {
      selected = rod
      actOn(rod)
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      // Restart the CURRENT level: the same opening stack.
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyZ' || event.code === 'Backspace') {
      event.preventDefault()
      if (!running) return
      undo()
    } else if (
      event.code === 'ArrowLeft' || event.code === 'ArrowRight'
      || event.code === 'KeyA' || event.code === 'KeyD'
      || event.code === 'ArrowUp' || event.code === 'Space' || event.code === 'Enter'
    ) {
      event.preventDefault()
      if (!running) return
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') selected = Math.max(0, selected - 1)
      else if (event.code === 'ArrowRight' || event.code === 'KeyD') selected = Math.min(2, selected + 1)
      else actOn(selected)
    }
  }

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(50, now - last)
    last = now
    if (toast !== null && now > toastUntil) toast = null
    renderHanoi(
      ctx, LOGICAL_W, LOGICAL_H, state, selected, heldRod, discs, moves,
      optimalFor(discs), perfectSoFar(moves, discs), false, winText, toast,
    )
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
  const pause = (): void => {
    if (!running) return
    running = false
    // Freeze the advance timer: stop it and keep the remainder.
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    stopLoop()
    renderHanoi(
      ctx, LOGICAL_W, LOGICAL_H, state, selected, heldRod, discs, moves,
      optimalFor(discs), perfectSoFar(moves, discs), true, winText, toast,
    )
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    startLoop()
  }

  canvas.addEventListener('mousedown', onMouseDown)
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
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const hanoiGame: MiniGameDefinition = {
  id: 'hanoi',
  title: '河内塔 Tower of Hanoi',
  icon: '🗼',
  description: '在三根柱子间搬圆盘，大盘不压小盘，把整座塔移到最右侧。',
  controls: ['←→ / AD：选柱 · 点击或 ↑/空格/回车：拿起 / 落下', 'Z / Backspace：回退一步', 'R：重开本关'],
  create: createHanoiGame,
}
