/**
 * 蛇界争霸游戏定义：把确定性引擎接成 {@link MiniGameInstance}——
 * 左右键 / A D 转向、上键 / W / 空格加速（消耗长度吐光点）、continuous
 * 帧循环内以固定步长累积器推进模拟（每帧至多补 3 个 tick），死亡事件用
 * 共享粒子系统爆光。R 重开（同 seed 换局号）、P 暂停；分数（=长度）经
 * onScore 上报，死亡 / 吃鸡时上报峰值长度加击杀加成。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import { CX, CY, TICK, createSnakeio, stepSnakeio, type IoInput, type IoState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderSnakeio } from './render.ts'
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

function createSnakeioGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: snakeio needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: IoState = createSnakeio(seed, round)
  let running = false
  let lastScore = -1
  let acc = 0
  const cam = { x: CX, y: CY }
  const steer = { turn: 0 as -1 | 0 | 1 }
  let boostKey = false
  const particles = createParticles()

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
    const score = player.alive
      ? Math.floor(Math.max(0, player.length))
      : Math.floor(player.peak) + player.kills * 15
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const reset = (): void => {
    round += 1
    state = createSnakeio(seed, round)
    const p = state.snakes[0]!
    cam.x = p.x
    cam.y = p.y
    acc = 0
    lastScore = -1
    boostKey = false
    steer.turn = 0
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault()
      steer.turn = -1
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault()
      steer.turn = 1
    } else if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Space') {
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
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      if (steer.turn === -1) steer.turn = 0
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      if (steer.turn === 1) steer.turn = 0
    } else if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Space') {
      boostKey = false
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    acc += f.dt
    let steps = 0
    while (acc >= TICK && steps < MAX_STEPS_PER_FRAME) {
      const input: IoInput = { turn: steer.turn, boost: boostKey }
      stepSnakeio(state, input)
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
      renderSnakeio(ctx, state, { camX: cam.x, camY: cam.y, paused: false })
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame)

  const pauseFrame = (): void => {
    renderSnakeio(ctx, state, { camX: cam.x, camY: cam.y, paused: true })
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
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const snakeioGame: MiniGameDefinition = {
  id: 'snakeio',
  title: '蛇界争霸 Snake.io',
  icon: '🐍',
  description: '改良贪吃蛇：吃光点变长，撞 AI 蛇即死——活到最后吃鸡。',
  controls: ['← → / A D：转向', '按住 ↑ / W / 空格：加速（消耗长度，尾部吐光点）', 'R：重开 · P：暂停'],
  create: createSnakeioGame,
}
