/**
 * 七巧板 Tangram 游戏定义：把纯逻辑接入 {@link MiniGameInstance}。指针拖拽
 * 移动板块（可从左侧托盘拖到右侧剪影），Q/E 或滚轮按 45° 步进旋转选中板块，
 * F 翻转平行四边形，数字 1-7 快速选择，R 重开本关（同关卡同种子 → 同布局），
 * P 暂停。全部板块的顶点与质心落入目标区域容差内即过关，过关后上报分数并
 * 1.8s 自动进入下一关（剪影复杂度递进，5 关循环）；最高关卡进度持久化。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createLevel, piecePoly, polygonCentroid, setPose, LOGICAL_H, LOGICAL_W } from './logic.ts'
import { pieceAt, renderTangram } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createParticles, THEME } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1800

function createTangramGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: tangram needs a 2d canvas context')
  const ctx = fit.ctx

  // 关卡记忆：从历史最高关卡继续；种子随关卡确定，重开同关得到同一布局。
  const seedFor = (level: number): number => Math.imul(level, 0x9e3779b9) >>> 0
  let level = readLevel('tangram')
  let state = createLevel(level, seedFor(level))
  let selected: number | null = null
  let dragging = false
  let dragOffX = 0
  let dragOffY = 0
  let running = false
  let winText: string | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = next
    saveLevel('tangram', level)
    state = createLevel(level, seedFor(level))
    selected = null
    dragging = false
    winText = null
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  /** 拖放结束：重算就位；全部就位即过关。 */
  const drop = (): void => {
    if (!dragging) return
    dragging = false
    loop.markDirty()
    if (selected !== null && state.placed[selected]) {
      const c = polygonCentroid(piecePoly(selected, state.poses[selected]!))
      particles.burst(c.x, c.y, THEME.good, 10, 120)
    }
    if (state.won && winText === null) {
      winText = state.moves + ' 步操作 · ' + state.name + ' 完成'
      reportScore()
      particles.burst(LOGICAL_W / 2 + 60, LOGICAL_H / 2, THEME.gold, 18, 160)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
  }

  /** 离散操作（旋转/翻转）也会计步并即时重算。 */
  const applyPose = (index: number, next: { rot?: number; flip?: boolean }): void => {
    if (winText !== null) return
    const pose = state.poses[index]!
    state = setPose(state, index, {
      x: pose.x,
      y: pose.y,
      rot: next.rot === undefined ? pose.rot : next.rot,
      flip: next.flip === undefined ? pose.flip : next.flip,
    }, true)
    loop.markDirty()
    if (state.won && winText === null) {
      winText = state.moves + ' 步操作 · ' + state.name + ' 完成'
      reportScore()
      particles.burst(LOGICAL_W / 2 + 60, LOGICAL_H / 2, THEME.gold, 18, 160)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
  }

  const rotate = (delta: number): void => {
    if (selected === null || !running) return
    applyPose(selected, { rot: state.poses[selected]!.rot + delta })
  }

  const toLogical = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || winText !== null) return
    focusGameHost(host)
    const p = toLogical(event)
    const hit = pieceAt(p.x, p.y, state)
    if (hit === null) return
    event.preventDefault()
    selected = hit
    dragging = true
    const pose = state.poses[hit]!
    dragOffX = pose.x - p.x
    dragOffY = pose.y - p.y
    canvas.setPointerCapture(event.pointerId)
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || selected === null || !running) return
    const p = toLogical(event)
    const pose = state.poses[selected]!
    state = setPose(state, selected, {
      x: p.x + dragOffX,
      y: p.y + dragOffY,
      rot: pose.rot,
      flip: pose.flip,
    })
    loop.markDirty()
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragging) return
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (selected !== null) {
      const pose = state.poses[selected]!
      state = setPose(state, selected, pose, true)
    }
    drop()
  }

  const onWheel = (event: WheelEvent): void => {
    if (!gameHasFocus(host) || !running) return
    event.preventDefault()
    rotate(event.deltaY > 0 ? 1 : -1)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (!running || winText !== null) {
      return
    } else if (event.code === 'KeyQ') {
      event.preventDefault()
      rotate(-1)
    } else if (event.code === 'KeyE') {
      event.preventDefault()
      rotate(1)
    } else if (event.code === 'KeyF') {
      event.preventDefault()
      if (selected !== null) applyPose(selected, { flip: !state.poses[selected]!.flip })
    } else if (event.code.startsWith('Digit')) {
      const n = Number(event.code.slice(5))
      if (n >= 1 && n <= 7) {
        selected = n - 1
        loop.markDirty()
      }
    }
  }

  // 脏标记渲染：静态拼图只在状态或粒子变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const animating = particles.size() > 0
    if (f.render || animating) {
      renderTangram(ctx, LOGICAL_W, LOGICAL_H, state, selected, !running, winText)
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    dragging = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderTangram(ctx, LOGICAL_W, LOGICAL_H, state, selected, true, winText)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
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
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

/** 七巧板游戏定义（注册于 games/index.ts）。 */
export const tangramGame: MiniGameDefinition = {
  id: 'tangram',
  title: '七巧板 Tangram',
  icon: '\ud83e\udde9',
  description: '七块板拼出剪影——拖拽旋转的几何艺术，中式智力经典。',
  controls: [
    '拖拽：移动板块（从托盘拖到剪影）',
    'Q / E / 滚轮：旋转（45\u00b0 步进）',
    'F：翻转平行四边形',
    '1-7：选择板块',
    'R：重开 · P：暂停',
  ],
  create: createTangramGame,
}
