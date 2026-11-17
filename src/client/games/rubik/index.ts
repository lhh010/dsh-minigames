/**
 * 魔方游戏定义：3D 可旋转魔方（render.ts 手写投影）接入
 * {@link MiniGameInstance}。空白处拖拽 = 旋转观察视角（惯性缓动）；按住
 * 贴纸沿切向拖拽 = 拧该层（dragToMove 确定性映射），0→90° 约 180ms 动画
 * 落定后走 logic 走法。H 提示 = 按全部历史逆序回拧一步（applyHint，上限
 * 3 次）；R 重开新打乱；P 暂停；双击或右下按钮重置视角。六面纯色即过关：
 * 粒子庆祝、onScore 上报、1.8s 后进下一关（5 关递进）。dirty 调度：静止
 * 零重绘，拧动动画 / 视角缓动 / 计时秒跳期间逐帧。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { applyHint, hintMove, newGame, userMove, type Move, type RubikState } from './logic.ts'
import {
  DEFAULT_VIEW, LOGICAL_H, LOGICAL_W, VIEW_BTN, dragToMove, makeView, pickSticker, renderRubik,
  type RenderState, type TwistAnim, type ViewAngles,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const ADVANCE_MS = 1800
const ANIM_MS = 180
const MAX_LEVEL = 5
const LS_REACHED = 'dsh-minigames:rubik:reached'
/** 触发拧动的最小拖拽位移（逻辑 px），小于此视为误触。 */
const DRAG_MIN_PX = 8
/** 视角拖拽灵敏度（弧度 / 逻辑 px）。 */
const ORBIT_GAIN = 0.011
/** 视角惯性每帧衰减系数与停止阈值。 */
const INERTIA_DECAY = 0.9
const INERTIA_EPS = 0.0003

/** 指针拖拽会话：旋转视角或待拧贴纸。 */
type Drag =
  | { mode: 'orbit'; lastX: number; lastY: number }
  | { mode: 'twist'; sticker: number; startX: number; startY: number; curX: number; curY: number }

function createRubikGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: rubik needs a 2d canvas context')
  const ctx = fit.ctx

  // 最高到达关卡持久化：重进游戏从上次进度继续（每关 seed 确定）。
  const readReached = (): number => {
    try {
      const saved = window.localStorage.getItem(LS_REACHED)
      if (saved !== null) {
        const n = Number(saved)
        if (Number.isFinite(n) && n >= 1) return Math.min(MAX_LEVEL, Math.floor(n))
      }
    } catch { /* storage unavailable */ }
    return 1
  }

  let level = readReached()
  let restartCount = 0
  // 关卡 seed 确定；R 重开时叠加重启计数 → 新打乱但仍可复现（随机全走 seed）。
  const seedFor = (): number => (level * 0x9e3779b9 + restartCount * 0x85ebca6b) >>> 0
  let state: RubikState = newGame(seedFor(), level)
  let winText: string | null = null
  let running = false
  let elapsedMs = 0
  let shownSecond = -1
  let twist: TwistAnim | null = null
  let twistElapsed = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const particles = createParticles()

  // 视角状态：当前角、惯性角速度、重置缓动目标。
  let view: ViewAngles = { ...DEFAULT_VIEW }
  let velYaw = 0
  let velPitch = 0
  let viewGoal: ViewAngles | null = null
  let drag: Drag | null = null

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number, freshScramble: boolean): void => {
    level = next
    if (freshScramble) restartCount += 1
    state = newGame(seedFor(), level)
    winText = null
    elapsedMs = 0
    shownSecond = -1
    twist = null
    twistElapsed = 0
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(Math.min(MAX_LEVEL, level + 1), true)
    }, delayMs)
  }

  /** 过关处理：庆祝文本、粒子、分数上报与自动进关（暂停中推迟）。 */
  const onSolved = (): void => {
    const sec = Math.floor(elapsedMs / 1000)
    const mm = String(Math.floor(sec / 60)).padStart(2, '0')
    const ss = String(sec % 60).padStart(2, '0')
    winText = '步数 ' + state.moves + ' · 打乱参考 ' + state.scramble.length + ' · 用时 ' + mm + ':' + ss
    try { window.localStorage.setItem(LS_REACHED, String(Math.min(MAX_LEVEL, level + 1))) } catch { /* storage unavailable */ }
    reportScore()
    particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 26, 190)
    for (const color of THEME.accents) particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, color, 6, 150)
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS // 暂停中过关：恢复时再计时
  }

  /** 拧一层：先动画后落定（帧循环结束时走 logic 已在 doMove 中先行更新）。 */
  const doMove = (move: Move): void => {
    if (state.solved) return
    const prev = state
    state = userMove(state, move.id, move.turns)
    twist = { moveId: move.id, turns: move.turns, phase: 0 }
    twistElapsed = 0
    loop.markDirty()
    if (state.solved && !prev.solved) onSolved()
  }

  /** H 提示：applyHint 弹掉历史末条并施加其逆（3D 动画同步呈现）。 */
  const hint = (): void => {
    if (!running || state.solved || twist !== null) return
    const move = hintMove(state)
    if (move === null || state.hintsUsed >= state.maxHints) return
    state = applyHint(state)
    twist = { moveId: move.id, turns: move.turns, phase: 0 }
    twistElapsed = 0
    loop.markDirty()
    if (state.solved) onSolved()
  }

  const resetView = (): void => {
    viewGoal = { ...DEFAULT_VIEW }
    velYaw = 0
    velPitch = 0
    loop.markDirty()
  }

  /** 事件坐标 → 逻辑画布坐标。 */
  const toLogical = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const { x, y } = toLogical(event)
    if (x >= VIEW_BTN.x && x <= VIEW_BTN.x + VIEW_BTN.w && y >= VIEW_BTN.y && y <= VIEW_BTN.y + VIEW_BTN.h) {
      resetView()
      return
    }
    // 拧动动画期间锁输入（视角旋转也不允许，保证层落定前的视觉一致）。
    if (twist !== null) return
    const sticker = pickSticker(x, y, makeView(view))
    if (sticker === null) drag = { mode: 'orbit', lastX: x, lastY: y }
    else drag = { mode: 'twist', sticker, startX: x, startY: y, curX: x, curY: y }
    loop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (drag === null) return
    const { x, y } = toLogical(event)
    if (drag.mode === 'orbit') {
      const dx = x - drag.lastX
      const dy = y - drag.lastY
      drag.lastX = x
      drag.lastY = y
      view.yaw += dx * ORBIT_GAIN
      view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch + dy * ORBIT_GAIN))
      velYaw = dx * ORBIT_GAIN
      velPitch = dy * ORBIT_GAIN
      viewGoal = null // 手动拖拽打断重置缓动
    } else {
      drag.curX = x
      drag.curY = y
    }
    loop.markDirty()
  }

  const onMouseUp = (): void => {
    if (drag === null) return
    if (drag.mode === 'twist') {
      const dx = drag.curX - drag.startX
      const dy = drag.curY - drag.startY
      if (Math.hypot(dx, dy) >= DRAG_MIN_PX && twist === null && !state.solved && running) {
        const move = dragToMove(drag.sticker, dx, dy, makeView(view))
        if (move !== null) doMove(move)
      }
    }
    drag = null
    loop.markDirty()
  }

  const onDblClick = (): void => {
    resetView()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level, true) // 新打乱：重启计数推进 seed
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      hint()
    }
  }

  const toRenderState = (paused: boolean): RenderState => ({
    cube: state.cube,
    level: state.level,
    scrambleLen: state.scramble.length,
    moves: state.moves,
    hintsLeft: state.maxHints - state.hintsUsed,
    elapsedMs,
    paused,
    winText,
    hover: drag !== null && drag.mode === 'twist' ? drag.sticker : null,
  })

  /** 视角缓动一步：重置目标逼近 + 惯性衰减；仍在动返回 true。 */
  const stepView = (): boolean => {
    let moving = false
    if (viewGoal !== null) {
      view.yaw += (viewGoal.yaw - view.yaw) * 0.2
      view.pitch += (viewGoal.pitch - view.pitch) * 0.2
      if (Math.abs(viewGoal.yaw - view.yaw) < 0.002 && Math.abs(viewGoal.pitch - view.pitch) < 0.002) {
        view = { ...viewGoal }
        viewGoal = null
      } else {
        moving = true
      }
    } else if (Math.abs(velYaw) > INERTIA_EPS || Math.abs(velPitch) > INERTIA_EPS) {
      view.yaw += velYaw
      view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch + velPitch))
      velYaw *= INERTIA_DECAY
      velPitch *= INERTIA_DECAY
      moving = true
    }
    return moving
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (!state.solved) elapsedMs += f.dt * 1000
    let dirty = false
    if (twist !== null) {
      twistElapsed += f.dt * 1000
      twist.phase = Math.min(1, twistElapsed / ANIM_MS)
      if (twist.phase >= 1) twist = null
      dirty = true
    }
    if (stepView()) dirty = true
    const second = Math.floor(elapsedMs / 1000)
    if (second !== shownSecond) {
      shownSecond = second
      dirty = true
    }
    if (dirty) loop.markDirty()
    if (!f.render && !dirty && particles.size() === 0) return
    renderRubik(ctx, LOGICAL_W, LOGICAL_H, toRenderState(false), view, twist)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderRubik(ctx, LOGICAL_W, LOGICAL_H, toRenderState(true), view, twist)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('dblclick', onDblClick)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
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
      canvas.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const rubikGame: MiniGameDefinition = {
  id: 'rubik',
  title: '魔方 Rubik',
  icon: '🎦',
  description: '3D 拖拽拧层复原六面颜色——状态空间天文数字，但你只需一步一步。',
  controls: ['拖贴纸切向：拧该层；空白处拖拽：旋转视角', '双击 / 按钮：重置视角', 'H：提示（逆序回拧，限 3 次）', 'R：重开新打乱 · P：暂停'],
  create: createRubikGame,
}
