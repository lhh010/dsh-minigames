/**
 * 双陆棋 Backgammon 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 空格/按钮掷骰，点击己方子选中、再点击高亮落点走子（右下槽为 bear
 * off 出局）；对方 AI 自动掷骰并按贪心启发式整回合行子；先全部移出
 * 者胜该局，3 局 2 胜。打吃触发粒子，骰子滚动动画期间逐帧重绘，静
 * 态盘面按脏标记按需重绘。R 重开整场、P 暂停。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  aiTurn, createBackgammon, legalSingleMoves, nextRound, playerMove, rollFor,
  type BackgammonState,
} from './logic.ts'
import {
  LOGICAL_H, LOGICAL_W, barAt, offAt, pointAt, renderBackgammon, rollButtonAt,
  type BackgammonView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { accent, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ROLL_MS = 520
/** 打吃/出局粒子的大致落点（盘面中部与右槽）。 */
const MID_Y = 320
const OFF_X = LOGICAL_W - 50
const AI_THINK_MS = 420
const TOAST_MS = 1500

/** 每次重开的新种子来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createBackgammonGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: backgammon needs a 2d canvas context')
  const ctx = initialFit.ctx

  let state: BackgammonState = createBackgammon(nextSeed())
  let selected = -1
  let userPaused = false
  let running = false
  let rolling = false
  let rollEndsAt = 0
  let aiMoveAt = 0
  let toast = ''
  let toastMs = 0
  let lastScore = -1
  const particles = createParticles()

  /** 当前后台已用/未用骰面下的玩家合法单步（去重骰面后合并）。 */
  const myMoves = () => {
    if (state.phase !== 'move' || state.turn !== 'you') return []
    const seen = new Set<number>()
    const out: ReturnType<typeof legalSingleMoves> = []
    for (const die of state.remaining) {
      if (seen.has(die)) continue
      seen.add(die)
      out.push(...legalSingleMoves(state.board, 'you', die))
    }
    return out
  }

  const movableSources = (): number[] => {
    const set = new Set<number>()
    for (const m of myMoves()) set.add(m.from)
    return [...set]
  }

  const targetsFor = (from: number): number[] => {
    const set = new Set<number>()
    for (const m of myMoves()) if (m.from === from) set.add(m.to)
    return [...set]
  }

  const reportScore = (): void => {
    const score = state.roundWinsYou * 100 + state.board.offYou * 5
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const show = (text: string): void => {
    toast = text
    toastMs = TOAST_MS
    loop.markDirty()
  }

  const clearSelection = (): void => {
    selected = -1
  }

  /** 掷骰动画启动（面值在动画结束时由逻辑层确定性地生成）。 */
  const startRoll = (): void => {
    if (state.phase !== 'roll' || rolling) return
    rolling = true
    rollEndsAt = performance.now() + ROLL_MS
    clearSelection()
    loop.markDirty()
  }

  /** 动画结束落地：真正掷骰；掷完若轮到 AI 行子则进入思考延时。 */
  const finishRoll = (): void => {
    rolling = false
    rollFor(state)
    if (state.phase === 'move' && state.turn === 'ai') {
      aiMoveAt = performance.now() + AI_THINK_MS
    } else if (state.phase === 'roll' && state.turn === 'ai') {
      // 玩家掷骰即被跳过 → 对方接着掷。
      aiMoveAt = 0
    } else if (state.phase === 'move') {
      const sources = movableSources()
      if (state.board.barYou > 0 && sources.includes(0)) selected = 0
    }
    reportScore()
    loop.markDirty()
  }

  /** AI 整回合行子落地：打吃时粒子反馈。 */
  const finishAiTurn = (): void => {
    const moves = aiTurn(state)
    let hits = 0
    for (const m of moves) if (m.hit) hits += 1
    if (hits > 0) {
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, accent(4), 14, 150)
      show('对方打吃你的子！')
    }
    reportScore()
    loop.markDirty()
  }

  /** 玩家尝试走一步：成功返回 true（含打吃反馈与自动回合收尾）。 */
  const tryMove = (from: number, to: number): boolean => {
    if (!playerMove(state, from, to)) return false
    clearSelection()
    if (state.turn === 'ai' || state.phase !== 'move') {
      // 回合已交还/局终：AI 侧由主循环驱动。
      if (state.phase === 'roll' && state.turn === 'ai') aiMoveAt = 0
    }
    reportScore()
    loop.markDirty()
    return true
  }

  const clickBoard = (x: number, y: number): void => {
    // 优先按目标处理：已选中时点击高亮点/出局槽即走。
    if (selected >= 0) {
      if (offAt(x, y) && targetsFor(selected).includes(0)) {
        if (tryMove(selected, 0)) {
          particles.burst(OFF_X, MID_Y, accent(2), 10, 120)
        }
        return
      }
      const p = pointAt(x, y)
      if (p !== null && targetsFor(selected).includes(p)) {
        tryMove(selected, p)
        return
      }
    }
    // 否则选择新的来源：中栏或己方有子且可动的尖点。
    if (barAt(x, y) && state.board.barYou > 0 && movableSources().includes(0)) {
      selected = 0
      loop.markDirty()
      return
    }
    const p = pointAt(x, y)
    if (p !== null && state.board.you[p - 1]! > 0 && movableSources().includes(p)) {
      selected = p
      loop.markDirty()
      return
    }
    if (p !== null && selected === p) {
      clearSelection()
      loop.markDirty()
    }
  }

  const restart = (): void => {
    state = createBackgammon(nextSeed())
    clearSelection()
    userPaused = false
    rolling = false
    aiMoveAt = 0
    toast = ''
    toastMs = 0
    reportScore()
    loop.markDirty()
  }

  const advance = (): void => {
    if (state.phase === 'roundOver') {
      nextRound(state)
      clearSelection()
      reportScore()
      loop.markDirty()
    } else if (state.phase === 'matchOver') {
      restart()
    } else if (state.phase === 'roll' && state.turn === 'you') {
      startRoll()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    // 浏览器快捷键（Ctrl/Cmd+R 等）不拦截。
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (!running || userPaused || rolling) {
        if (state.phase === 'matchOver' && !userPaused) restart()
        return
      }
      advance()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      if (state.phase !== 'matchOver') {
        userPaused = !userPaused
        loop.markDirty()
      }
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    if (userPaused || rolling) return
    if (state.phase === 'matchOver') {
      restart()
      return
    }
    if (state.phase === 'roundOver') {
      advance()
      return
    }
    if (state.phase === 'roll' && state.turn === 'you') {
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
      const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
      if (rollButtonAt(x, y)) startRoll()
      return
    }
    if (state.phase === 'move' && state.turn === 'you') {
      const rect = canvas.getBoundingClientRect()
      const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
      const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
      clickBoard(x, y)
    }
  }

  const view = (): BackgammonView => ({
    board: state.board,
    phase: state.phase,
    turn: state.turn,
    dice: state.dice,
    remaining: state.remaining,
    roundNo: state.round,
    roundWinsYou: state.roundWinsYou,
    roundWinsAi: state.roundWinsAi,
    matchWinner: state.matchWinner,
    selected,
    movable: state.phase === 'move' && state.turn === 'you' && !rolling ? movableSources() : [],
    targets: selected >= 0 && state.phase === 'move' && state.turn === 'you' ? targetsFor(selected) : [],
    rolling,
    toast: toastMs > 0 ? toast : '',
    userPaused,
    paused: !running,
  })

  // 脏标记渲染：静态盘面只在状态或动效变化时重绘（见 frame-scheduler）。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    toastMs = Math.max(0, toastMs - dtMs)
    if (toastMs === 0) toast = ''
    const now = performance.now()
    // AI 驱动：待掷骰先掷（带动画），行子阶段思考后整回合落地。
    if (!userPaused && running) {
      if (state.phase === 'roll' && state.turn === 'ai' && !rolling) startRoll()
      if (rolling && now >= rollEndsAt) finishRoll()
      if (!rolling && state.phase === 'move' && state.turn === 'ai') {
        if (aiMoveAt === 0) aiMoveAt = now + AI_THINK_MS
        else if (now >= aiMoveAt) {
          aiMoveAt = 0
          finishAiTurn()
        }
      }
    }
    const animating = rolling || toastMs > 0 || particles.size() > 0
      || (state.phase === 'move' && state.turn === 'ai')
      || (state.phase === 'roll' && state.turn === 'ai')
    if (f.render || animating) {
      renderBackgammon(ctx, view(), now)
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderBackgammon(ctx, view(), performance.now())
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderBackgammon(ctx, view(), performance.now())

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      initialFit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const backgammonGame: MiniGameDefinition = {
  id: 'backgammon',
  title: '双陆棋 Backgammon',
  icon: '🏛️',
  description: '掷骰行子的千年竞速——点数拆分、阻挡与反击的艺术。',
  controls: ['空格 / 点击按钮：掷骰', '点击蓝子选中，再点绿色高亮点落子（右下槽 = 移出）', '空格：下一局 / 再来一场', 'R：重开 · P：暂停'],
  create: createBackgammonGame,
}
