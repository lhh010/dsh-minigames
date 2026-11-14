/**
 * 建桥大师 Bridge Builder 游戏定义：把纯逻辑结构求解器接成
 * {@link MiniGameInstance}。建造期（dirty 按需渲染）：点击两个网格点放
 * 梁、点击杆件拆除（全额退款）；空格进入测试期（continuous 连续渲
 * 染）：固定子步确定性物理推进，杆件断裂迸粒子，车达右岸过关上报
 * onScore（关卡基础分 + 剩余预算）。R 重开本关、P 暂停、N 过关后进
 * 下一关。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  DECK_ROW,
  LEVELS,
  createRunWorld,
  levelFor,
  placeReject,
  scoreFor,
  stepRun,
  type BridgeBeam,
  type BridgeNode,
  type RunWorld,
} from './logic.ts'
import {
  LOGICAL_H,
  LOGICAL_W,
  nearestNode,
  pickBeam,
  px,
  py,
  renderBuilderScene,
  type BuilderView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 测试期每渲染帧推进的物理子步数（60fps × 4 = 1/60s 模拟量）。 */
const SUBSTEPS_PER_FRAME = 4

function createBuilderGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: bridgebuilder needs a 2d canvas context')
  const ctx = fit.ctx

  let levelIndex = Math.min(readLevel('bridgebuilder'), LEVELS.length) - 1
  let beams: BridgeBeam[] = []
  let world: RunWorld | null = null
  let mode: 'build' | 'test' = 'build'
  let outcome: 'running' | 'won' | 'failed' | null = null
  let selected: BridgeNode | null = null
  let hover: BridgeNode | null = null
  let paused = false
  let running = false
  let travel = 0
  let score: number | null = null
  let bestScore = -1
  let lastScore = -1
  const particles = createParticles()

  const view = (): BuilderView => ({
    level: levelFor(levelIndex),
    levelIndex,
    beams,
    world,
    mode,
    outcome,
    selected,
    hover,
    paused,
    score,
    travel,
  })

  const reportScore = (): void => {
    if (bestScore <= lastScore) return
    lastScore = bestScore
    options?.onScore?.(bestScore)
  }

  /** 开始 / 重开某一关（清空蓝图回到建造期）。 */
  const startLevel = (index: number): void => {
    levelIndex = Math.min(Math.max(index, 0), LEVELS.length - 1)
    saveLevel('bridgebuilder', levelIndex + 1)
    beams = []
    world = null
    mode = 'build'
    outcome = null
    selected = null
    hover = null
    travel = 0
    score = null
    buildLoop.markDirty()
    testLoop.pause()
  }

  /** 进入测试：由蓝图构造物理世界。 */
  const beginTest = (): void => {
    world = createRunWorld(levelFor(levelIndex), beams)
    mode = 'test'
    outcome = 'running'
    selected = null
    hover = null
    travel = 0
    score = null
    buildLoop.pause()
    testLoop.markDirty()
    testLoop.start()
  }

  /** 返回建造（保留蓝图，杆件自动复原）。 */
  const backToBuild = (): void => {
    testLoop.pause()
    world = null
    mode = 'build'
    outcome = null
    travel = 0
    buildLoop.markDirty()
    buildLoop.start()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused || mode !== 'build') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    // 先看是否点中已有杆件 → 拆除。
    const hitIdx = pickBeam(x, y, beams)
    if (hitIdx !== null) {
      beams = beams.filter((_, i) => i !== hitIdx)
      selected = null
      buildLoop.markDirty()
      return
    }
    const node = nearestNode(x, y, levelFor(levelIndex))
    if (node === null) {
      selected = null
      buildLoop.markDirty()
      return
    }
    if (selected === null) {
      selected = node
      buildLoop.markDirty()
      return
    }
    if (selected.x === node.x && selected.y === node.y) {
      selected = null
      buildLoop.markDirty()
      return
    }
    if (placeReject(levelFor(levelIndex), beams, selected, node) === null) {
      beams = [...beams, { a: selected, b: node }]
    }
    selected = null
    buildLoop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running || mode !== 'build') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const node = nearestNode(x, y, levelFor(levelIndex))
    if (node === null && hover === null) return
    if (node !== null && hover !== null && node.x === hover.x && node.y === hover.y) return
    hover = node
    buildLoop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (paused) resumeGame()
      else pauseGame()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (!running || paused) return
      if (mode === 'build') beginTest()
      else backToBuild()
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (outcome === 'won') startLevel(levelIndex + 1)
    }
  }

  // 建造期：dirty 按需渲染（静止零重绘）。
  const buildLoop = createFrameLoop(f => {
    if (!f.render) return
    renderBuilderScene(ctx, view())
    particles.tick(ctx, f.dt * 1000)
  }, { mode: 'dirty' })

  // 测试期：continuous 连续渲染 + 固定子步物理。
  const testLoop = createFrameLoop(f => {
    if (!paused && world !== null && outcome === 'running') {
      const before = world.wheels[0]!.x + world.wheels[1]!.x
      for (let i = 0; i < SUBSTEPS_PER_FRAME; i += 1) stepRun(world)
      const after = world.wheels[0]!.x + world.wheels[1]!.x
      travel += (after - before) / 2
      // 断裂粒子：新断杆中点迸碎屑。
      for (const bi of world.newBreaks) {
        const beam = world.beams[bi]!
        const a = world.nodes[beam.ai]!
        const b = world.nodes[beam.bi]!
        particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, THEME.bad, 10, 130)
      }
      world.newBreaks = []
      if (world.outcome !== 'running') {
        outcome = world.outcome
        if (outcome === 'won') {
          score = scoreFor(levelIndex, beams)
          if (score > bestScore) bestScore = score
          reportScore()
          particles.burst(px(levelFor(levelIndex).rightAnchor.x), py(DECK_ROW) - 24, THEME.good, 16, 150)
        }
      }
    }
    if (f.render) {
      renderBuilderScene(ctx, view())
      particles.tick(ctx, f.dt * 1000)
    }
  }, { mode: 'continuous' })

  const pauseGame = (): void => {
    if (!running) return
    paused = true
    if (mode === 'build') buildLoop.markDirty()
    else testLoop.markDirty()
    renderBuilderScene(ctx, view())
  }
  const resumeGame = (): void => {
    paused = false
    if (mode === 'build') buildLoop.markDirty()
    else testLoop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
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
      testLoop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const bridgeBuilderGame: MiniGameDefinition = {
  id: 'bridgebuilder',
  title: '建桥大师 Bridge Builder',
  icon: '🚧',
  description: '有限预算搭一座桥，让小车安全开过去——结构力学的艺术。',
  controls: [
    '点击两个格点：放梁 · 点击杆件：拆除（退款）',
    '空格：建造 ⇄ 测试 · R：重开 · P：暂停 · N：过关后下一关',
  ],
  create: createBuilderGame,
}
