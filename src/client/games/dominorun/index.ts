/**
 * 多米诺连锁 DominoRun 游戏定义：把纯逻辑连锁模拟接成
 * {@link MiniGameInstance}。建造期（dirty 按需渲染）：点击空位放置当前
 * 选中件型、右键移回库存、数字键 1/2/3 切换件型、U 撤回。空格从起点
 * 推倒进入连锁动画（continuous 逐帧渲染，固定拍长步进 logic.stepChain）：
 * 逐牌倒下旋转波浪，撞响铃铛 = 过关上报 onScore，链断 = 失败，空格回
 * 建造期重摆。R 重开本关、P 暂停。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LEVELS,
  createGameState,
  inventoryLeft,
  levelFor,
  pipColors,
  placePiece,
  removePiece,
  resetToBuild,
  scoreFor,
  startChain,
  stepChain,
  undo,
  type PieceType,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, columnAt, geometry, renderScene, type DominoView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

/** 连锁一拍时长（毫秒）：每拍推进一次 stepChain。 */
const BEAT_MS = 150
/** 每关固定种子（关卡为手工关卡；种子只决定骨牌彩点等装饰，确定性）。 */
const LEVEL_SEED = 20261116

function createDominoRunGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: dominorun needs a 2d canvas context')
  const ctx = fit.ctx

  let state = createGameState(Math.min(readLevel('dominorun'), LEVELS.length) - 1, LEVEL_SEED)
  let selectedType: PieceType = 'domino'
  let hoverX: number | null = null
  let paused = false
  let running = false
  let beatAccumMs = 0
  let animMs = 0
  let score: number | null = null
  let bestScore = -1
  let lastReported = -1
  const particles = createParticles()

  const view = (): DominoView => {
    const level = levelFor(state.levelIndex)
    return {
      level,
      levelIndex: state.levelIndex,
      pieces: [...state.pieces.values()],
      phase: state.phase,
      fallen: state.chain === null ? [] : [...state.chain.fallen],
      outcome: state.outcome,
      paused,
      hoverX,
      selectedType,
      left: inventoryLeft(state),
      pips: pipColors(level, LEVEL_SEED),
      animMs,
      score,
    }
  }

  const reportScore = (): void => {
    if (bestScore <= lastReported) return
    lastReported = bestScore
    options?.onScore?.(bestScore)
  }

  /** 开始 / 重开某一关（清空盘面回到建造期）。 */
  const startLevel = (index: number): void => {
    const clamped = Math.min(Math.max(index, 0), LEVELS.length - 1)
    saveLevel('dominorun', clamped + 1)
    state = createGameState(clamped, LEVEL_SEED)
    hoverX = null
    paused = false
    beatAccumMs = 0
    animMs = 0
    score = null
    chainLoop.pause()
    buildLoop.markDirty()
    buildLoop.start()
  }

  const toLogical = (event: MouseEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused || state.phase !== 'build') return
    const p = toLogical(event)
    const col = columnAt(view().level, p.x, p.y)
    if (col === null) return
    if (event.button === 2 || event.shiftKey) {
      removePiece(state, col)
    } else {
      placePiece(state, col, selectedType)
    }
    buildLoop.markDirty()
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    if (!running || paused || state.phase !== 'build') return
    const p = toLogical(event)
    const col = columnAt(view().level, p.x, p.y)
    if (col !== null) removePiece(state, col)
    buildLoop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running || state.phase !== 'build') return
    const p = toLogical(event)
    const col = columnAt(view().level, p.x, p.y)
    if (col === hoverX) return
    hoverX = col
    buildLoop.markDirty()
  }

  /** 空格：建造期 → 推倒开始连锁；连锁终态（过关 / 链断）→ 回建造期。 */
  const onSpace = (): void => {
    if (!running || paused) return
    if (state.phase === 'build') {
      startChain(state)
      beatAccumMs = 0
      animMs = 0
      buildLoop.pause()
      chainLoop.markDirty()
      chainLoop.start()
      return
    }
    resetToBuild(state)
    chainLoop.pause()
    buildLoop.markDirty()
    buildLoop.start()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(state.levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (paused) resumeGame()
      else pauseGame()
    } else if (event.code === 'Space') {
      event.preventDefault()
      onSpace()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      if (running && !paused && state.phase === 'build') {
        undo(state)
        buildLoop.markDirty()
      }
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (state.outcome === 'won') startLevel(state.levelIndex + 1)
    } else if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      event.preventDefault()
      const pick: Record<string, PieceType> = { Digit1: 'domino', Digit2: 'bridge', Digit3: 'booster' }
      selectedType = pick[event.code]!
      if (state.phase === 'build') buildLoop.markDirty()
    }
  }

  // 建造期：dirty 按需渲染（静止零重绘）。
  const buildLoop = createFrameLoop(f => {
    if (!f.render) return
    renderScene(ctx, view())
  }, { mode: 'dirty' })

  // 连锁动画期：continuous 逐帧渲染 + 固定拍长步进模拟。
  const chainLoop = createFrameLoop(f => {
    if (!paused && state.phase === 'chain' && state.outcome === null) {
      animMs += f.dt * 1000
      beatAccumMs += f.dt * 1000
      while (beatAccumMs >= BEAT_MS && state.outcome === null) {
        beatAccumMs -= BEAT_MS
        const ev = stepChain(state)
        if (ev.kind === 'win') {
          score = scoreFor(state.levelIndex, inventoryLeft(state))
          if (score > bestScore) bestScore = score
          reportScore()
          const geo = geometry(state.level)
          particles.burst(
            geo.originX + state.level.bellX * geo.cell + geo.cell / 2,
            geo.bottomY - state.level.terrain[state.level.bellX]! * geo.cell - geo.cell,
            THEME.gold, 18, 170,
          )
        } else if (ev.kind === 'break') {
          particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.bad, 10, 120)
        }
      }
    } else if (state.phase === 'chain' && state.outcome !== null) {
      // 终态后继续播一会儿铃铛摆动 / 粒子。
      animMs += f.dt * 1000
    }
    if (f.render) {
      renderScene(ctx, view())
      particles.tick(ctx, f.dt * 1000)
    }
  }, { mode: 'continuous' })

  const pauseGame = (): void => {
    if (!running) return
    paused = true
    buildLoop.markDirty()
    chainLoop.markDirty()
    renderScene(ctx, view())
  }
  const resumeGame = (): void => {
    paused = false
    buildLoop.markDirty()
    chainLoop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  buildLoop.start()

  return {
    start: resumeGame,
    pause: pauseGame,
    resume: resumeGame,
    destroy: () => {
      running = false
      buildLoop.destroy()
      chainLoop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const dominorunGame: MiniGameDefinition = {
  id: 'dominorun',
  title: '多米诺连锁 DominoRun',
  icon: '🁢',
  description: '摆好骨牌推倒第一张——连锁反应越过沟壑与台阶，撞响终点的铃铛。',
  controls: [
    '点击空位：放置当前件型 · 右键：移回库存 · 1/2/3：骨牌/桥板/加速器',
    '空格：推倒 / 回建造期 · U：撤回 · R：重开 · P：暂停 · N：过关后下一关',
  ],
  create: createDominoRunGame,
}
