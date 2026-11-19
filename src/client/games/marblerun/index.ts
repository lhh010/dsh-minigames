/**
 * 滚珠轨道 MarbleRun 游戏定义：把纯逻辑轨道物理接成
 * {@link MiniGameInstance}。建造期（dirty 按需渲染）：点击空格放置当前
 * 选中件、滚轮旋转（悬停已放置件则旋转它）、右键移回库存、1-5 切换
 * 件种、U 撤回；空格释放滚珠进入测试期（continuous 连续渲染）：固定
 * 子步确定性物理推进，入杯迸粒子过关上报 onScore（关卡基础分 + 剩余
 * 库存件奖励），出界 / 停滞 / 撞尖刺失败可回收。R 重开本关、P 暂停、
 * N 过关后进下一关。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVELS,
  PIECE_KINDS,
  PIECE_ORIENTATIONS,
  createBoard,
  createRun,
  levelFor,
  placePiece,
  pieceAt,
  placeReject,
  removePieceAt,
  rotatePieceAt,
  scoreFor,
  stepRun,
  totalPieces,
  undo,
  type PieceKind,
  type RunWorld,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, inventorySlotAt, pickCell, renderScene, type RenderView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

function createMarbleRunGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: marblerun needs a 2d canvas context')
  const ctx = fit.ctx

  let board = createBoard(Math.min(readLevel('marblerun'), LEVELS.length) - 1)
  let run: RunWorld | null = null
  let mode: 'build' | 'run' = 'build'
  let outcome: 'won' | 'out' | 'stuck' | 'shattered' | null = null
  let selectedKind: PieceKind = 'straight'
  let pendingRot = 0
  let hoverCell: { x: number; y: number } | null = null
  let paused = false
  let running = false
  let score: number | null = null
  let bestScore = -1
  let lastScore = -1
  const particles = createParticles()

  const hoverValid = (): boolean =>
    hoverCell !== null && placeReject(board, hoverCell.x, hoverCell.y, selectedKind) === null

  const view = (): RenderView => ({
    level: board.level,
    placements: board.placements,
    inventory: board.inventory,
    run,
    levelIndex: board.levelIndex,
    mode,
    outcome,
    paused,
    selectedKind,
    pendingRot,
    hoverCell,
    hoverValid: hoverValid(),
    score,
  })

  const draw = (): void => {
    renderScene(ctx, view(), totalPieces(board.inventory))
  }

  const reportScore = (): void => {
    if (bestScore <= lastScore) return
    lastScore = bestScore
    options?.onScore?.(bestScore)
  }

  /** 开始 / 重开某一关（清空棋盘回到建造期）。 */
  const startLevel = (index: number): void => {
    board = createBoard(Math.min(Math.max(index, 0), LEVELS.length - 1))
    saveLevel('marblerun', board.levelIndex + 1)
    run = null
    mode = 'build'
    outcome = null
    score = null
    runLoop.pause()
    // 关键：释放滚珠时 buildLoop 被 pause——若在失败态（滚珠飞出/停滞/碎裂）
    // 按 R，markDirty 打在已暂停的循环上永远不渲染（游戏看起来卡死）。
    buildLoop.start()
    buildLoop.markDirty()
  }

  /** 释放滚珠：进入测试期。 */
  const releaseMarble = (): void => {
    run = createRun(board.level, board.placements)
    mode = 'run'
    outcome = null
    score = null
    buildLoop.pause()
    runLoop.markDirty()
    runLoop.start()
  }

  /** 回收滚珠：带着既有布局回到建造期。 */
  const recoverToBuild = (): void => {
    runLoop.pause()
    run = null
    mode = 'build'
    outcome = null
    buildLoop.markDirty()
    buildLoop.start()
  }

  /** 测试期一帧：推进物理、结算结果（过关上报得分并迸粒子）。 */
  const tickRun = (dt: number): void => {
    if (run === null || outcome !== null || paused) return
    stepRun(run, dt)
    if (run.outcome !== 'running') {
      outcome = run.outcome
      if (run.outcome === 'won') {
        score = scoreFor(board.levelIndex, totalPieces(board.inventory))
        if (score > bestScore) bestScore = score
        reportScore()
        particles.burst(run.px, run.py, THEME.gold, 26, 200)
      }
      runLoop.markDirty()
    }
  }

  /** 逻辑像素坐标（鼠标事件 → 逻辑画布）。 */
  const toLogical = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || paused || mode !== 'build' || event.button !== 0) return
    const { x, y } = toLogical(event)
    const slot = inventorySlotAt(x, y)
    if (slot !== null) {
      const kind = PIECE_KINDS[slot]!
      if ((board.inventory[kind] ?? 0) > 0) selectedKind = kind
      buildLoop.markDirty()
      return
    }
    const cell = pickCell(x, y)
    if (cell === null) return
    const reject = placePiece(board, cell.x, cell.y, selectedKind, pendingRot % PIECE_ORIENTATIONS[selectedKind])
    if (reject === null) buildLoop.markDirty()
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    if (!running || paused || mode !== 'build') return
    const { x, y } = toLogical(event)
    const cell = pickCell(x, y)
    if (cell === null) return
    if (removePieceAt(board, cell.x, cell.y)) buildLoop.markDirty()
  }

  /** 滚轮：悬停已放置件 → 旋转它；否则旋转待放置档位。 */
  const onWheel = (event: WheelEvent): void => {
    if (!running || paused || mode !== 'build') return
    event.preventDefault()
    const { x, y } = toLogical(event)
    const cell = pickCell(x, y)
    if (cell !== null && pieceAt(board, cell.x, cell.y) >= 0) {
      if (rotatePieceAt(board, cell.x, cell.y)) buildLoop.markDirty()
      return
    }
    const n = PIECE_ORIENTATIONS[selectedKind]
    pendingRot = ((pendingRot + (event.deltaY > 0 ? 1 : -1)) % n + n) % n
    buildLoop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!running || mode !== 'build') return
    const { x, y } = toLogical(event)
    const cell = pickCell(x, y)
    if (cell === null && hoverCell === null) return
    if (cell !== null && hoverCell !== null && cell.x === hoverCell.x && cell.y === hoverCell.y) return
    hoverCell = cell
    buildLoop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      startLevel(board.levelIndex)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      if (paused) resumeGame()
      else pauseGame()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (!running || paused) return
      if (mode === 'build') releaseMarble()
      else recoverToBuild()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      if (!running || paused || mode !== 'build') return
      if (undo(board)) buildLoop.markDirty()
    } else if (event.code === 'KeyN') {
      event.preventDefault()
      if (outcome === 'won') startLevel(board.levelIndex + 1)
    } else if (event.code.startsWith('Digit')) {
      const d = Number(event.code.slice(5))
      if (d >= 1 && d <= PIECE_KINDS.length && mode === 'build' && !paused) {
        const kind = PIECE_KINDS[d - 1]!
        if ((board.inventory[kind] ?? 0) > 0) {
          selectedKind = kind
          buildLoop.markDirty()
        }
      }
    }
  }

  // 建造期：dirty 按需渲染（静止零重绘）。
  const buildLoop = createFrameLoop(() => {
    draw()
  }, { mode: 'dirty' })

  // 测试期：滚珠逐帧物理 + 粒子 + 重绘。
  const runLoop = createFrameLoop((frame) => {
    tickRun(frame.dt)
    if (frame.render || outcome !== null || particles.size() > 0) {
      draw()
      particles.tick(ctx, 16)
    }
  })

  const pauseGame = (): void => {
    paused = true
    buildLoop.markDirty()
  }

  const resumeGame = (): void => {
    paused = false
    buildLoop.markDirty()
    runLoop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('mousemove', onMouseMove)
  const keyDown = (e: KeyboardEvent): void => onKeyDown(e)
  window.addEventListener('keydown', keyDown)
  focusGameHost(host)

  buildLoop.start()

  return {
    start(): void {
      if (running) return
      running = true
      focusGameHost(host)
      if (mode === 'build') buildLoop.start()
      else runLoop.start()
    },
    pause(): void {
      paused = true
      buildLoop.pause()
      runLoop.pause()
      buildLoop.markDirty()
    },
    resume(): void {
      resumeGame()
      if (!running) return
      if (mode === 'build') buildLoop.start()
      else runLoop.start()
    },
    destroy(): void {
      running = false
      buildLoop.destroy()
      runLoop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', keyDown)
      fit.dispose()
    },
  }
}

/** 滚珠轨道 MarbleRun：搭一段轨道让滚珠安全入杯。 */
export const marblerunGame: MiniGameDefinition = {
  id: 'marblerun',
  title: '滚珠轨道 MarbleRun',
  icon: '🟣',
  description: '搭一段轨道让滚珠安全入杯——坡度、弯道、跳台，每块板都算数。',
  controls: [
    '点击放置 · 滚轮旋转 · 右键移回',
    '1-5 选件 · U 撤回',
    '空格：释放 / 回收滚珠',
    'N：下一关 · R：重开 · P：暂停',
  ],
  create: createMarbleRunGame,
}
