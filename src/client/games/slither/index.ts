/**
 * 贪吃蛇大作战游戏定义：把确定性引擎接成 {@link MiniGameInstance}——
 * 鼠标指向转向（蛇头朝指针）、按住左键/空格加速（消耗长度吐光点）、
 * continuous 帧循环内以固定步长累积器推进模拟（每帧至多补 3 个 tick），
 * 死亡事件用共享粒子系统爆光。R 重开（同 seed 换局号）、P 暂停；分数
 * （=长度）经 onScore 上报，死亡时上报长度峰值。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { CX, CY, TICK, createSlither, stepSlither, type SlitherState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderSlither } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 单帧最多补的固定步数（防卡顿后追帧过猛）。 */
const MAX_STEPS_PER_FRAME = 3

function createSlitherGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: slither needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: SlitherState = createSlither(seed, round)
  let running = false
  let lastScore = -1
  let acc = 0
  const cam = { x: CX, y: CY }
  const pointer = { x: LOGICAL_W / 2, y: LOGICAL_H / 2, active: false }
  let boostMouse = false
  let boostKey = false
  const particles = createParticles()

  const pointerFromEvent = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    pointer.y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    pointer.active = true
  }

  /** 死亡事件 -> 粒子（世界坐标转屏幕坐标）。 */
  const consumeEvents = (): void => {
    for (const e of state.events) {
      if (e.type === 'death') {
        particles.burst(e.x - cam.x + LOGICAL_W / 2, e.y - cam.y + LOGICAL_H / 2, accent(e.color), 16, 180)
      }
    }
  }

  const reportScore = (): void => {
    const player = state.snakes[0]!
    const score = Math.floor(player.alive ? Math.max(0, player.length) : player.peak)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const reset = (): void => {
    round += 1
    state = createSlither(seed, round)
    const p = state.snakes[0]!
    cam.x = p.x
    cam.y = p.y
    acc = 0
    lastScore = -1
    boostMouse = false
    boostKey = false
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      event.preventDefault()
      boostKey = true
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') boostKey = false
  }
  const onMouseMove = (event: MouseEvent): void => pointerFromEvent(event)
  const onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) boostMouse = true
    pointerFromEvent(event)
  }
  const onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) boostMouse = false
  }
  const onMouseLeave = (): void => {
    boostMouse = false
    pointer.active = false
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    acc += f.dt
    let steps = 0
    while (acc >= TICK && steps < MAX_STEPS_PER_FRAME) {
      const p = state.snakes[0]!
      let angle = p.angle
      if (p.alive) {
        const sx = p.x - cam.x + LOGICAL_W / 2
        const sy = p.y - cam.y + LOGICAL_H / 2
        angle = Math.atan2(pointer.y - sy, pointer.x - sx)
      }
      stepSlither(state, { angle, boost: (boostMouse || boostKey) && p.alive })
      consumeEvents()
      acc -= TICK
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0
    const p = state.snakes[0]!
    if (p.alive) {
      const k = Math.min(1, f.dt * 8)
      cam.x += (p.x - cam.x) * k
      cam.y += (p.y - cam.y) * k
    }
    reportScore()
    if (f.render || particles.size() > 0) {
      renderSlither(ctx, state, {
        camX: cam.x, camY: cam.y,
        pointerX: pointer.x, pointerY: pointer.y, pointerActive: pointer.active,
        paused: false,
      })
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame)

  const pauseFrame = (): void => {
    renderSlither(ctx, state, {
      camX: cam.x, camY: cam.y,
      pointerX: pointer.x, pointerY: pointer.y, pointerActive: pointer.active,
      paused: true,
    })
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    pauseFrame()
  }
  const resume = (): void => {
    if (running) return
    running = true
    acc = 0
    loop.start()
    loop.markDirty()
  }

  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  reportScore()

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const slitherGame: MiniGameDefinition = {
  id: 'slither',
  title: '贪吃蛇大作战 Slither',
  icon: '🐍',
  description: 'slither.io 单机版：吞噬光点变长，加速围堵 AI 蛇——头撞蛇身即死，吃掉战利品。',
  controls: ['鼠标：转向（蛇头朝向指针）', '按住左键 / 空格：加速（消耗长度，尾部吐光点）', 'R：重开 · P：暂停'],
  create: createSlitherGame,
}
