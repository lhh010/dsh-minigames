/**
 * 残局挑战游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击白子选中、
 * 高亮合法落点、再点落点走子；U 悔棋、H 提示（限 3 次）、R 重开、P 暂停；
 * 过关后点击任意处进入下一题（8 题循环）。回合制 dirty 帧循环：无操作零
 * 重绘，过关粒子仍在动时持续重绘，得分经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  PUZZLES, createChessEndState, applyPlayerMove, legalTargets, undoMove, requestHint,
  type ChessEndState, type ChessMove,
} from './logic.ts'
import { renderChessEnd, CELL, BOARD_X, BOARD_Y, W, H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { createParticles, accent, THEME } from '../theme.ts'

/** 防守方噪声种子：题号 + 固定基值，同题重开走子序列可重放。 */
const BASE_SEED = 20261119

function createChessEndGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: chessend needs a 2d canvas context')
  const ctx = fit.ctx

  let puzzleIndex = 0
  let state: ChessEndState = createChessEndState(puzzleIndex, BASE_SEED + puzzleIndex)
  let selected: number | null = null
  let hint: ChessMove | null = null
  let hintLabel = ''
  let running = false
  let paused = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 指针事件（CSS 像素）→ 逻辑坐标。 */
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }

  /** 逻辑坐标 → 格索引（盘外返回 -1）。 */
  const squareOf = (x: number, y: number): number => {
    const col = Math.floor((x - BOARD_X) / CELL)
    const row = Math.floor((y - BOARD_Y) / CELL)
    if (row < 0 || row > 7 || col < 0 || col > 7) return -1
    return row * 8 + col
  }

  /** 走子成功后的粒子庆祝。 */
  const celebrate = (): void => {
    const move = state.lastPlayer
    if (move === null) return
    const cx = BOARD_X + (move.to & 7) * CELL + CELL / 2
    const cy = BOARD_Y + (move.to >> 3) * CELL + CELL / 2
    particles.burst(cx, cy, state.status === 'won' ? THEME.gold : accent(0), 14, 150)
  }

  const restart = (): void => {
    state = createChessEndState(puzzleIndex, BASE_SEED + puzzleIndex)
    selected = null
    hint = null
    hintLabel = ''
    paused = false
    reportScore()
    loop.markDirty()
  }

  /** 过关 / 结束后点击进入下一题（最后一题循环回首题）。 */
  const advance = (): void => {
    puzzleIndex = (puzzleIndex + 1) % PUZZLES.length
    restart()
  }

  const tryMove = (from: number, to: number): boolean => {
    const result = applyPlayerMove(state, from, to)
    if (!result.ok) {
      state = { ...state, message: result.reason }
      return true
    }
    state = result.state
    hint = null
    hintLabel = ''
    selected = null
    celebrate()
    reportScore()
    return true
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (paused) return
    // 已过关 / 已结束：点击任意处切下一题。
    if (state.status !== 'playing') {
      advance()
      loop.markDirty()
      return
    }
    const p = toLogical(event)
    const sq = squareOf(p.x, p.y)
    if (sq < 0) {
      selected = null
      loop.markDirty()
      return
    }
    const targets = selected === null ? [] : legalTargets(state.board, selected)
    if (selected !== null && targets.includes(sq)) {
      tryMove(selected, sq)
    } else if (state.board[sq]! >= 'A' && state.board[sq]! <= 'Z') {
      // 点击己方棋子：切换选中（再次点击取消）。
      selected = selected === sq ? null : sq
    } else {
      selected = null
    }
    loop.markDirty()
  }

  const undoLast = (): void => {
    if (state.status !== 'playing') return
    state = undoMove(state)
    selected = null
    hint = null
    hintLabel = ''
    loop.markDirty()
  }

  const useHint = (): void => {
    if (state.status !== 'playing') return
    if (state.hintsLeft <= 0) {
      state = { ...state, message: '提示已用完（每局 3 次）' }
      loop.markDirty()
      return
    }
    const result = requestHint(state)
    if (result.move === null) return
    state = result.state
    hint = result.move
    hintLabel = '参考：' + result.label
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyR':
        event.preventDefault()
        restart()
        loop.markDirty()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyU':
        event.preventDefault()
        if (running && !paused) undoLast()
        loop.markDirty()
        break
      case 'KeyH':
        event.preventDefault()
        if (running && !paused) useHint()
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    if (f.render || particles.size() > 0) {
      renderChessEnd(ctx, state, selected ?? -1, selected === null ? [] : legalTargets(state.board, selected), hint, paused)
      // 提示标签绘制在底栏消息位置（消息为空时）。
      if (hintLabel !== '' && state.message === '') {
        ctx.textAlign = 'center'
        ctx.font = '600 13px system-ui, sans-serif'
        ctx.fillStyle = THEME.gold
        ctx.fillText(hintLabel, W / 2, H - 18)
      }
      particles.tick(ctx, f.dt * 1000)
    }
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderChessEnd(ctx, state, selected ?? -1, selected === null ? [] : legalTargets(state.board, selected), hint, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.start()
    loop.markDirty()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderChessEnd(ctx, state, -1, [], null, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const chessendGame: MiniGameDefinition = {
  id: 'chessend',
  title: '残局挑战 ChessEnd',
  icon: '♚',
  description: '车杀单王、后堡杀法……经典残局一步不差地走通。',
  controls: [
    '点击白子选中 → 点击高亮落点走子',
    'U：悔棋 · H：提示（每局 3 次）',
    'R：重开 · P：暂停',
  ],
  create: createChessEndGame,
}
