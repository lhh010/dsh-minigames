/**
 * 天平谜题 Balance 游戏定义：把纯力矩逻辑接成 {@link MiniGameInstance}。
 * 交互：点击砝码架上的砝码选中 → 点击挂点挂上；点击已挂砝码取下重放；
 * 横梁按净力矩实时倾斜（弹性动画）。U 撤回上一步、R 重开本关、P 暂停。
 * dirty 渲染：静态时零重绘，倾斜动画 / 粒子期间逐帧。过关上报 onScore
 * 并自动进入下一关（1.5s，暂停时冻结剩余量）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVEL_WEIGHTS, createStart, generateLevel, isWin, levelSeed, leftTorque, mulberry32,
  netTorque, placeWeight, removeWeight, rightTorque, type BalanceState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, placedWeightAt, renderBalance, shelfWeightAt, slotAt, tiltForTorque } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1500
const TOAST_MS = 900
/** 撤回历史上限：回退步数有界。 */
const MAX_HISTORY = 200
/** 倾角动画：每帧向目标逼近的比例（指数趋近）。 */
const TILT_EASE = 0.15
/** 倾角动画结束判定的弧度阈值。 */
const TILT_EPS = 0.0015

interface UndoEntry {
  state: BalanceState
}

function createBalanceGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: balance needs a 2d canvas context')
  const ctx = fit.ctx

  const rng = mulberry32(0xba1aec)
  let level = Math.min(readLevel('balance'), LEVEL_WEIGHTS.length)
  let gen = generateLevel(rng, LEVEL_WEIGHTS[level - 1]!)
  let state = createStart(gen.weights)
  let selected: number | null = null
  let angle = 0
  let toast: string | null = null
  let toastUntil = 0
  let winText: string | null = null
  let running = false
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
    saveLevel('balance', level)
    gen = generateLevel(mulberry32(levelSeed(0xba1aec, level)), LEVEL_WEIGHTS[Math.min(next, LEVEL_WEIGHTS.length) - 1]!)
    state = createStart(gen.weights)
    selected = null
    angle = 0
    toast = null
    winText = null
    history.length = 0
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      if (level >= LEVEL_WEIGHTS.length) {
        // 通关后循环回第 1 关（换种子重新生成）。
        startLevel(1)
      } else {
        startLevel(level + 1)
      }
    }, delayMs)
  }

  const showToast = (text: string): void => {
    toast = text
    toastUntil = performance.now() + TOAST_MS
    loop.markDirty()
  }

  /** 挂上 / 取下后统一走这里：更新、检查过关。 */
  const commit = (next: BalanceState): void => {
    history.push({ state })
    if (history.length > MAX_HISTORY) history.shift()
    state = next
    selected = null
    loop.markDirty()
    if (isWin(state)) {
      winText = '左 ' + String(leftTorque(state)) + ' = 右 ' + String(rightTorque(state)) + ' · 恰好平衡'
      reportScore()
      particles.burst(LOGICAL_W / 2, 258, THEME.gold, 18, 160)
      for (let s = 0; s < 10; s += 1) particles.burst(LOGICAL_W / 2 + (s - 4.5) * 50, 200, THEME.good, 3, 90)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || winText !== null) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const wi = shelfWeightAt(state, x, y)
    if (wi !== null) {
      selected = selected === wi ? null : wi
      loop.markDirty()
      return
    }
    const placed = placedWeightAt(state, x, y)
    if (placed !== null) {
      // 取下重放。
      const next = removeWeight(state, placed)
      if (next !== null) commit(next)
      return
    }
    const slot = slotAt(x, y)
    if (slot !== null) {
      if (selected === null) {
        showToast('先在砝码架选一枚砝码')
        return
      }
      const next = placeWeight(state, selected, slot)
      if (next === null) {
        showToast('挂点已被占用')
        return
      }
      commit(next)
    }
  }

  const undo = (): void => {
    if (winText !== null) return
    const entry = history.pop()
    if (entry === undefined) return
    state = entry.state
    selected = null
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      if (!running) return
      undo()
    }
  }

  // 脏标记渲染：倾斜动画未收敛或粒子未结束期间逐帧，否则零重绘。
  const loop = createFrameLoop(f => {
    if (toast !== null && performance.now() > toastUntil) {
      toast = null
      loop.markDirty()
    }
    const target = tiltForTorque(netTorque(state))
    const animating = Math.abs(angle - target) > TILT_EPS || particles.size() > 0
    if (f.render || animating) {
      if (animating) {
        angle += (target - angle) * TILT_EASE
        if (Math.abs(angle - target) <= TILT_EPS) angle = target
        loop.markDirty()
      }
      renderBalance(
        ctx, LOGICAL_W, LOGICAL_H, state, angle, selected, level,
        leftTorque(state), rightTorque(state), false, winText, toast,
      )
      particles.tick(ctx, f.dt * 1000)
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderBalance(
      ctx, LOGICAL_W, LOGICAL_H, state, angle, selected, level,
      leftTorque(state), rightTorque(state), true, winText, toast,
    )
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
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
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const balanceGame: MiniGameDefinition = {
  id: 'balance',
  title: '天平谜题 Balance',
  icon: '⚖️',
  description: '在横梁上摆放砝码让它恰好平衡——重量乘以力臂的几何艺术。',
  controls: ['点击砝码 → 点击挂点放置 · 点击已挂砝码取下重放', 'U：撤回一步', 'R：重开本关', 'P：暂停'],
  create: createBalanceGame,
}
