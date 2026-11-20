/**
 * 鬼墙游戏定义：把纯规则与启发式 AI 接成 {@link MiniGameInstance}。
 * 点击棋盘走子（合法落点有提示），W 循环切换 走子→横墙→竖墙 模式，
 * 放墙模式下点击墙槽放置（悬停显示半透明幽灵预览，非法显示红）；
 * AI 延迟片刻回手（侧栏显示思考提示）。三局两胜：局分记在 HUD，随
 * 已结束局数提升 AI 难度（0→2 级）。R 重开当前局（整届结束后重置整
 * 届），P 暂停。dirty 渲染：只有交互、AI 落子与粒子活动时重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  canPlaceWall, chooseAiAction, createGame, legalSteps, matchDecided, movePawn,
  nextDifficulty, placeWall, shortestPath, type QuoridorState,
} from './logic.ts'
import {
  LOGICAL_W, LOGICAL_H, cellAt, renderQuoridor, wallSlotAt,
  type InputMode, type QuoridorView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const AI_DELAY_MS = 550
const NEXT_GAME_MS = 1600

/** 局胜利基础分与等级加成、夺赛总分。 */
const GAME_WIN_BASE = 40
const GAME_WIN_PER_LEVEL = 30
const MATCH_WIN_BONUS = 150

function createQuoridorGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: quoridor needs a 2d canvas context')
  const ctx = fit.ctx

  let state: QuoridorState = createGame()
  let mode: InputMode = 'move'
  let hoverCell: { c: number; r: number } | null = null
  let hoverWall: { orient: 'h' | 'v'; c: number; r: number } | null = null
  let matchWins: [number, number] = [0, 0]
  let gamesPlayed = 0
  let matchOver = false
  let matchWon = false
  let paused = false
  let thinking = false
  let aiAt = 0
  let nextGameAt = 0
  let aiSeed = Math.floor(Math.random() * 0x7fffffff)
  let totalScore = 0
  let lastReported = -1
  const particles = createParticles()

  const level = (): number => nextDifficulty(gamesPlayed)

  const reportScore = (): void => {
    if (totalScore === lastReported) return
    lastReported = totalScore
    options?.onScore?.(totalScore)
  }

  // 走子合法落点缓存：仅在轮到玩家且局面未结束时非空，state 变更后重算。
  let stepsCache: { c: number; r: number }[] = []
  const refreshSteps = (): void => {
    stepsCache = state.turn === 0 && state.winner === null && !matchOver ? legalSteps(state) : []
  }
  const legalStepsForTurn = (): { c: number; r: number }[] => stepsCache

  const restartGame = (): void => {
    if (matchOver) {
      matchWins = [0, 0]
      gamesPlayed = 0
      matchOver = false
      matchWon = false
      totalScore = 0
      lastReported = -1
      reportScore()
    }
    state = createGame()
    mode = 'move'
    hoverCell = null
    hoverWall = null
    thinking = false
    aiAt = 0
    nextGameAt = 0
    refreshSteps()
    loop.markDirty()
  }

  const dists = (): [number, number] => [
    Math.max(0, shortestPath(state, 0)),
    Math.max(0, shortestPath(state, 1)),
  ]

  const finishGame = (winner: 0 | 1): void => {
    matchWins[winner] += 1
    gamesPlayed += 1
    if (winner === 0) {
      totalScore += GAME_WIN_BASE + GAME_WIN_PER_LEVEL * level()
      const pos = state.pawns[0]!
      particles.burst(
        LOGICAL_W * 0.35, 60 + pos.r * 36, '#9ece6a', 26, 160,
      )
    }
    if (matchDecided(matchWins)) {
      matchOver = true
      if (matchWins[0] >= 2) {
        matchWon = true
        totalScore += MATCH_WIN_BONUS
      } else {
        matchWon = false
      }
    } else {
      nextGameAt = performance.now() + NEXT_GAME_MS
    }
    reportScore()
    loop.markDirty()
  }

  const afterAction = (): void => {
    refreshSteps()
    hoverCell = null
    hoverWall = null
    if (state.winner !== null) {
      finishGame(state.winner)
      return
    }
    if (state.turn === 1) {
      thinking = true
      aiAt = performance.now() + AI_DELAY_MS
    }
    loop.markDirty()
  }

  const tryMove = (to: { c: number; r: number }): void => {
    if (paused || matchOver || state.turn !== 0 || state.winner !== null) return
    const ns = movePawn(state, to)
    if (ns === null) return
    state = ns
    afterAction()
  }

  const tryWall = (orient: 'h' | 'v', c: number, r: number): void => {
    if (paused || matchOver || state.turn !== 0 || state.winner !== null) return
    const ns = placeWall(state, orient, c, r)
    if (ns === null) return
    state = ns
    afterAction()
  }

  const aiAct = (): void => {
    const action = chooseAiAction(state, aiSeed, level())
    aiSeed = (aiSeed * 1664525 + 1013904223) % 0x7fffffff
    if (action === null) return
    if (action.type === 'move') {
      const ns = movePawn(state, action.to)
      if (ns !== null) state = ns
    } else {
      const ns = placeWall(state, action.orient, action.c, action.r)
      if (ns !== null) state = ns
    }
    thinking = false
    afterAction()
  }

  const pointer = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    const { x, y } = pointer(event)
    if (mode === 'move') {
      const cell = cellAt(x, y)
      if (cell !== null) tryMove(cell)
    } else {
      const slot = wallSlotAt(x, y)
      if (slot !== null) tryWall(mode === 'wallH' ? 'h' : 'v', slot.c, slot.r)
    }
    loop.markDirty()
  }

  const onMouseMove = (event: MouseEvent): void => {
    const { x, y } = pointer(event)
    if (mode === 'move') {
      const cell = cellAt(x, y)
      const changed = cell === null || hoverCell === null
        ? cell !== null || hoverCell !== null
        : cell.c !== hoverCell.c || cell.r !== hoverCell.r
      if (changed) {
        hoverCell = cell
        hoverWall = null
        loop.markDirty()
      }
    } else {
      const slot = wallSlotAt(x, y)
      const changed = slot === null || hoverWall === null
        ? slot !== null || hoverWall !== null
        : slot.c !== hoverWall.c || slot.r !== hoverWall.r
      if (changed) {
        hoverCell = null
        hoverWall = slot === null ? null : { orient: mode === 'wallH' ? 'h' : 'v', c: slot.c, r: slot.r }
        loop.markDirty()
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restartGame()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      paused = !paused
      loop.markDirty()
      return
    }
    if (event.code === 'KeyW') {
      event.preventDefault()
      if (state.turn !== 0 || state.winner !== null || matchOver) return
      mode = mode === 'move' ? 'wallH' : mode === 'wallH' ? 'wallV' : 'move'
      hoverWall = null
      hoverCell = null
      loop.markDirty()
    }
  }

  const frame = (f: FrameInfo): void => {
    const now = performance.now()
    if (!paused && !matchOver) {
      if (state.winner === null && aiAt > 0 && now >= aiAt) {
        aiAt = 0
        aiAct()
      } else if (state.winner !== null && nextGameAt > 0 && now >= nextGameAt) {
        nextGameAt = 0
        state = createGame()
        refreshSteps()
        loop.markDirty()
      }
    }
    if (!f.render && particles.size() === 0) return
    const view: QuoridorView = {
      state,
      mode,
      steps: legalStepsForTurn(),
      hoverCell,
      hoverWall,
      wallPreviewValid: hoverWall !== null && canPlaceWall(state, hoverWall.orient, hoverWall.c, hoverWall.r),
      thinking,
      matchWins,
      levelLabel: 'AI 等级 L' + (level() + 1),
      dists: dists(),
      paused,
      matchOver,
      matchWon,
    }
    renderQuoridor(ctx, view)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  refreshSteps()
  loop.start()

  return {
    start: () => { loop.start() },
    pause: () => { paused = true; aiAt = aiAt > 0 ? performance.now() + AI_DELAY_MS : 0; loop.markDirty() },
    resume: () => { paused = false; loop.markDirty() },
    destroy: () => {
      loop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const quoridorGame: MiniGameDefinition = {
  id: 'quoridor',
  title: '鬼墙 Quoridor',
  icon: '🎌',
  description: '走到对岸就赢——但你和对手都能竖墙，路是人走出来的，也是墙堵出来的。',
  controls: ['点击格子走子 · 点击墙槽放墙', 'W：切换 走子/横墙/竖墙', 'R：重开 · P：暂停'],
  create: createQuoridorGame,
}
