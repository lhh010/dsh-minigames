/**
 * 真珠回路游戏定义：把纯逻辑接入 {@link MiniGameInstance}。点击格边
 * 切换画线；H 提示（闪一条应画边，弃时间奖励）；R 重开本关；P 暂停；
 * [ / ] 在已解锁关卡间切换。关卡进度经共享 level-progress 持久化
 * （'masyu'），重挂载从上次进度继续。内部关卡索引 0 基、展示与持久
 * 化 1 基。渲染走脏标记帧循环：输入、悬停、提示闪烁、完成动画或
 * 粒子活跃时才置脏重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVEL_SIZES, computeScore, edgeCount, isWon, puzzleFromSeed,
  type EdgeState, type MasyuPuzzle,
} from './logic.ts'
import { renderMasyu, logicalW, logicalH, edgeAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1600
/** 提示边闪烁时长。 */
const HINT_MS = 1600
/** 完成发光动画时长。 */
const WIN_ANIM_MS = 4000

function createMasyuGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 持久化关卡 1 基；本游戏内部 0 基。
  let level = readLevel('masyu') - 1
  let puzzle: MasyuPuzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, LEVEL_SIZES[level % LEVEL_SIZES.length]!, LEVEL_SIZES[level % LEVEL_SIZES.length]!)
  let edges: EdgeState[] = new Array<EdgeState>(edgeCount(puzzle.w, puzzle.h)).fill(0)
  let hover = -1
  let solved = false
  let running = false
  let startedAt = 0
  let pausedAt = 0
  let elapsed = '0:00'
  /** HUD 当前已显示的整秒数（按秒置脏）。 */
  let shownSec = -1
  let solvedAt = 0
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let hintEdge = -1
  let hintUntil = 0
  let hintUsed = false
  let lastScore = -1
  const particles = createParticles()
  const initialFit = fitCanvas(host, canvas, logicalW(puzzle.w), logicalH(puzzle.h))
  if (initialFit === null) throw new Error('dsh-minigames: masyu needs a 2d canvas context')
  let fit = initialFit
  let ctx = fit.ctx

  const refit = (w: number, h: number): void => {
    fit.dispose()
    const next = fitCanvas(host, canvas, logicalW(w), logicalH(h))
    if (next === null) throw new Error('dsh-minigames: masyu needs a 2d canvas context')
    fit = next
    ctx = next.ctx
  }

  const startLevel = (next: number): void => {
    level = next
    const size = LEVEL_SIZES[level % LEVEL_SIZES.length]!
    puzzle = puzzleFromSeed((level + 1) * 0x9e3779b9, size, size)
    edges = new Array<EdgeState>(edgeCount(size, size)).fill(0)
    solved = false
    hover = -1
    hintEdge = -1
    hintUntil = 0
    hintUsed = false
    startedAt = performance.now()
    shownSec = -1
    refit(size, size)
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = level + 1
      saveLevel('masyu', next + 1)
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (solved || !isWon(edges, puzzle.pearls, puzzle.w, puzzle.h)) return
    solved = true
    solvedAt = performance.now()
    if (level + 1 !== lastScore) {
      lastScore = level + 1
      options?.onScore?.(computeScore(level + 1, (performance.now() - startedAt) / 1000, hintUsed))
    }
    const cx = logicalW(puzzle.w) / 2
    const cy = logicalH(puzzle.h) / 2
    particles.burst(cx, cy, THEME.gold, 18, 170)
    loop.markDirty()
    if (running) scheduleAdvance(ADVANCE_MS)
    else advanceRemaining = ADVANCE_MS
  }

  const toggleEdge = (i: number): void => {
    if (solved || i < 0 || i >= edges.length) return
    edges[i] = (edges[i] === 1 ? 0 : 1) as EdgeState
    loop.markDirty()
    checkSolved()
  }

  const pointerEdge = (event: MouseEvent): number => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * logicalW(puzzle.w)) / rect.width
    const y = ((event.clientY - rect.top) * logicalH(puzzle.h)) / rect.height
    return edgeAt(puzzle.w, puzzle.h, x, y)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    toggleEdge(pointerEdge(event))
  }

  const onContextMenu = (event: MouseEvent): void => { event.preventDefault() }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running) return
    const next = pointerEdge(event)
    if (next !== hover) {
      hover = next
      loop.markDirty()
    }
  }

  const doHint = (): void => {
    if (solved) return
    for (let i = 0; i < puzzle.solution.length; i += 1) {
      if (puzzle.solution[i] === 1 && edges[i] !== 1) {
        hintEdge = i
        hintUntil = performance.now() + HINT_MS
        hintUsed = true
        loop.markDirty()
        return
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      doHint()
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      const max = readLevel('masyu') - 1
      const next = level + (event.code === 'BracketRight' ? 1 : -1)
      if (next >= 0 && next <= max) startLevel(next)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const draw = (paused: boolean): void => {
    const now = performance.now()
    renderMasyu(ctx, {
      w: puzzle.w, h: puzzle.h, pearls: puzzle.pearls, edges, hover,
      hintEdge, hintAlpha: hintUntil > now ? 0.4 + 0.6 * Math.abs(Math.sin(now / 130)) : 0,
      levelLabel: '第 ' + (level + 1) + ' 关', unique: puzzle.unique, elapsed,
      solved, solvedPulse: solved ? Math.abs(Math.sin((now - solvedAt) / 190)) : 0,
      paused,
    })
  }

  // 脏标记渲染：提示闪烁、完成发光动画与粒子期间持续置脏。
  const loop = createFrameLoop(f => {
    const now = performance.now()
    if (!solved && startedAt > 0) {
      const secs = Math.floor((now - startedAt) / 1000)
      if (secs !== shownSec) {
        shownSec = secs
        elapsed = String(Math.floor(secs / 60)) + ':' + String(secs % 60).padStart(2, '0')
        loop.markDirty()
      }
    }
    const animating = particles.size() > 0
    if (hintUntil > now || (solved && now - solvedAt < WIN_ANIM_MS)) loop.markDirty()
    if (f.render || animating) {
      draw(false)
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
    pausedAt = performance.now()
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    draw(true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (pausedAt > 0) {
      startedAt += performance.now() - pausedAt
      pausedAt = 0
    }
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startedAt = performance.now()
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const masyuGame: MiniGameDefinition = {
  id: 'masyu',
  title: '真珠回路 Masyu',
  icon: '🌀',
  description: '画一条不交叉的闭合回路：白珠直行必须转弯、黑珠转弯必须直行——纯逻辑推理。',
  controls: ['左键点击格边：画线/取消', 'H：提示（闪一条应画边，弃时间奖励）', 'R：重开本关', '[ ]：切换关卡（已通关范围）', 'P：暂停'],
  create: createMasyuGame,
}
