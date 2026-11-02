/**
 * 迷你高尔夫游戏定义：把纯逻辑状态机接入 {@link MiniGameInstance}——
 * 在果岭任意处按下拖拽蓄力（拉杆方向的反方向击球，力度 ∝ 拉距），
 * 松手击球；也可 ← / → 旋转瞄准、长按空格蓄力。R 重开本关，P 暂停
 * （面板暂停同样生效），[ ] 在已解锁关卡间切换。入洞触发粒子与星级
 * 浮字，累计星数作为分数上报；关卡进度走共享 level 存储。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createGolfLevel, nextLevel, restartLevel, shoot, step, togglePause, type MiniGolfState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, logicalToWorld, renderGolf, worldToLogical } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'minigolf'
/** 拉杆距离（世界单位）映射到满力。 */
const FULL_POWER_PULL = 70
/** 键盘蓄力速率（每秒力度增量）。 */
const CHARGE_RATE = 0.9
/** 键盘瞄准旋转速率（弧度/秒）。 */
const AIM_RATE = 1.8
/** 单次按键旋转步长（弧度）。 */
const AIM_STEP = 0.03
/** 低于该力度的轻点不击球。 */
const MIN_FIRE_POWER = 0.05
/** 星级浮字显示时长（秒），与 render.ts 的淡出曲线保持一致。 */
const STAR_POP_S = 1.6

function createMiniGolfGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: minigolf needs a 2d canvas context')
  const ctx = fit.ctx

  let state: MiniGolfState = createGolfLevel(readLevel(GAME_ID))
  let running = false
  /** 键盘瞄准角（拖杆时被拖杆值覆盖）。 */
  let aimAngle = 0
  /** 键盘蓄力值。 */
  let power = 0
  /** 拖杆进行中的瞄准。 */
  let drag: { angle: number; power: number } | null = null
  /** 入洞星级浮字状态。 */
  let star: { count: number; t: number } | null = null
  let lastScore = -1
  const particles = createParticles()
  const keys = { left: false, right: false, charge: false }

  const reportScore = (): void => {
    const s = state.totalStars
    if (s === lastScore) return
    lastScore = s
    options?.onScore?.(s)
  }

  const handleEvents = (): void => {
    for (const ev of state.events) {
      if (ev.kind === 'sink') {
        saveLevel(GAME_ID, state.level + 1)
        const h = worldToLogical(state.hole.x, state.hole.y)
        particles.burst(h.x, h.y, THEME.gold, 8, 120)
        particles.burst(h.x, h.y, THEME.good, 14, 180)
        star = { count: ev.stars, t: STAR_POP_S }
        reportScore()
      }
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const dt = f.dt
    const aiming = state.phase === 'aiming' && drag === null
    if (aiming) {
      if (keys.left) aimAngle -= AIM_RATE * dt
      if (keys.right) aimAngle += AIM_RATE * dt
      if (keys.charge) power = Math.min(1, power + CHARGE_RATE * dt)
    }
    step(state, dt)
    handleEvents()
    // 滚动 / 粒子 / 浮字 / 消息期间持续重绘（dirty 模式下的滚动渲染）。
    if (state.phase === 'rolling' || particles.size() > 0 || (star !== null && star.t > 0) || state.msgTimer > 0) {
      if (star !== null) star.t = Math.max(0, star.t - dt)
      loop.markDirty()
    }
    if (f.render) {
      renderGolf(ctx, { state, paused: false, aim: drag ?? { angle: aimAngle, power }, star })
      particles.tick(ctx, dt * 1000)
    }
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pointerWorld = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return logicalToWorld(
      ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    )
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || state.phase !== 'aiming') return
    drag = { angle: aimAngle, power: 0 }
    try { canvas.setPointerCapture(event.pointerId) } catch { /* capture optional */ }
    loop.markDirty()
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (drag === null) return
    const p = pointerWorld(event)
    const dx = state.ball.x - p.x
    const dy = state.ball.y - p.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2) return
    // 弹弓式：球被拉向指针的反方向弹出，力度 ∝ 拉距。
    drag = { angle: Math.atan2(dy, dx), power: Math.min(1, dist / FULL_POWER_PULL) }
    loop.markDirty()
  }
  const onPointerUp = (): void => {
    if (drag === null) return
    const { angle, power: p } = drag
    drag = null
    aimAngle = angle
    if (p > MIN_FIRE_POWER) shoot(state, angle, p)
    loop.markDirty()
  }

  /** 跳转到指定关（[ ] 导航，仅限已解锁范围）。 */
  const jumpLevel = (target: number): void => {
    state = createGolfLevel(target, state.totalStars)
    power = 0
    drag = null
    aimAngle = 0
    reportScore()
    loop.markDirty()
  }

  const advance = (): void => {
    nextLevel(state)
    power = 0
    drag = null
    aimAngle = 0
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Space' || k === 'ArrowUp' || k === 'ArrowDown') {
      event.preventDefault()
    }
    switch (k) {
      case 'ArrowLeft': case 'KeyA':
        if (state.phase === 'aiming' && !event.repeat && !keys.left) aimAngle -= AIM_STEP
        keys.left = true
        loop.markDirty()
        break
      case 'ArrowRight': case 'KeyD':
        if (state.phase === 'aiming' && !event.repeat && !keys.right) aimAngle += AIM_STEP
        keys.right = true
        loop.markDirty()
        break
      case 'Space':
        if (state.phase === 'levelDone' && !event.repeat) advance()
        else if (state.phase === 'aiming') keys.charge = true
        break
      case 'Enter': case 'NumpadEnter':
        if (state.phase === 'levelDone' && !event.repeat) advance()
        break
      case 'KeyR':
        if (!event.repeat) {
          restartLevel(state)
          power = 0
          drag = null
          loop.markDirty()
        }
        break
      case 'BracketLeft': case 'BracketRight': {
        if (!event.repeat) {
          const max = readLevel(GAME_ID)
          const next = state.level + (event.code === 'BracketRight' ? 1 : -1)
          if (next >= 1 && next <= max) jumpLevel(next)
        }
        break
      }
      case 'KeyP': case 'Escape':
        if (!event.repeat) togglePauseLocal()
        break
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false
    if (event.code === 'Space' && keys.charge) {
      keys.charge = false
      if (state.phase === 'aiming' && power > MIN_FIRE_POWER) {
        shoot(state, aimAngle, power)
        power = 0
        loop.markDirty()
      }
    }
  }

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    togglePause(state)
    renderGolf(ctx, { state, paused: true, aim: drag ?? { angle: aimAngle, power }, star })
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (state.phase === 'paused') togglePause(state)
    loop.resume()
    loop.markDirty()
  }
  const togglePauseLocal = (): void => {
    if (state.phase === 'paused') resume()
    else pause()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
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
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      fit.dispose()
    },
  }
}

export const minigolfGame: MiniGameDefinition = {
  id: 'minigolf',
  title: '迷你高尔夫',
  icon: '⛳',
  description: '8 洞俯视迷你高尔夫：拖杆蓄力推球，绕开沙坑与斜坡，用最少杆数把球送进洞。',
  controls: [
    '按住拖拽拉杆瞄准，松手击球（拉得越远越大力）',
    '← / → 瞄准 · 长按空格蓄力，松开击球',
    'R：重开本关 · P：暂停',
    '空格 / 回车：入洞后进入下一关 · [ ] 切换关卡',
  ],
  create: createMiniGolfGame,
}
