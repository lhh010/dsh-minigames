/**
 * 引力弹弓 Orbit 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * continuous 帧循环推进模拟与渲染。拖拽瞄准（弹弓式：反向拖拽）松手
 * 发射；空格/P 暂停，1/2/3 时间倍速，H 参考解提示，R 重开本关。过关
 * 与失败后自动流转；得分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  createOrbit, stepOrbit, launch, setAim, retryLevel, advanceLevel, restartLevel,
  currentLevel, MIN_LAUNCH_SPEED, PHASE_MS, W, H,
  type OrbitState,
} from './logic.ts'
import { createOrbitRenderer } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 拖拽力度→初速换算系数。 */
const DRAG_SCALE = 1.7
/** 初速上限 px/s。 */
const MAX_SPEED = 420

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createOrbitGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: orbit needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: OrbitState = createOrbit((seed + round) >>> 0)
  const renderer = createOrbitRenderer((seed + round) >>> 0)
  let running = false
  let lastScore = -1
  let prevPhase: OrbitState['phase'] = state.phase
  // 拖拽瞄准：按下点（逻辑坐标）与是否发生过 move。
  let dragFrom: { x: number, y: number } | null = null
  let dragMoved = false

  const toLogical = (e: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * W,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * H,
    }
  }

  const applyAim = (from: { x: number, y: number }, to: { x: number, y: number }): void => {
    // 弹弓式：初速 = (按下点 - 当前点) * 系数，上限 MAX_SPEED。
    let vx = (from.x - to.x) * DRAG_SCALE
    let vy = (from.y - to.y) * DRAG_SCALE
    const sp = Math.hypot(vx, vy)
    if (sp > MAX_SPEED) {
      vx = (vx / sp) * MAX_SPEED
      vy = (vy / sp) * MAX_SPEED
    }
    setAim(state, vx, vy)
  }

  const onPointerDown = (e: PointerEvent): void => {
    focusGameHost(host)
    if (state.phase !== 'aim' || !running) return
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    dragFrom = toLogical(e)
    dragMoved = false
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (dragFrom === null || state.phase !== 'aim') return
    dragMoved = true
    applyAim(dragFrom, toLogical(e))
  }
  const onPointerUp = (e: PointerEvent): void => {
    if (dragFrom === null) return
    dragFrom = null
    if (state.phase !== 'aim') return
    // 瞄准向量已由 move 维护；未拖拽的轻点不发射（清空瞄准）。
    if (!dragMoved) setAim(state, 0, 0)
    const sp = Math.hypot(state.aimVx, state.aimVy)
    if (sp >= MIN_LAUNCH_SPEED) launch(state)
  }
  const onPointerCancel = (): void => {
    dragFrom = null
    dragMoved = false
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        togglePause()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'Digit1':
        event.preventDefault()
        state.speed = 1
        break
      case 'Digit2':
        event.preventDefault()
        state.speed = 2
        break
      case 'Digit3':
        event.preventDefault()
        state.speed = 4
        break
      case 'KeyH':
        event.preventDefault()
        state.hintVisible = !state.hintVisible
        break
      case 'KeyR':
        event.preventDefault()
        restartLevel(state)
        break
    }
  }
  document.addEventListener('keydown', onKeyDown)

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepOrbit(state, f.dt * 1000)
    // 撞击瞬间：在探针最后位置爆粒子。
    if (prevPhase === 'flying' && state.phase === 'lost' && state.lostReason === 'crash') {
      const p = state.trail[state.trail.length - 1] ?? currentLevel(state).station
      renderer.burst(p.x, p.y)
    }
    prevPhase = state.phase
    // 结算停留期满自动流转。
    if (state.phase === 'won' && state.phaseMs >= PHASE_MS) advanceLevel(state)
    else if (state.phase === 'lost' && state.phaseMs >= PHASE_MS) retryLevel(state)
    reportScore()
    if (f.render || state.phase !== 'flying') renderer.draw(ctx, state, !running)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createOrbit((seed + round) >>> 0)
    prevPhase = state.phase
    lastScore = -1
    dragFrom = null
    loop.markDirty()
    renderer.draw(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderer.draw(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    dragFrom = null
    loop.resume()
  }

  focusGameHost(host)
  renderer.draw(ctx, state, false)

  return {
    start(): void {
      if (running) return
      running = true
      loop.start()
    },
    pause,
    resume,
    destroy(): void {
      running = false
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      document.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

/** 引力弹弓 Orbit：一次点火，借行星引力转弯，规划轨迹抵达信标。 */
export const orbitGame: MiniGameDefinition = {
  id: 'orbit',
  title: '引力弹弓 Orbit',
  icon: '🪐',
  description: '一次点火，借行星的引力转弯加速——精确规划轨迹抵达信标。',
  controls: [
    '拖拽瞄准 · 松手发射',
    '空格 / P：暂停',
    '1 / 2 / 3：倍速 ×1 ×2 ×4',
    'H：参考解提示',
    'R：重开 · P：暂停',
  ],
  create: createOrbitGame,
}
