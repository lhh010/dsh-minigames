/**
 * 桌上冰球游戏定义：把纯逻辑接到 {@link MiniGameInstance}——鼠标/触摸
 * 直接控制下半区推杆（限速追踪，防止瞬移穿透），R 重开、P 暂停，终场
 * 点击/空格重开。continuous 帧循环；onScore 在终场一次性上报全场累计
 * 玩家进球数。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { createState, step, W, H, type IceHockeyState } from './logic.ts'
import { renderIcehockey } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME } from '../theme.ts'

function createIcehockeyGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, W, H)
  if (initialFit === null) throw new Error('dsh-minigames: icehockey needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: IceHockeyState = createState()
  let running = false
  let reported = false

  // 指针目标（逻辑坐标）；undefined 表示本帧未更新。
  const input = { x: undefined as number | undefined, y: undefined as number | undefined }

  /** 终场一次性上报全场累计玩家进球数。 */
  const reportScore = (): void => {
    if (reported || state.over === null) return
    reported = true
    options?.onScore?.(state.playerGoals)
  }

  const restart = (): void => {
    state = createState((Math.random() * 0xffffffff) >>> 0)
    reported = false
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    // CSS px → 逻辑台面坐标。
    const rect = canvas.getBoundingClientRect()
    input.x = ((event.clientX - rect.left) / rect.width) * W
    input.y = ((event.clientY - rect.top) / rect.height) * H
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyR':
        event.preventDefault()
        restart()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'Space':
        event.preventDefault()
        if (state.over !== null) restart()
        break
    }
  }
  const onPointerDown = (): void => {
    if (state.over !== null) restart()
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const pointer = input.x !== undefined && input.y !== undefined
      ? { x: input.x, y: input.y }
      : {}
    state = step(state, f.dt * 1000, pointer)
    reportScore()
    if (f.render) renderIcehockey(ctx, state)
  }

  const loop = createFrameLoop(frame)

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    running = false
    loop.pause()
    renderIcehockey(ctx, state)
    drawPauseVeil()
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
  }
  /** 暂停遮罩（渲染器只认比赛状态，暂停由宿主叠加）。 */
  const drawPauseVeil = (): void => {
    ctx.fillStyle = 'rgba(13,13,20,0.55)'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText('已暂停', W / 2, H / 2 - 6)
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('按 P 继续 · 按 R 重开', W / 2, H / 2 + 20)
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderIcehockey(ctx, state)

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}


export const icehockeyGame: MiniGameDefinition = {
  id: 'icehockey',
  title: '桌上冰球 AirHockey',
  icon: '🥍',
  description: '气垫台面推杆撞击——快过对手的反应，进球就是硬道理。',
  controls: ['鼠标/触摸：移动推杆', 'R：重开', 'P：暂停'],
  create: createIcehockeyGame,
}
