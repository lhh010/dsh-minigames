/**
 * 斗兽棋游戏定义：把纯规则引擎（logic.ts）与一层贪心 AI（ai.ts）组装
 * 成 {@link MiniGameInstance}。玩家执红（棋盘下方，向上进攻），AI 执黑；
 * 3 局 2 胜，AI 难度随局数上升（噪声递减、第三局加算对手应手）。点击
 * 选子/走子，AI 同步应手（一层贪心耗时微秒级，无需分帧）；U 悔棋、
 * R 重开（局间为下一局/新场）、P 暂停。onScore 在每局与整场结束时上报
 * 累计分（每胜一局 +10，整场获胜 +20，零封 +10）。帧循环为 dirty 按需
 * 重绘（粒子活跃时持续标脏）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  createStartPosition, legalMoves, applyMove, status, denInDanger,
  idx, colorOf, type Move, type Piece, type Position,
} from './logic.ts'
import { chooseMove } from './ai.ts'
import { renderJungle, LOGICAL_W, LOGICAL_H, cellAt, centerOfIndex, type JungleView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 整场获胜所需的局数（3 局 2 胜）。 */
const MATCH_WINS = 2

function createJungleGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: jungle needs a 2d canvas context')
  const ctx = fit.ctx

  let gameNo = 1
  let pWins = 0
  let aWins = 0
  let matchOver = false
  let pos: Position = createStartPosition()
  let history: Position[] = []
  let selected = -1
  let hints: Move[] = []
  let lastMove: Move | null = null
  let paused = false
  let result: 'playing' | 'win' | 'lose' | 'paused' = 'playing'
  let lastScore = -1
  const particles = createParticles()

  /** 累计分：每胜一局 +10，整场获胜 +20，零封对手 +10；仅在变化时上报。 */
  const reportScore = (): void => {
    let score = pWins * 10
    if (matchOver && pWins > aWins) score += 20
    if (matchOver && aWins === 0) score += 10
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 走完一步后的终局结算：记局分、判整场归属。 */
  const settle = (): void => {
    const st = status(pos)
    if (st.kind === 'playing') return
    if (st.winner === 'r') pWins += 1
    else aWins += 1
    matchOver = pWins >= MATCH_WINS || aWins >= MATCH_WINS || gameNo >= 3
    result = st.winner === 'r' ? 'win' : 'lose'
    reportScore()
  }

  /** 按当前局数取难度（1-3）。 */
  const difficulty = (): number => Math.min(gameNo, 3)

  /** AI 种子随局数与步数推进，同一对局序列内完全确定。 */
  const aiSeed = (): number => (0x9e3779b9 + gameNo * 2654435761 + history.length * 40503) >>> 0

  const burstAt = (target: number, piece: Piece): void => {
    const cxY = centerOfIndex(target)
    particles.burst(cxY[0], cxY[1], colorOf(piece) === 'r' ? '#f7768e' : '#7dcfff', 16, 160)
  }

  /** 走一子（玩家或 AI 通用）：吃子粒子、推进历史、结算、标脏。 */
  const playMove = (m: Move): void => {
    const target = idx(m[2], m[3])
    const captured = pos.board[target] as Piece | ''
    if (captured !== '') burstAt(target, captured)
    history.push(pos)
    pos = applyMove(pos, m)
    lastMove = m
    selected = -1
    hints = []
    settle()
    loop.markDirty()
  }

  /** AI 同步应手（一层贪心，含第三局应手层）。 */
  const aiReply = (): void => {
    const m = chooseMove(pos, difficulty(), aiSeed())
    if (m === null) {
      settle()
      return
    }
    playMove(m)
  }

  const newGame = (): void => {
    pos = createStartPosition()
    history = []
    selected = -1
    hints = []
    lastMove = null
    paused = false
    result = 'playing'
    loop.markDirty()
  }

  /** R：局间进入下一局 / 整场结束后开新场 / 对局中重开本局。 */
  const onRestartKey = (): void => {
    if (result !== 'playing') {
      if (matchOver) {
        gameNo = 1
        pWins = 0
        aWins = 0
        matchOver = false
        lastScore = -1
      } else {
        gameNo += 1
      }
    }
    newGame()
    reportScore()
  }

  /** U：悔到玩家上一次行动前（弹出一整对玩家+AI 着法）。 */
  const undo = (): void => {
    if (result !== 'playing' || history.length === 0) return
    pos = history.pop()!
    if (pos.turn === 'b' && history.length > 0) pos = history.pop()!
    selected = -1
    hints = []
    lastMove = null
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (result !== 'playing') return
    paused = !paused
    loop.markDirty()
  }

  const hit = (event: MouseEvent): number => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    return cellAt(x, y)
  }

  /** 是否轮到 AI 行棋（独立函数避免属性窄化误报）。 */
  const needsAi = (): boolean => pos.turn === 'b'

  const onMouseDown = (event: MouseEvent): void => {
    if (paused || result !== 'playing' || pos.turn !== 'r') return
    const i = hit(event)
    if (i >= 0) {
      const p = pos.board[i] as Piece | ''
      if (p !== '' && colorOf(p) === 'r') {
        selected = i
        hints = legalMoves(pos).filter(m => idx(m[0], m[1]) === i)
        loop.markDirty()
        return
      }
      const m = hints.find(mm => idx(mm[2], mm[3]) === i)
      if (m !== undefined) {
        playMove(m)
        if (result === 'playing' && needsAi()) aiReply()
        return
      }
    }
    if (selected !== -1) {
      selected = -1
      hints = []
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') { event.preventDefault(); onRestartKey(); return }
    if (event.code === 'KeyP') { event.preventDefault(); togglePause(); return }
    if (event.code === 'KeyU') { event.preventDefault(); undo(); return }
  }

  const frame = (f: FrameInfo): void => {
    // 粒子未结束则持续标脏，保证爆裂动画播完。
    if (particles.size() > 0) loop.markDirty()
    if (!f.render && particles.size() === 0) return
    const view: JungleView = {
      pos,
      selected,
      hints,
      lastMove,
      denThreat: denInDanger(pos, 'r') ? 'r' : denInDanger(pos, 'b') ? 'b' : null,
      gameNo,
      playerWins: pWins,
      aiWins: aWins,
      matchOver,
      result: paused ? 'paused' : result,
    }
    renderJungle(ctx, view)
    particles.tick(ctx, f.dt * 1000)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  return {
    start: () => { loop.start() },
    pause: () => { paused = true; loop.markDirty() },
    resume: () => { paused = false; loop.markDirty() },
    destroy: () => {
      loop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const jungleGame: MiniGameDefinition = {
  id: 'jungle',
  title: '斗兽棋 Jungle',
  icon: '🦁',
  description: '象狮虎豹狼狗猫鼠八兽争穴——大吃小、鼠吃象，河流里只有鼠能游。',
  controls: [
    '点击己方兽子选中，再点目标格走子（正交一格）；你执红在下方、向上进攻，目标是上方黑方兽穴',
    '等级数字 ≥ 对方即可吃（同级互吃）；唯一例外：鼠(1)可吃象(8)，象不可吃鼠',
    '仅鼠可入河游泳；狮虎可沿直线跳过整条河（河中任一格有鼠则跳被挡）；河中鼠与岸上子互相不能吃',
    '敌子落入你的陷阱时等级归零、任何己子可吃（己方陷阱对己子无效）；攻入对方兽穴、全歼或令对方无子可动即胜',
    '3 局 2 胜，AI 随局数变强；R 重开/下一局 · P 暂停 · U 悔棋',
  ],
  create: createJungleGame,
}
