/**
 * 中国象棋游戏定义：把纯规则引擎与分帧 alpha-beta AI 组装成
 * MiniGameInstance —— 点击己方棋子再点高亮点走子；黑方由内置
 * AI 应着（每帧只算一个根着法切片，画面不卡顿）。难度 1-3 档对应
 * 搜索深度 2/3/4，D 键切换；U 悔棋（回退一整个回合）；R 重开；P 暂停。
 * 终局按难度上报分数。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  applyMove, colOf, colorOf, createStartPosition, findKing, idx, inCheck,
  legalMoves, positionKey, rowOf, status, type Move, type Piece, type Position, type Status,
} from './logic.ts'
import { LEVEL_DEPTH, NODE_BUDGET, createSearch, type SearchStepper } from './ai.ts'
import { LOGICAL_H, LOGICAL_W, pointAt, pointX, pointY, renderXiangqi, undoHit, type XiangqiView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const AI_DELAY_MS = 400
/** 思考中提示的闪烁周期（ms）。 */
const BLINK_MS = 400
const GAME_ID = 'xiangqi'

interface HistoryEntry {
  /** 该着走完后的局面。 */
  pos: Position
  /** 该着本身。 */
  move: Move
  /** 走完后局面的键（重复计数用）。 */
  key: string
}

function createXiangqiGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: xiangqi needs a 2d canvas context')
  const ctx = fit.ctx

  const startPos = createStartPosition()
  let level = Math.min(Math.max(readLevel(GAME_ID), 1), LEVEL_DEPTH.length)
  let pos: Position = startPos
  const history: HistoryEntry[] = []
  /** 局面键 -> 出现次数（本局）。 */
  const repetitions = new Map<string, number>()
  let selected = -1
  let targets = new Set<number>()
  let lastMove: Move | null = null
  let over: Status = { kind: 'playing' }
  let running = false
  let stepper: SearchStepper | null = null
  let thinking = false
  let aiAt = 0
  let lastBlink = -1
  let lastScore = -1
  const particles = createParticles()

  repetitions.set(positionKey(startPos), 1)

  const depth = (): number => LEVEL_DEPTH[level - 1]!

  const checkSquare = (): number => {
    if (!inCheck(pos)) return -1
    return findKing(pos.board, pos.turn)
  }

  const overlayFor = (): { text: string; sub: string; color: string } | null => {
    if (over.kind === 'playing') return null
    if (over.kind === 'draw-repetition') return { text: '和棋', sub: '三次重复局面 · R 重开', color: THEME.text }
    const won = over.winner === 'r'
    return {
      text: over.kind === 'checkmate'
        ? (won ? '将杀！红方胜' : '将杀！黑方胜')
        : (won ? '困毙！红方胜' : '困毙！黑方胜'),
      sub: won ? 'AI 被击败 · R 再来一局' : '再接再厉 · R 重开',
      color: won ? THEME.good : THEME.bad,
    }
  }

  /** 终局上报：胜 = 10 * 难度，和 = 2 * 难度；同一局只报一次。 */
  const reportScore = (): void => {
    if (over.kind === 'playing') return
    const score = over.kind === 'draw-repetition'
      ? 2 * level
      : over.winner === 'r' ? 10 * level : 0
    if (score <= 0 || score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const restart = (): void => {
    pos = startPos
    history.length = 0
    repetitions.clear()
    repetitions.set(positionKey(startPos), 1)
    selected = -1
    targets = new Set()
    lastMove = null
    over = { kind: 'playing' }
    stepper = null
    thinking = false
    aiAt = 0
    lastScore = -1
    loop.markDirty()
  }

  /** 落子：更新历史、重复计数与终局状态。 */
  const play = (m: Move): void => {
    const captured = pos.board[idx(m[2], m[3])] as Piece | ''
    if (captured !== '') {
      // 吃子动画：在被吃子位置爆出对应颜色的粒子。
      const color = colorOf(captured) === 'r' ? '#f7768e' : '#9ece6a'
      particles.burst(pointX(m[3]), pointY(m[2]), color, 12, 150)
    }
    pos = applyMove(pos, m)
    lastMove = m
    const key = positionKey(pos)
    history.push({ pos, move: m, key })
    const count = (repetitions.get(key) ?? 0) + 1
    repetitions.set(key, count)
    selected = -1
    targets = new Set()
    over = status(pos, count)
    if (over.kind !== 'playing') {
      const won = over.kind !== 'draw-repetition' && over.winner === 'r'
      if (won) {
        particles.burst(LOGICAL_W / 2, LOGICAL_H / 2, THEME.gold, 20, 180)
        saveLevel(GAME_ID, Math.min(level + 1, LEVEL_DEPTH.length))
      }
      reportScore()
    }
    loop.markDirty()
  }

  /** 悔棋：取消思考并回退到玩家上一手之前（最多两步）。 */
  const undo = (): void => {
    if (history.length === 0) return
    stepper = null
    thinking = false
    aiAt = 0
    history.pop()
    const last = history[history.length - 1]
    // 若刚弹掉的是 AI 的着（其后继局面 turn 为红），再弹掉玩家的着。
    if (last !== undefined && last.pos.turn === 'r') history.pop()
    const now = history[history.length - 1]
    pos = now === undefined ? startPos : now.pos
    lastMove = now === undefined ? null : now.move
    selected = -1
    targets = new Set()
    repetitions.clear()
    repetitions.set(positionKey(startPos), 1)
    for (const h of history) {
      repetitions.set(h.key, (repetitions.get(h.key) ?? 0) + 1)
    }
    over = status(pos, repetitions.get(positionKey(pos)) ?? 1)
    loop.markDirty()
  }

  const tryPlayerMove = (from: number, to: number): boolean => {
    const m = legalMoves(pos).find(mm => mm[0] === rowOf(from) && mm[1] === colOf(from) && mm[2] === rowOf(to) && mm[3] === colOf(to))
    if (m === undefined) return false
    play(m)
    return true
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (over.kind !== 'playing' || thinking || aiAt > 0) {
      if (undoHit(x, y)) undo()
      return
    }
    if (undoHit(x, y)) {
      undo()
      return
    }
    const s = pointAt(x, y)
    if (s < 0) return
    if (selected >= 0 && targets.has(s)) {
      if (tryPlayerMove(selected, s) && over.kind === 'playing') {
        aiAt = performance.now() + AI_DELAY_MS
      }
      return
    }
    const p = pos.board[s] as Piece | ''
    if (p !== '' && colorOf(p) === 'r') {
      selected = s
      targets = new Set(legalMoves(pos)
        .filter(mm => idx(mm[0], mm[1]) === s)
        .map(mm => idx(mm[2], mm[3])))
    } else {
      selected = -1
      targets = new Set()
    }
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyD') {
      event.preventDefault()
      level = (level % LEVEL_DEPTH.length) + 1
      restart()
    } else if (event.code === 'KeyU') {
      event.preventDefault()
      undo()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const buildView = (paused: boolean): XiangqiView => {
    const overlay = overlayFor()
    return {
      pos,
      selected,
      targets,
      lastMove,
      checkSquare: checkSquare(),
      difficultyLabel: level + '·深度' + depth(),
      thinking,
      statusText: overlay?.text ?? null,
      statusSub: overlay?.sub ?? '',
      statusColor: overlay?.color ?? THEME.text,
      paused,
      canUndo: history.length > 0,
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const now = performance.now()
    if (over.kind === 'playing' && aiAt > 0 && now >= aiAt) {
      aiAt = 0
      // 种子由难度与手数派生：本局内确定，跨着法有变化。
      stepper = createSearch(pos, depth(), NODE_BUDGET, 0x51ce0000 + level * 977 + history.length)
      thinking = true
      loop.markDirty()
    }
    if (stepper !== null) {
      const r = stepper.step()
      if (r.done) {
        stepper = null
        thinking = false
        if (r.result.move !== null) play(r.result.move)
        else over = status(pos, repetitions.get(positionKey(pos)) ?? 1)
      }
      loop.markDirty()
    }
    // 思考中闪烁提示：周期性置脏重绘。
    if (thinking) {
      const phase = Math.floor(now / BLINK_MS)
      if (phase !== lastBlink) {
        lastBlink = phase
        loop.markDirty()
      }
    }
    if (!f.render && particles.size() === 0) return
    renderXiangqi(ctx, buildView(false))
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    loop.pause()
    renderXiangqi(ctx, buildView(true))
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.start()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
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
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const xiangqiGame: MiniGameDefinition = {
  id: 'xiangqi',
  title: '中国象棋 Xiangqi',
  icon: '🐘',
  description: '楚河汉界完整对局：人机对战内置 alpha-beta AI，支持将军提示与悔棋。',
  controls: [
    '点击棋子再点落点：走子',
    'U / 悔棋按钮：悔棋一回合',
    'D：切换难度（1-3 档，深度 2/3/4）',
    'R：重开',
    'P：暂停',
  ],
  create: createXiangqiGame,
}
