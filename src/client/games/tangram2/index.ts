/**
 * 七巧拼图 Tangram2 游戏定义：把纯拼图逻辑接成 MiniGameInstance ——
 * 指针拖拽板块到剪影（顶点集合容差匹配自动吸附，成功迸发粒子），点击
 * 选中后 R 旋转 45°、F 翻转（平行四边形需要），G 提示放置一块，短按 R
 * 旋转选中板、长按 R 重开整局（新种子），P 暂停。5 关递进（方块 ->
 * 房子 -> 城墙 -> 帆船 -> 兔子），过关按 computeScore 累计总分并通过
 * onScore 上报。dirty 按需渲染（见 frame-scheduler）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  computeScore, createLevel, cycleRotation, hintPlace, isLevelClear,
  tryPlace, toggleFlip, LEVEL_FIGURES, LOGICAL_H, LOGICAL_W,
  type TangramState,
} from './logic.ts'
import { pieceHit, renderTangram, type TangramView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 短按 R 的判定窗口：按住超过此时长（毫秒）视为重开。 */
const HOLD_RESTART_MS = 650

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createTangramGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: tangram2 needs a 2d canvas context')
  const ctx = fit.ctx

  let state: TangramState = createLevel(1, nextSeed())
  let selected: number | null = null
  let dragging = false
  let dragOffX = 0
  let dragOffY = 0
  let cleared = false
  let complete = false
  let paused = false
  let running = false
  let score = 0
  let lastScore = -1
  let lastSecond = -1
  const particles = createParticles()

  /** R 长按状态：keydown 记起点并起定时器，短按 keyup 旋转，长按重开。 */
  let rDownAt = 0
  let rHoldTimer = 0
  let rHoldFired = false

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const startLevel = (level: number, seed: number): void => {
    state = createLevel(level, seed)
    selected = null
    dragging = false
    cleared = false
    lastSecond = -1
    loop.markDirty()
  }

  const restart = (): void => {
    score = 0
    reportScore()
    complete = false
    paused = false
    startLevel(1, nextSeed())
  }

  /** 放置成功后的公共收尾：粒子 + 过关计分。 */
  const afterPlaced = (id: number): void => {
    const piece = state.pieces.find((q) => q.id === id)
    if (piece !== undefined) particles.burst(piece.x, piece.y, pieceColorOf(id), 12)
    if (isLevelClear(state) && !cleared) {
      cleared = true
      score += computeScore(state.level, state.elapsedMs, state.moves)
      reportScore()
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 18)
    }
    loop.markDirty()
  }

  const pieceColorOf = (id: number): string => THEME.accents[id % THEME.accents.length]!

  /** 短按 R：旋转当前选中的未放置板（计步）。 */
  const rotateSelected = (): void => {
    if (cleared || complete || paused || !running) return
    if (selected === null) return
    const piece = state.pieces.find((q) => q.id === selected)
    if (piece === undefined || piece.placed) return
    cycleRotation(state, selected)
    state.moves += 1
    loop.markDirty()
  }

  /** F：翻转当前选中的未放置板（计步）。 */
  const flipSelected = (): void => {
    if (cleared || complete || paused || !running) return
    if (selected === null) return
    const piece = state.pieces.find((q) => q.id === selected)
    if (piece === undefined || piece.placed) return
    toggleFlip(state, selected)
    state.moves += 1
    loop.markDirty()
  }

  /** G：提示放置一块正确的板（计步惩罚已含在 moves）。 */
  const hint = (): void => {
    if (cleared || complete || paused || !running) return
    const id = hintPlace(state)
    if (id === null) return
    selected = null
    state.moves += 1
    afterPlaced(id)
  }

  /** 空格：过关进下一关；全部通关后按空格不动作（R 重开）。 */
  const advance = (): void => {
    if (paused || !running) return
    if (!cleared) return
    if (state.level + 1 > LEVEL_FIGURES.length) {
      complete = true
    } else {
      startLevel(state.level + 1, state.seed)
    }
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (cleared || complete) return
    paused = !paused
    loop.markDirty()
  }

  const toLogical = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || paused || cleared || complete) return
    focusGameHost(host)
    const p = toLogical(event)
    const hit = pieceHit(p.x, p.y, state)
    if (hit === null) {
      selected = null
      loop.markDirty()
      return
    }
    event.preventDefault()
    selected = hit
    dragging = true
    const piece = state.pieces.find((q) => q.id === hit)!
    dragOffX = piece.x - p.x
    dragOffY = piece.y - p.y
    canvas.setPointerCapture(event.pointerId)
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || selected === null || !running || paused) return
    const p = toLogical(event)
    const piece = state.pieces.find((q) => q.id === selected)
    if (piece === undefined) return
    piece.x = Math.min(LOGICAL_W - 8, Math.max(8, p.x + dragOffX))
    piece.y = Math.min(LOGICAL_H - 8, Math.max(8, p.y + dragOffY))
    loop.markDirty()
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragging) return
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    dragging = false
    if (selected !== null) {
      state.moves += 1
      if (tryPlace(state, selected)) {
        const piece = state.pieces.find((q) => q.id === selected)!
        selected = null
        afterPlaced(piece.id)
      } else {
        loop.markDirty()
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      if (event.repeat) return
      rDownAt = Date.now()
      rHoldFired = false
      rHoldTimer = window.setTimeout(() => {
        if (Date.now() - rDownAt >= HOLD_RESTART_MS) {
          rHoldFired = true
          restart()
        }
      }, HOLD_RESTART_MS)
      return
    }
    if (event.code === 'KeyF') {
      event.preventDefault()
      flipSelected()
      return
    }
    if (event.code === 'KeyG') {
      event.preventDefault()
      hint()
      return
    }
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      advance()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyR') return
    if (rHoldTimer !== 0) {
      window.clearTimeout(rHoldTimer)
      rHoldTimer = 0
    }
    if (rHoldFired) {
      rHoldFired = false
      return
    }
    rotateSelected()
  }

  const view = (): TangramView => ({ state, selected, dragging, score, cleared, complete, paused })

  // 脏标记渲染：静态盘面只在状态 / 粒子 / 秒表变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    let animating = false
    if (particles.size() > 0) {
      particles.tick(ctx, dtMs)
      animating = true
    }
    if (running && !paused && !cleared && !complete) {
      state.elapsedMs += dtMs
      const second = Math.floor(state.elapsedMs / 1000)
      if (second !== lastSecond) {
        lastSecond = second
        animating = true
      }
    }
    if (f.render || animating) {
      renderTangram(ctx, view())
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    dragging = false
    loop.pause()
    renderTangram(ctx, view())
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }

  reportScore()

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  renderTangram(ctx, view())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      if (rHoldTimer !== 0) window.clearTimeout(rHoldTimer)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

/** 七巧拼图游戏定义（注册于 games/index.ts）。 */
export const tangram2Game: MiniGameDefinition = {
  id: 'tangram2',
  title: '七巧拼图 Tangram2',
  icon: '🔷',
  description: '七块板拼出剪影——旋转翻转全靠脑补，经典中的经典。',
  controls: [
    '拖拽：把板块拖进剪影（姿态对了自动吸附）',
    '点击选中 · R：旋转 45° · F：翻转',
    'G：提示放一块 · 长按 R：重开 · P：暂停',
  ],
  create: createTangramGame,
}
