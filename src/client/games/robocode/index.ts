/**
 * 编程机器人 RoboCode 装配层：把纯逻辑与渲染接成 MiniGameInstance——
 * 点击面板插入指令、点击槽位删除、滚轮调循环次数、空格运行/停止、
 * R 重开、P 暂停。运行时按轨迹逐帧播放逐格动画；静止时 dirty 按需重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { runProgram, getLevels, type Dir, type RunResult, type Token } from './logic.ts'
import { renderRobocode, VIEW_W, VIEW_H, paletteHit, slotHit, boardMetrics, type RobocodeView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { createParticles } from '../theme.ts'

/** 中断后自动复位重编的延时 ms。 */
const FAIL_RESET_MS = 1500

function createRobocodeGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (fit === null) throw new Error('dsh-minigames: robocode needs a 2d canvas context')
  const ctx = fit.ctx
  const levels = getLevels()
  let levelIndex = 0

  const freshView = (): RobocodeView => {
    const level = levels[levelIndex]!
    return {
      level,
      tokens: [],
      mode: 'edit',
      paused: false,
      message: '',
      messageTtl: 0,
      chipsLeft: level.chipsTotal,
      collected: [],
      trace: [],
      traceIndex: 0,
      opToken: [],
      animT: 1,
      stepMs: 300,
      from: { x: level.startX, y: level.startY, dir: level.startDir },
      robot: { x: level.startX, y: level.startY, dir: level.startDir },
      time: 0,
      failAt: 0,
      failReason: '',
      particles: createParticles(),
    }
  }
  let view = freshView()
  let running = false
  let paused = false
  let lastRun: RunResult | null = null
  let cleared = 0

  const markDirty = (): void => loop.markDirty()

  /** 回到编辑模式：机器人复位，程序保留供继续修改。 */
  const resetToEdit = (): void => {
    const level = view.level
    view.mode = 'edit'
    view.trace = []
    view.traceIndex = 0
    view.opToken = []
    view.animT = 1
    view.chipsLeft = level.chipsTotal
    view.collected = []
    view.robot = { x: level.startX, y: level.startY, dir: level.startDir }
    view.from = { x: level.startX, y: level.startY, dir: level.startDir }
    markDirty()
  }

  /** 某步开始播放：设置插值端点、时长与事件粒子。 */
  const startStep = (index: number): void => {
    const step = view.trace[index]!
    view.from = { x: view.robot.x, y: view.robot.y, dir: view.robot.dir }
    view.robot = { x: step.x, y: step.y, dir: step.dir }
    view.animT = 0
    view.stepMs = step.event === 'turn' ? 170 : step.event === 'jump' ? 380 : 300
    const m = boardMetrics(view.level)
    const cellCenter = (x: number, y: number): { px: number; py: number } => ({
      px: m.bx + x * m.cell + m.cell / 2,
      py: m.by + y * m.cell + m.cell / 2,
    })
    if (step.event === 'pick') {
      view.chipsLeft -= 1
      view.collected.push(step.y * view.level.w + step.x)
      const p = cellCenter(step.x, step.y)
      view.particles.burst(p.px, p.py, '#e0af68', 14, 150)
    } else if (step.event === 'win') {
      const p = cellCenter(step.x, step.y)
      view.particles.burst(p.px, p.py, '#9ece6a', 26, 190)
    } else if (step.event === 'blocked' || step.event === 'spike' || step.event === 'budget') {
      const p = cellCenter(step.x, step.y)
      view.particles.burst(p.px, p.py, '#f7768e', 12, 130)
    }
  }

  /** 开始运行：校验 + 展开 + 预计算轨迹。 */
  const startRun = (): void => {
    const compiled = runProgram(view.level, view.tokens)
    if (compiled.error !== null || compiled.result === null) {
      view.message = compiled.error ?? '程序无法运行'
      view.messageTtl = 2400
      markDirty()
      return
    }
    if (compiled.result.steps.length === 0) {
      view.message = '程序为空，先点击面板插入指令'
      view.messageTtl = 2400
      markDirty()
      return
    }
    lastRun = compiled.result
    view.mode = 'run'
    view.trace = compiled.result.steps
    view.opToken = compiled.opToken
    view.traceIndex = 0
    view.chipsLeft = view.level.chipsTotal
    view.collected = []
    view.robot = { x: view.level.startX, y: view.level.startY, dir: view.level.startDir }
    startStep(0)
    markDirty()
  }

  /** 一步动画播完：推进到下一步或收尾。 */
  const finishStep = (): void => {
    if (view.traceIndex + 1 < view.trace.length) {
      view.traceIndex += 1
      startStep(view.traceIndex)
      return
    }
    view.traceIndex += 1
    if (lastRun !== null && lastRun.status === 'won') {
      view.mode = 'won'
      cleared += 1
      options?.onScore?.(cleared)
    } else {
      view.mode = 'fail'
      view.failAt = view.time
      view.failReason = lastRun === null ? '' : lastRun.reason
    }
  }

  const nextLevel = (): void => {
    levelIndex = (levelIndex + 1) % levels.length
    view = freshView()
    markDirty()
  }

  const onClick = (event: MouseEvent): void => {
    if (paused || view.mode !== 'edit') return
    const rect = canvas.getBoundingClientRect()
    const px = (event.clientX - rect.left) * (VIEW_W / rect.width)
    const py = (event.clientY - rect.top) * (VIEW_H / rect.height)
    const pick = paletteHit(px, py)
    if (pick !== null) {
      if (pick === 'clear') {
        view.tokens = []
      } else if (view.tokens.length < view.level.maxSlots) {
        view.tokens.push(pick)
      } else {
        view.message = '指令槽位已满（' + String(view.level.maxSlots + ' 个）')
        view.messageTtl = 1800
      }
      markDirty()
      return
    }
    const slot = slotHit(px, py, view.tokens.length)
    if (slot >= 0 && slot < view.tokens.length) {
      view.tokens.splice(slot, 1)
      markDirty()
    }
  }

  const onWheel = (event: WheelEvent): void => {
    if (paused || view.mode !== 'edit') return
    const rect = canvas.getBoundingClientRect()
    const px = (event.clientX - rect.left) * (VIEW_W / rect.width)
    const py = (event.clientY - rect.top) * (VIEW_H / rect.height)
    const slot = slotHit(px, py, view.tokens.length)
    const token = slot >= 0 ? view.tokens[slot] : undefined
    if (slot >= 0 && typeof token === 'object') {
      event.preventDefault()
      token.loop = (token.loop % 8) + 1
      markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (paused) return
      if (view.mode === 'edit') startRun()
      else if (view.mode === 'run') resetToEdit()
      else if (view.mode === 'won') nextLevel()
      else resetToEdit()
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      if (view.mode === 'won') {
        nextLevelIndexReset()
      } else {
        resetToEdit()
      }
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  /** R 在过关 overlay 上等价重开本关（不推进关卡）。 */
  const nextLevelIndexReset = (): void => {
    view = freshView()
    markDirty()
  }

  const frame = (f: FrameInfo): void => {
    if (paused) {
      if (f.render) renderRobocode(ctx, view, 0)
      return
    }
    const dtMs = Math.min(f.dt * 1000, 50)
    view.time += dtMs
    let dirty = false
    if (view.messageTtl > 0) {
      view.messageTtl -= dtMs
      if (view.messageTtl <= 0) view.message = ''
      dirty = true
    }
    if (view.mode === 'run') {
      view.animT += dtMs / view.stepMs
      dirty = true
      while (view.animT >= 1 && view.mode === 'run') {
        view.animT -= 1
        finishStep()
      }
    } else if (view.mode === 'fail') {
      if (view.time - view.failAt >= FAIL_RESET_MS) resetToEdit()
      dirty = true
    }
    if (view.particles.size() > 0) dirty = true
    if (dirty) markDirty()
    if (f.render) renderRobocode(ctx, view, dtMs)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })
  const togglePause = (): void => {
    paused = !paused
    view.paused = paused
    markDirty()
  }
  const pause = (): void => {
    if (paused) return
    paused = true
    view.paused = true
    markDirty()
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    view.paused = false
    markDirty()
  }

  canvas.addEventListener('click', onClick)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderRobocode(ctx, view, 0)

  return {
    start: (): void => {
      if (running) return
      running = true
      loop.start()
    },
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const robocodeGame: MiniGameDefinition = {
  id: 'robocode',
  title: '编程机器人 RoboCode',
  icon: '🤖',
  description: '拖指令、编程序，让机器人自己走出迷宫点亮所有芯片——像写代码一样玩游戏。',
  controls: [
    '指令说明：F＝前进一格 · L＝左转 90° · R＝右转 90° · J＝跳跃（越过一格坑/尖刺）· F2＝前进两格',
    '⟲n…end＝循环块（重复其间指令 n 次，可嵌套两层；滚轮调 n）',
    '玩法：点击面板插入指令 → 空格运行 → 撞墙/踩尖刺会中断，收齐全部芯片后进入 ★ 终点过关',
    '点击槽位：删除 · 空格：运行/停止 · R：重开 · P：暂停',
  ],
  create: createRobocodeGame,
}
