/**
 * 导弹指令游戏定义：把纯逻辑接成 {@link MiniGameInstance}——鼠标移动
 * 瞄准（画布任意点）、点击或空格发射拦截弹，方向键亦可移动准星；
 * continuous 帧循环推进模拟与渲染，R 重开、P 暂停，分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createMissile, fireMissile, stepMissile, W, H, GROUND_Y, type MissileState } from './logic.ts'
import { renderMissile } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 准星方向键单次位移 px。 */
const AIM_STEP = 14

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createMissileGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: missile needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: MissileState = createMissile((seed + round) >>> 0)
  let running = false
  let lastScore = -1
  let aimX = W / 2
  let aimY = H / 2 - 40

  /** 准星限制在画布内（不贴边、不进地面）。 */
  const clampAim = (): void => {
    aimX = Math.max(10, Math.min(W - 10, aimX))
    aimY = Math.max(20, Math.min(GROUND_Y - 8, aimY))
  }

  /** 指针事件坐标 → 逻辑画布坐标。 */
  const pointerToLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'Space':
        event.preventDefault()
        fireMissile(state, aimX, aimY)
        break
      case 'ArrowLeft':
        event.preventDefault()
        aimX -= AIM_STEP
        break
      case 'ArrowRight':
        event.preventDefault()
        aimX += AIM_STEP
        break
      case 'ArrowUp':
        event.preventDefault()
        aimY -= AIM_STEP
        break
      case 'ArrowDown':
        event.preventDefault()
        aimY += AIM_STEP
        break
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
    }
  }
  const onPointerMove = (event: PointerEvent): void => {
    const p = pointerToLogical(event)
    aimX = p.x
    aimY = p.y
    clampAim()
  }
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    onPointerMove(event)
    fireMissile(state, aimX, aimY)
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    stepMissile(state, f.dt * 1000)
    reportScore()
    if (f.render) renderMissile(ctx, state, false, aimX, aimY)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createMissile((seed + round) >>> 0)
    lastScore = -1
    loop.markDirty()
    renderMissile(ctx, state, false, aimX, aimY)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderMissile(ctx, state, true, aimX, aimY)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderMissile(ctx, state, false, aimX, aimY)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
    },
  }
}

export const missileGame: MiniGameDefinition = {
  id: 'missile',
  title: '导弹指令 Missile',
  icon: '💥',
  description: '在来袭导弹落地前发射拦截弹引爆——预判与爆炸半径的经典艺术。',
  controls: ['鼠标移动瞄准 · 点击 / 空格：发射拦截弹', '方向键也可移动准星', '共 6 波 · 每波结束奖励城市 · R：重开 · P：暂停'],
  create: createMissileGame,
}
