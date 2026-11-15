/**
 * 百变拼图 Jigsaw 游戏定义：把纯拼图逻辑接成 {@link MiniGameInstance} ——
 * 指针拖拽碎片到盘面（距离 + 角度双条件吸附，成功迸发粒子），点击选中后
 * 空格/T 旋转当前碎片（R 已被重开占用，旋转备用 T），G 提示自动放置一块，
 * R 重开整局（新种子），P 暂停。五关递进（16→36 块，第 3 关起需要旋转
 * 对齐），过关按 computeScore 累计总分并通过 onScore 上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  buildPatternScene, computeScore, createLevel, hintPlace, isComplete,
  cyclePiece, targetCenter, tryPlace,
  LEVELS, LOGICAL_H, LOGICAL_W,
  type JigsawState,
} from './logic.ts'
import { makeSparks, pieceHit, renderJigsaw, type JigsawSpark, type JigsawView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const SPARK_COUNT = 14

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createJigsawGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: jigsaw needs a 2d canvas context')
  const ctx = fit.ctx

  let runSeed = nextSeed()
  let state: JigsawState = createLevel(1, runSeed)
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
  let sparks: JigsawSpark[] = []

  const reportScore = (): void => {
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 本关图案场景（与散布一样由 runSeed + 关卡号确定）。 */
  const sceneFor = (s: JigsawState): ReturnType<typeof buildPatternScene> =>
    buildPatternScene((s.seed ^ Math.imul(s.level, 0x51ab1e)) >>> 0)

  const startLevel = (level: number, seed: number): void => {
    runSeed = seed
    state = createLevel(level, seed)
    selected = null
    dragging = false
    cleared = false
    complete = false
    sparks = []
    lastSecond = -1
    loop.markDirty()
  }

  const restart = (): void => {
    score = 0
    reportScore()
    startLevel(1, nextSeed())
  }

  /** 吸附/提示成功后的公共收尾：粒子 + 过关判定。 */
  const afterPlaced = (id: number): void => {
    const p = state.pieces.find((q) => q.id === id)
    if (p === undefined) return
    const t = targetCenter(state.size, p.row, p.col)
    sparks = [...sparks, ...makeSparks(t.x, t.y, SPARK_COUNT, THEME.good)]
    if (isComplete(state) && !cleared) {
      cleared = true
      score += computeScore(state.level, state.elapsedMs, state.moves)
      reportScore()
      sparks = [...sparks, ...makeSparks(LOGICAL_W / 2, LOGICAL_H / 2, SPARK_COUNT, THEME.gold)]
    }
    loop.markDirty()
  }

  /** 旋转当前选中的碎片（计步）。 */
  const rotateSelected = (): void => {
    if (cleared || complete || paused || !running) return
    if (selected === null) return
    const p = state.pieces.find((q) => q.id === selected)
    if (p === undefined || p.placed) return
    cyclePiece(state, selected)
    state.moves += 1
    loop.markDirty()
  }

  /** G：提示放置编号最小的未归位碎片（计步 + 计分惩罚已含在 moves）。 */
  const hint = (): void => {
    if (cleared || complete || paused || !running) return
    const id = hintPlace(state)
    if (id === null) return
    state.moves += 1
    afterPlaced(id)
  }

  /** 空格：进行中旋转选中碎片；过关进下一关；通关整局重来。 */
  const advance = (): void => {
    if (paused || !running) return
    if (!cleared && !complete) {
      rotateSelected()
      return
    }
    if (complete) {
      restart()
      return
    }
    if (state.level + 1 > LEVELS.length) {
      complete = true
    } else {
      startLevel(state.level + 1, runSeed)
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
    if (hit === null) return
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
      if (tryPlace(state, selected)) afterPlaced(selected)
      else loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space' || event.code === 'KeyT') {
      event.preventDefault()
      advance()
      return
    }
    if (event.code === 'KeyG') {
      event.preventDefault()
      hint()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const view = (): JigsawView => ({
    state,
    scene: sceneFor(state),
    selected,
    dragging,
    sparks,
    score,
    cleared,
    complete,
    paused,
  })

  // 脏标记渲染：静态盘面只在状态/粒子/秒表变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    let animating = false
    if (sparks.length > 0) {
      const dt = f.dt
      sparks = sparks.filter((s) => s.life + dtMs < s.maxLife)
      for (const s of sparks) {
        s.life += dtMs
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vy += 260 * dt
      }
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
      renderJigsaw(ctx, view())
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    dragging = false
    loop.pause()
    renderJigsaw(ctx, view())
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
  focusGameHost(host)
  running = true
  loop.start()
  renderJigsaw(ctx, view())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

/** 百变拼图游戏定义（注册于 games/index.ts）。 */
export const jigsawGame: MiniGameDefinition = {
  id: 'jigsaw',
  title: '百变拼图 Jigsaw',
  icon: '🧷',
  description: '碎片散落一桌，拼回完整的图案——咬合的手感与完成的满足。',
  controls: [
    '拖拽：把碎片拖到盘面（近了自动吸附）',
    '点击选中 · 空格 / T：旋转当前碎片',
    'G：提示放置一块 · R：重开 · P：暂停',
  ],
  create: createJigsawGame,
}
