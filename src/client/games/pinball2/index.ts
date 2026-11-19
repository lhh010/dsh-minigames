/**
 * 弹球台 Pinball2 游戏定义：把纯物理状态机接到 MiniGameInstance。
 * Z / ← 左挡板，M / → 右挡板；长按空格蓄力、松开发射（可先后发两球
 * 同场互撞）；N 轻推台面（每球 3 次，超限 TILT 没收球）；R 重开、
 * P 暂停。continuous 帧循环：物理吃 f.dt，绘制吃 f.render；得分变化经
 * onScore 上报并在 localStorage 记最佳。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createGame, nudge, plungerRelease, restart, setFlipper, step, togglePause,
  type Pinball2State,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderPinball2 } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const BEST_KEY = 'dsh-minigames:best:pinball2'
/** 松手发射的最小蓄力（轻点空格不应满力弹出）。 */
const MIN_LAUNCH_POWER = 0.08

function loadBest(): number {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch { return 0 }
}

function saveBest(v: number): void {
  try { window.localStorage.setItem(BEST_KEY, String(Math.floor(v))) } catch { /* storage 不可用 */ }
}

function createPinball2Game(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: pinball2 needs a 2d canvas context')
  const ctx = initialFit.ctx

  // 每次挂载取一个运行 seed：台面布置与 nudge 抖动都由它派生。
  const runSeed = (Date.now() ^ 0x5c1a2b) >>> 0
  let state: Pinball2State = createGame(1, runSeed)

  let running = false
  let best = loadBest()
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    const s = Math.floor(state.score)
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
    if (s > best) { best = s; saveBest(best) }
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'bumper') particles.burst(ev.x, ev.y, THEME.gold, 8, 150)
      else if (ev.kind === 'sling') particles.burst(ev.x, ev.y, THEME.bad, 7, 130)
      else if (ev.kind === 'target') particles.burst(ev.x, ev.y, THEME.good, 6, 110)
      else if (ev.kind === 'bank') particles.burst(ev.x, ev.y, THEME.gold, 20, 220)
      else if (ev.kind === 'magnet') particles.burst(ev.x, ev.y, THEME.accents[1]!, 16, 200)
      else if (ev.kind === 'hit') particles.burst(ev.x, ev.y, '#c8d0dd', 10, 140)
      else if (ev.kind === 'tableUp') particles.burst(LOGICAL_W / 2, 240, THEME.good, 24, 240)
      else if (ev.kind === 'drain') particles.burst(LOGICAL_W / 2, LOGICAL_H - 40, THEME.bad, 14, 160)
      else if (ev.kind === 'tilt') particles.burst(LOGICAL_W / 2, 120, THEME.bad, 16, 180)
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt)
    handleEvents()
    reportScore()
    if (f.render) {
      renderPinball2(ctx, { state, paused: false, best })
      particles.tick(ctx, f.dt * 1000)
    }
  }

  const loop = createFrameLoop(frame)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      event.preventDefault()
    }
    if (event.repeat) return
    switch (k) {
      case 'KeyZ': case 'ArrowLeft':
        setFlipper(state, 'left', true)
        break
      case 'KeyM': case 'ArrowRight':
        setFlipper(state, 'right', true)
        break
      case 'Space':
        if (state.result === 'paused') togglePauseLocal()
        else if (state.result === 'playing') state.plungerHeld = true
        break
      case 'KeyN':
        nudge(state)
        break
      case 'KeyR':
        if (state.result !== 'paused') {
          restart(state)
          lastScore = -1
          reportScore()
        }
        break
      case 'KeyP': case 'Escape':
        togglePauseLocal()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    const k = event.code
    if (k === 'KeyZ' || k === 'ArrowLeft') setFlipper(state, 'left', false)
    else if (k === 'KeyM' || k === 'ArrowRight') setFlipper(state, 'right', false)
    else if (k === 'Space' && state.plungerHeld) {
      if (state.plunger >= MIN_LAUNCH_POWER) plungerRelease(state)
      else { state.plunger = 0; state.plungerHeld = false }
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    // 归位按住的键，避免暂停期间状态卡死。
    setFlipper(state, 'left', false)
    setFlipper(state, 'right', false)
    state.plungerHeld = false
    togglePause(state)
    renderPinball2(ctx, { state, paused: true, best })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (state.result === 'paused') togglePause(state)
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (state.result === 'paused') resume()
    else pause()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      initialFit.dispose()
    },
  }
}

export const pinball2Game: MiniGameDefinition = {
  id: 'pinball2',
  title: '弹球台 Pinball2',
  icon: '🕹️',
  description: '两颗钢球一张台——弹射器充能、挡板 timing，物理弹球的纯粹快乐。',
  controls: [
    'Z / ← 左挡板 · M / → 右挡板',
    '长按空格蓄力发射 · 可双球同场互撞',
    'N 轻推台面（每球 3 次，超限 TILT 没收球）',
    'R：重开 · P：暂停',
  ],
  create: createPinball2Game,
}
