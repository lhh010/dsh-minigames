/**
 * 钩荡忍者游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染；按住鼠标左键 / 空格发射并保持钩索，松开惯性
 * 飞行；R 重开、P 暂停；距离分经 onScore 上报（最高分由面板管理）。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createGrapple, stepGrapple, grappleScore, W, H, type GrappleState, type GrappleInput } from './logic.ts'
import { renderGrapple } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function createGrappleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: grapple needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: GrappleState = createGrapple((seed + round) >>> 0)
  let running = false
  let lastScore = -1

  const input: GrappleInput = { hold: false }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 修饰键组合（Ctrl/Cmd+R 刷新等）是浏览器命令，不作为游戏输入。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      event.preventDefault()
      input.hold = true
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') input.hold = false
  }
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    input.hold = true
  }
  const onPointerUp = (): void => {
    input.hold = false
  }

  const reportScore = (): void => {
    const score = grappleScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    // 死亡 / 过关阶段也要推进阶段计时，dt 照常传入。
    stepGrapple(state, f.dt * 1000, input)
    reportScore()
    if (f.render) renderGrapple(ctx, state, false)
  }
  const loop = createFrameLoop(frame)

  const reset = (): void => {
    round += 1
    state = createGrapple((seed + round) >>> 0)
    lastScore = -1
    input.hold = false
    loop.markDirty()
    renderGrapple(ctx, state, false)
  }

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderGrapple(ctx, state, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderGrapple(ctx, state, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
    },
  }
}

export const grappleGame: MiniGameDefinition = {
  id: 'grapple',
  title: '钩荡忍者 Grapple',
  icon: '🪝',
  description: '按住发射钩索荡过深渊——惯性飞行与释放时机决定生死，坠落即重来。',
  controls: ['按住 鼠标/空格：发射并保持钩索', '松开：惯性抛物线飞行', '躲开尖刺、坠渊回段首 · 5 关 · R：重开 · P：暂停'],
  create: createGrappleGame,
}
