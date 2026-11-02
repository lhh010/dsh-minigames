/**
 * 黑洞吞噬游戏定义：把确定性引擎接成 {@link MiniGameInstance}——指针
 * 移动（黑洞朝指针匀速逼近）、R 重开（同 seed 换局号）、P 暂停；
 * continuous 帧循环内以固定步长累积器推进模拟（每帧至多补 3 个 tick），
 * 摄像机平滑跟随玩家洞。吞数即分数，经 onScore 上报；里程碑/咬合事件
 * 转浮字与粒子。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { TICK, createHole, stepHole, type HoleState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, renderHole, type FloatText } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 每局种子：挂载时取一次，重开换新局号但同一天内可复现。 */
function dailySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 单帧最多补的固定步数（防卡顿后追帧过猛）。 */
const MAX_STEPS_PER_FRAME = 3
/** 浮字存活时长（秒，与渲染层 age 淡出公式匹配）。 */
const FLOAT_LIFETIME = 1.6

function createHoleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: hole needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = dailySeed()
  let round = 0
  let state: HoleState = createHole(seed, round)
  let running = false
  let lastScore = -1
  let acc = 0
  let clock = 0
  const cam = { x: state.holes[0]!.x, y: state.holes[0]!.y }
  const pointer = { x: LOGICAL_W / 2, y: LOGICAL_H / 2, active: false }
  const particles = createParticles()
  let floats: FloatText[] = []

  const pointerFromEvent = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    pointer.y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    pointer.active = true
  }

  /** 逻辑事件 -> 浮字（世界坐标）与粒子（屏幕坐标）。 */
  const consumeEvents = (): void => {
    for (const e of state.events) {
      if (e.type === 'milestone') {
        floats.push({ x: e.x, y: e.y, text: e.text, age: 0 })
        particles.burst(e.x - cam.x + LOGICAL_W / 2, e.y - cam.y + LOGICAL_H / 2, THEME.gold, 18, 200)
      } else if (e.type === 'bite') {
        particles.burst(e.x - cam.x + LOGICAL_W / 2, e.y - cam.y + LOGICAL_H / 2, THEME.bad, 14, 180)
      }
    }
  }

  const reportScore = (): void => {
    const score = state.holes[0]!.eaten
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const reset = (): void => {
    round += 1
    state = createHole(seed, round)
    const p = state.holes[0]!
    cam.x = p.x
    cam.y = p.y
    acc = 0
    lastScore = -1
    floats = []
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      reset()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }
  const onMouseMove = (event: MouseEvent): void => pointerFromEvent(event)
  const onMouseDown = (event: MouseEvent): void => pointerFromEvent(event)
  const onMouseLeave = (): void => {
    pointer.active = false
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    clock += f.dt
    acc += f.dt
    let steps = 0
    while (acc >= TICK && steps < MAX_STEPS_PER_FRAME) {
      const p = state.holes[0]!
      // 指针 inactive 时目标 = 自身（原地等待）。
      const tx = pointer.active ? cam.x + pointer.x - LOGICAL_W / 2 : p.x
      const ty = pointer.active ? cam.y + pointer.y - LOGICAL_H / 2 : p.y
      stepHole(state, { targetX: tx, targetY: ty })
      consumeEvents()
      acc -= TICK
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0
    const p = state.holes[0]!
    const k = Math.min(1, f.dt * 6)
    cam.x += (p.x - cam.x) * k
    cam.y += (p.y - cam.y) * k
    // 浮字推进与回收。
    for (const fl of floats) fl.age += f.dt / FLOAT_LIFETIME
    floats = floats.filter(fl => fl.age < 1)
    reportScore()
    if (f.render || particles.size() > 0) {
      renderHole(ctx, state, { camX: cam.x, camY: cam.y, time: clock, paused: false, floats })
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame)

  const pauseFrame = (): void => {
    renderHole(ctx, state, { camX: cam.x, camY: cam.y, time: clock, paused: true, floats })
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
  canvas.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('keydown', onKeyDown)
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
      canvas.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const holeGame: MiniGameDefinition = {
  id: 'hole',
  title: '黑洞吞噬 Hole.io',
  icon: '🕳️',
  description: '操纵街道上的黑洞：能吞的都吞，越吞越大——两分钟内长成吞噬整座城的天坑。',
  controls: ['鼠标：黑洞朝指针匀速移动', 'R：重开 · P：暂停'],
  create: createHoleGame,
}
