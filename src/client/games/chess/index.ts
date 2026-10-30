/**
 * Chess game definition: wires the pure rules and the negamax AI into a
 * {@link MiniGameInstance} — click a piece then a highlighted target to move;
 * the AI (Black) answers after a short delay. Four levels ramp the search
 * depth (2→5 ply, shared node budget). Promotion pops a picker; P pauses,
 * R restarts the current game; a draw replays the level.
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  applyMove, colorOf, createStartPosition, findKing, inCheck,
  legalMoves, positionKey, status, type Move, type Piece, type Position, type Status,
} from './logic.ts'
import { LEVEL_DEPTH, NODE_BUDGET, chooseMove } from './ai.ts'
import { LOGICAL_H, LOGICAL_W, promotionAt, renderChess, squareAt, type ChessView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { readLevel, saveLevel } from '../level-progress.ts'

const AI_DELAY_MS = 400
const ADVANCE_MS = 1600
const GAME_ID = 'chess'

function createChessGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: chess needs a 2d canvas context')
  const ctx = fit.ctx

  let level = Math.min(Math.max(readLevel(GAME_ID), 1), LEVEL_DEPTH.length)
  let pos: Position = createStartPosition()
  let selected = -1
  let targets = new Set<number>()
  let lastMove: Move | null = null
  let over: Status = { kind: 'playing' }
  /** positionKey → occurrence count (this game only). */
  const repetitions = new Map<string, number>()
  let promotion: { from: number; to: number; white: boolean } | null = null
  let running = false
  let thinking = false
  let aiAt = 0
  let ply = 0
  let lastScore = -1
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  const particles = createParticles()

  const depth = (): number => LEVEL_DEPTH[level - 1]!

  const checkSquare = (): number => {
    if (!inCheck(pos)) return -1
    return findKing(pos.board, pos.turn)
  }

  const overlayFor = (): { text: string; sub: string; color: string } | null => {
    if (over.kind === 'playing') return null
    if (over.kind === 'checkmate' && over.winner === 'w') return { text: '将杀！你赢了', sub: `即将进入第 ${Math.min(level + 1, LEVEL_DEPTH.length)} 关 · R 重开`, color: THEME.good }
    if (over.kind === 'checkmate') return { text: '你被将杀', sub: '同一关再来 · R 重开', color: THEME.bad }
    if (over.kind === 'stalemate') return { text: '逼和', sub: '平局重玩本关 · R 重开', color: THEME.text }
    return { text: '和棋', sub: '平局重玩本关 · R 重开', color: THEME.text }
  }

  const reportScore = (): void => {
    if (over.kind !== 'checkmate' || over.winner !== 'w') return
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const restart = (): void => {
    clearTimeout(advanceTimer)
    advanceTimer = 0
    advanceRemaining = 0
    pos = createStartPosition()
    selected = -1
    targets = new Set()
    lastMove = null
    over = { kind: 'playing' }
    repetitions.clear()
    repetitions.set(positionKey(pos), 1)
    promotion = null
    thinking = false
    aiAt = 0
    ply = 0
    loop.markDirty()
  }

  /** Apply a move, update repetition counts and the game status. */
  const play = (m: Move): void => {
    pos = applyMove(pos, m)
    lastMove = m
    selected = -1
    targets = new Set()
    ply += 1
    const key = positionKey(pos)
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1)
    over = status(pos, repetitions.get(key)!)
    if (over.kind === 'checkmate' && over.winner === 'w') {
      particles.burst((LOGICAL_W * 3) / 4, LOGICAL_H / 2, THEME.gold, 18, 160)
      reportScore()
      saveLevel(GAME_ID, Math.min(level + 1, LEVEL_DEPTH.length))
      if (running) scheduleAdvance()
      else advanceRemaining = ADVANCE_MS
    }
    loop.markDirty()
  }

  const scheduleAdvance = (): void => {
    advanceAt = performance.now() + ADVANCE_MS
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      if (level < LEVEL_DEPTH.length) level += 1
      restart()
    }, ADVANCE_MS)
  }

  const aiMove = (): void => {
    thinking = true
    // Seed derives from level + ply: deterministic per game, varied across plies.
    const res = chooseMove(pos, depth(), NODE_BUDGET, 0x51ce_0000 + level * 977 + ply)
    thinking = false
    if (res.move === null) { over = status(pos, repetitions.get(positionKey(pos)) ?? 1); return }
    play(res.move)
  }

  const tryPlayerMove = (from: number, to: number): boolean => {
    const matches = legalMoves(pos).filter(m => m.from === from && m.to === to)
    if (matches.length === 0) return false
    if (matches.length > 1 && matches[0]!.promo !== '') {
      promotion = { from, to, white: true }
      loop.markDirty()
      return true
    }
    play(matches[0]!)
    return true
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (promotion !== null) {
      const pick = promotionAt(x, y)
      if (pick !== null) {
        const m = legalMoves(pos).find(mm => mm.from === promotion!.from && mm.to === promotion!.to && mm.promo === pick)
        promotion = null
        if (m !== undefined) play(m)
      } else {
        promotion = null
        loop.markDirty()
      }
      return
    }
    if (over.kind !== 'playing' || aiAt > 0) return
    const s = squareAt(x, y)
    if (s < 0) return
    const p = pos.board[s] as Piece | ''
    if (selected >= 0 && targets.has(s)) {
      tryPlayerMove(selected, s)
      if (over.kind === 'playing') aiAt = performance.now() + AI_DELAY_MS
      return
    }
    if (p !== '' && colorOf(p) === 'w') {
      selected = s
      targets = new Set(legalMoves(pos).filter(m => m.from === s).map(m => m.to))
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
    } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      // 跳关：在已解锁 AI 棋力档位间切换（fresh start，同 R 语义）。
      event.preventDefault()
      const max = Math.min(readLevel(GAME_ID), LEVEL_DEPTH.length)
      const target = level + (event.code === 'BracketRight' ? 1 : -1)
      if (target >= 1 && target <= max) {
        level = target
        restart()
      }
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    const now = performance.now()
    if (over.kind === 'playing' && aiAt > 0 && now >= aiAt) {
      aiAt = 0
      aiMove()
    }
    if (!f.render && particles.size() === 0) return
    const overlay = overlayFor()
    const view: ChessView = {
      pos,
      selected,
      targets,
      lastMove,
      checkSquare: checkSquare(),
      levelLabel: `L${level}·深度${depth()}`,
      statusText: overlay?.text ?? null,
      statusSub: overlay?.sub ?? '',
      statusColor: overlay?.color ?? THEME.text,
      paused: false,
      promotion,
      thinking,
    }
    renderChess(ctx, view)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    loop.pause()
    renderPausedFrame()
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      advanceAt = performance.now() + advanceRemaining
      advanceTimer = window.setTimeout(() => {
        advanceTimer = 0
        advanceRemaining = 0
        if (level < LEVEL_DEPTH.length) level += 1
        restart()
      }, advanceRemaining)
      advanceRemaining = 0
    }
    loop.start()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  /** Final paused frame (matches the lightsout pause pattern). */
  const renderPausedFrame = (): void => {
    const overlay = overlayFor()
    const view: ChessView = {
      pos, selected, targets, lastMove, checkSquare: checkSquare(),
      levelLabel: `L${level}·深度${depth()}`,
      statusText: overlay?.text ?? null, statusSub: overlay?.sub ?? '',
      statusColor: overlay?.color ?? THEME.text,
      paused: true, promotion, thinking,
    }
    renderChess(ctx, view)
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  repetitions.set(positionKey(pos), 1)
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
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const chessGame: MiniGameDefinition = {
  id: 'chess',
  title: '国际象棋',
  icon: '♞',
  description: '执白对弈 α-β 剪枝搜索的 AI：四档棋力（深度 2→5），支持王车易位、吃过路兵、升变与三次重复判和。',
  controls: ['点击棋子再点目标格：走子', '升变时点击选择新棋子', 'R：重开本局', '[ / ]：切换棋力档位（已解锁范围内）', 'P：暂停'],
  create: createChessGame,
}
