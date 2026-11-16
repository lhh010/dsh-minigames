/**
 * 蛋糕等分 CakeCut 入口：点击两点定一刀（虚线预览吸附到块边交点），
 * 把蛋糕切成面积完全相等的 K 份。切块后两片沿刀线法向微微分开；每块
 * 实时显示面积偏差（超差红显）。H 切换对称辅助线、U 撤回一刀、
 * R 重开本关、P 暂停；过关上报分数并自动进入下一关，进度持久化。
 * dirty 渲染：仅在交互与分离动画期间重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVEL_COUNT, cakeCut, cakeDeviations, cakeUndo, computeScore, createCakeState,
  cutSegments, type Block, type Pt,
} from './logic.ts'
import {
  logicalH, logicalW, renderCake, toWorld, type BlockView, type PreviewView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1800
/** 分离动画位移（画布像素）。 */
const SEP_TARGET = 7
/** 每块分离位移的动画进度（当前值向目标缓动）。 */
interface SepAnim { dx: number; dy: number; cur: number }

function createCakecutGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  // 进度持久化为 1 基；本游戏关卡下标 0 基，且限定在已解锁范围内。
  const maxLevel = Math.min(readLevel('cakecut'), LEVEL_COUNT)
  let levelIndex = maxLevel - 1
  let state = createCakeState(levelIndex, (levelIndex + 1) * 1013)
  let cutAnchor: Pt | null = null
  let mouse: Pt | null = null
  let showGuides = state.level.showGuidesByDefault
  let running = false
  let elapsedSecs = 0
  let shownSec = -1
  let elapsed = '0:00'
  let winText: string | null = null
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScoreLevel = -1
  const particles = createParticles()
  /** 每块分离位移（块 id → 动画状态）。 */
  const seps = new Map<number, SepAnim>()

  const initialFit = fitCanvas(host, canvas, logicalW, logicalH)
  if (initialFit === null) throw new Error('dsh-minigames: cakecut needs a 2d canvas context')
  const fit = initialFit

  const failText = (): string | null => {
    if (state.solved || state.cutsUsed < state.level.cuts) return null
    return '刀已用完，尚未等分'
  }

  /** 新块的分离方向：沿刀线法向，符号取质心所在侧。 */
  const startSeps = (before: Block[], after: Block[], a: Pt, b: Pt): void => {
    const nx = -(b.y - a.y)
    const ny = b.x - a.x
    const len = Math.hypot(nx, ny) || 1
    const beforeIds = new Set(before.map(bl => bl.id))
    for (const blk of after) {
      if (beforeIds.has(blk.id)) continue
      let cx = 0
      let cy = 0
      for (const p of blk.outer) { cx += p.x; cy += p.y }
      cx /= blk.outer.length
      cy /= blk.outer.length
      const sign = (nx * (cy - a.y) - ny * (cx - a.x)) >= 0 ? 1 : -1
      const prev = seps.get(blk.id)
      const baseX = prev === undefined ? 0 : prev.dx
      const baseY = prev === undefined ? 0 : prev.dy
      seps.set(blk.id, { dx: baseX + (sign * nx * SEP_TARGET) / len, dy: baseY + (sign * ny * SEP_TARGET) / len, cur: prev === undefined ? 0 : prev.cur })
    }
  }

  const startLevel = (next: number): void => {
    levelIndex = next
    state = createCakeState(levelIndex, (levelIndex + 1) * 1013)
    cutAnchor = null
    showGuides = state.level.showGuidesByDefault
    elapsedSecs = 0
    shownSec = -1
    elapsed = '0:00'
    winText = null
    seps.clear()
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      const next = levelIndex + 1
      if (next >= LEVEL_COUNT) {
        winText = '全部 5 关完成 · ' + elapsed
        loop.markDirty()
        return
      }
      saveLevel('cakecut', next + 1) // 持久化 1 基
      startLevel(next)
    }, delayMs)
  }

  const checkSolved = (): void => {
    if (state.solved) {
      cutAnchor = null
      winText = '第 ' + (levelIndex + 1) + ' 关完成 · ' + elapsed
      if (levelIndex !== lastScoreLevel) {
        lastScoreLevel = levelIndex
        options?.onScore?.(computeScore(levelIndex, state.level.cuts - state.cutsUsed))
      }
      particles.burst(logicalW / 2, 250, THEME.gold, 22, 170)
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
  }

  const tryCut = (from: Pt, to: Pt): void => {
    const before = state.blocks
    const next = cakeCut(state, from, to)
    cutAnchor = null
    if (next === null) { loop.markDirty(); return }
    startSeps(before, next.blocks, from, to)
    state = next
    checkSolved()
    loop.markDirty()
  }

  const worldFromEvent = (event: PointerEvent): Pt => {
    const rect = canvas.getBoundingClientRect()
    return toWorld(
      ((event.clientX - rect.left) * logicalW) / rect.width,
      ((event.clientY - rect.top) * logicalH) / rect.height,
    )
  }

  const preview = (): PreviewView | null => {
    if (cutAnchor === null || mouse === null || !running || state.solved) return null
    if (Math.hypot(mouse.x - cutAnchor.x, mouse.y - cutAnchor.y) < 1e-6) return null
    const segs = cutSegments(state.blocks, cutAnchor, mouse)
    return { segs, ok: segs.length > 0 }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!running || state.solved) return
    const p = worldFromEvent(event)
    if (cutAnchor === null) {
      cutAnchor = p
    } else {
      tryCut(cutAnchor, p)
    }
    loop.markDirty()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!running || cutAnchor === null) return
    const p = worldFromEvent(event)
    if (mouse === null || Math.hypot(p.x - mouse.x, p.y - mouse.y) > 0.5) {
      mouse = p
      loop.markDirty()
    }
  }

  const onPointerLeave = (): void => {
    mouse = null
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      showGuides = !showGuides
      loop.markDirty()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      if (!running || state.solved) return
      const prev = cakeUndo(state)
      if (prev !== null) {
        state = prev
        cutAnchor = null
        seps.clear()
        loop.markDirty()
      }
    }
  }

  const buildViews = (): BlockView[] => {
    const devs = cakeDeviations(state)
    const tol = state.level.tolerance
    return state.blocks.map((blk, i) => {
      const sep = seps.get(blk.id)
      const k = sep === undefined ? 1 : sep.cur
      const off = sep === undefined ? { x: 0, y: 0 } : { x: sep.dx * k, y: sep.dy * k }
      const dev = devs[i] ?? 0
      const color = accent(i)
      const labelColor = Math.abs(dev) <= tol ? THEME.good : THEME.bad
      const label = (dev >= 0 ? '+' : '') + (dev * 100).toFixed(1) + '%'
      return { block: blk, color, offset: off, label, labelColor }
    })
  }

  const draw = (paused: boolean): void => {
    const tol = state.level.tolerance
    renderCake(fit.ctx, {
      blocks: buildViews(),
      outlineCenter: { x: 0, y: 0 },
      guides: state.level.guides,
      showGuides,
      preview: paused ? null : preview(),
      hud: {
        levelName: state.level.name,
        levelIndex,
        cutsLeft: state.level.cuts - state.cutsUsed,
        piecesNow: state.blocks.length,
        piecesTarget: state.level.pieces,
        tolerancePct: (tol * 100).toFixed(1) + '%',
        time: elapsed,
        failText: failText(),
      },
      paused,
      winText,
    })
  }

  const loop = createFrameLoop(f => {
    if (running && !state.solved) {
      elapsedSecs += f.dt
      const secs = Math.floor(elapsedSecs)
      if (secs !== shownSec) {
        shownSec = secs
        elapsed = String(Math.floor(secs / 60)) + ':' + String(secs % 60).padStart(2, '0')
        loop.markDirty()
      }
    }
    // 分离动画推进（cur → 1 缓动）。
    let animating = false
    for (const sep of seps.values()) {
      if (sep.cur < 1) {
        sep.cur = Math.min(1, sep.cur + f.dt * 5)
        animating = true
      }
    }
    const particlesActive = particles.size() > 0
    if (f.render || animating || particlesActive) {
      draw(false)
      particles.tick(fit.ctx, f.dt * 1000)
      if (animating || particlesActive) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    cutAnchor = null
    mouse = null
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
    if (advanceRemaining > 0 && state.solved) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
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
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const cakecutGame: MiniGameDefinition = {
  id: 'cakecut',
  title: '蛋糕等分 CakeCut',
  icon: '🍰',
  description: '有限的刀数把蛋糕切成完全等份——几何直觉就是你的刀工。',
  controls: [
    '点击两点定一刀（虚线预览吸附到刀路）',
    'H：对称辅助线 · U：撤回一刀',
    'R：重开本关 · P：暂停',
  ],
  create: createCakecutGame,
}
