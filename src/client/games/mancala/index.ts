/**
 * 播棋游戏定义：把纯规则与渲染器接成 {@link MiniGameInstance}——点击己方
 * 坑走子（逐籽播种动画），AI 应手；三局积分制，难度随局数上升（噪声与
 * 暴露惩罚收紧）。R 重开整场比赛，P 暂停/继续；动画期间逐帧、静止时脏标记按需重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createMancala, applyMove, chooseAiMove, mulberry32, legalMoves, type MancalaState, type MoveResult } from './logic.ts'
import { renderMancala, resultOverlay, LOGICAL_W, LOGICAL_H, pitAt, type MancalaView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const TOTAL_ROUNDS = 3
/** 每粒种子动画时长（毫秒）。 */
const SEED_MS = 85
/** AI 走子前延迟。 */
const AI_DELAY_MS = 420
const ROUND_WIN_BASE = 30
const ROUND_LOSS = 3

interface Animation {
  /** 播种路径。 */
  path: number[]
  /** 已播籽数。 */
  step: number
  /** 动画中间盘面。 */
  pits: number[]
  /** 走子完整结果。 */
  result: MoveResult
  /** 走子方起始坑。 */
  pit: number
}

function createMancalaGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: mancala needs a 2d canvas context')
  const ctx = fit.ctx

  let state: MancalaState = createMancala()
  let round = 1
  let points: [number, number] = [0, 0]
  let roundOver = false
  let matchOver = false
  let paused = false
  let hover = -1
  let lastMove = -1
  let anim: Animation | null = null
  let timer = 0
  let lastScore = -1
  const particles = createParticles()
  let rngState = 0x9e3779b9
  let rng = mulberry32(rngState)

  const difficulty = (): number => round - 1

  const reportScore = (): void => {
    if (points[0] === lastScore) return
    lastScore = points[0]
    options?.onScore?.(points[0])
  }

  const buildView = (): MancalaView => ({
    pits: anim === null ? state.pits : anim.pits,
    hover,
    turn: state.turn,
    highlight: anim === null ? -1 : (anim.path[anim.step - 1] ?? -1),
    lastMove,
    round,
    totalRounds: TOTAL_ROUNDS,
    points: [points[0], points[1]],
    overlay: paused ? 'paused' : (matchOver ? 'match' : (roundOver ? resultOverlay(state) : null)),
    matchSubtitle: matchOver
      ? (points[0] > points[1] ? '总比分 ' + points[0] + ':' + points[1] + ' 你获胜 · R 再来'
        : points[0] < points[1] ? '总比分 ' + points[0] + ':' + points[1] + ' AI 获胜 · R 再来'
        : '总比分 ' + points[0] + ':' + points[1] + ' 平手 · R 再来')
      : '',
  })

  const nextRound = (): void => {
    if (round >= TOTAL_ROUNDS) {
      matchOver = true
      return
    }
    round += 1
    roundOver = false
    state = createMancala()
    lastMove = -1
    loop.markDirty()
  }

  const settleRound = (): void => {
    roundOver = true
    const h = state.pits[6]!
    const a = state.pits[13]!
    if (state.winner === 'human') {
      points[0] += ROUND_WIN_BASE + (h - a) + difficulty() * 10
    } else if (state.winner === 'ai') {
      points[0] += ROUND_LOSS
      points[1] += 1
    } else {
      points[0] += 10
    }
    reportScore()
    const c = renderCenter()
    if (state.winner === 'human') particles.burst(c.x, c.y, '#9ece6a', 26, 170)
    loop.markDirty()
    timer = window.setTimeout(nextRound, 1600)
  }

  const afterMove = (res: MoveResult): void => {
    if (res.state.finished) {
      state = res.state
      settleRound()
      return
    }
    state = res.state
    if (state.turn === 'ai') {
      timer = window.setTimeout(aiStep, AI_DELAY_MS)
    }
    loop.markDirty()
  }

  const stepAnim = (): void => {
    if (anim === null) return
    anim.step += 1
    const slot = anim.path[anim.step - 1]
    if (slot !== undefined) anim.pits[slot]! += 1
    loop.markDirty()
    if (anim.step >= anim.path.length) {
      const res = anim.result
      anim = null
      afterMove(res)
      return
    }
    timer = window.setTimeout(stepAnim, SEED_MS)
  }

  const startMove = (pit: number): void => {
    const res = applyMove(state, pit)
    if (res === null) return
    lastMove = pit
    const pits = [...state.pits]
    pits[pit] = 0
    if (res.path.length === 0) {
      afterMove(res)
      return
    }
    anim = { path: res.path, step: 0, pits, result: res, pit }
    timer = window.setTimeout(stepAnim, SEED_MS)
    loop.markDirty()
  }

  const aiStep = (): void => {
    if (paused || anim !== null || state.finished || state.turn !== 'ai') return
    const pit = chooseAiMove(state, difficulty(), rng)
    if (pit < 0) return
    startMove(pit)
  }

  const playerMove = (pit: number): void => {
    if (paused || matchOver || roundOver || anim !== null) return
    if (state.turn !== 'human' || state.finished) return
    if (legalMoves(state).indexOf(pit) < 0) return
    startMove(pit)
  }

  const restart = (): void => {
    window.clearTimeout(timer)
    anim = null
    state = createMancala()
    round = 1
    points = [0, 0]
    roundOver = false
    matchOver = false
    paused = false
    hover = -1
    lastMove = -1
    lastScore = -1
    rngState = (rngState + 0x1b56c4e9) >>> 0
    rng = mulberry32(rngState)
    loop.resume()
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (matchOver) return
    paused = !paused
    if (paused) loop.pause()
    else loop.resume()
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const pit = pitAt(x, y)
    if (pit >= 0 && pit <= 5) playerMove(pit)
  }

  const onMouseMove = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const pit = pitAt(x, y)
    const next = pit >= 0 && pit <= 5 ? pit : -1
    if (next !== hover) {
      hover = next
      loop.markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    const m = /^Digit([1-6])$/.exec(event.code)
    if (m !== null) {
      event.preventDefault()
      playerMove(6 - Number(m[1]))
    }
  }

  const frame = (f: FrameInfo): void => {
    // 静止时仅脏标记重绘；动画/粒子期间每帧都画。
    if (!f.render && anim === null && particles.size() === 0) return
    renderMancala(ctx, buildView())
    particles.tick(ctx, f.dt * 1000)
    if (anim !== null || particles.size() > 0) loop.markDirty()
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  loop.start()

  return {
    start: () => { loop.start() },
    pause: () => {
      window.clearTimeout(timer)
      paused = true
      loop.pause()
      loop.markDirty()
    },
    resume: () => {
      paused = false
      loop.resume()
      // 恢复被打断的 AI 应手 / 未完动画推进。
      if (anim !== null) timer = window.setTimeout(stepAnim, SEED_MS)
      else if (!roundOver && !matchOver && state.turn === 'ai') timer = window.setTimeout(aiStep, AI_DELAY_MS)
      loop.markDirty()
    },
    destroy: () => {
      window.clearTimeout(timer)
      loop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

function renderCenter(): { x: number, y: number } {
  return { x: LOGICAL_W / 2, y: LOGICAL_H / 2 }
}

export const mancalaGame: MiniGameDefinition = {
  id: 'mancala',
  title: '播棋 Mancala',
  icon: '🫙',
  description: '捡起一把种子逐坑播种——落在自己的粮仓里才算收获，古老播种棋的算计。',
  controls: ['点击坑 / 数字键 1-6：走子', 'R：重开', 'P：暂停'],
  create: createMancalaGame,
}
