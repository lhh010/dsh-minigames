/**
 * 跳棋竞速 CheckersHop 游戏定义：把纯逻辑接成 {@link MiniGameInstance}
 * —— 点击己方棋子选中（虚线 + 空心环显示一步与链跳的全部可停点），
 * 点击高亮点落子；AI 短延时后一层贪心行子；一局结束自动开下一局
 * （3 局 2 胜），R 重开整场、P 暂停。落子与胜利触发粒子；盘面静态，
 * 按脏标记按需重绘（dirty 模式）；分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  aiTurn, countInTargetCamp, createCheckersHop, distSum, hasAnyMove,
  legalTargets, nextRound, playerMove,
  type CheckersHopMove,
  type CheckersHopState,
} from './logic.ts'
import {
  CELL_X, CELL_Y, LOGICAL_H, LOGICAL_W, cellAt, renderCheckersHop,
  type CheckersHopView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const AI_THINK_MS = 520
const THEME_GOLD = '#e0af68'
const ROUND_GAP_MS = 2000
const TOAST_MS = 1400
const AI_COLOR = '#f7768e'

/** 每次重开的新种子来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createCheckersHopGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: checkershop needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: CheckersHopState = createCheckersHop(nextSeed())
  let selected = -1
  let targets: number[] = []
  let userPaused = false
  let paused = false
  let running = false
  let aiMoveAt = 0
  let nextRoundAt = 0
  let toast = ''
  let toastEndsAt = 0
  let lastScore = -1
  const particles = createParticles()

  const show = (text: string): void => {
    toast = text
    toastEndsAt = performance.now() + TOAST_MS
    loop.markDirty()
  }

  const clearSelection = (): void => {
    selected = -1
    targets = []
  }

  const reportScore = (): void => {
    const score = state.roundWinsYou * 1000 + countInTargetCamp(state.board, 'you') * 10
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 局终/整场结束的落地（含粒子与分数）。 */
  const burstAt = (cell: number, color: string, count: number): void => {
    particles.burst(CELL_X[cell]!, CELL_Y[cell]!, color, count, 150)
  }

  const scheduleAiIfNeeded = (): void => {
    if (state.phase === 'play' && state.turn === 'ai') {
      aiMoveAt = performance.now() + AI_THINK_MS
    } else {
      aiMoveAt = 0
    }
    if (state.phase === 'roundEnd') {
      nextRoundAt = performance.now() + ROUND_GAP_MS
    } else {
      nextRoundAt = 0
    }
  }

  const restart = (): void => {
    state = createCheckersHop(nextSeed())
    clearSelection()
    userPaused = false
    aiMoveAt = 0
    nextRoundAt = 0
    toast = ''
    lastScore = -1
    reportScore()
    scheduleAiIfNeeded()
    loop.markDirty()
  }

  const onPointerDown = (ev: PointerEvent): void => {
    if (userPaused || paused) return
    if (state.phase === 'matchEnd') return
    const rect = canvas.getBoundingClientRect()
    const x = ((ev.clientX - rect.left) / rect.width) * LOGICAL_W
    const y = ((ev.clientY - rect.top) / rect.height) * LOGICAL_H
    const id = cellAt(x, y)
    if (id < 0) {
      clearSelection()
      loop.markDirty()
      return
    }
    if (state.phase !== 'play' || state.turn !== 'you') return
    if (selected >= 0 && targets.includes(id)) {
      const from = selected
      const moved = playerMove(state, from, id)
      if (moved) {
        burstAt(id, accent(0), 8)
        clearSelection()
        reportScore()
        if (state.roundWinner === 'you') {
          burstAt(id, THEME_GOLD, 24)
        }
        scheduleAiIfNeeded()
        loop.markDirty()
      }
      return
    }
    if (state.board[id] === 1) {
      const list = legalTargets(state.board, id)
      if (list.length === 0) {
        show('这枚棋子无处可去（营区锁定的子不能外出）')
        clearSelection()
      } else {
        selected = id
        targets = list
      }
      loop.markDirty()
      return
    }
    if (state.board[id] === 2) {
      show('那是 AI 的棋子，选自己的蓝子')
      loop.markDirty()
      return
    }
    if (selected >= 0 && !targets.includes(id)) {
      show('走不到那格：只能走一步，或跳过紧邻的子')
      clearSelection()
      loop.markDirty()
    }
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (ev.key === 'r' || ev.key === 'R') {
      restart()
      return
    }
    if (ev.key === 'p' || ev.key === 'P') {
      if (state.phase === 'matchEnd') return
      userPaused = !userPaused
      loop.markDirty()
    }
  }

  const loop = createFrameLoop((frame) => {
    const now = performance.now()
    // toast 到期清除。
    if (toast !== '' && now >= toastEndsAt) {
      toast = ''
      loop.markDirty()
    }
    if (running && !userPaused && !paused) {
      if (aiMoveAt > 0 && now >= aiMoveAt) {
        aiMoveAt = 0
        const move: CheckersHopMove | null = aiTurn(state)
        if (move !== null) {
          burstAt(move.to, AI_COLOR, 8)
          reportScore()
        } else if (state.phase === 'play') {
          show('AI 无棋可走，跳手')
        }
        // AI 跳手或走完后若仍轮到 AI（玩家被跳过），继续排程。
        if (state.phase === 'play' && state.turn === 'ai') aiMoveAt = now + AI_THINK_MS
        else if (state.phase === 'play' && state.turn === 'you' && !hasAnyMove(state.board, 'you')) {
          show('你无棋可走，跳手')
          aiMoveAt = now + AI_THINK_MS
          state.turn = 'ai'
        }
        if (state.phase === 'roundEnd') nextRoundAt = now + ROUND_GAP_MS
        loop.markDirty()
      } else if (nextRoundAt > 0 && now >= nextRoundAt) {
        nextRoundAt = 0
        nextRound(state)
        clearSelection()
        scheduleAiIfNeeded()
        loop.markDirty()
      }
    }
    if (frame.render || particles.size() > 0) {
      particles.tick(ctx, frame.wallMs)
      renderCheckersHop(ctx, buildView())
    }
  }, { mode: 'dirty' })

  const buildView = (): CheckersHopView => ({
    board: state.board,
    turn: state.turn,
    phase: state.phase,
    roundNo: state.roundNo,
    roundWinsYou: state.roundWinsYou,
    roundWinsAi: state.roundWinsAi,
    matchWinner: state.matchWinner,
    roundWinner: state.roundWinner,
    selected,
    targets,
    distYou: distSum(state.board, 'you'),
    distAi: distSum(state.board, 'ai'),
    toast,
    userPaused,
    paused,
  })

  focusGameHost(host)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  reportScore()

  return {
    start(): void {
      if (running) return
      running = true
      loop.start()
      scheduleAiIfNeeded()
    },
    pause(): void {
      paused = true
      loop.pause()
      loop.markDirty()
    },
    resume(): void {
      paused = false
      if (!userPaused) loop.resume()
      loop.markDirty()
    },
    destroy(): void {
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      initialFit.dispose()
    },
  }
}

export const checkershopGame: MiniGameDefinition = {
  id: 'checkershop',
  title: '跳棋竞速 CheckersHop',
  icon: '♻',
  description: '一步一跳还是连环跳？把全部棋子先搬到对岸的人赢。',
  controls: [
    '目标：把你的 10 枚蓝子全部移进对面（上方）营区，先到齐者胜该局，3 局 2 胜',
    '点击己方棋子选中，再点击高亮点落子：可走一步到相邻空位，或跳过紧邻棋子（不分敌我）落到其正后方空位',
    '跳后若还能继续跳可连环跳（点任一高亮点随时停），全程不吃子、纯竞速',
    '防赖规则：棋子进入对面营区后锁定，只能在该营区内移动、不能移出',
    'R 重开整场 · P 暂停；顶部"距离和"越小越好（以你的对岸营区为参照）',
  ],
  create: createCheckersHopGame,
}
